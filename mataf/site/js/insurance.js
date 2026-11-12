// כרטסות ביטוח חיים וביטוח בריאות - דף עבודה ידני להשוואת פוליסות.
// עקרונות קשיחים (מתוך קובץ ההמלצות המאושר + גיבוב מקצועי של המקורות, 10.11.2026):
// - כל הנתונים מוזנים ידנית מהפוליסה או מדוח הר הביטוח. אין ייבוא אוטומטי, אין API, אין שליפת נתוני לקוח.
// - הר הביטוח מוצג כקישור + הסבר עובדתי בלבד, בלי טענה לחיבור או אינטגרציה.
// - התראת כפילות בהר הביטוח אינה בהכרח ביטוח מיותר - מסומן "מצריך בחינה מקצועית", לעולם לא "לבטל".
// - אין המלצה רפואית, אין המלצת זכאות, אין אומדן חיסכון אוטומטי.
// - נתוני הלקוח בזיכרון הדפדפן בלבד ונמחקים ברענון (כמו שאר המערכת).

const escIns = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function emptyInsState() { return { policies: [], seq: 1 }; }

// --- התראת סיום הנחה (ביטוח חיים) ---
// תכונת שירות לסוכן: סימון מראש כשהנחה שנרשמה ידנית מתקרבת לסיומה.
// חוזר ביטוח 2026-1-4 (תחילה 1.2.2027) מחייב את החברות להודיע למבוטח חודש לפני סיום או הקטנת הנחה -
// החובה חלה על הנחות שייקבעו מ-1.2.2027; ההתראה כאן אינה טענת ציות של חברה ואינה תחליף להודעתה.
export function discountAlert(pol, now = new Date()) {
    if (!pol.discountEnd) return null;
    const m = /^(\d{4})-(\d{2})$/.exec(pol.discountEnd);
    if (!m) return null;
    const end = new Date(+m[1], +m[2] - 1 + 1, 0); // סוף חודש הסיום
    const days = Math.round((end - now) / 86400000);
    if (days < 0) return { level: 'red', text: 'תקופת ההנחה שנרשמה הסתיימה - כדאי לבדוק מול הפוליסה את הפרמיה הנוכחית.' };
    if (days <= 45) return { level: 'amber', text: `תקופת ההנחה מסתיימת בעוד כ-${days} ימים - מועד טוב לבחון מול הלקוח את המשך הכיסוי.` };
    return null;
}

function field(ns, i, key, label, type = 'text', extra = '', val = '') {
    return `<label class="ins-field">${label}<input type="${type}" data-ins="${ns}|${i}|${key}" value="${escIns(val)}" ${extra}></label>`;
}

function renderHarbGuide() {
    return `<div class="card">
        <div class="group-label">הר הביטוח - מקור המידע הרשמי על פוליסות הלקוח</div>
        <ul class="notes">
            <li>הר הביטוח הוא שירות חינמי רשמי של רשות שוק ההון, ביטוח וחיסכון: מרכז את פוליסות הביטוח וחוזי השירות הביטוחיים של האדם (חיים, בריאות, רכוש ועוד) הפעילים נכון לחודש הקודם, כולל שם המבטח והפרמיה ששולמה בפועל.</li>
            <li>הכניסה באמצעות מזהה ממשלתי. סוכן יכול לצפות במידע של לקוח רק לאחר שהלקוח מוסמך אותו דרך האתר.</li>
            <li>האתר מסמן אפשרות של כפל ביטוח - אך מודגש שם בעצמו שהתראה אינה בהכרח ביטוח מיותר; נדרשת בחינה מקצועית לפני כל פעולה.</li>
            <li>במערכת זו אין ייבוא אוטומטי מהר הביטוח ואין חיבור מקוון: מעתיקים ידנית מהדוח את הפרטים הרלוונטיים לשדות למטה.</li>
        </ul>
        <div class="herobtns"><a class="ghostbtn" href="https://harb.cma.gov.il/Home" target="_blank" rel="noopener">לפתיחת הר הביטוח (harb.cma.gov.il)</a></div>
    </div>`;
}

// רשימות בחירה (בקשת הבעלים 12.11 13:53: חלונות נגללים במקום שדות ריקים, חברות ממוינות לפי שם).
// "אחר" תמיד אחרון ופותח שדה טקסט. ערך שנשמר בעבר ואינו ברשימה נשמר ומוצג כאפשרות.
const sortHe = (arr) => [...arr].sort((a, b) => a.localeCompare(b, 'he'));
const OTHER = 'אחר';
export const LIFE_INSURERS = sortHe(['AIG', 'איילון', 'ביטוח ישיר', 'הכשרה', 'הפניקס', 'הראל', 'כלל', 'מגדל', 'מנורה מבטחים']);
export const HEALTH_INSURERS = sortHe([...LIFE_INSURERS, 'ווישור', 'כללית (שב״ן)', 'מכבי (שב״ן)', 'מאוחדת (שב״ן)', 'לאומית (שב״ן)', 'ליברה']);
const LIFE_PRODUCTS = ['ריסק - ביטוח חיים טהור', 'ביטוח חיים למשכנתא', 'ביטוח מנהלים - רכיב ריסק', 'אובדן כושר עבודה', 'מוות מתאונה', 'נכות מתאונה', 'מחלות קשות', 'סיעודי'];
const HEALTH_PRODUCTS = ['ניתוחים בישראל', 'תרופות שאינן בסל', 'השתלות וטיפולים מיוחדים בחו״ל', 'אמבולטורי (בדיקות, ייעוצים)', 'מחלות קשות', 'סיעודי', 'שב״ן - רובד בסיסי', 'שב״ן - רובד עליון (זהב / פלטינום)', 'פוליסה משולבת (כמה כיסויים)'];
const DISCOUNT_PCTS = Array.from({ length: 19 }, (_, k) => String(k * 5)); // 0-90 בקפיצות של 5
const DISCOUNT_PERIODS = ['אין הנחה', 'עד שנה', '1-2 שנים', '3-5 שנים', '5-10 שנים', 'לכל תקופת הביטוח'];
const DEDUCTIBLES = ['ללא השתתפות עצמית (מהשקל הראשון)', 'מעל השב״ן (משלים שב״ן)', 'השתתפות עצמית קבועה', 'לא ידוע'];
const WAITING = ['ללא', '90 יום', '6 חודשים', '12 חודשים', '24 חודשים', 'לא ידוע'];
const CLAIM_ROUTES = ['הסכם עם נותן השירות (בלי תשלום מראש)', 'החזר הוצאות', 'שילוב של שניהם', 'לא ידוע'];
// select עם "אחר" שפותח שדה טקסט (המפתח key+'Other')
function choiceField(ns, i, key, label, options, p, sorted = false) {
    const val = p[key] || '';
    const list = sorted ? sortHe(options) : options;
    const known = list.includes(val) || val === OTHER || val === '';
    const opts = [['', label + '...'], ...list.map(o => [o, o]), ...(known ? [] : [[val, val]]), [OTHER, OTHER]];
    const sel = `<select data-ins="${ns}|${i}|${key}">${opts.map(([v, l]) => `<option value="${escIns(v)}"${val === v ? ' selected' : ''}>${escIns(l)}</option>`).join('')}</select>`;
    const other = val === OTHER ? `<input type="text" data-ins="${ns}|${i}|${key}Other" value="${escIns(p[key + 'Other'] || '')}" placeholder="פירוט">` : '';
    return `<label class="ins-field">${label}${sel}${other}</label>`;
}
const shown = (p, key) => p[key] === OTHER ? (p[key + 'Other'] || OTHER) : p[key];

const SOURCE_OPTS = [['', 'מקור הנתון'], ['harb', 'דוח הר הביטוח'], ['manual', 'קלט ידני / פוליסה'], ['other', 'אחר']];
function sourceSelect(ns, i, val) {
    return `<label class="ins-field">מקור הנתון<select data-ins="${ns}|${i}|source">${SOURCE_OPTS.map(([v, l]) => `<option value="${v}"${val === v ? ' selected' : ''}>${l}</option>`).join('')}</select></label>`;
}

function policyCard(ns, i, p, fieldsHtml, alertsHtml) {
    return `<div class="card ins-policy">
        <div class="ins-policy-head">
            <b>פוליסה ${i + 1}${p.insurer ? ' · ' + escIns(shown(p, 'insurer')) : ''}${p.product ? ' · ' + escIns(shown(p, 'product')) : ''}</b>
            <button type="button" class="ghostbtn" data-ins-del="${ns}|${i}">הסרה</button>
        </div>
        <div class="ins-grid">${fieldsHtml}</div>
        ${alertsHtml}
    </div>`;
}

// ---------- ביטוח חיים ----------
const LIFE_INIT = { insurer: '', product: '', sumInsured: '', premium: '', discountPct: '', discountEnd: '', source: '', note: '' };

export function renderLifeTab(state) {
    const st = state.life;
    const cards = st.policies.map((p, i) => {
        const a = discountAlert(p);
        const alertHtml = a ? `<div class="note small ins-alert-${a.level}">${a.text}</div>` : '';
        return policyCard('life', i, p, `
            ${choiceField('life', i, 'insurer', 'חברת ביטוח', LIFE_INSURERS, p)}
            ${choiceField('life', i, 'product', 'מוצר / סוג כיסוי', LIFE_PRODUCTS, p)}
            ${field('life', i, 'sumInsured', 'סכום ביטוח (₪)', 'number', 'min="0"', p.sumInsured)}
            ${field('life', i, 'premium', 'פרמיה חודשית בפועל (₪)', 'number', 'min="0" step="0.01"', p.premium)}
            <label class="ins-field">אחוז הנחה (%)<select data-ins="life|${i}|discountPct"><option value="">אחוז הנחה...</option>${[...DISCOUNT_PCTS, ...(p.discountPct && !DISCOUNT_PCTS.includes(String(p.discountPct)) ? [String(p.discountPct)] : [])].map(v => `<option value="${v}"${String(p.discountPct) === v ? ' selected' : ''}>${v}%</option>`).join('')}</select></label>
            ${field('life', i, 'discountEnd', 'סיום תקופת הנחה (חודש/שנה)', 'month', '', p.discountEnd)}
            ${sourceSelect('life', i, p.source)}
            ${field('life', i, 'note', 'הערה', 'text', '', p.note)}
        `, alertHtml);
    }).join('');
    const anyAlert = st.policies.some(p => discountAlert(p));
    return `
        <div class="group-label">ביטוח חיים</div>
        <h2>פוליסות ביטוח חיים של הלקוח - דף עבודה</h2>
        <div class="note small"><b>דוח המסלקה יכול לכלול גם מוצרי ביטוח עם כיסוי למקרה מוות, לרבות ביטוח חיים למשכנתה</b> (לפי פרסום המפעיל) - אין התחייבות שהדוח מכסה הכל, ויש לבדוק מה התקבל בדוח הספציפי שהועלה. הר הביטוח משלים את הבדיקה, במיוחד לביטוחי בריאות וסיעוד שאינם מדווחים למסלקה כלל. <b>כל הערכים מוזנים ידנית מהפוליסה או מדוח הר הביטוח - לא התקבלו מחברת הביטוח ולא נמשכו אוטומטית.</b> הנתונים נשמרים בזיכרון הדפדפן בלבד ונמחקים ברענון. ההשוואה הרשמית ב-life.cma.gov.il מציגה את מחיר המקסימום שחברה רשאית לגבות ממצטרף חדש - לא הצעה אמיתית, ויתכנו תוספות לפי החיתום.</div>
        ${renderHarbGuide()}
        ${cards || '<div class="card"><div class="muted">טרם נרשמו פוליסות. הוסיפו פוליסה ראשונה מהדוח או מהפוליסה עצמה.</div></div>'}
        <div class="herobtns"><button type="button" class="primarybtn" data-ins-add="life">הוספת פוליסת חיים</button></div>
        ${anyAlert ? '' : ''}
        <div class="card">
            <div class="group-label">התראת סיום הנחה</div>
            <div class="muted small">כשרושמים תאריך סיום הנחה, המערכת מסמנת אדום/כתום כשהמועד מתקרב או חלף. מ-1.2.2027 יחול חוזר ביטוח 2026-1-4: על הנחות שייקבעו מאותו מועד, שיעור ההנחה לא יופחת במשך 10 שנים לפחות, והחברה תידרש להודיע למבוטח חודש לפני סיום או הקטנת הנחה. ההתראה כאן היא שירות של דף העבודה - היא אינה הודעת חברת הביטוח ואינה טענה שהחברה מחויבת בה על פוליסות קיימות.</div>
        </div>
        <div class="card">
            <div class="group-label">השוואת תעריף רשמית</div>
            <div class="muted small">מחשבון ביטוח החיים של רשות שוק ההון משווה תעריפי ביטוח חיים (ריסק) וביטוח חיים למשכנתא - מחיר מקסימום מאושר בלבד.</div>
            <div class="herobtns"><a class="ghostbtn" href="https://life.cma.gov.il" target="_blank" rel="noopener">למחשבון ביטוח החיים הרשמי (life.cma.gov.il)</a></div>
        </div>`;
}

// ---------- ביטוח בריאות ----------
const HEALTH_TYPES = [['', 'סוג כיסוי'], ['shban', 'שב״ן (קופת חולים)'], ['private', 'פרטי (חברת ביטוח)'], ['other', 'אחר / לא ידוע']];
const HEALTH_INIT = { insurer: '', product: '', edition: '', type: '', premium: '', discountPeriod: '', deductible: '', limits: '', exclusions: '', waiting: '', claimRoute: '', overlap: false, source: '', note: '' };

export function renderHealthTab(state) {
    const st = state.health;
    const cards = st.policies.map((p, i) => {
        const overlapHtml = p.overlap
            ? `<div class="note small ins-alert-amber">סומן כפילות אפשרית (למשל בהר הביטוח) - <b>מצריך בחינה מקצועית</b>. התראת כפילות אינה בהכרח ביטוח מיותר; אין לבטל כיסוי על סמכה.</div>` : '';
        return policyCard('health', i, p, `
            ${choiceField('health', i, 'insurer', 'מבטח / קופת חולים', HEALTH_INSURERS, p)}
            ${choiceField('health', i, 'product', 'מוצר / כיסוי', HEALTH_PRODUCTS, p)}
            ${field('health', i, 'edition', 'מהדורה / תאריך פוליסה', 'month', '', p.edition)}
            <label class="ins-field">סוג כיסוי<select data-ins="health|${i}|type">${HEALTH_TYPES.map(([v, l]) => `<option value="${v}"${p.type === v ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
            ${field('health', i, 'premium', 'פרמיה חודשית בפועל (₪)', 'number', 'min="0" step="0.01"', p.premium)}
            ${choiceField('health', i, 'discountPeriod', 'תקופת הנחה', DISCOUNT_PERIODS, p)}
            ${choiceField('health', i, 'deductible', 'השתתפות עצמית', DEDUCTIBLES, p)}
            ${field('health', i, 'limits', 'מגבלות', 'text', '', p.limits)}
            ${field('health', i, 'exclusions', 'חריגים', 'text', '', p.exclusions)}
            ${choiceField('health', i, 'waiting', 'תקופת אכשרה', WAITING, p)}
            ${choiceField('health', i, 'claimRoute', 'דרך מימוש תביעה', CLAIM_ROUTES, p)}
            ${sourceSelect('health', i, p.source)}
            <label class="ins-field ins-check"><input type="checkbox" data-ins="health|${i}|overlap"${p.overlap ? ' checked' : ''}> סומנה כפילות אפשרית (למשל בהר הביטוח)</label>
            ${field('health', i, 'note', 'הערה', 'text', '', p.note)}
        `, overlapHtml);
    }).join('');
    return `
        <div class="group-label">ביטוח בריאות</div>
        <h2>כיסויי בריאות של הלקוח - דף עבודה לבחינה ידנית</h2>
        <div class="note small"><b>כל הערכים מוזנים ידנית מהפוליסה או מדוח הר הביטוח; ערך ריק משמעו "לא ידוע" עד שיאומת מול מסמך המקור.</b> אין כאן ייעוץ רפואי, המלצת זכאות או אומדן חיסכון, ואין המלצה אוטומטית לביטול או החלפת כיסוי. הנתונים בזיכרון הדפדפן בלבד ונמחקים ברענון.</div>
        <div class="card">
            <div class="group-label">שלוש שכבות הכיסוי בישראל</div>
            <ul class="notes">
                <li><b>סל הבריאות הממלכתי</b> - זכאות חוקית לכל תושב; אינו מוצר לרישום כאן.</li>
                <li><b>שב״ן</b> - שירותי בריאות נוספים של קופות החולים.</li>
                <li><b>ביטוח פרטי</b> - מסחרי, מחברות הביטוח.</li>
            </ul>
            <div class="muted small">הרשמה כאן מתייחסת לשכבות שב״ן ופרטי בלבד. מידע נוסף לציבור: <a href="https://campus.gov.il/course/digitalil-gov-healthinsurance-he/" target="_blank" rel="noopener">קורס הביטוח הבריאותי הממשלתי (campus.gov.il)</a>.</div>
        </div>
        ${renderHarbGuide()}
        ${cards || '<div class="card"><div class="muted">טרם נרשמו כיסויים. הוסיפו כיסוי ראשון מהדוח או מהפוליסה.</div></div>'}
        <div class="herobtns"><button type="button" class="primarybtn" data-ins-add="health">הוספת כיסוי בריאות</button></div>`;
}

// ---------- events (נקרא מ-app.js) ----------
export function insInit(kind) { return kind === 'life' ? { ...LIFE_INIT } : { ...HEALTH_INIT }; }
export function insApply(state, ns, i, key, value) {
    const st = state[ns];
    if (!st || !st.policies[i]) return false;
    st.policies[i][key] = value;
    return true;
}
