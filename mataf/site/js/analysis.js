import { mekipa, klalit, hishtalmut, tagmulim, hashkaa } from './refdata.js';
import { OFFICIAL_PENSION, OFFICIAL_GEMEL, OFFICIAL_INSURANCE, trackCodeParts, boundOfficial, fundIdFromTrackCode } from './official.js';

export const GROUP_LABEL = {
    mekipa: 'קרנות פנסיה מקיפה', klalit: 'קרנות פנסיה כללית', hishtalmut: 'קרנות השתלמות',
    tagmulim: 'קופות גמל (תגמולים)', hashkaa: 'גמל להשקעה',
};
export const GROUPS = [
    { key: 'mekipa', data: mekipa }, { key: 'klalit', data: klalit }, { key: 'hishtalmut', data: hishtalmut },
    { key: 'tagmulim', data: tagmulim }, { key: 'hashkaa', data: hashkaa },
];
export const REF_DATE = '09/2026';
export const REF_NOTE = 'שארפ ותשואות: כפי שמפורסמים במאגרי האוצר 09/2026 (בביטוח-נט שארפ רשמי לחמש השנים האחרונות, לפי מתודולוגיית הרשות). לדירוג נכנסים רק מסלולים עם תשואה נצברת תלת-שנתית קיימת בדיווח הרשמי; מסלול צעיר יותר אינו מדורג, גם אם הקרן עצמה ותיקה.';

// --- name matching ---
const TYPE_TOKENS = ['מניות', 'כללי', 'סחיר', 'אגח', 'מדדי', 'מדד', 'עוקב', 'הלכה', 'שקלי', 'צמוד', 'משולב', 'הון'];
// סימוכי מנדט/סיכון מן השם עצמו של המסלול (אותן אסמכתאות סוג כמו בהתאמת שמות) - תנאי בסיס לאומדן מחלקה.
export function typeEvidenceOf(name) {
    const tt = tokens(name || '');
    return TYPE_TOKENS.filter(t => tt.includes(t));
}

const STOP = ['מסלול', 'קרן', 'קופת', 'קופה', 'גמל', 'פנסיה', 'השתלמות', 'מקיפה', 'כללית', 'להשקעה', 'בעמ', 'בע"מ', 'חברה', 'לביטוח', 'לבטוח', 'ניהול', 'וגמל', 'ופנסיה', 'מבטחים', '-', '–', 'ה'];
function tokens(s) {
    // אג"ח/אג״ח מאוחד ל'אגח' לפני הסרת גרשיים - אחרת הטוקן מתפרק ל'אג' וסימוכין האג"ח אובדת (תוקן 09/11/2026)
    return s.replace(/אג["״'׳]ח/g, 'אגח').replace(/[0-9"'״׳.,()\-–]/g, ' ').split(/\s+/)
        .map(t => t.trim()).filter(t => t.length >= 2 && !STOP.includes(t));
}
// שער סיווג בין סוג המוצר במסלקה לבין המאגר/הסיווג הרשמי - חלק מהתאמה מאומתת כפולה (מזהה + ח.פ + סוג).
const GEMEL_KIND_CLS = {
    hishtalmut: ['קרנות השתלמות'],
    tagmulim: ['תגמולים ואישית לפיצויים', 'מרכזית לפיצויים'],
    hashkaa: ['קופת גמל להשקעה', 'קופת גמל להשקעה - חסכון לילד'],
};
const GEMEL_CLS_GROUP = {
    'קרנות השתלמות': 'hishtalmut',
    'תגמולים ואישית לפיצויים': 'tagmulim', 'מרכזית לפיצויים': 'tagmulim',
    'קופת גמל להשקעה': 'hashkaa', 'קופת גמל להשקעה - חסכון לילד': 'hashkaa',
};
function officialRow(o, srcName, extraFlag = '') {
    return {
        name: o.name, mgr: '', sharpe: o.sharpe ?? 0, months: o.y3 != null ? 36 : 0, y3: o.y3 ?? null,
        sharpeOff: o.sharpe ?? null, eq: o.eq, fo: null, fx: null, feeA: o.feeA ?? null, feeD: o.feeD ?? null,
        act: null, assets: o.assetsM ? Math.round(o.assetsM / 1000 * 10) / 10 : null,
        flag: `נתוני ${srcName} רשמיים 09/2026, מזהה ${o.fundId}${extraFlag}`,
    };
}
function sigToks(s) { return tokens(s || '').filter(t => t.length >= 3); }
// מילים גנריות בשמות יצרנים/חברות - אינן מבדלות בין חברות ואינן ראיה לשיוך חברה
const CO_STOP = new Set(['חברה', 'לביטוח', 'בעמ', 'ביטוח', 'פנסיה', 'וגמל', 'גמל', 'פיננסיים', 'פיננסים', 'השקעות', 'ניהול', 'קופות', 'קופת', 'בע"מ']);
function coToks(s) { return sigToks(s).filter(t => !CO_STOP.has(t)); }

export function matchTrack(account, trackName, trackCode = '') {
    // התאמה רשמית מאומתת כפולה: FUND_ID (7 הספרות האחרונות של קוד המסלול) + ח.פ היצרן (9 הספרות הראשונות)
    // + שער סוג מוצר (פנסיה->פנסיה-נט, השתלמות/תגמולים/השקעה->גמל-נט בסיווג מתאים, מנהלים/אחר->ביטוח-נט).
    const { fid, prefix } = trackCodeParts(trackCode);
    let o = null, srcName = null, group = null;
    if (account.kind === 'pensia') {
        o = boundOfficial(OFFICIAL_PENSION, fid, prefix);
        if (o) { srcName = 'פנסיה-נט (data.gov.il, רשות שוק ההון)'; group = o.cls === 'קרנות כלליות' ? 'klalit' : 'mekipa'; }
    } else if (GEMEL_KIND_CLS[account.kind]) {
        o = boundOfficial(OFFICIAL_GEMEL, fid, prefix);
        if (o && !GEMEL_KIND_CLS[account.kind].includes(o.cls)) o = null; // הסיווג הרשמי סותר את סוג המוצר - לא מתאימים
        if (o) { srcName = 'גמל-נט (data.gov.il, רשות שוק ההון)'; group = GEMEL_CLS_GROUP[o.cls] || null; }
    } else if (!account.kind || ['menahalim', 'other'].includes(account.kind)) {
        o = boundOfficial(OFFICIAL_INSURANCE, fid, prefix);
        if (o) {
            const row = { name: `${o.name} (${o.company})`, mgr: o.company, sharpe: o.sharpe ?? 0, months: o.y3 != null ? 36 : 0, y3: o.y3, sharpeOff: o.sharpe, eq: o.eq, fo: null, fx: null, feeA: o.feeA, feeD: null, act: null, assets: Math.round(o.assetsM / 1000 * 10) / 10, flag: `נתוני ביטוח-נט רשמיים ${o.period}, מזהה ${o.fundId}, ${o.classification}` };
            return { row, score: 1, group: null, officialId: fid, src: 'bituachnet' };
        }
    }
    if (o) return { row: officialRow(o, srcName), score: 1, group, officialId: fid };
    // ללא קוד מסלול אין שיוך זהות אוטומטי כלל - גם לא לפי שם רשמי מלא ומדויק (התאמת שם עלולה
    // לשייך מסלול שגוי באותה חברה). הזהות נבחרת ידנית בלבד דרך selectorOptionsFor/manualMatchFor.
    return { row: null, score: 0, group: null };
}

// נרמול שם להשוואת "התאמת שם מדויקה" (סימון בלבד בתוך רשימת הבחירה - אינו שיוך זהות)
export function normName(x) { return String(x || '').replace(/["'״׳.,()\-–;]/g, ' ').split(/\s+/).filter(Boolean).join(' '); }

// אפשרויות הבחירה הידנית למסלול ללא קוד: רק מסלולים רשמיים של אותה חברה (מיפוי יצרן ->
// טוקנים מבדלים בשם המסלול/הקרן) ובאותו סוג מוצר. מיפוי שלא נפתר אינו מרחיב את הרשימה
// לחברות אחרות - מוחזר status unresolved-company. אין אפשרות נבחרת כברירת מחדל;
// התאמת שם מדויקה מסומנת בלבד וממוינת ראשונה.
export function selectorOptionsFor(account, trackName) {
    const yToks = coToks(account.yatzran || '');
    let rows = [];
    if (account.kind === 'pensia') {
        rows = Object.entries(OFFICIAL_PENSION).map(([id, r]) => ({ id: +id, name: r.name, eq: r.eq, co: r.parentCoName || '' }));
    } else if (GEMEL_KIND_CLS[account.kind]) {
        rows = Object.entries(OFFICIAL_GEMEL).filter(([, r]) => GEMEL_KIND_CLS[account.kind].includes(r.cls)).map(([id, r]) => ({ id: +id, name: r.name, eq: r.eq, co: '' }));
    } else if (!account.kind || ['menahalim', 'other'].includes(account.kind)) {
        rows = Object.entries(OFFICIAL_INSURANCE).map(([id, r]) => ({ id: +id, name: `${r.name} (${r.company})`, eq: r.eq, co: r.company || '' }));
    } else {
        return { status: 'unsupported-kind', options: [] };
    }
    if (!yToks.length) return { status: 'unresolved-company', options: [] };
    const plan = account.plan || '';
    const opts = rows.filter(o => {
        const rt = new Set(coToks(o.name + ' ' + o.co));
        if (!yToks.some(t => rt.has(t))) return false;
        if (/משלימה/.test(plan) && !/משלימה/.test(o.name + ' ' + o.co)) return false;
        if (/מקיפה/.test(plan) && /משלימה/.test(o.name + ' ' + o.co)) return false;
        return true;
    });
    if (!opts.length) return { status: 'unresolved-company', options: [] };
    const tn = normName(trackName);
    for (const o of opts) o.nameMatch = normName(o.name) === tn;
    opts.sort((a, b) => ((b.nameMatch ? 1 : 0) - (a.nameMatch ? 1 : 0)) || a.name.localeCompare(b.name, 'he'));
    return { status: 'ok', options: opts };
}

// הפעלת בחירה ידנית שמורה על החזקה: תקפה רק כשטביעת האצבע המלאה תואמת -
// אותו חשבון, אותו סוג מוצר, אותו שם מסלול במסלקה, אותה יתרה ואותה שורה רשמית (מזהה + שם).
// אי-התאמה = הבחירה אינה מוחלת (מוחזר null) והממשק מודיע ומאפס - אין החלת זהות סטלה.
export function manualMatchFor(account, track, sel) {
    if (!sel || typeof sel !== 'object') return null;
    const id = sel.officialId;
    if (!Number.isInteger(id) || id <= 0) return null;
    if (sel.account !== account.account || sel.kind !== account.kind) return null;
    if (sel.trackName !== (track.baseName || track.name)) return null;
    if (Math.round((sel.balance ?? -1) * 100) !== Math.round((track.balance || 0) * 100)) return null;
    let o = null, srcName = null, group = null;
    if (account.kind === 'pensia') {
        o = OFFICIAL_PENSION[id];
        if (o) { srcName = 'פנסיה-נט (data.gov.il, רשות שוק ההון)'; group = o.cls === 'קרנות כלליות' ? 'klalit' : 'mekipa'; }
    } else if (GEMEL_KIND_CLS[account.kind]) {
        o = OFFICIAL_GEMEL[id];
        if (o && !GEMEL_KIND_CLS[account.kind].includes(o.cls)) o = null;
        if (o) { srcName = 'גמל-נט (data.gov.il, רשות שוק ההון)'; group = GEMEL_CLS_GROUP[o.cls] || null; }
    } else if (!account.kind || ['menahalim', 'other'].includes(account.kind)) {
        o = OFFICIAL_INSURANCE[id];
        if (o) {
            const row = { name: `${o.name} (${o.company})`, mgr: o.company, sharpe: o.sharpe ?? 0, months: o.y3 != null ? 36 : 0, y3: o.y3, sharpeOff: o.sharpe, eq: o.eq, fo: null, fx: null, feeA: o.feeA, feeD: null, act: null, assets: Math.round(o.assetsM / 1000 * 10) / 10, flag: `זהות נבחרה ידנית על-ידי המשתמש מול מאגר ביטוח-נט הרשמי ${o.period} (מזהה ${o.fundId}) - לא אומתה בקוד מסלול מהמסלקה` };
            if (row.name !== sel.name) return null;
            return { row, score: 1, group: null, officialId: null, userSelected: true };
        }
    }
    if (!o) return null;
    const row = officialRow(o, srcName, '');
    // שער סוג מוצר כמו ברשימת הבחירה: בחירה שנשמרה/נוצרה ביד אינה מקשרת שורת משלימה לחשבון מקיפה ולהיפך
    const plan = account.plan || '';
    const rowCtx = (row.name || '') + ' ' + (o.parentCoName || '');
    if (/משלימה/.test(plan) && !/משלימה/.test(rowCtx)) return null;
    if (/מקיפה/.test(plan) && /משלימה/.test(rowCtx)) return null;
    if (row.name !== sel.name) return null;
    row.flag = `זהות נבחרה ידנית על-ידי המשתמש מתוך רשימת המסלולים הרשמיים של אותה חברה וסוג מוצר (נתוני ${srcName} 09/2026, מזהה ${o.fundId}) - לא אומתה בקוד מסלול מהמסלקה`;
    return { row, score: 1, group, officialId: null, userSelected: true };
}

// קטגוריות חשיפה מנייתית בפועל (לא לפי שם המסלול) - כפי שביקש המשתמש 08/11/2026.
export const EQ_BUCKETS = [
    { key: 1, label: 'עד 20% מניות', test: e => e <= 20 },
    { key: 2, label: 'מעל 20% ועד 30% מניות', test: e => e > 20 && e <= 30 },
    { key: 3, label: 'מעל 30% ועד 50% מניות', test: e => e > 30 && e <= 50 },
    { key: 4, label: 'מעל 50% ומתחת 70% מניות', test: e => e > 50 && e < 70 },
    { key: 5, label: '70% מניות ומעלה', test: e => e >= 70 },
];
export function bucketOf(eq) { return EQ_BUCKETS.find(b => b.test(eq)) || null; }

// מנדט מעקב מדויק לפי שם המסלול הרשמי. חלופה שקולה חייבת להיות באותו מנדט בדיוק:
// עוקב S&P 500 אינו שקול לעוקב מדדי מניות כלליים, לאג"ח, למסלול עוקב גמיש או למסלול מנוהל - גם באותה קטגוריית חשיפה.
// שינוי מנדט הוא בחירה מודעת של הלקוח, לא תחליף שקול. מסלולים עם סמן מט"ח/גידור בשם לא קיימים כיום במאגר; אם יופיעו יש להוסיף להם מנדט נפרד.
export function mandateOf(name) {
    const raw = name || '';
    const n = raw.toLowerCase().replace(/[\s;.\-]+/g, '');
    if (/s[1&]p500|500s&p/.test(n)) return 'idx_sp500';
    if (/אג"חעםמניות/.test(n)) return 'idx_bond_eq';
    if (/אג"ח/.test(raw)) return 'idx_bond';
    if (/מדדימניות/.test(n)) return 'idx_equity';
    if (/מדדיםגמיש/.test(n)) return 'idx_flex';
    if (/עוקבמדד|עוקבימדד|עוקבתמדד/.test(n)) return 'idx_other';
    return 'active';
}
export const MANDATE_LABEL = {
    idx_sp500: 'עוקב מדד S&P 500', idx_bond_eq: 'עוקב מדדי אג"ח עם מניות', idx_bond: 'עוקב מדדי אג"ח',
    idx_equity: 'עוקב מדדי מניות', idx_flex: 'עוקב מדדים גמיש', idx_other: 'עוקב מדד (אחר)', active: 'מסלול מנוהל/כללי (לא עוקב מדד)',
};

// עד 3 חלופות מובילות לאותו סוג מוצר ואותה קטגוריית חשיפה בפועל, מדורגות לפי שארפ רשמי (SHARPE_RATIO כפי שדווח).
// רק מסלולים הפתוחים לכלל האוכלוסיה (כשיש שדה אוכלוסיית יעד) ורק מסלולים עם שארפ רשמי קיים נכנסים לדירוג;
// אם יש פחות מ-3 זה מוצג כמות שהוא, בלי מילוי מלאכותי. בפנסיה-נט אין שדה אוכלוסיית יעד - פתיחות לקהל מסומנת כלא מאומתת.
function eligibleAlternativesFor(account, matched, clientAge = null) {
    if (!matched || !matched.officialId || !matched.row || matched.row.eq === null) return { bucket: null, items: [], eligible: 0 };
    const bucket = bucketOf(matched.row.eq);
    if (!bucket) return { bucket: null, items: [], eligible: 0 };
    let pool = [], popKnown = true;
    if (account.kind === 'pensia') {
        const wantCls = matched.group === 'klalit' ? 'קרנות כלליות' : 'קרנות חדשות';
        pool = Object.values(OFFICIAL_PENSION).filter(r => r.cls === wantCls);
        popKnown = false; // בפנסיה-נט אין שדה אוכלוסיית יעד
    } else if (GEMEL_KIND_CLS[account.kind]) {
        const clsSet = GEMEL_KIND_CLS[account.kind];
        pool = Object.values(OFFICIAL_GEMEL).filter(r => clsSet.includes(r.cls) && (!r.pop || /כלל האוכלוסיה/.test(r.pop)));
    } else return { bucket, items: [], eligible: 0 };
    // רק חלופות עם שארפ רשמי גבוה ממש מזה של המסלול הנוכחי; אם לנוכחי אין שארפ רשמי, מוצגים המדורגים הגבוהים עם ציון מפורש.
    const curSharpe = matched.row.sharpeOff;
    // בפנסיה הקוהורט לדירוג המשוקלל הוא כלל המסלולים הפתוחים בסוג ובדלי החשיפה (ללא סינון שארפ מוקדם); בגמל נשאר סינון שארפ גבוה ממש.
    const cands = pool.filter(r => r.fundId !== matched.officialId && r.eq !== null && bucket.test(r.eq) && r.sharpe != null
        && (account.kind === 'pensia' || curSharpe == null || r.sharpe > curSharpe))
        .sort((a, b) => b.sharpe - a.sharpe);
    // זכאות הצטרפות (בקשת הלקוח 08/11/2026): מוצעים רק מסלולים שפתיחותם להצטרפות אומתה מול תקנון/אתר הגוף הרשמי.
    // מסלול סגור או שלא אומת מוחרג (המאגר הרשמי ממשיך לדווח גם על מסלולים סגורים, כגון "כללי" שנסגר 1/1/2016).
    // מסלול למקבלי קצבה אינו רלוונטי לעמית שומר. שדה אוכלוסיית יעד בגמל-נט מגדיר אוכלוסיית מטרה בלבד - לא אימות הצטרפות פתוחה כיום,
    // ולכן גם מסלולי גמל/השתלמות נדרשים לאימות תקנון/אתר הגוף (ברירת מחדל: אי-הצעה עד לאימות).
    // מסלולים תלויי-גיל אינם מוחרגים לפי גיל: התקנונים שאומתו מתירים במפורש בחירת מסלול גיל מחוץ לטווח (ברירת מחדל בלבד);
    // מסלול שסעיף הבחירה שלו טרם אומת (סטטוס age) נשאר בקוהורט עם סימון מותנה, לא מוחרג ולא מוצג כמאומת אישית.
    const join = window.JOINABILITY || {};
    let excludedClosed = 0, excludedUnverified = 0, excludedMissing = 0, excludedAgeUnverified = 0, excludedMandate = 0;
    const curMandate = mandateOf(matched.row.name || '');
    const kept = [];
    for (const r of cands) {
        if (/למקבלי קצבה/.test(r.name || '')) { excludedClosed++; continue; }
        const j = join[r.fundId];
        if (!j) { excludedUnverified++; continue; }
        if (j.s === 'closed') { excludedClosed++; continue; }
        // מסלול תלוי-גיל שסעיף בחירת המסלול מחוץ לטווח טרם אומת אצל הגוף (סטטוס age): נכלל רק כשגיל
        // העמית בתוך טווח ברירת המחדל (הצטרפות רגילה). מחוץ לטווח או גיל לא ידוע - מוחרג עד לאימות,
        // כי הכלי מצהיר שמוצעים רק מסלולים שפתיחותם אומתה.
        if (j.s === 'age') {
            const inBand = clientAge != null && (j.ageMin == null || clientAge >= j.ageMin) && (j.ageMax == null || clientAge <= j.ageMax);
            if (!inBand) { excludedAgeUnverified++; continue; }
        }
        // שמירת מנדט מעקב מדויק: חלופה מוצגת רק באותו מנדט כמו המסלול הנוכחי (ראו mandateOf); אחרת מוחרגת עם סיבה.
        if (mandateOf(r.name) !== curMandate) { excludedMandate++; continue; }
        kept.push({ ...r, joinStatus: j.s, joinNote: j.note, joinSrc: j.src, ageMin: j.ageMin ?? null, ageMax: j.ageMax ?? null });
    }
    // דירוג משוקלל 4-מדדי (המשקלים הסופיים אושרו על-ידי הלקוח 09/11/2026 07:41; הסרת דמי הניהול מהציון אושרה 07:37):
    // 40% שארפ רשמי, 30% תשואת 3 שנים, 10% איזון אקטוארי, 20% מדד שירות - שארפ/תשואה/אקטוארי על חלון מסונכרן 07/2023-06/2026; שירות - מדד 2025 הרשמי.
    // הלקוח מודע לחפיפה בין שארפ לתשואה ובחר במפורש לתת להם 70% (07:41).
    // דמי הניהול (שני הרכיבים, ממוצע רשמי 09/2026) אינם בציון - מוצגים בטבלה כמידע בלבד; ההשוואה הכספית ההכרעת מול הצעה אישית בשלב הבחירה.
    // נרמול: אחוזון דירוג-אמצע (midrank) בתוך הקוהורט הפתוח המלא; אקטוארי מדורג ברמת קרן ושירות ברמת גוף מנהל, ומצורפים למסלולים (אין הכפלת משקל).
    // חסר באחד מארבעת מדדי הציון = מוחרג עם סיבה, לא אפס; חסר דמי ניהול (לא בציון) = נכלל ומוצג '-'. מוצגים רק מסלולים עם ציון גבוה מזה של המסלול הנוכחי (בסיס ההשוואה).
    if (account.kind === 'pensia') {
        const JUNE = window.JUNE26 || {}, ACT = window.ACT36M || {}, SRV = window.SERVICE25 || {};
        const curJ = JUNE[matched.officialId];
        const curOff = OFFICIAL_PENSION[matched.officialId];
        const curAct = curJ && ACT[curJ.p] ? ACT[curJ.p].v : null;
        const curSrv = curJ && SRV[curJ.p] ? SRV[curJ.p].v : null;
        const curFeeA = curOff && curOff.feeA != null ? curOff.feeA : null;
        const curFeeD = curOff && curOff.feeD != null ? curOff.feeD : null;
        const curComplete = !!(curJ && curJ.s != null && curJ.y != null && curAct != null && curSrv != null);
        const cohort = [];
        for (const r of kept) {
            const jd = JUNE[r.fundId];
            const act = jd && ACT[jd.p] ? ACT[jd.p].v : null;
            const srv = jd && SRV[jd.p] ? SRV[jd.p].v : null;
            // חסר באחד מארבעת מדדי הציון = מוחרג עם סיבה; חסר דמי ניהול (לא בציון) = נכלל ומוצג '-'
            if (!jd || jd.s == null || jd.y == null || act == null || srv == null) { excludedMissing++; continue; }
            cohort.push({ ...r, jSharpe: jd.s, jY3: jd.y, act, actFund: ACT[jd.p].name, srv, srvFund: SRV[jd.p].name });
        }
        const all = curComplete ? [{ fundId: matched.officialId, name: matched.row.name, jSharpe: curJ.s, jY3: curJ.y, act: curAct, actFund: ACT[curJ.p].name, srv: curSrv, srvFund: SRV[curJ.p].name, feeA: curFeeA, feeD: curFeeD, isCurrent: true }, ...cohort] : cohort;
        if (all.length >= 2) {
            const pct = vals => {
                const n = vals.length, out = new Array(n).fill(null);
                if (n <= 1) return new Array(n).fill(50);
                const order = vals.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]);
                for (let i = 0; i < n;) {
                    let j = i; while (j + 1 < n && order[j + 1][0] === order[i][0]) j++;
                    const mid = (i + j) / 2 + 1;
                    for (let k = i; k <= j; k++) out[order[k][1]] = 100 * (mid - 1) / (n - 1);
                    i = j + 1;
                }
                return out;
            };
            const sP = pct(all.map(x => x.jSharpe));
            const yP = pct(all.map(x => x.jY3));
            // אקטוארי: דירוג קרנות נפרדות (מסלולים שונים של אותה קרן חולקים ציון זהה - אין הכפלת משקל)
            const funds = [...new Set(all.map(x => x.actFund || x.fundId))];
            const fundAct = funds.map(fnd => { const x = all.find(z => (z.actFund || z.fundId) === fnd); return x.act; });
            const fP = pct(fundAct);
            const actP = all.map(x => fP[funds.indexOf(x.actFund || x.fundId)]);
            // שירות: דירוג גופים מנהלים נפרדים (אותו שיקול - ציון מדד השירות משותף לכל קרנות הגוף)
            const srvOrgs = [...new Set(all.map(x => x.srvFund || x.fundId))];
            const orgSrv = srvOrgs.map(org => { const x = all.find(z => (z.srvFund || z.fundId) === org); return x.srv; });
            const svP = pct(orgSrv);
            const srvP = all.map(x => svP[srvOrgs.indexOf(x.srvFund || x.fundId)]);
            // דמי הניהול אינם חלק מהציון (הוראת הלקוח 09/11/2026 07:37): שני הרכיבים מוצגים בטבלה כממוצע רשמי בלבד.
            const comp = (a, b, c, e) => all.map((_, i) => a * sP[i] + b * yP[i] + c * actP[i] + e * srvP[i]);
            const main = comp(0.40, 0.30, 0.10, 0.20);
            all.forEach((x, i) => { x.score = main[i]; });
            // רגישות: משקל שירות 15%/25%, השאר ביחס קבוע 40:30:10 (דמי ניהול אינם בציון) - אם המוביל (מלבד הנוכחי) מתחלף, מסומן כפשרה קרובה
            const winner = arr => { let bi = -1; arr.forEach((v, i) => { if (!all[i].isCurrent && (bi < 0 || v > arr[bi])) bi = i; }); return bi; };
            const w0 = winner(main), w1 = winner(comp(0.425, 0.3188, 0.1063, 0.15)), w2 = winner(comp(0.375, 0.2813, 0.0938, 0.25));
            const tradeoffClose = w0 >= 0 && (w1 !== w0 || w2 !== w0);
            // בסיס השוואה חסר (חסר אחד מארבעת מדדי הציון של המסלול הנוכחי): אין "מעל הנוכחי",
            // אין חלופה אוטומטית לדוח לפני/אחרי ואין טענת שיפור או חיסכון. הדירוג הפנימי של הקוהורט
            // נשמר להשוואה בלבד (rankedPeers) עם scored=false וסימון baselineIncomplete מפורש.
            if (!curComplete) {
                return { bucket, items: [], eligible: 0, popKnown, curSharpe,
                    excludedClosed, excludedUnverified, excludedMissing, excludedAgeUnverified, excludedMandate,
                    scored: false, baselineIncomplete: true, neutralComponents: [funds.length === 1 ? 'actuarial' : null, srvOrgs.length === 1 ? 'service' : null].filter(Boolean), rankedPeers: [...cohort].sort((a, b) => b.score - a.score || a.fundId - b.fundId), window: window.SCORING_WINDOW, curScore: null, cohortN: all.length, tradeoffClose: false };
            }
            const curScore = main[0];
            const above = cohort.filter(x => x.score > curScore).sort((a, b) => b.score - a.score);
            return { bucket, items: above.slice(0, 3), eligible: above.length, popKnown, curSharpe,
                excludedClosed, excludedUnverified, excludedMissing, excludedAgeUnverified, excludedMandate,
                scored: true, neutralComponents: [funds.length === 1 ? 'actuarial' : null, srvOrgs.length === 1 ? 'service' : null].filter(Boolean), rankedPeers: [...cohort].sort((a, b) => b.score - a.score || a.fundId - b.fundId), window: window.SCORING_WINDOW, curScore, cohortN: all.length, tradeoffClose };
        }
        return { bucket, items: [], eligible: 0, popKnown, curSharpe, excludedClosed, excludedUnverified, excludedMissing, excludedAgeUnverified, excludedMandate,
            scored: false, window: window.SCORING_WINDOW, cohortN: all.length, tooSmall: true };
    }
    return { bucket, items: kept.slice(0, 3), eligible: kept.length, popKnown, curSharpe, excludedClosed, excludedUnverified, excludedAgeUnverified };
}

// Comparison visibility is independent of suitability for a transfer simulation.
// Never feed comparison-only, tied, lower-scored or incomplete peers into items.
// Non-pension scores use no actuarial component. Joining evidence and score availability are independent.
function nonPensionComparisons(account, matched, age) {
    const insurance = account.kind === 'menahalim';
    const source = insurance ? OFFICIAL_INSURANCE : OFFICIAL_GEMEL;
    const current = source[matched.officialId];
    const bucket = bucketOf(current?.eq);
    if (!current || !bucket) return {bucket:null,items:[],comparisons:[],comparisonCount:0};
    const service = (insurance ? window.SERVICE25_INSURANCE : window.SERVICE25_GEMEL) || {};
    // JOINABILITY is pension/gemel only. Insurance identifiers must never borrow its evidence.
    const join = insurance ? {} : window.JOINABILITY || {};
    const cls = x => insurance ? x.classification : x.cls;
    const mandate = mandateOf(current.name);
    const cohort = Object.values(source).filter(x => cls(x) === cls(current) &&
        (x.fundId === current.fundId || insurance || !x.pop || /כלל האוכלוסיה/.test(x.pop)) && x.eq != null && bucket.test(x.eq) &&
        mandateOf(x.name) === mandate && !/למקבלי קצבה/.test(x.name || '') &&
        (x.fundId === current.fundId || join[x.fundId]?.s !== 'closed'))
        .map(x => ({...x,srv:service[x.parentId] ?? null,isCurrent:x.fundId === current.fundId}));
    const percentile = (v, values) => {
        if (v == null || !Number.isFinite(v)) return null;
        const vs = values.filter(Number.isFinite);
        if (vs.length <= 1) return 50;
        return 100 * (vs.filter(x => x < v).length + (vs.filter(x => x === v).length-1)/2) / (vs.length-1);
    };
    const orgs = [...new Map(cohort.filter(x=>x.srv != null).map(x=>[x.parentId,x.srv])).values()];
    for (const x of cohort) {
        const parts = [['sharpe',40,percentile(x.sharpe,cohort.map(z=>z.sharpe))],
            ['return',30,percentile(x.y3,cohort.map(z=>z.y3))],['service',20,percentile(x.srv,orgs)]];
        const present = parts.filter(z=>z[2] != null);
        x.componentMask = present.map(z=>z[0]).join('+');
        x.missingComponents = parts.filter(z=>z[2] == null).map(z=>z[0]);
        x.score = present.length ? present.reduce((n,z)=>n+z[1]*z[2],0)/present.reduce((n,z)=>n+z[1],0) : null;
        x.partialScore = x.missingComponents.length > 0;
        x.rankComplete = !x.partialScore && cohort.length > 1;
        x.scoreAvailable = x.score != null && cohort.length > 1;
        if (!x.scoreAvailable) x.score = null;
        const j = join[x.fundId];
        const inAge = j?.s === 'age' && age != null && (j.ageMin == null || age >= j.ageMin) && (j.ageMax == null || age <= j.ageMax);
        x.joinVerified = j?.s === 'open' || inAge;
        x.joinStatus = j?.s || 'unverified';
        x.joinNote = j?.note || 'פתיחות להצטרפות טרם אומתה מול מקור רשמי';
        x.joinSrc = j?.src;
        x.missingHistory = x.y3 == null;
    }
    const cur = cohort.find(x=>x.isCurrent);
    const peers = cohort.filter(x=>!x.isCurrent);
    for (const x of peers) {
        x.relation = x.score != null && cur?.score != null && x.componentMask === cur.componentMask
            ? Math.abs(x.score-cur.score)<1e-8 ? 'equal' : x.score>cur.score ? 'higher' : 'lower' : 'unranked';
        x.comparisonOnly = true;
    }
    peers.sort((a,b)=>Number(b.rankComplete)-Number(a.rankComplete) || a.componentMask.localeCompare(b.componentMask) || (b.score ?? -1)-(a.score ?? -1) || a.fundId-b.fundId);
    const items = peers.filter(x=>x.joinVerified && x.rankComplete && cur?.rankComplete && x.relation==='higher').slice(0,3);
    return {bucket,items,eligible:items.length,comparisons:peers.slice(0,3),comparisonCount:peers.length,
        rankedPeers:peers,scored:true,curScore:cur?.score ?? null,currentScored:cur,curSharpe:current.sharpe,
        cohortN:cohort.length,window:insurance?'שארפ רשמי לחמש השנים האחרונות ותשואה נצברת תלת-שנתית (ביטוח-נט 09/2026, לפי מתודולוגיית הרשות)':'שארפ רשמי ותשואה נצברת תלת-שנתית כפי שפורסמו (גמל-נט 09/2026)',serviceProxy:account.kind==='hishtalmut',
        neutralComponents:orgs.length===1?['service']:[],reason:peers.length?null:'no_compatible_peers'};
}

export function alternativesFor(account, matched, clientAge = null) {
    if (matched?.officialId && matched?.row && (GEMEL_KIND_CLS[account.kind] || account.kind === 'menahalim')) return nonPensionComparisons(account, matched, clientAge);
    const r = eligibleAlternativesFor(account, matched, clientAge);
    if (!r.bucket || !matched?.row) return { ...r, comparisons: [], comparisonCount: 0, reason: 'missing_identity_or_exposure' };
    let pool = [];
    if (account.kind === 'pensia') {
        const cls = matched.group === 'klalit' ? 'קרנות כלליות' : 'קרנות חדשות';
        pool = Object.values(OFFICIAL_PENSION).filter(x => x.cls === cls);
    } else if (GEMEL_KIND_CLS[account.kind]) {
        pool = Object.values(OFFICIAL_GEMEL).filter(x => GEMEL_KIND_CLS[account.kind].includes(x.cls) && (!x.pop || /כלל האוכלוסיה/.test(x.pop)));
    } else return { ...r, comparisons: [], comparisonCount: 0, reason: 'unsupported_product' };
    const currentOfficial = (account.kind === 'pensia' ? OFFICIAL_PENSION : OFFICIAL_GEMEL)[matched.officialId];
    if (currentOfficial) pool = pool.filter(x => x.cls === currentOfficial.cls);
    const mandate = mandateOf(matched.row.name);
    const ranked = new Map((r.rankedPeers || []).map(x => [x.fundId, x]));
    const join = window.JOINABILITY || {};
    const peers = pool.filter(x => x.fundId !== matched.officialId && x.eq != null && r.bucket.test(x.eq)
        && mandateOf(x.name) === mandate && !/למקבלי קצבה/.test(x.name || '') && join[x.fundId]?.s !== 'closed')
        .map(x => {
            const j = join[x.fundId];
            const inAge = j?.s === 'age' && clientAge != null && (j.ageMin == null || clientAge >= j.ageMin) && (j.ageMax == null || clientAge <= j.ageMax);
            const verified = j?.s === 'open' || inAge;
            const scored = ranked.get(x.fundId);
            let relation = 'unranked';
            if (scored && r.curScore != null) relation = Math.abs(scored.score - r.curScore) < 1e-8 ? 'equal' : scored.score > r.curScore ? 'higher' : 'lower';
            else if (account.kind !== 'pensia' && x.y3 != null && matched.row.y3 != null && x.sharpe != null && r.curSharpe != null) relation = x.sharpe === r.curSharpe ? 'equal' : x.sharpe > r.curSharpe ? 'higher' : 'lower';
            return { ...x, ...scored, comparisonOnly: true, joinVerified: verified, joinStatus: j?.s || 'unverified', relation,
                rankComplete: !!scored, missingHistory: x.y3 == null, joinNote: j?.note || 'פתיחות להצטרפות טרם אומתה מול מקור רשמי' };
        });
    peers.sort((a, b) => Number(b.rankComplete) - Number(a.rankComplete)
        || (a.rankComplete && b.rankComplete ? b.score - a.score : 0)
        || (account.kind !== 'pensia' ? Number(b.sharpe != null) - Number(a.sharpe != null) || (b.sharpe ?? 0) - (a.sharpe ?? 0) : 0)
        || Number(b.joinVerified) - Number(a.joinVerified) || a.fundId - b.fundId);
    return { ...r, comparisons: peers.slice(0, 3), comparisonCount: peers.length, reason: peers.length ? null : 'no_compatible_peers' };
}

// מפתח יציב ויחיד להחזקה: חשבון + קוד מסלול (כשקיים) + סדרן כפילויות לשם זהה באותו חשבון.
// שתי שורות בעלות אותו שם (קודים שונים) או שורות כפולות ללא קוד אינן מתמזגות - לכל אחת מפתח משלה.
export function trackKeyOf(account, track) {
    return account + '|' + (track.code || track.baseName || track.name) + (track.uid ? '#' + track.uid : '');
}

// ==================================================================
// ביטול כפילויות בייבוא (09/11/2026)
// זהות רשומה: יצרן + מספר חשבון/פוליסה + סוג מוצר. זהות דוח: תאריך ערך הצבירות (asOf).
// עותקים זהים (אותו חשבון, אותו דוח, אותו תוכן) - מדלגים ומציינים במפורש כמה דולגו.
// דוחות שונים בתאריכי ערך - נטען העדכני בלבד, עם מקור ותאריכים גלויים.
// רשומות מתנגשות (אותו חשבון, אותו תאריך ערך או ללא תאריך בר-השוואה, תוכן שונה) - נדחות
// לחלוטין מהחישוב: לא נטענות, לא נספרות ולא ניתנות לבחירה. הן נשמרות כפי שהן ברשימת
// rejected עם פירוט הגרסאות, והמשתמש מתבקש להעלות קובץ אחד לא-חופף. אין ניחוש גרסה.
export function dedupeAccounts(accounts) {
    const notes = [];
    const rejected = [];
    const groups = new Map();
    let anon = 0;
    const stripFlag = (x) => (x || '').replace(/ \[רשומה מתנגשת \d+\]$/, ''); // סיומת סימון אינה חלק מזהות החשבון (אידמפוטנטיות ניתוח חוזר)
    for (const a of accounts || []) {
        const acctNo = stripFlag(a.account).trim();
        const id = acctNo
            ? [(a.yatzran || '').trim(), acctNo, a.sugMutzar || '', a.kind || ''].join('|')
            : '|anon|' + (anon++);
        if (!groups.has(id)) groups.set(id, []);
        groups.get(id).push(a);
    }
    const canon = (a) => JSON.stringify({
        p: a.plan || '', s: a.sugPolisa || '', st: a.status || '', as: a.asOf || '',
        tr: (a.tracks || []).map(t => [t.name, t.code || '', Math.round((t.balance || 0) * 100) / 100]).sort(),
        fd: a.feeDeposit ?? null, fa: a.feeAcc ?? null, tb: Math.round((a.totalBalance || 0) * 100) / 100,
    });
    const dateKey = (a) => {
        const d = (a.asOf || a.nechonut || '').replace(/\D/g, '');
        return /^\d{8}$/.test(d) ? d : ''; // yyyyMMdd בממשק 009
    };
    const out = [];
    // רשומה ללא מספר חשבון לעולם אינה מקובצת לצורך דה-דופ: שני חשבונות שונים ללא מספר אינם עותקים זה לזה
    for (const [id, list] of groups) {
        if (id.startsWith('|')) { out.push(...list); continue; }
        void id;
        if (list.length === 1) { out.push(list[0]); continue; }
        const stripId0 = stripFlag(list[0].account).trim();
        const label = `${stripId0 || '?'} (${list[0].yatzran || 'גוף לא ידוע'})`;
        // עותקים זהים לחלוטין: דילוג בטוח עם ספירה גלויה
        const byContent = new Map();
        for (const a of list) {
            const c = canon(a);
            if (!byContent.has(c)) byContent.set(c, []);
            byContent.get(c).push(a);
        }
        const kept = [];
        for (const [, same] of byContent) {
            kept.push(same[0]);
            if (same.length > 1) notes.push(`חשבון ${label}: נמצאו ${same.length} עותקים זהים של אותו דוח (העלאה כפולה או חפיפה בין קבצים) - דולגו ${same.length - 1}.`);
        }
        if (kept.length === 1) { out.push(kept[0]); continue; }
        // תוכן שונה: העדכני בתאריך ערך נטען, קודמים מדולגים עם provenance גלוי
        const withDate = kept.filter(a => dateKey(a));
        if (withDate.length) {
            const maxD = withDate.map(dateKey).sort().pop();
            const newest = kept.filter(a => dateKey(a) === maxD);
            const older = kept.filter(a => dateKey(a) !== maxD);
            for (const o of older) notes.push(`חשבון ${label}: נמצאו דוחות מתאריכי ערך שונים; נטען העדכני (תאריך ערך ${maxD}), דוח מתאריך ${dateKey(o) || 'לא ידוע'} דולג.`);
            if (newest.length === 1) { out.push(newest[0]); continue; }
            // כמה רשומות שונות באותו תאריך-ערך עדכני: דחייה מלאה מהחישוב. הגרסאות נשמרות כפי שהן
            // ברשימת rejected (סדר דטרמיניסטי), ללא סכום מצרפי - סכום גרסאות חלופיות אינו שווי נכסים.
            const sorted = newest.slice().sort((a, b) => canon(a) < canon(b) ? -1 : 1);
            rejected.push({ label, reason: 'conflict-same-date', asOf: maxD, versions: sorted.map(r => ({ record: r, balance: Math.round(((r.totalBalance ?? (r.tracks || []).reduce((sm, t) => sm + (t.balance || 0), 0)) || 0) * 100) / 100 })) });
            notes.push(`חשבון ${label}: נמצאו ${sorted.length} רשומות שונות באותו תאריך ערך (${maxD}) - החשבון נדחה מהחישוב; הנתונים נשמרים ומוצגים להשוואה. כדי לטעון אותו, הסירו את הכפילות והעלו קובץ אחד לא-חופף.`);
        } else {
            const sorted = kept.slice().sort((a, b) => canon(a) < canon(b) ? -1 : 1);
            rejected.push({ label, reason: 'conflict-undatable', asOf: null, versions: sorted.map(r => ({ record: r, balance: Math.round(((r.totalBalance ?? (r.tracks || []).reduce((sm, t) => sm + (t.balance || 0), 0)) || 0) * 100) / 100 })) });
            notes.push(`חשבון ${label}: נמצאו ${sorted.length} רשומות שונות ללא תאריך ערך בר-השוואה - החשבון נדחה מהחישוב; הנתונים נשמרים ומוצגים להשוואה. כדי לטעון אותו, הסירו את הכפילות והעלו קובץ אחד לא-חופף.`);
        }
    }
    // הרשומות שנדחו נצמדות גם למערך עצמו (מאפיין שאינו נספר ואינו מושרשר ב-JSON) כדי שגם קורא
    // שמעביר רק את מערך החשבונות לא יאבד את הדחייה בשתיקה.
    Object.defineProperty(out, 'rejectedVersions', { value: rejected, enumerable: false, writable: true, configurable: true });
    return { accounts: out, notes, rejected };
}

export function analyzePortfolio(p) {
    const dd = dedupeAccounts(p.accounts);
    if (dd.accounts.length !== p.accounts.length || dd.notes.length) p.accounts = dd.accounts;
    // רשומות שנדחו בייבוא נשמרות על אובייקט התיק עצמו: ניתוח חוזר (render חוזר) רואה את אותה
    // רשימת דחיות גם אחרי שהרשומות הוסרו מ-p.accounts, ואינו כופל אותה.
    if (dd.rejected.length && !(p.rejectedImports || []).length) p.rejectedImports = dd.rejected;
    const holdings = [];
    const unmatched = [];
    let total = 0, matched = 0, eqSum = 0;
    const manualDropped = [];
    const mmSeen = new Set();
    for (const a of p.accounts) {
        if (a.kind === 'risk') continue;
        const seen = {};
        for (const t of a.tracks) {
            const base = t.baseName || t.name; // שם-בסיס יציב: ניתוח חוזר על אותו אובייקט תיק לא יערום סיומות ולא יאבד מפתחות מבוססי-שם
            const dupKey = (t.code || '') + '|' + base;
            seen[dupKey] = (seen[dupKey] || 0);
            if (seen[dupKey] > 0) t.uid = seen[dupKey]; else t.uid = undefined;
            seen[dupKey]++;
            total += t.balance;
            let m = matchTrack(a, base, t.code);
            if (!m.row && p.manualMatches) {
                const mmKey = a.account + '|' + (t.code || base) + (t.uid ? '#' + t.uid : '');
                mmSeen.add(mmKey);
                const mmSel = p.manualMatches[mmKey];
                if (mmSel) {
                    const applied = manualMatchFor(a, t, mmSel);
                    if (applied) m = applied;
                    else manualDropped.push({ key: mmKey, name: mmSel.name || '' });
                }
            }
            // השלמת חשיפה ממקורות פומביים נוספים (exposure-extra.js) למסלולים שאינם במאגרי האוצר, לפי מזהה המסלול הרשמי.
            // שים לב: ההתאמה הרשמית דורשת גם ח.פ תואם; כאן מחלצים את 7 הספרות בלבד לצורך איתור השלמה מתועדת.
            const digits = (t.code || '').replace(/\D/g, '');
            const fid = digits.length >= 7 ? parseInt(digits.slice(-7), 10) : 0;
            const ov = (!m.row || m.row.eq === null) && fid > 0 ? (window.EXPOSURE_OVERRIDES || {})[fid] || null : null;
            const eq = m.row && m.row.eq !== null ? m.row.eq : (ov ? ov.eq : null);
            t.baseName = base;
            t.name = t.uid ? base + ' #' + (t.uid + 1) : base; // בידול תצוגה לשורות כפולות - מחושב מחדש משם-הבסיס בכל ניתוח (אידמפוטנטי)
            holdings.push({ account: a, track: t, match: m, equityPct: eq, override: ov, estimate: eq === null ? classEstimate(a, t) : null });
            if (eq !== null) { matched += t.balance; eqSum += t.balance * eq; }
            else unmatched.push({ account: a, name: t.name, balance: t.balance });
        }
    }
    return {
        holdings, totalValue: total, matchedValue: matched,
        weightedEquity: matched > 0 ? eqSum / matched : null,
        coverage: total > 0 ? matched / total : 0,
        unmatchedTracks: unmatched,
        importNotes: dd.notes,
        rejectedImports: p.rejectedImports || [], // רשומות חופפות/מתנגשות שנדחו לפני החישוב - נשמרות כפי שהן, ללא סכום מצרפי
        manualDropped, // בחירות ידניות שמורות שטביעת האצבע שלהן אינה תואמת את ההחזקה הנוכחית - לא הוחלו
        manualOrphans: p.manualMatches ? Object.keys(p.manualMatches).filter(k => !mmSeen.has(k)).map(k => ({ key: k, name: (p.manualMatches[k] || {}).name || '' })) : [], // בחירות שההחזקה שלהן כבר לא קיימת
    };
}
export function topCandidates(groupKey, minEq, n = 6) {
    const g = GROUPS.find(x => x.key === groupKey);
    if (!g) return [];
    // מסלולים המוגבלים לעובדי סקטור/מפעל מסוים (flag ב-refdata, מקור: שדה אוכלוסיית היעד במאגר הרשמי)
    // אינם חלופה פתוחה לכל לקוח ולכן מוחרגים מהדירוג. לקוח שכבר מחזיק מסלול כזה עדיין רואה את ההתאמה שלו.
    const openOnly = r => !/עובדי/.test(r.flag || '');
    return g.data.main
        .filter(r => r.months >= 36 && openOnly(r) && (minEq === null || (r.eq !== null && r.eq >= minEq)))
        .sort((a, b) => b.sharpe - a.sharpe)
        .slice(0, n);
}

// --- 161 derived computations (rules from the 08/11/2026 rule library, partial coverage) ---
export const RULES_SRC = 'ספריית כללים ראשונית 08/11/2026 (כיסוי חלקי; כללי פריסה מעתק מראה בלבד)';
export const EXEMPT_CAP_2026 = 13750; // ₪ לשנת עבודה, קפוא 2025-2027
export const KITZBA_MAZKE_2026 = 9430;
export const EXEMPT_PCT_2026 = 0.575;

// --- חישוב נטו 2026 - מקורות רשמיים בלבד ---
// מדרגות + מס יסף + ערך נקודת זיכוי: רשות המסים, "לוח עזר לחישוב מס הכנסה ממשכורת ושכר עבודה לחודש ינואר 2026 ואילך" (מעודכן לאפריל 2026), gov.il:
// https://www.gov.il/BlobFolder/generalpage/income-tax-monthly-deductions-booklet/he/generalInformation_income-tax-monthly-deductions-booklet_monthly-deductions-booklet-2026.pdf
// פטור קצבה מזכה: רשות המסים, מדריך לקיבוע זכויות (טופס 161ד) 2026, gov.il (57.5% מתקרת 9,430 = 5,422 לחודש)
export const TAX_BRACKETS_2026_MONTHLY = [[7010, 0.10], [10060, 0.14], [19000, 0.20], [25100, 0.31], [46690, 0.35], [Infinity, 0.47]];
export const SURTAX_MONTHLY_THRESHOLD_2026 = 60130; // מס נוסף 3% (סעיף 121ב) מעל 60,130 לחודש
export const SURTAX_RATE_2026 = 0.03;
export const CREDIT_POINT_MONTHLY_2026 = 242; // נקודת זיכוי 33א, לחודש
export function monthlyTaxBrackets2026(taxableMonthly) {
    let tax = 0, prev = 0;
    for (const [cap, rate] of TAX_BRACKETS_2026_MONTHLY) {
        if (taxableMonthly > prev) tax += (Math.min(taxableMonthly, cap) - prev) * rate;
        prev = cap;
        if (taxableMonthly <= cap) break;
    }
    if (taxableMonthly > SURTAX_MONTHLY_THRESHOLD_2026) tax += (taxableMonthly - SURTAX_MONTHLY_THRESHOLD_2026) * SURTAX_RATE_2026;
    return tax;
}
// חישוב נטו חודשי לקצבה: הפטור ניתן רק כשסומנה זכאות (גיל הזכאות + קצבה מזכה) ומופחת ב-% ניצול קיבוע זכויות של אותו בן זוג.
// המס על הקצבה מחושב שולית: מס על (הכנסה אחרת + קצבה חייבת) פחות מס על ההכנסה האחרת בלבד, כך שמס על הכנסות אחרות לא מיוחס לקצבה.
export function pensionNetMonthly2026({ gross, eligible = false, kibuaUsedPct = 0, certExemptRatePct = null, simChoice = '', creditPoints = 2.25, otherIncome = 0 }) {
    const capExempt = Math.round(KITZBA_MAZKE_2026 * EXEMPT_PCT_2026); // 5,422
    // הפטור: הקצבה פטורה עד 57.5% מתקרת הקצבה המזכה (5,422 ₪). ניצול סל הפטור (מענקים פטורים/היוון) מקטין קודם את התקרה החודשית - יתרת סל הפטור/180 - ורק אז הפטור מוגבל בקצבה בפועל: מדריך 161ד 2026, דוגמה 1 עמ' 6-7 (יתרת סל 382,005/180=2,122, וקצבה 12,000 ← פטור 2,122). קצבה נמוכה מהתקרה פטורה במלואה (דוגמה 3 עמ' 3).
    // מקור ראשי: שיעור הפטור מאישור קיבוע הזכויות בפועל (אחוז מהתקרה המזכה, כולל הקצאה בין משלמים - סל פטור אחד לכל המשלמים של אותו אדם).
    // בלי אישור: הפטור מחושב רק אחרי בחירה מפורשת של הנחיית הדמיה - סל מלא או ניצול חלקי גס. אין ברירת מחדל שקטה של זכאות מלאה.
    let exemptCapMonthly = 0, exemptSource;
    if (certExemptRatePct !== null && certExemptRatePct !== undefined && isFinite(certExemptRatePct)) {
        exemptCapMonthly = KITZBA_MAZKE_2026 * Math.min(Math.max(certExemptRatePct, 0), EXEMPT_PCT_2026 * 100) / 100;
        exemptSource = 'certificate';
    } else if (simChoice === 'full') {
        exemptCapMonthly = capExempt;
        exemptSource = 'sim-full';
    } else if (simChoice === 'used') {
        const remainingPct = 1 - Math.min(Math.max(kibuaUsedPct, 0), 100) / 100;
        exemptCapMonthly = capExempt * remainingPct;
        exemptSource = 'sim-estimate';
    } else {
        exemptSource = 'unspecified';
    }
    const exempt = eligible ? Math.min(gross, exemptCapMonthly) : 0;
    if (!eligible) exemptSource = 'none';
    const taxablePension = Math.max(0, gross - exempt);
    const other = Math.max(0, otherIncome);
    const credits = creditPoints * CREDIT_POINT_MONTHLY_2026;
    const taxOtherOnly = Math.max(0, monthlyTaxBrackets2026(other) - credits);
    const taxTotal = Math.max(0, monthlyTaxBrackets2026(other + taxablePension) - credits);
    const pensionTax = taxTotal - taxOtherOnly; // מס שולי על הקצבה בלבד
    return {
        gross, eligible, exempt: Math.round(exempt), taxablePension: Math.round(taxablePension), exemptSource,
        taxOther: Math.round(taxOtherOnly), pensionTax: Math.round(pensionTax), taxTotal: Math.round(taxTotal),
        netPension: Math.round(gross - pensionTax), netTotal: Math.round(gross + other - taxTotal),
    };
}
// קצבת שאירים - משטר מס נפרד מקצבה מזכה: פקודת מס הכנסה סעיף 9(6ו) (תיקון 190, נוסח נבו) -
// (א) קצבת שאירים הנובעת מתשלומים פטורים פטורה; (ב) קצבת שאירים מקופת גמל לקצבה / תכנית ביטוח / פנסיה תקציבית
// פטורה עד תקרת הקצבה המזכה (9,430 ₪ ב-2026, לוח הניכויים הרשמי) - פטור מלא, לא 57.5%, ללא קיבוע זכויות
// וללא ניצול סל הפטור (קצבת שאירים מוחרגת מהגדרת "קצבה מזכה" גם במדריך 161ד הרשמי 2026).
// החלק שמעל התקרה חייב במס שולי. החישוב מניח קצבה שאינה מתשלומים פטורים (הערכה שמרנית).
export function survivorNetMonthly2026({ gross, creditPoints = 2.25, otherIncome = 0 }) {
    const exempt = Math.min(Math.max(0, gross), KITZBA_MAZKE_2026);
    const taxablePension = Math.max(0, gross - exempt);
    const other = Math.max(0, otherIncome);
    const credits = creditPoints * CREDIT_POINT_MONTHLY_2026;
    const taxOtherOnly = Math.max(0, monthlyTaxBrackets2026(other) - credits);
    const taxTotal = Math.max(0, monthlyTaxBrackets2026(other + taxablePension) - credits);
    const pensionTax = taxTotal - taxOtherOnly;
    return { gross, exempt: Math.round(exempt), taxablePension: Math.round(taxablePension), pensionTax: Math.round(pensionTax), netPension: Math.round(gross - pensionTax) };
}
// נרמול מספרים ממקורות טקסט (טופס 161, שדות ידניים). פסיק או נקודה יכולים להיות מפריד אלפים
// או עשרוני; ההכרעה לפי תבנית, ללא ניחוש שקט: שני המפרידים -> האחרון עשרוני; פסיק בודד עם
// קבוצות של 3 ספרות -> אלפים; פסיק עם 1-2 ספרות -> עשרוני (למשל שנות עבודה "6,5"); מינוס נשמר.
export function toNum(s) {
    if (!s) return null;
    let t = String(s).trim();
    // תווים שאינם מספר/מפריד/מטבע/אחוז/סוגריים - ערך מעוות: null, לא ניקוי שקט שהופך קלט פגום לתקין
    if (/[^\d\s.,()+%₪$€-]/.test(t)) return null;
    let neg = false;
    const par = t.match(/^\((.+)\)$/); // סוגריים חשבונאיים = שלילי
    if (par) { neg = true; t = par[1]; }
    t = t.replace(/[\s₪$€%]/g, '');
    if (/^-/.test(t)) neg = true;
    t = t.replace(/^[+-]/, '');
    if (!t || /[()]/.test(t)) return null;
    const hasDot = t.includes('.'), hasComma = t.includes(',');
    if (hasDot && hasComma) {
        if (t.lastIndexOf(',') > t.lastIndexOf('.')) t = t.replace(/\./g, '').replace(',', '.');
        else t = t.replace(/,/g, '');
    } else if (hasComma) {
        if (/^\d{1,3}(,\d{3})+$/.test(t)) t = t.replace(/,/g, '');
        else if (/^\d+,\d{1,2}$/.test(t)) t = t.replace(',', '.');
        else return null; // פסיקים במיקומים לא חוקיים - ערך מעוות, לא לנחש
    } else if (hasDot && /\.\d{3}$/.test(t) && (t.match(/\./g) || []).length === 1) {
        return null; // "12.500" - נקודה עם 3 ספרות: אלפים או עשרוני? דו-משמעי, לא לנחש בלי פורמט השדה
    }
    t = t.replace(/[^\d.]/g, '');
    const n = parseFloat(t);
    return isFinite(n) ? (neg ? -n : n) : null;
}
// שדה "שנות עבודה" (טופס 161 / הזנה ידנית): החילוץ מהטופס מייצר נקודה עשרונית עד 3 ספרות
// (27.000, 6.500, 12.583) - כאן נקודה עם 3 ספרות היא עשרונית בוודאות, בניגוד לערך כספי דו-משמעי.
// מותרת גם כתיבה ידנית עם פסיק עשרוני או סיומת "שנים". ערך שלא בפורמט -> null (והשדה מסומן, לא מושמט בשקט).
export function parseWorkYears(s) {
    if (!s) return null;
    const t = String(s).trim().replace(/\s*שנים\s*$/, '');
    let m = t.match(/^(\d{1,3})[.,](\d{1,3})$/);
    if (m) { const n2 = parseFloat(m[1] + '.' + m[2]); return isFinite(n2) && n2 >= 0 && n2 <= 80 ? n2 : null; }
    if (/^\d{1,3}$/.test(t)) { const n2 = parseInt(t, 10); return n2 >= 0 && n2 <= 80 ? n2 : null; }
    return null;
}

// יחס 32/שנות עבודה: מענקים פטורים על פני יותר מ-32 שנות עבודה מוכפלים ביחס זה לפני ×1.35 (מדריך 161ד 2026, עמ' 6-7).
export function grantRatio32(years) {
    return years && years > 32 ? 32 / years : 1;
}

export function insights161(f) {
    const years = parseWorkYears(f.workYears);
    const salarySev = toNum(f.salarySeverance) ?? toNum(f.salaryFull);
    let cap = null;
    if (years && salarySev) cap = Math.min(salarySev * 1.5, EXEMPT_CAP_2026) * years;
    const formExempt = toNum(f.maxExempt);
    const exemptMatches = cap !== null && formExempt !== null ? Math.abs(cap - formExempt) < Math.max(2, cap * 0.001) : null;
    let ktseva = 0, direct = 0;
    for (const g of f.grants) {
        const amt = toNum(g.amount) || 0;
        if (g.code === '5' || g.code === '6') ktseva += amt; else if (g.code === '1') direct += amt;
    }
    const mustFillPartB = direct > 0 || ktseva > 405900;
    // M-003: מענק בגין יותר מ-32 שנים - רק החלק היחסי (× 32/שנים), מדריך 161ד 2026 עמ' 6-7
    const ratio32 = grantRatio32(years);
    const kibuah = formExempt !== null ? formExempt * ratio32 * 1.35 / 180 : null;
    let spread = null;
    if (years && years >= 6) {
        const raw = years / 4;
        spread = Math.min(6, raw - Math.floor(raw) >= 0.5 ? Math.ceil(raw) : Math.floor(raw));
    }
    const notes = [];
    if (f.workYears && String(f.workYears).trim() && years === null) notes.push(`שדה שנות העבודה ("${String(f.workYears).trim()}") אינו בפורמט מספרי מזוהה (למשל 27 או 12.583) - תקרת הפטור המחושבת ושנות הפריסה לא חושבו. תקנו את השדה מול הטופס.`);
    if (direct > 0) notes.push('קיים מענק מעסיק ישיר (קוד משלם 1): אינו זכאי לרצף קצבה, וחובה למלא חלק ב׳ בטופס 161.');
    if (ktseva > 0) notes.push(`סכומים מקופות (קוד 5/6): ${Math.round(ktseva).toLocaleString('he-IL')} ₪ - זכאים לרצף קצבה עד התקרה.`);
    const eligYearM = f.retireDate && f.retireDate.match(/(19|20)\d{2}/);
    const eligYear = eligYearM ? +eligYearM[0] : null;
    if (kibuah !== null) notes.push(`ניצול הפטור ההוני מקטין את יתרת הפטור על הקצבה בקיבוע זכויות - הערכה גסה להמחשה בקבועי 2026 בלבד: כ-${Math.round(kibuah).toLocaleString('he-IL')} ₪ לחודש (הסכום הפטור כמודפס בטופס${ratio32 < 1 ? ` × 32/${years}` : ''} × 1.35 / 180). הסכום בטופס נומינלי: הנוסחה הרשמית דורשת מידוד לתחילת שנת הזכאות, וחריגות (כגון מענקים ששולמו למעלה מ-15 שנה לפני הקצבה הראשונה ולא יובאו בקיזוז) לא נבדקו כאן - לכן זו אינה הפחתת הזכויות בפועל; הקביעה מול פקיד השומה בלבד.${eligYear && eligYear !== 2026 ? ` שנת הזכאות לפי הטופס: ${eligYear} - שיעור הפטור לשנת זו שונה (2027: 62.5%, 2028 ואילך: 67%) והתקרה מתמדדת מדי שנה.` : ''} מקור: מדריך רשות המסים לקיבוע זכויות טופס 161ד 2026 (gov.il).`);
    if (spread !== null) notes.push(`פריסת מס קדימה: כ-${spread} שנות פריסה אפשריות לפי ${years} שנות עבודה (שנה על 4 שנות עבודה, עיגון מ-0.5 כלפי מעלה; מקור החוזר בעתק מראה בלבד - לאמת).`);
    notes.push(`פטור קצבה מזכה 2026: ${Math.round(KITZBA_MAZKE_2026 * EXEMPT_PCT_2026).toLocaleString('he-IL')} ₪ לחודש (57.5% מתקרת ${KITZBA_MAZKE_2026.toLocaleString('he-IL')} ₪), בכפוף לקיבוע זכויות.${eligYear && eligYear !== 2026 ? ` שנת הזכאות לפי הטופס: ${eligYear} - קבועי 2026 כאן להמחשה בלבד.` : ''} מקור רשמי: רשות המסים, מדריך לקיבוע זכויות טופס 161ד לשנת 2026 (gov.il) - לוח הפטורים: 2025 57%, 2026 57.5%, 2027 62.5%, 2028 ואילך 67%.`);
    return { computedExemptCap: cap, exemptMatchesForm: exemptMatches, ktsevaEligible: ktseva, directEmployer: direct, mustFillPartB, kibuahMonthlyCost: kibuah, spreadYears: spread, notes };
}

// ==================================================================
// בקר יעד סיכון כולל + שילובים סינתטיים בתוך אותה קרן (נוסף 09/11/2026)
// ==================================================================

// זהות התאמה משותפת לממשק ולדוח: קוד רשמי, או שם השורה שאושרה. אישור ידני תקף רק לזהות שנשמרה בעת האישור.
export function matchIdentityOf(m) { return !m ? null : (m.officialId != null ? 'id:' + m.officialId : (m.row ? 'name:' + m.row.name : null)); }
export function includedHoldingsOf(holdings, confirmed = {}, excluded = {}) {
    const out = [];
    for (const h of holdings) {
        const key = trackKeyOf(h.account.account, h.track);
        const auto = !!(h.match && h.match.officialId) || !!h.override;
        const id = matchIdentityOf(h.match);
        const viaConfirm = !auto && !!(h.match && h.match.row) && id !== null && confirmed[key] === id;
        // החזקה עם חשיפה ידועה שהוצאה ידנית מהממוצע אינה נזרקת: היא מסומנת excludedFromAvg וממשיכה כקפואה בחשיפתן הידועה - כל שקל מחולק בדיוק פעם אחת.
        const known = h.equityPct !== null && (auto || viaConfirm);
        if (known) out.push({ h, key, bal: h.track.balance, eq: h.equityPct, kind: h.account.kind,
            excludedFromAvg: !!excluded[key],
            matched: viaConfirm ? { ...h.match, userConfirmed: true } : h.match,
            cls: h.override ? (h.override.sourceType === 'official' ? 'official' : (h.override.sourceType || 'web')) : (viaConfirm ? 'confirmed' : 'official') });
    }
    return out;
}

// קרנות פנסיה (ברמת קרן בודדת, parentCo במאגר פנסיה-נט) שאומת מול התקנון בתוקף כי עמית רשאי,
// מעת לעת, להעביר "את הפקדת דמי הגמולים או את היתרה הצבורה, כולה או חלקה, למסלול השקעה אחר" -
// כלומר החזקה בשני מסלולים במקביל באותה קרן מותרת. אימות ברמת קרן, לא חברה: קרן שלא נבדקה = לא מאומת.
export const MIX_TAKANON = {
    162: { fund: 'מגדל מקפת אישית', clause: 'תקנון מגדל מקפת אישית, גרסת יוני 2025, סעיף 22(א)', ageElection: 'פרק ד\' (השקעות), מסלולי ברירת המחדל: "עמית רשאי לבחור במסלול השקעה שבסעיפים (19א)(1)(א) עד (ג) גם אם גילו אינו בטווח הגילים המתאים למסלול ההשקעה"', src: 'https://my.migdal.co.il/media/27887/regulations-makefet-ishit-062025-mungash.pdf' },
    163: { fund: 'מיטב פנסיה מקיפה', clause: 'תקנון מיטב פנסיה מקיפה, מהדורת 01/05/2026 (גרסה 27), סעיף 22(א): "להעביר את הפקדת דמי הגמולים או את היתרה הצבורה, כולה או חלקה, למסלול השקעה אחר"', ageElection: 'פרק ד\' (השקעות), סעיף 19(א)(1): "עמית רשאי לעבור למסלול השקעה במסגרת המודל שאינו מתאים לגילו או להישאר במסלול כאמור"', src: 'https://www.meitav.co.il/media/2gvh00gj/%D7%97%D7%95%D7%91%D7%A8%D7%AA-%D7%AA%D7%A7%D7%A0%D7%95%D7%9F-%D7%A4%D7%A0%D7%A1%D7%99%D7%94-%D7%9E%D7%A7%D7%99%D7%A4%D7%94-2026.pdf' },
    168: { fund: 'מנורה מבטחים פנסיה', clause: 'תקנון מנורה מבטחים מקיפה, בתוקף 26/7/2026, סעיף 22.1', src: 'https://cdn.menoramivt.co.il/public/docs/20260201/1768084863_%D7%AA%D7%A7%D7%A0%D7%95%D7%9F_%D7%9E%D7%A7%D7%99%D7%A4%D7%94.pdf' },
    170: { fund: 'כלל פנסיה', clause: 'תקנון כלל פנסיה מקיפה y703, מהדורת מאי 2026, סעיף 22(א)', ageElection: 'פרק ד\' (השקעות): "עמית רשאי לעבור למסלול השקעה במסגרת המודל שאינו מתאים לגילו או להישאר במסלול"', src: 'https://www.clalbit.co.il/media/1r3nyivr/%D7%AA%D7%A7%D7%A0%D7%95%D7%9F-%D7%9B%D7%9C%D7%9C-%D7%A4%D7%A0%D7%A1%D7%99%D7%94-%D7%9E%D7%A7%D7%99%D7%A4%D7%94-y703-5-2026.pdf' },
    209: { fund: 'הפניקס פנסיה מקיפה', clause: 'תקנון הפניקס פנסיה מקיפה, בתוקף 1/7/2024, סעיף 22(א)', ageElection: 'פרק ד\' (השקעות), מסלולי המודל: "עמית רשאי לעבור למסלול השקעה במסגרת המודל שאינו מתאים לגילו או להישאר במסלול כאמור"', src: 'https://digital-content.fnx.co.il/sites/docs/genery/takanonimpensia/%D7%AA%D7%A7%D7%A0%D7%95%D7%9F-%D7%94%D7%A4%D7%A0%D7%99%D7%A7%D7%A1-%D7%9E%D7%A7%D7%99%D7%A4%D7%94-1-7-2024.pdf' },
    214: { fund: 'הראל פנסיה', clause: 'תקנון הראל פנסיה מקיפה, ינואר 2024, סעיף 22(א)', src: 'https://media.harel-group.co.il/media/wwsbtpe1/%D7%AA%D7%A7%D7%A0%D7%95%D7%9F-%D7%A7%D7%A8%D7%9F-%D7%A4%D7%A0%D7%A1%D7%99%D7%94-%D7%9E%D7%A7%D7%99%D7%A4%D7%94-%D7%99%D7%A0%D7%95%D7%90%D7%A8-2024.pdf' },
};
export const SEVERANCE_CAVEAT = 'אם בחשבון קיימים כספי פיצויים: העברתם למסלול שאינו מסלול ברירת המחדל מותנית באישור המעסיק, בזכאות לכספי הפיצויים, או בהתגבשות זכאות ללא תנאי (סעיף 22(ב)/22.2 בתקנוני הקרנות שאומתו). הכלי אינו יודע את הרכב הכספים בחשבון - יש לוודא מול הגוף המנהל לפני כל פעולה.';

// סיווג גיאוגרפי של אפיק המניות לפי מנדט בשם המסלול בלבד - אין שדה רשמי לחלוקת מניות ארץ/חו"ל,
// ולכן אין לגזור מספרים (בטח לא כמשלים ל-100% של חשיפת חו"ל לכל הנכסים). מסווגים רק כשיש בסיס מפורש בשם;
// אחרת 'unclassified' - ומוצג כך, בלי להשלים בדמיון שמות לחברה/מעסיק (שמות גופים מכילים 'ישראל'/'תל אביב').
export function equityGeoOf(name) {
    const raw = name || '';
    const n = raw.toLowerCase().replace(/[\s;.\-"]+/g, '');
    if (/s[1&]p500|500s&p|msci|nasdaq|נאסדק/.test(n) || /חו"ל|עולמי|אירופה|ארה"ב|אירופי|אסיה/.test(raw))
        return { cls: 'foreign', basis: 'סיווג לפי מנדט בשם המסלול (מדד/חשיפת חו"ל) - שם בלבד, לא נתון נצפה' };
    if (/מניותישראל/.test(n) || /מדדתא|תא(35|90|125)|תלאביב(35|90|125)/.test(n))
        return { cls: 'local', basis: 'סיווג לפי מנדט בשם המסלול (מדד/חשיפת ישראל) - שם בלבד, לא נתון נצפה' };
    return { cls: 'unclassified', basis: null };
}
export const GEO_LABEL = { local: 'שוק מקומי', foreign: 'מניות חו"ל', unclassified: 'לא מסווג', any: 'ללא העדפה' };

// חלוקת משקלי הקצאה בשילוב לפי סיווג-מנדט (שם/קטגוריה בלבד). משקלי ההקצאה מדויקים; אין מכאן שום טענה מספרית
// על חשיפה גיאוגרפית בפועל: שדות החשיפה הרשמיים הם חשיפה דלתא/look-through במיליונים (עשויה לעבור 100%, נגזרים/גידור),
// ואין זהות-קבוצות שמצדיקה חשבון חסם - בדיקת 1,050 השורות הרשמיות מצאה 113 שורות ממונפות ו-27 אינוורסיות (repro r4, 09/11/2026).
export function geoMixOf(components) {
    const out = { foreign: 0, local: 0, unclassified: 0 };
    for (const c of components) out[(c.geo && c.geo.cls) || 'unclassified'] += c.w;
    return out;
}

// קופות גמל/השתלמות שאומת מול התקנון בתוקף כי עמית רשאי להחזיק במקביל יותר ממסלול אחד ולבצע העברה חלקית.
// מפתח: parentId (ח.פ גוף מנהל במאגר גמל-נט) + סיווג קופה. אימות ברמת קרן בודדת, לא חברה; קרן שלא נבדקה = לא מאומתת.
export const MIX_TAKANON_GEMEL = {
    '513026484|קרנות השתלמות': { fund: 'הפניקס השתלמות', clause: 'תקנון קרן השתלמות מסלולית "הפניקס השתלמות" (מס\' קופה 399), מהדורת 1.7.2024, סעיף 24: "עמית יהיה רשאי להפנות הפקדות או יתרות קיימות בחשבונו ליותר ממסלול השקעה אחד"; סעיף 25: העברת "את יתרתו או חלקה ממסלול אחד או ממספר מסלולים לאחר או לאחרים". בסיס חוקי נוסף: תקנה 33ב(א)(1) לתקנות מס הכנסה (כללים לאישור ולניהול קופות גמל)', src: 'https://www.fnx.co.il/sites/docs/polarchive/kupotdocs/%D7%AA%D7%A7%D7%A0%D7%95%D7%9F-%D7%A7%D7%A8%D7%9F-%D7%94%D7%A9%D7%AA%D7%9C%D7%9E%D7%95%D7%AA-1-7-2024.pdf' },
};

// הקשר שילובים של אותה קרן/קופה עבור החזקה: קרן פנסיה (parentCo) או קופת גמל/השתלמות (אותו גוף מנהל + אותה רמת קופה).
export function fundMixContext(matched, clientAge = null, kind = 'pensia') {
    const isPension = kind === 'pensia';
    const isGemel = !!GEMEL_KIND_CLS[kind];
    if (!isPension && !isGemel) return { ok: false, reason: 'not_supported_product' };
    const TABLE = isPension ? OFFICIAL_PENSION : OFFICIAL_GEMEL;
    // זהות מאומתת-קוד, או התאמת שם שהמשתמש אישר במפורש בממשק (userConfirmed) המקושרת לשורה הרשמית לפי אותו מזהה קרן.
    let row = null;
    if (matched && matched.officialId != null) row = TABLE[matched.officialId];
    else if (matched && matched.userConfirmed && matched.row) {
        // שורת מועמד לפי שם (שהמשתמש אישר במפורש) - קישור לשורה הרשמית לפי מזהה, ובהיעדרו לפי שמה הרשמי המדויק.
        if (matched.row.fundId != null) row = TABLE[matched.row.fundId];
        else if (matched.row.name) row = Object.values(TABLE).find(r => r.name === matched.row.name) || null;
    }
    if (!row) return { ok: false, reason: 'no_official_id' };
    const AGE_BAND = /לבני\s*\d|מותאם גיל|תלוי גיל/;
    const eligible = [], dropped = [];
    let takanon = null;
    if (isPension) {
        if (row.parentCo == null) return { ok: false, reason: 'not_pension_fund' };
        const join = window.JOINABILITY || {};
        const tracks = Object.values(OFFICIAL_PENSION)
            .filter(r => r.parentId === row.parentId && r.parentCo === row.parentCo && r.eq !== null)
            .filter(r => !/למקבלי קצבה|קצבה לזכאים/.test(r.name || ''));
        takanon = MIX_TAKANON[row.parentCo] || null;
        // מסלולי טווח-גיל: בחירה בהם מותרת רק אם אומתה הוראת בחירה מפורשת בתקנון הקרן (אין להסיק מהיעדר סימון גיל בנתוני ההצטרפות).
        for (const r of tracks) {
            const j = join[r.fundId];
            if (!j) { dropped.push({ r, why: 'unverified' }); continue; }
            if (AGE_BAND.test(r.name || '') && !(takanon && takanon.ageElection)) { dropped.push({ r, why: 'age_track_unverified' }); continue; }
            if (j.s === 'closed') { dropped.push({ r, why: 'closed' }); continue; }
            if (j.s === 'age') {
                const inBand = clientAge != null && (j.ageMin == null || clientAge >= j.ageMin) && (j.ageMax == null || clientAge <= j.ageMax);
                if (!inBand) { dropped.push({ r, why: 'age_unverified' }); continue; }
            }
            eligible.push({ ...r, joinNote: j.note, joinSrc: j.src });
        }
    } else {
        if (!GEMEL_KIND_CLS[kind].includes(row.cls)) return { ok: false, reason: 'no_official_id' };
        const tracks = Object.values(OFFICIAL_GEMEL)
            .filter(r => r.parentId === row.parentId && r.cls === row.cls && r.eq !== null);
        takanon = MIX_TAKANON_GEMEL[row.parentId + '|' + row.cls] || null;
        for (const r of tracks) {
            if (/בניהול אישי/.test(r.name || '')) { dropped.push({ r, why: 'ira' }); continue; } // מסלול בניהול אישי (IRA) אינו מרכיב שילוב רגיל
            if (/הלכה|שריעה/.test(r.name || '')) { dropped.push({ r, why: 'special_terms_unverified' }); continue; } // מסלולי הלכה/שריעה: 'כלל האוכלוסיה' אינו ראיה שאין תנאי הצטרפות מיוחדים (הצהרה/זכאות) - מודר עד אימות מסמך המסלול
            if (AGE_BAND.test(r.name || '') && !(takanon && takanon.ageElection)) { dropped.push({ r, why: 'age_track_unverified' }); continue; }
            if (r.pop && !/כלל האוכלוסיה/.test(r.pop)) { dropped.push({ r, why: 'restricted_pop' }); continue; } // מסלול מוגבל לקהל יעד - לעמית קיים בקופה מעבר פנימי עשוי להיות מותר, אך זכאות למסלול מוגבל לא אומתה
            eligible.push({ ...r, joinNote: 'פתיחות מסלול לפי שדה אוכלוסיית היעד במאגר גמל-נט הרשמי (' + REF_DATE + ')', joinSrc: null });
        }
    }
    return {
        ok: true, row, tracks: eligible, dropped, takanon, mixVerified: !!takanon,
        lo: eligible.length ? Math.min(...eligible.map(r => r.eq)) : null,
        hi: eligible.length ? Math.max(...eligible.map(r => r.eq)) : null,
    };
}

// הצעה ליעד חשיפה x בתוך הקרן: מסלול בודד או שילוב סינתטי של שני מסלולים עוטפים.
// שיטת בחירת הרכיבים (מוצהרת): הזוג העוטף הסמוך ביותר ליעד (מזעור סטייה); מוצגים נתוני הרכיבים הרשמיים בלבד.
// אין ולא יוצג ציון/שארפ משוקלל לשילוב - שילוב מסלולים אינו ממוצע של מדדי הביצוע שלהם.
export function proposalForTarget(ctx, x, clientAge = null, geoPref = 'any', curEq = null) {
    if (!ctx.ok) return { type: 'unavailable', reason: ctx.reason === 'not_supported_product' ? 'שילוב בתוך מוצר זמין כרגע לקרנות פנסיה ולקופות גמל/השתלמות שאומתו מול תקנון בלבד.' : (ctx.reason === 'not_pension_fund' ? 'שילוב בתוך קרן זמין כרגע לקרנות פנסיה בלבד (אומת מול תקנון).' : 'חסר זיהוי רשמי של המסלול.') };
    if (!ctx.mixVerified) return { type: 'unverified_fund', fund: ctx.row.parentCoName, reason: `תקנון ${ctx.row.parentCoName || 'הקרן/הקופה'} טרם נבדק לאישור החזקה בשני מסלולים במקביל - לא מוצג שילוב עד לאימות.` };
    // העדפה גיאוגרפית לאפיק המניות: מסלולים מסווגים בכיוון ההפוך מודרים; מסלולים לא-מסווגים נשארים זמינים אך מתויגים ככאלה (לא כתואמים להעדפה).
    const tagged = ctx.tracks.map(r => ({ ...r, geo: equityGeoOf(r.name) }));
    const prefActive = geoPref === 'local' || geoPref === 'foreign';
    let t = tagged, geoNote = null, matchingCount = 0;
    if (prefActive) {
        const matching = tagged.filter(r => r.geo.cls === geoPref);
        matchingCount = matching.length;
        const uncls = tagged.filter(r => r.geo.cls === 'unclassified');
        t = [...matching, ...uncls];
        if (!t.length) return { type: 'unavailable', reason: `תחת העדפת "${GEO_LABEL[geoPref]}" אין בקרן/קופה מסלולים ניתנים לשילוב - המסלולים הזכאים מסווגים בכיוון ההפוך ואינם מוצעים.` };
    }
    // המסלול הנוכחי זמין תמיד כרכיב 'הישארות' (העברת יתרה חלקית מותרת בתקנונים שאומתו) - גם אם אינו זכאי להצטרפות חדשה.
    // בלעדיו טווח ההשגה היה קטע מנותק מהמצב הקיים (דוגמה: נוכחי 20%, מסלולים 58.4-71.52 - יעד 40 אינו בר-השגה בפועל).
    // רכיב ההישארות מייצג את ההחזקה בפועל בחשיפתה הנוכחית (curEq), גם אם אותו מסלול קיים במאגר הזכאים עם נתון רשמי זהה -
    // כך טווח ההשגה רציף מהמצב הקיים (אין 'חור' בין החשיפה הנוכחית לטווח המסלולים הזכאים).
    t = t.filter(r => !((r.fundId != null && ctx.row.fundId != null && r.fundId === ctx.row.fundId) || r.name === ctx.row.name));
    // רכיב 'הישארות' מייצג שמירת יתרה קיימת במסלול הנוכחי בלבד (לא הקצאה חדשה אליו): מותר גם למסלול סגור להצטרפות,
    // ומוצע רק כאן - אחרי בדיקת mixVerified - כך שההעברה החלקית ממנו למסלול אחר באותה קרן/קופה מאומתת רגולטורית (תקנון/תקנה).
    t = [...t, { ...ctx.row, eq: curEq != null ? curEq : ctx.row.eq, isCurrent: true, geo: equityGeoOf(ctx.row.name) }];
    // הערת כנות גיאוגרפית: מוצגת בכל פעם שהעדפה פעילה והרכיבים הנבחרים אינם כוללים מסלול מסווג בכיוון המועדף -
    // גם כשקיים מסלול כזה בקרן אך חשבון החשיפה בחר מסלולים אחרים (הקרובים ליעד).
    const geoNoteFor = (used) => {
        if (!prefActive) return null;
        if (used.some(r => r.geo && r.geo.cls === geoPref)) return null;
        return matchingCount
            ? `בקרן/קופה קיים מסלול עם בסיס-מנדט לסיווג "${GEO_LABEL[geoPref]}", אך חשבון החשיפה בחר מסלולים לא-מסווגים גיאוגרפית (הקרובים ליעד); ההצעה אינה מבטיחה את הכיוון המועדף.`
            : `אין בקרן/קופה מסלול עם בסיס-מנדט לסיווג "${GEO_LABEL[geoPref]}"; ההצעה נשענת על מסלולים לא-מסווגים גיאוגרפית (אין שדה רשמי לחלוקת מניות ארץ/חו"ל) ואינה מבטיחה את הכיוון המועדף.`;
    };
    if (!t.length) return { type: 'unavailable', reason: 'אין בקרן מסלולים זכאים עם נתון חשיפה (אחרי החרגת מסלולים סגורים/לא מאומתים/למקבלי קצבה/מוגבלי קהל יעד).' };
    const sorted = [...t].sort((a, b) => a.eq - b.eq);
    const lo = sorted[0], hi = sorted[sorted.length - 1];
    const singleGeo = (track) => ({ geoMix: geoMixOf([{ geo: track.geo, w: 1 }]), geoUnmet: prefActive && track.geo.cls !== geoPref });
    // יעד שמוביל למסלול הנוכחי עצמו אינו 'מעבר מלא' - הוא הישארות (R3): מוחזר stay כדי שהתצוגה לא תציג העברה פיקטיבית.
    const singleRet = (track, extra = {}) => ({ type: track.isCurrent ? 'stay' : 'single', track, achieved: track.eq, geoNote: geoNoteFor([track]), ...singleGeo(track), ...extra });
    const exact = sorted.find(r => Math.abs(r.eq - x) < 0.01);
    if (exact) return singleRet(exact);
    if (x <= lo.eq) return singleRet(lo, { cappedAt: 'min', rangeLo: lo.eq, rangeHi: hi.eq });
    if (x >= hi.eq) return singleRet(hi, { cappedAt: 'max', rangeLo: lo.eq, rangeHi: hi.eq });
    let low = sorted[0], high = sorted[sorted.length - 1];
    if (prefActive) {
        // ניווט גיאוגרפי: הרכיב התחתון/העליון נבחר קודם מבין המסלולים המסווגים בכיוון המועדף (הקרובים ביותר ליעד), ורק אם אין כאלה - מהלא-מסווגים.
        const below = sorted.filter(r => r.eq <= x), above = sorted.filter(r => r.eq >= x);
        low = [...below].reverse().find(r => r.geo.cls === geoPref && !r.isCurrent) || [...below].reverse().find(r => r.geo.cls === geoPref) || below[below.length - 1] || sorted[0];
        high = above.find(r => r.geo.cls === geoPref && !r.isCurrent) || above.find(r => r.geo.cls === geoPref) || above[0] || sorted[sorted.length - 1];
        if (low === high || (low.fundId != null && low.fundId === high.fundId)) return singleRet(low);
    } else {
        for (let i = 0; i < sorted.length - 1; i++) {
            if (sorted[i].eq <= x && sorted[i + 1].eq >= x) { low = sorted[i]; high = sorted[i + 1]; break; }
        }
    }
    const w = (x - low.eq) / (high.eq - low.eq);
    const achieved = w * high.eq + (1 - w) * low.eq;
    const AGE_BAND = /לבני\s*\d|מותאם גיל|תלוי גיל/;
    const ageClause = (AGE_BAND.test(low.name || '') || AGE_BAND.test(high.name || '')) && ctx.takanon && ctx.takanon.ageElection ? ctx.takanon.ageElection : null;
    const geoMix = geoMixOf([{ geo: high.geo, w }, { geo: low.geo, w: 1 - w }]);
    // מצב 'לא מקויים' (מבוסס מנדט בלבד, ללא חשבון חסם): העדפה פעילה ואין אף רכיב מסווג-מנדט בכיוון המועדף - לא להציג כהושגה.
    const geoUnmet = prefActive && ![low, high].some(r => r.geo.cls === geoPref);
    return { type: 'mix', low, high, wHigh: w, wLow: 1 - w, achieved, takanon: ctx.takanon, ageClause, geoNote: geoNoteFor([low, high]), geoMix, geoUnmet };
}

// פתרון יעד כולל: החזקות קפואות (לא נבחרו) תורמת חשיפה קבועה; ההחזקות הנבחרות נדרשות לכסות את ההפרש.
// החלוקה בין הנבחרות: יישור-פערים (water-filling) לחשיפת יעד משותפת x בכפוף לטווח הזמין בכל קרן -
// כלל מכני ושקוף, לא טענה לאופטימליות מתמטית של שארפ התיק.
// included: [{key, bal, eq, kind, matched}] - החזקות הנכללות בממוצע הסיכון בלבד.
// שמירת/שחזור מצב בקר היעד (פורמט planner.v=1 בתוך התיק המוצפן). תאימות לאחור: קבצים ישנים ללא המפתח נטענים כרגיל;
// קבצים חדשים בגרסה ישנה - המנifest מתעלם ממפתחות לא מוכרים. שחזור תקף רק למפתחות (trackKeyOf) הקיימים בתיק המנותח מחדש,
// ואישור-זהות תקף רק כשהזהות המחושבת כעת זהה בדיוק לזו שנשמרה - רענון נתונים רשמיים שמשנה שם/מזהה שורה מבטל את האישור בשקט.
export function plannerSnapshotOf(state) {
    return { v: 1,
        targetEq: (typeof state.targetEq === 'number' && isFinite(state.targetEq)) ? state.targetEq : null,
        geoPref: ['any', 'local', 'foreign'].includes(state.geoPref) ? state.geoPref : 'any',
        unknownAssumption: (typeof state.unknownAssumption === 'number' && isFinite(state.unknownAssumption)) ? Math.min(100, Math.max(0, state.unknownAssumption)) : null,
        eligible: { ...state.eligible }, excluded: { ...state.excluded }, confirmed: { ...state.confirmed }, selections: { ...(state.selections || {}) }, marketPick: { ...(state.marketPick || {}) } };
}
export function plannerRestoreOf(pl, holdings) {
    const out = { eligible: {}, excluded: {}, confirmed: {}, marketPick: {}, targetEq: null, geoPref: 'any', unknownAssumption: null, dropped: { keys: 0, confirms: 0, eligUnconfirmed: 0 } };
    if (!pl || typeof pl !== 'object' || pl.v !== 1) return out;
    const byKey = new Map();
    for (const h of holdings || []) byKey.set(trackKeyOf(h.account.account, h.track), h);
    const boolMap = (o) => { const r = {}; if (o && typeof o === 'object' && !Array.isArray(o)) for (const [k, v] of Object.entries(o)) { if (v === true && byKey.has(k)) r[k] = true; else if (v === true) out.dropped.keys++; } return r; };
    out.eligible = boolMap(pl.eligible);
    // מאז 11.11.2026 false = "ללא שינוי" (החרגה מפורשת מהיעד) - נשמר בשחזור; קודם נזרק כי ברירת המחדל הייתה false
    if (pl.eligible && typeof pl.eligible === 'object' && !Array.isArray(pl.eligible)) for (const [k, v] of Object.entries(pl.eligible)) if (v === false && byKey.has(k)) out.eligible[k] = false;
    // בחירות מסלול מהשוק (M-037): רק למפתח קיים ולמסלול רשמי קיים
    if (pl.marketPick && typeof pl.marketPick === 'object' && !Array.isArray(pl.marketPick)) for (const [k, id] of Object.entries(pl.marketPick)) if (byKey.has(k) && Number.isInteger(id) && marketRowById(id)) out.marketPick[k] = id;
    out.excluded = boolMap(pl.excluded);
    if (pl.confirmed && typeof pl.confirmed === 'object' && !Array.isArray(pl.confirmed)) {
        for (const [k, id] of Object.entries(pl.confirmed)) {
            const h = byKey.get(k);
            if (!h || typeof id !== 'string') { if (typeof id === 'string') out.dropped.confirms++; continue; }
            if (matchIdentityOf(h.match) === id) out.confirmed[k] = id; else out.dropped.confirms++;
        }
    }
    // זכאות משוחזרת תקפה רק להחזקה שעומדת כעת באותו תנאי הכללה כמו includedHoldingsOf: זיהוי אוטומטי (קוד רשמי/עקיפה) או אישור ששוחזר בהצלחה.
    // אחרת תיבת הסימון מוסתרת אך הדגל נשמר - ואישור מחדש יבחר את ההחזקה בשקט בלי פעולת משתמש נראית.
    for (const k of Object.keys(out.eligible)) {
        if (out.eligible[k] === false) continue; // החרגה אינה דורשת זיהוי
        const h = byKey.get(k);
        const auto = !!(h && h.match && h.match.officialId) || !!(h && h.override);
        const id = h ? matchIdentityOf(h.match) : null;
        const viaConfirm = !auto && !!(h && h.match && h.match.row) && id !== null && out.confirmed[k] === id;
        if (!auto && !viaConfirm) { delete out.eligible[k]; out.dropped.eligUnconfirmed++; }
    }
    // בחירת רשומה מתנגשת משוחזרת כמות שהיא; תקפותה נבדקת מול קבוצת הקונפליקט בפועל בזמן הניתוח (אינדקס מחוץ לטווח מתעלם)
    if (typeof pl.targetEq === 'number' && isFinite(pl.targetEq) && pl.targetEq >= 0 && pl.targetEq <= 100) out.targetEq = pl.targetEq;
    if (['any', 'local', 'foreign'].includes(pl.geoPref)) out.geoPref = pl.geoPref;
    if (typeof pl.unknownAssumption === 'number' && isFinite(pl.unknownAssumption) && pl.unknownAssumption >= 0 && pl.unknownAssumption <= 100) out.unknownAssumption = pl.unknownAssumption;
    return out;
}

// בחירות ידניות שמורות: תקפות רק כרשומות תקינות מבנית; ההחלה בפועל מותנית בטביעת אצבע מלאה (manualMatchFor)
export function plannerSelectionsOf(pl) {
    const out = {};
    if (!pl || typeof pl !== 'object' || pl.v !== 1) return out;
    const sel = pl.selections;
    if (sel && typeof sel === 'object' && !Array.isArray(sel)) {
        for (const [k, v] of Object.entries(sel)) {
            if (typeof k !== 'string' || !v || typeof v !== 'object') continue;
            if (!Number.isInteger(v.officialId) || v.officialId <= 0) continue;
            if (typeof v.name !== 'string' || !v.name) continue;
            if (typeof v.balance !== 'number' || !isFinite(v.balance) || v.balance < 0) continue;
            if (typeof v.account !== 'string' || typeof v.kind !== 'string' || typeof v.trackName !== 'string') continue;
            out[k] = { officialId: v.officialId, name: v.name, balance: v.balance, account: v.account, kind: v.kind, trackName: v.trackName };
        }
    }
    return out;
}

// ---------- מסלולים מכל השוק לפי יעד החשיפה (M-037, אושר ע"י הבעלים 11.11.2026 14:09) ----------
// מוצעים רק מסלולים שפתיחותם להצטרפות אומתה (JOINABILITY, בקשת הלקוח 08/11/2026). כיום מאומתים רק מסלולי
// קרנות פנסיה חדשות; בגמל/השתלמות אין עדיין אימות - מוחזר unverifiedKind ולא רשימה. ביטוח מנהלים לא מוצע לניוד
// כברירת מחדל (מקדם מובטח בפוליסה עלול לאבד ערך).
function marketPoolOf(kind, group, clientAge) {
    if (kind === 'menahalim') return { disabled: 'menahalim', rows: [] };
    if (kind !== 'pensia') return { disabled: 'unverified_kind', rows: [] };
    const wantCls = group === 'klalit' ? 'קרנות כלליות' : 'קרנות חדשות';
    const join = window.JOINABILITY || {};
    const rows = Object.values(OFFICIAL_PENSION).filter(r => {
        if (r.cls !== wantCls || r.eq === null || /למקבלי קצבה/.test(r.name || '')) return false;
        const j = join[r.fundId];
        if (!j || j.s === 'closed') return false;
        if (j.s === 'age') return clientAge != null && (j.ageMin == null || clientAge >= j.ageMin) && (j.ageMax == null || clientAge <= j.ageMax);
        return true;
    });
    return { disabled: rows.length ? null : 'none_verified', rows };
}
export function marketRange(kind, group, clientAge) {
    const { rows } = marketPoolOf(kind, group, clientAge);
    return rows.length ? { lo: Math.min(...rows.map(r => r.eq)), hi: Math.max(...rows.map(r => r.eq)) } : null;
}
// מועמדים בחשיפה קרובה ליעד (±band; מתרחב ל-±10 כשיש פחות מ-3), מדורגים בציון המשוקלל המאושר
// (40% שארפ, 30% תשואת 3 שנים, 10% איזון אקטוארי, 20% שירות - אחוזון בתוך הקוהורט שברצועה). חסר מדד = מוחרג עם ספירה.
export function marketCandidates(kind, group, targetEq, clientAge = null, band = 5, limit = 5) {
    const pool = marketPoolOf(kind, group, clientAge);
    if (pool.disabled) return { disabled: pool.disabled, items: [], band, total: 0 };
    let b = band;
    let inBand = pool.rows.filter(r => Math.abs(r.eq - targetEq) <= b);
    if (inBand.length < 3 && b < 10) { b = 10; inBand = pool.rows.filter(r => Math.abs(r.eq - targetEq) <= b); }
    const JUNE = window.JUNE26 || {}, ACT = window.ACT36M || {}, SRV = window.SERVICE25 || {};
    const cohort = [], missing = [];
    for (const r of inBand) {
        const jd = JUNE[r.fundId];
        const act = jd && ACT[jd.p] ? ACT[jd.p].v : null, srv = jd && SRV[jd.p] ? SRV[jd.p].v : null;
        if (!jd || jd.s == null || jd.y == null || act == null || srv == null) { missing.push(r); continue; }
        cohort.push({ ...r, jSharpe: jd.s, jY3: jd.y, act, actFund: ACT[jd.p].name, srv, srvFund: SRV[jd.p].name, joinStatus: (window.JOINABILITY[r.fundId] || {}).s });
    }
    if (cohort.length) {
        const pctl = vals => {
            const n = vals.length; if (n <= 1) return new Array(n).fill(50);
            const out = new Array(n).fill(null), order = vals.map((v, i) => [v, i]).sort((x, y) => x[0] - y[0]);
            for (let i = 0; i < n;) { let j = i; while (j + 1 < n && order[j + 1][0] === order[i][0]) j++; const mid = (i + j) / 2 + 1; for (let k = i; k <= j; k++) out[order[k][1]] = 100 * (mid - 1) / (n - 1); i = j + 1; }
            return out;
        };
        const sP = pctl(cohort.map(x => x.jSharpe)), yP = pctl(cohort.map(x => x.jY3));
        const funds = [...new Set(cohort.map(x => x.actFund))], fP = pctl(funds.map(f => cohort.find(z => z.actFund === f).act));
        const orgs = [...new Set(cohort.map(x => x.srvFund))], oP = pctl(orgs.map(o => cohort.find(z => z.srvFund === o).srv));
        cohort.forEach((x, i) => { x.score = 0.4 * sP[i] + 0.3 * yP[i] + 0.1 * fP[funds.indexOf(x.actFund)] + 0.2 * oP[orgs.indexOf(x.srvFund)]; });
        cohort.sort((x, y) => y.score - x.score || Math.abs(x.eq - targetEq) - Math.abs(y.eq - targetEq) || x.fundId - y.fundId);
    }
    return { disabled: null, items: cohort.slice(0, limit), band: b, total: cohort.length, missing: missing.length, cohortN: cohort.length };
}
export function marketRowById(fundId) { return OFFICIAL_PENSION[fundId] || null; }
// מזהה רשמי של מסלול פנסיה מתוך התאמה: קוד רשמי, או - בבחירה ידנית מרשימת המסלולים הרשמיים - שם רשמי זהה
export function pensionFundIdOfMatch(match) {
    if (!match) return null;
    if (match.officialId != null && OFFICIAL_PENSION[match.officialId]) return +match.officialId;
    if (match.row && match.row.name) { const r = Object.values(OFFICIAL_PENSION).find(x => x.name === match.row.name); if (r) return r.fundId; }
    return null;
}
export function parentIdOfMatch(match) { const id = pensionFundIdOfMatch(match); return id != null ? OFFICIAL_PENSION[id].parentId : null; }

export function solveTargetPlan(included, selectedKeys, T, clientAge = null, whole = null, geoPref = 'any', opts = {}) {
    const market = !!opts.market, picks = opts.picks || {};
    included = included.filter(x => x.bal > 0); // שורות יתרה אפס אינן נושאות חשיפה - מונע חלוקה באפס ורעש
    const incVal = included.reduce((s, x) => s + x.bal, 0);
    const V = whole && whole.totalValue > 0 ? whole.totalValue : incVal;
    if (V <= 0) return { status: 'empty' };
    const sel = [], frozen = [];
    for (const x of included) (selectedKeys.has(x.key) && !x.excludedFromAvg ? sel : frozen).push(x);
    if (!sel.length) return { status: 'none_selected', V, reqSel: 0 };
    const S_bal = sel.reduce((s, x) => s + x.bal, 0);
    if (S_bal <= 0) return { status: 'none_selected', V, reqSel: 0 };
    const estF = whole && whole.estFrozen ? whole.estFrozen : [];
    const noBasisVal = whole && whole.noBasisVal ? whole.noBasisVal : 0;
    // החזקות עם חשיפה ידועה שאינן נכללות (הוצאו ידנית / טרם אושרו): קפואות בחשיפתן הידועה - כל שקל מחולק בדיוק פעם אחת.
    const frozenKnown = whole && whole.frozenKnown ? whole.frozenKnown : [];
    const frozenKnownSum = frozenKnown.reduce((s, x) => s + x.bal * x.eq, 0);
    const frozenKnownVal = frozenKnown.reduce((s, x) => s + x.bal, 0);
    // אין להניח מספר כלשהו (גם לא אמצע סקאלה) עבור חלק שאין לו בסיס: בלי הנחה מפורשת של המשתמש התכנית בלתי-נתונה (underdetermined).
    const uAssump = whole && whole.unknownAssumption !== null && whole.unknownAssumption !== undefined && isFinite(whole.unknownAssumption) ? Math.min(100, Math.max(0, whole.unknownAssumption)) : null;
    const frozenExact = frozen.reduce((s, x) => s + x.bal * x.eq, 0) + frozenKnownSum;
    const estSum = estF.reduce((s, e) => s + e.bal * e.eq, 0);
    const per = sel.map(x => {
        const ctx = fundMixContext(x.matched, clientAge, x.kind);
        const cur = x.eq;
        let lo = cur, hi = cur, note = null;
        if (ctx.ok && ctx.mixVerified && ctx.tracks.length) {
            let pool = ctx.tracks;
            if (geoPref === 'local' || geoPref === 'foreign') {
                pool = pool.filter(r => { const g = equityGeoOf(r.name).cls; return g === geoPref || g === 'unclassified'; });
            }
            if (pool.length) { lo = Math.min(Math.min(...pool.map(r => r.eq)), cur); hi = Math.max(Math.max(...pool.map(r => r.eq)), cur); }
            else note = 'תחת ההעדפה הגיאוגרפית שנבחרה אין בקרן/קופה מסלולים זמינים (המסלולים מסווגים בכיוון ההפוך בלבד) - ההחזקה נשארת כפי שהיא.';
        }
        else note = !ctx.ok ? 'פער זמני: מנגנון שינוי-מסלול בתוך אותו גוף אומת מול תקנון רק לחלק מסוגי המוצרים (קרנות פנסיה וקופות גמל/השתלמות שצוינו); לסוג מוצר זה האימות טרם הושלם (אין להניח שכללי תקנון הפנסיה חלים עליו). ההחזקה נשארת כפי שהיא.'
            : !ctx.mixVerified ? `תקנון ${ctx.row.parentCoName || 'הקרן/הקופה'} טרם נבדק להחזקה במקביל - ההחזקה נשארת כפי שהיא.`
            : 'אין בקרן/קופה מסלולי יעד זכאים (או שמסלולי טווח-הגיל בה טרם אומתו כניתנים לבחירה) - ההחזקה נשארת כפי שהיא.';
        // שוק: הטווח מתרחב לטווח המסלולים המאומתים בכל הגופים (בכפוף לסוג המוצר). טווח הקרן נשמר לבחירת סוג ההצעה.
        const inLo = lo, inHi = hi;
        const grp = x.matched && x.matched.group;
        const mr = market ? marketRange(x.kind, grp, clientAge) : null;
        if (mr) { lo = Math.min(lo, mr.lo); hi = Math.max(hi, mr.hi); if (note && !ctx.ok) note = null; }
        // בחירה ידנית: ההחזקה מקובעת בחשיפת המסלול שנבחר, ושאר ההחזקות מתאזנות סביבה
        const pk = mr && picks[x.key] != null ? marketRowById(picks[x.key]) : null;
        if (pk) { lo = pk.eq; hi = pk.eq; }
        return { ...x, ctx, curEq: cur, lo, hi, inLo, inHi, note, marketOk: !!mr };
    });
    // ניתוח גבולות לפי חלק ללא-בסיס u (תרחיש היפותטי חסום 0%-100%; אינו גבול מתמטי - חשיפה ממונפת עלולה לחרוג).
    const analyze = (u) => {
        const Fu = frozenExact + estSum + noBasisVal * u;
        const lo = (Fu + per.reduce((s, p) => s + p.lo * p.bal, 0)) / V;
        const hi = (Fu + per.reduce((s, p) => s + p.hi * p.bal, 0)) / V;
        return { loAll: lo, hiAll: hi, reqSel: (T * V - Fu) / S_bal, feasible: T >= lo - 1e-9 && T <= hi + 1e-9 };
    };
    if (noBasisVal > 0 && uAssump === null) {
        const officialOnly0 = (incVal + frozenKnownVal) > 0 ? { value: incVal + frozenKnownVal, eq: (included.reduce((s, x) => s + x.bal * x.eq, 0) + frozenKnownSum) / (incVal + frozenKnownVal) } : null;
        return { status: 'underdetermined', V, S_bal, per, noBasisVal, estVal: estF.reduce((s, e) => s + e.bal, 0), b0: analyze(0), b100: analyze(100), officialOnly: officialOnly0 };
    }
    const F = frozenExact + estSum + noBasisVal * (uAssump !== null ? uAssump : 0);
    const loAll = (F + per.reduce((s, p) => s + p.lo * p.bal, 0)) / V;
    const hiAll = (F + per.reduce((s, p) => s + p.hi * p.bal, 0)) / V;
    const reqSel = (T * V - F) / S_bal;
    const feasible = T >= loAll - 1e-9 && T <= hiAll + 1e-9;
    let xStar = null, achievedWholeEst = null, wholeLo = null, wholeHi = null, gap = null;
    if (feasible) {
        let a = Math.min(...per.map(p => p.lo)), b = Math.max(...per.map(p => p.hi));
        const f = x => per.reduce((s, p) => s + Math.min(Math.max(x, p.lo), p.hi) * p.bal, 0);
        for (let i = 0; i < 80; i++) { const m = (a + b) / 2; if (f(m) < reqSel * S_bal) a = m; else b = m; }
        xStar = (a + b) / 2;
        let selAch = 0;
        for (const p of per) {
            p.targetEq = Math.min(Math.max(xStar, p.lo), p.hi);
            const pick = picks[p.key] != null ? marketRowById(picks[p.key]) : null;
            const curParent = parentIdOfMatch(p.matched), curFund = pensionFundIdOfMatch(p.matched);
            const sameCo = (r) => !!(r && curParent != null && r.parentId === curParent);
            if (pick && p.marketOk && pick.fundId === curFund) {
                p.proposal = { type: 'stay', topIsCurrent: true, picked: true };
            } else if (pick && p.marketOk) {
                // בחירה ידנית של המשתמש מטבלת השוק - גוברת על הצעת המערכת
                p.proposal = { type: 'market', track: pick, picked: true, achieved: pick.eq, sameCompany: sameCo(pick) };
            } else if (p.marketOk && (p.targetEq < p.inLo - 0.005 || p.targetEq > p.inHi + 0.005)) {
                // היעד מחוץ לטווח הקרן הנוכחית - המסלול המדורג ראשון בשוק ברצועת היעד
                const mc = marketCandidates(p.kind, p.matched && p.matched.group, p.targetEq, clientAge);
                const top = mc.items[0];
                p.proposal = top && top.fundId === curFund ? { type: 'stay', topIsCurrent: true }
                    : top ? { type: 'market', track: top, auto: true, achieved: top.eq, sameCompany: sameCo(top) }
                    : { type: 'stay', cappedAt: p.targetEq > p.inHi ? 'max' : 'min', rangeLo: p.inLo, rangeHi: p.inHi };
            } else {
                p.proposal = Math.abs(p.targetEq - p.curEq) < 0.005 ? { type: 'stay' } : proposalForTarget(p.ctx, p.targetEq, clientAge, geoPref, p.curEq);
            }
            p.achievedEq = p.proposal.type === 'stay' ? p.curEq : (p.proposal.achieved ?? p.curEq);
            selAch += p.achievedEq * p.bal;
        }
        achievedWholeEst = (F + selAch) / V;
        gap = T - achievedWholeEst;
        // טווח אי-ודאות של התוצאה הכוללת: אומדנים בקצוות טווח המחלקה שלהם, חלק ללא-בסיס 0%-100% (הנחות תרחיש, לא גבולות קשיחים).
        const base = frozenExact + selAch;
        wholeLo = (base + estF.reduce((s, e) => s + e.bal * e.lo, 0)) / V;
        wholeHi = (base + estF.reduce((s, e) => s + e.bal * e.hi, 0) + 100 * noBasisVal) / V;
    }
    // מדד נתונים מאומתים בלבד (ללא אומדנים וללא תרחישים): החלק הזוהה כפי שהוא כיום (נכללים + ידועים שאינם נכללים).
    const officialOnly = (incVal + frozenKnownVal) > 0 ? { value: incVal + frozenKnownVal, eq: (included.reduce((s, x) => s + x.bal * x.eq, 0) + frozenKnownSum) / (incVal + frozenKnownVal) } : null;
    return { status: feasible ? 'ok' : 'infeasible', V, S_bal, F, reqSel, loAll, hiAll, xStar, per, achievedWholeEst, wholeLo, wholeHi, gap, noBasisVal, estVal: estF.reduce((s, e) => s + e.bal, 0), officialOnly, unknownAssumption: uAssump };
}

// אומדן מחלקה מצומצם (מוצר + מנדט) למסלול ללא נתון רשמי: חציון וטווח מינ/מקס של המחלקה.
// מסומן תמיד כאומדן (*); הטווח הוא טווח המחלקה בפועל, לא גבול מובטח למסלול הספציפי.
export function classEstimate(account, track) {
    // הערכה מותרת רק כשלשם ההחזקה עצמה יש סימוכין מנדט/סיכון מזוהה; אחרת אין בסיס כלל (לא נופלים לחציון רחב).
    const ev = typeEvidenceOf(track.name || '');
    if (!ev.length) return null;
    let pool = [], clsDesc = '';
    if (account.kind === 'pensia') { pool = Object.values(OFFICIAL_PENSION); clsDesc = 'קרנות פנסיה'; }
    else if (GEMEL_KIND_CLS[account.kind]) { pool = Object.values(OFFICIAL_GEMEL).filter(r => GEMEL_KIND_CLS[account.kind].includes(r.cls)); clsDesc = { hishtalmut: 'קרנות השתלמות', tagmulim: 'קופות גמל (תגמולים)', hashkaa: 'גמל להשקעה' }[account.kind] || account.kind; }
    else if (account.kind === 'menahalim') { pool = Object.values(OFFICIAL_INSURANCE); clsDesc = 'ביטוחי מנהלים'; }
    else return null;
    const evKey = ev.slice().sort().join('|');
    const base = pool.filter(r => r.eq !== null && typeEvidenceOf(r.name).slice().sort().join('|') === evKey);
    if (base.length < 5) return null; // מחלקה קטנה מדי - אין בסיס סטטיסטי, ולא מוצג חציון מחלקה רחבה
    const eqs = base.map(r => r.eq).sort((a, b) => a - b);
    const med = eqs.length % 2 ? eqs[(eqs.length - 1) / 2] : (eqs[eqs.length / 2 - 1] + eqs[eqs.length / 2]) / 2;
    const fos = base.map(r => r.fo).filter(v => v !== null && v !== undefined).sort((a, b) => a - b);
    const foMed = fos.length ? (fos.length % 2 ? fos[(fos.length - 1) / 2] : (fos[fos.length / 2 - 1] + fos[fos.length / 2]) / 2) : null;
    const basis = `חציון מחלקה: ${clsDesc} עם סימוכין "${ev.join(' ')}" בשם (${base.length} מסלולים, ${REF_DATE}) - אומדן מבוסס נתוני מחלקה רשמיים, לא נתון שנצפה בהחזקה זו`;
    return { eq: Math.round(med * 100) / 100, lo: eqs[0], hi: eqs[eqs.length - 1], n: base.length, fo: foMed, basis, narrow: true, evidence: ev };
}
