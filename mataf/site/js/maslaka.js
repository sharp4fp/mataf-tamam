// Parser for Israeli pension clearinghouse (מסלקה פנסיונית) Mimshak XML files, interface 009.
// Extracts per-account holdings, tracks, balances, fees and reported forecasts.
// Raw codes are kept visible; classification is name-based and labeled as heuristic.

function txt(el, tag) {
    const x = el.getElementsByTagName(tag)[0];
    return (x && x.textContent ? x.textContent : '').trim();
}
// אזהרות קריאה גלויות (תוקן 09/11/2026): ערכים מספריים חריגים לעולם אינם נקראים בשקט.
// '420 000' קודם פורש כ-420 (קטיעה שקטה) - כעת מזוהה כמפריד אלפים ברווחים ומתועד באזהרה.
// ערך בלתי תקין אחר אינו נקטע - מוחזר null ומדווח.
let parseWarnings = [];
function num(s, tag = '') {
    if (!s) return null;
    const raw = String(s).trim();
    if (!raw) return null;
    const noCommas = raw.replace(/,/g, '');
    if (/^-?\d+(\.\d+)?$/.test(noCommas)) return parseFloat(noCommas);
    if (/^-?\d{1,3}( \d{3})+(\.\d+)?$/.test(noCommas)) {
        const v = parseFloat(noCommas.replace(/ /g, ''));
        parseWarnings.push(`פורש מפריד-אלפים ברווחים: '${raw}' נקרא כ-${v}${tag ? ` (שדה ${tag})` : ''} - לבדוק מקור`);
        return v;
    }
    parseWarnings.push(`ערך מספרי לא תקין לא נקרא: '${raw}'${tag ? ` (שדה ${tag})` : ''}`);
    return null;
}
function allText(el, tag) {
    return Array.from(el.getElementsByTagName(tag)).map(e => (e.textContent || '').trim());
}

function classify(plan, sugMutzar) {
    if (/השתלמות/.test(plan)) return 'hishtalmut';
    if (/פנסיה/.test(plan)) return 'pensia';
    if (/גמל להשקעה/.test(plan)) return 'hashkaa';
    if (/מוות|חיים|קולקטיב/.test(plan) || sugMutzar === '8') return 'risk';
    if (sugMutzar === '2') return 'pensia'; // verified in the field map of the rule library
    if (sugMutzar === '1') return 'menahalim';
    if (/גמל|תגמולים/.test(plan)) return 'tagmulim';
    return 'other';
}

// מספר זהות ישראלי: 9 ספרות עם אפסים מובילים. המסלקה, טופס 161 וקובץ קודם עשויים לכתוב אותו
// עם או בלי אפסים מובילים - כל השוואה והצגה עוברות דרך הנרמול הזה (M-001, 11.11.2026).
export function normalizeIdNumber(s) {
    const d = String(s || '').replace(/\D/g, '');
    if (!d || /^0+$/.test(d)) return '';
    // אפסים מובילים אינם חלק מהזהות: המסלקה מרפדת ל-15 ספרות (000000317260826), טופס 161 ל-9 או בלי אפסים.
    // מסירים את כולם ומרפדים ל-9 - כך 317260826, 0317260826 ו-000000317260826 הם אותו אדם.
    const core = d.replace(/^0+/, '');
    return core.length < 9 ? core.padStart(9, '0') : core;
}

export const KIND_LABEL = {
    pensia: 'קרן פנסיה', hishtalmut: 'קרן השתלמות', tagmulim: 'קופת גמל',
    hashkaa: 'גמל להשקעה', menahalim: 'ביטוח מנהלים (סיווג לפי קוד 1 - לא אומת)',
    risk: 'כיסוי ביטוחי', other: 'לא סווג',
};

const flag12 = (v) => (v === '1' ? true : v === '2' ? false : null);
export function annuityFactorOf(ylg) {
    const factor = num(txt(ylg, 'MEKADEM-MOVTACH-LEPRISHA'));
    const out = {
        retireAge: parseInt(txt(ylg, 'GIL-PRISHA')) || null,
        guaranteedFactor: factor !== null && factor > 0 ? factor : null,
        lifeGuarantee: flag12(txt(ylg, 'MEKADEM-HAVTACHST-TOCHELET')),
        lifeGuaranteeAtRetirement: flag12(txt(ylg, 'MEKADEM-HAVTACHST-TOCHELETPRISHA')),
        yieldGuarantee: flag12(txt(ylg, 'MEKADEM-HAVTACHAT-TSUA')),
        yieldGuaranteePeriod: flag12(txt(ylg, 'MEKADEM-HAVTACHAT-TSUATKUFA')),
        lifeAffectsPension: flag12(txt(ylg, 'TOCHELET-MASHPIA-KITZBA')),
        yieldAffectsPension: flag12(txt(ylg, 'TSUA-MASHPIA-KITZBA')),
        track: txt(ylg, 'SHEM-MASLOL') || '',
        limitYears: num(txt(ylg, 'TKUFAT-HAGBALA-BESHANIM')),
        totalSavings: num(txt(ylg, 'TOTAL-CHISACHON-MITZTABER-TZAFUY')),
        // ממשק אחזקות גרסה 008 (קובץ השדות הרשמי, בספרייה): 212 = צבירה צפויה המיועדת לקצבה, 210 = המיועדת להון,
        // 206 = סכום קצבת זקנה לפי המסלול הבסיסי. SUG-KUPA (205) הוא 1 = משלמת, 2 = לא משלמת, 3 = השתלמות -
        // הוא אינו מבחין בין קצבה להון (תוקן 12.11.2026, M-046).
        annuitySavings: num(txt(ylg, 'TOTAL-SCHUM-MTZBR-TZAFUY-LEGIL-PRISHA-MECHUSHAV-LEKITZBA-IM-PREMIYOT')),
        capitalPart: num(txt(ylg, 'TOTAL-ITRA-TZFUYA-MECHUSHAV-LEHON-IM-PREMIOT')),
        reportedPension: num(txt(ylg, 'SCHUM-KITZVAT-ZIKNA')),
        sugKupa: txt(ylg, 'SUG-KUPA') || '',
    };
    // קובץ ישן בלי שדות 210/212: כשיש מקדם, כל הצבירה נחשבת קצבתית
    if (out.annuitySavings === null && out.capitalPart === null && out.guaranteedFactor) out.annuitySavings = out.totalSavings;
    out.projectedSavings = out.annuitySavings;
    // קצבה מהמקדם המובטח: הצבירה המיועדת לקצבה חלקי המקדם (קצבה חודשית ברוטו, לפני מס) - "על ידי חלוקת היתרה הצבורה במקדם"
    out.pensionFromGuaranteed = out.guaranteedFactor && out.annuitySavings
        ? Math.round(out.annuitySavings / out.guaranteedFactor * 100) / 100 : null;
    const any = out.guaranteedFactor !== null || (out.capitalPart || 0) > 0 || [out.lifeGuarantee, out.yieldGuarantee, out.lifeAffectsPension, out.yieldAffectsPension].some(v => v !== null);
    return any ? out : null;
}

function parseAccount(hop, yatzran, mutzarSug) {
    const plan = txt(hop, 'SHEM-TOCHNIT');
    // SUG-MUTZAR lives at the Mutzar/NetuneiMutzar level, passed in; fall back to any nested code.
    const sugMutzar = mutzarSug || txt(hop, 'SUG-MUTZAR');
    // Tracks: each PerutMasluleiHashkaa block carries one (track x component) balance; group by track name.
    const byName = new Map();
    for (const block of Array.from(hop.getElementsByTagName('PerutMasluleiHashkaa'))) {
        const name = txt(block, 'SHEM-MASLUL-HASHKAA');
        const code = txt(block, 'KOD-MASLUL-HASHKAA');
        const bal = num(txt(block, 'SCHUM-TZVIRA-BAMASLUL'), 'צבירה במסלול') || 0;
        if (!name) continue;
        const prev = byName.get(name);
        if (prev) prev.balance += bal;
        else byName.set(name, { name, code, balance: bal });
    }
    // יתרות שליליות: לא נכנסות לחישוב (מודל התיק אינו מכסה נטיות שליליות), אך מדווחות במפורש ולא מושלכות בשקט.
    // יתרות אפס מדולגות ונספרות בהערה אחת.
    const allTracks = Array.from(byName.values());
    const tracks = [];
    let zeroCount = 0;
    for (const t of allTracks) {
        if (t.balance > 0.005) tracks.push(t);
        else if (t.balance < -0.005) parseWarnings.push(`יתרה שלילית במסלול '${t.name}': ${t.balance} ש"ח לא נכנסה לחישוב התיק - לבדוק מול הגוף המנהל`);
        else zeroCount++;
    }
    if (zeroCount) parseWarnings.push(`${zeroCount} שורות צבירה אפס דולגו`);
    // Actual fees charged in the report month, from HotzaotBafoalLehodeshDivoach; fall back to contracted structure.
    // The accrual rate there is the rate charged in the report month - shown as reported, never annualized.
    let feeDeposit = null, feeAcc = null;
    const hotz = hop.getElementsByTagName('HotzaotBafoalLehodeshDivoach')[0];
    if (hotz) {
        feeDeposit = num(txt(hotz, 'SHEUR-DMEI-NIHUL-HAFKADA'));
        feeAcc = num(txt(hotz, 'SHEUR-DMEI-NIHUL-TZVIRA'));
    }
    if (feeDeposit === null) feeDeposit = num(txt(hop, 'SHEUR-DMEI-NIHUL-HAFKADA-MIVNE')) ?? num(txt(hop, 'SHEUR-DMEI-NIHUL-HAFKADA'));
    if (feeAcc === null) feeAcc = num(txt(hop, 'SHEUR-DMEI-NIHUL-HISACHON-MIVNE')) ?? num(txt(hop, 'SHEUR-DMEI-NIHUL-HISACHON'));
    const lastDep = hop.getElementsByTagName('PerutPirteiHafkadaAchrona')[0];
    const tsuaVals = allText(hop, 'TSUA-NETO').map(v => parseFloat(v)).filter(v => isFinite(v));
    const covers = [];
    for (const m of Array.from(hop.getElementsByTagName('PerutMitryot'))) {
        covers.push({
            desc: txt(m, 'SHEM-MEVATACHAT') ? `${txt(m, 'SHEM-MEVATACHAT')} (קוד סוג ${txt(m, 'KOD-SUG-MUTZAR-BITUACH') || '?'})` : 'כיסוי קולקטיבי',
            sum: num(txt(m, 'SCHUM-BITUACH')),
            cost: num(txt(m, 'ALUT-KISUI')),
            from: txt(m, 'TAARICH-TCHILAT-HABITUACH'),
            to: txt(m, 'TAARICH-TOM-TKUFAT-HABITUAH'),
        });
    }
    // תחזית הגוף המנהל: סכום כל הקופות (משלמת/לא משלמת) באותו גיל פרישה - לא רק הבלוק הראשון (M-047)
    let forecast = null;
    const ylgs = Array.from(hop.getElementsByTagName('YitraLefiGilPrisha'));
    const fAge = ylgs.length ? (parseInt(txt(ylgs[0], 'GIL-PRISHA')) || 0) : 0;
    if (fAge) {
        const sameAge = ylgs.filter(y => (parseInt(txt(y, 'GIL-PRISHA')) || 0) === fAge);
        const sumOf = (tag) => { const v = sameAge.map(y => num(txt(y, tag))).filter(x => x !== null); return v.length ? Math.round(v.reduce((n, x) => n + x, 0) * 100) / 100 : null; };
        forecast = {
            age: fAge,
            savingsWith: sumOf('TOTAL-CHISACHON-MITZTABER-TZAFUY'),
            pensionWith: sumOf('SCHUM-KITZVAT-ZIKNA'),
            savingsWithout: sumOf('TZVIRAT-CHISACHON-CHAZUYA-LELO-PREMIYOT'),
            pensionWithout: sumOf('KITZVAT-HODSHIT-TZFUYA'),
            assumedYield: num(txt(sameAge[0], 'ACHUZ-TSUA-BATACHAZIT')),
            blocks: sameAge.length,
        };
    }
    // מקדם הקצבה של הפוליסה (M-045, החלטת הבעלים 11.11 18:57): בביטוח מנהלים המקדם המובטח מגיע מהמסלקה
    // (בלוק YitraLefiGilPrisha), ולא נדרש ציטוט קצבה. דגלים 1 = כן, 2 = לא - אומת מול ממשק אחזקות 008 (M-046).
    // בפוליסה יכולים להיות כמה בלוקים: אחד לכל קופה (משלמת/לא משלמת) ולכל גיל פרישה 60-70.
    // לוקחים את גיל הבלוק שיש בו מקדם (אחרת הראשון) ומסכמים את כל הקופות של אותו גיל.
    const factorBlocks = Array.from(hop.getElementsByTagName('YitraLefiGilPrisha')).map(annuityFactorOf).filter(Boolean);
    const lead = factorBlocks.find(b => b.guaranteedFactor !== null) || factorBlocks[0] || null;
    let annuityFactor = null;
    if (lead) {
        const same = factorBlocks.filter(b => b.retireAge === lead.retireAge);
        const sum = (k) => same.reduce((n, b) => n + (b[k] || 0), 0);
        annuityFactor = Object.assign({}, lead);
        annuityFactor.annuitySavings = sum('annuitySavings') || null;
        annuityFactor.projectedSavings = annuityFactor.annuitySavings;
        annuityFactor.capitalSavings = sum('capitalPart') || null;
        annuityFactor.capitalOnly = !annuityFactor.annuitySavings && !!annuityFactor.capitalSavings;
        annuityFactor.pensionFromGuaranteed = annuityFactor.guaranteedFactor && annuityFactor.annuitySavings
            ? Math.round(annuityFactor.annuitySavings / annuityFactor.guaranteedFactor * 100) / 100 : null;
        annuityFactor.reportedPension = sum('reportedPension') || null;
        annuityFactor.blocks = same.length;
        annuityFactor.ages = Array.from(new Set(factorBlocks.map(b => b.retireAge))).filter(Boolean);
    }
    // --- שדות נוספים לדוח המקוצר (מיפוי מול דוח לדוגמה; כל השדות מכתבי ה-XML עצמו, ללא חישוב) ---
    // דמי ניהול חוזיים לפי מבנה דמי הניהול: SUG-HOTZAA=1 מצבירה (שנתי), SUG-HOTZAA=2 מהפקדה (מפרט 009).
    // רק שורת "שיעור קבוע" (MEAFYENEI-MASLUL-DMEI-NIHUL=1) יחידה מאותו סוג היא שיעור חוזי אישי חד-משמעי:
    // מבנה משתנה/רב-פרמטרי (2-10), שורות חוזרות בשיעורים שונים, או קופה על בסיס הוצאות בפועל
    // (GOVA-...=1, ואז השיעור הוא ממוצע קופה לא אישי) - אינם שיעור אישי: לא מנחשים, נשמר לאימות ידני.
    let feeContractDep = null, feeContractAcc = null;
    const depFixed = new Set(), accFixed = new Set();
    let sawVariableFee = false, sawExpenseBasis = false;
    // בסיס מעורב: שורה אחת משתנה/בסיס-הוצאות/קבועה ללא ערך קריא מאותו סוג (SUG) מספיקה כדי לבטל
    // את כל בסיס אותו סוג - אין לבחור שיעור קבוע בודד מתוך מבנה מעורב שעשוי להסדיר את אותם דמי ניהול.
    let depMixed = false, accMixed = false;
    for (const d of Array.from(hop.getElementsByTagName('PerutMivneDmeiNihul'))) {
        const sug = txt(d, 'SUG-HOTZAA');
        const rate = num(txt(d, 'SHEUR-DMEI-NIHUL'));
        const mode = txt(d, 'MEAFYENEI-MASLUL-DMEI-NIHUL');
        const markMixed = () => { if (sug === '1') accMixed = true; if (sug === '2') depMixed = true; };
        if (txt(d, 'GOVA-DMEI-NIHUL-NIKBA-AL-PI-HOTZAOT-BAPOAL') === '1') { sawExpenseBasis = true; markMixed(); continue; }
        if (mode !== '1') { if (mode && mode !== '0') { sawVariableFee = true; markMixed(); } continue; }
        if (rate === null) { markMixed(); continue; }
        if (sug === '2') depFixed.add(rate);
        if (sug === '1') accFixed.add(rate);
    }
    if (accFixed.size > 1) accMixed = true;
    if (depFixed.size > 1) depMixed = true;
    if (accFixed.size === 1 && !accMixed) feeContractAcc = [...accFixed][0];
    if (depFixed.size === 1 && !depMixed) feeContractDep = [...depFixed][0];
    if (accFixed.size > 1 || depFixed.size > 1) parseWarnings.push(`מבנה דמי ניהול עם שורות שיעור קבוע חוזרות (${[...accFixed].join('/') || '-'}% מצבירה, ${[...depFixed].join('/') || '-'}% מהפקדה) - אין שיעור חוזי חד-משמעי; לא נבחר שיעור, לוודא מול הגוף המנהל`);
    if (sawVariableFee) parseWarnings.push('מבנה דמי הניהול כולל שיעורים משתנים (לפי ותק/צבירה/גיל/פרמטרים) - השיעור האישי תלוי פרמטרים; לא נבחר שיעור קבוע בודד מאותו סוג ואין בסיס חוזי לחישוב חיסכון - לוודא מול הגוף המנהל');
    if (sawExpenseBasis) parseWarnings.push('דמי הניהול בחשבון נקבעים על בסיס הוצאות בפועל - השיעור המדווח הוא ממוצע ברמת הקופה ולא אישי; אינו נכנס לחישוב חיסכון');
    // מעסיק פעיל (STATUS-MAASIK=1) - בלוקי YeshutMaasik יושבים ברמת המוצר (NetuneiMutzar), לא בתוך החשבון
    let employer = '';
    const scope = (hop.closest && hop.closest('Mutzar')) || hop;
    for (const m of Array.from(scope.getElementsByTagName('YeshutMaasik'))) {
        if (txt(m, 'STATUS-MAASIK') === '1' && txt(m, 'SHEM-MAASIK')) { employer = txt(m, 'SHEM-MAASIK'); break; }
    }
    if (!employer) employer = txt(scope, 'SHEM-MAASIK');
    // שכר למוצר: זוגות (חודש, שכר) - נלקח החודש העדכני ביותר
    let salaryLatest = null, salaryMonth = '';
    {
        const pairs = [];
        const months = allText(hop, 'CHODESH-SACHAR');
        const sals = allText(hop, 'SACHAR-BERAMAT-HAFKADA');
        for (let i = 0; i < Math.min(months.length, sals.length); i++) pairs.push({ m: months[i], s: num(sals[i]) });
        pairs.sort((a, b) => (b.m || '').localeCompare(a.m || ''));
        const top = pairs.find(pr => pr.s !== null);
        if (top) { salaryLatest = top.s; salaryMonth = top.m; }
    }
    // הפקדות אחרונות לפי סוג: SUG-HAFKADA=1 הפקדה שוטפת, 3 חד-פעמית (לא נספרת בהפקדה החודשית)
    const deposits = [];
    for (const d of Array.from(hop.getElementsByTagName('PerutPirteiHafkadaAchrona'))) {
        deposits.push({ sug: txt(d, 'SUG-HAFKADA'), period: txt(d, 'TAARICH-HAFKADA-ACHARON'), total: num(txt(d, 'TOTAL-HAFKADA')) });
    }
    const disability = num(txt(hop, 'SACH-PENSIAT-NECHUT'));
    const survivors = {
        almana: num(txt(hop, 'KITZBAT-SHEERIM-LEALMAN-O-ALMANA')),
        yatom: num(txt(hop, 'KITZBAT-SHEERIM-LEYATOM')),
        hore: num(txt(hop, 'KITZBAT-SHEERIM-LEHORE-NITMACH')),
    };
    const premiumCollected = num(txt(hop, 'SACH-DMEI-BITUAH-SHENIGBOO'));
    const hasLoan = txt(hop, 'YESH-HALVAA-BAMUTZAR');
    const nezilut = txt(hop, 'MOED-NEZILUT-TAGMULIM');
    const asOf = txt(hop, 'TAARICH-ERECH-TZVIROT');
    const sevVals = allText(hop, 'YITRAT-PITZUIM-LELO-HITCHASHBENOT').map(v => parseFloat(v)).filter(v => isFinite(v));
    const totalBalance = tracks.reduce((n, t) => n + t.balance, 0);
    // יתרת סוף השנה הקודמת (PerutYitrotLesofShanaKodemet) - ערך היסטורי בלבד (31/12 של השנה הקודמת),
    // לא יתרה נוכחית; מוצג בהפרדה ולעולם אינו נספר ביתרה הנוכחית או במכנה החשיפה.
    let prevYearEnd = null;
    for (const py of Array.from(hop.getElementsByTagName('PerutYitrotLesofShanaKodemet'))) {
        const v = num(txt(py, 'YITRAT-SOF-SHANA'));
        if (v !== null) prevYearEnd = (prevYearEnd || 0) + v;
    }
    return {
        yatzran, account: txt(hop, 'MISPAR-POLISA-O-HESHBON'), plan,
        sugMutzar, sugPolisa: txt(hop, 'SUG-POLISA'), sugTochnit: txt(hop, 'SUG-TOCHNIT-O-CHESHBON'),
        status: txt(hop, 'STATUS-POLISA-O-CHESHBON'), nechonut: txt(hop, 'TAARICH-NECHONUT') || txt(hop, 'TAARICH-MADAD'),
        tracks, feeDeposit, feeAcc,
        lastDepositPeriod: lastDep ? txt(lastDep, 'TAARICH-HAFKADA-ACHARON') : '',
        lastDepositTotal: lastDep ? num(txt(lastDep, 'TOTAL-HAFKADA')) : null,
        tsuaNeto: tsuaVals.length ? tsuaVals[0] : null,
        covers, forecast, annuityFactor,
        severanceBalance: sevVals.length ? sevVals.reduce((a, b) => a + b, 0) : null,
        kind: classify(plan, sugMutzar), totalBalance, prevYearEnd,
        feeContractDep, feeContractAcc, employer, salaryLatest, salaryMonth,
        deposits, disability, survivors, premiumCollected, hasLoan, nezilut, asOf,
    };
}

export function parseMaslakaXml(fileName, text, into, report) {
    parseWarnings = [];
    const clean = text.replace(/^﻿/, '');
    const doc = new DOMParser().parseFromString(clean, 'text/xml');
    if (doc.getElementsByTagName('parsererror').length || !doc.getElementsByTagName('Mimshak').length) {
        report.push({ fileName, ok: false, detail: 'הקובץ אינו XML של ממשק מסלקה תקין' });
        return;
    }
    // Client name: the first SHEM-PRATI in the file is the service desk ("מוקד קשרי לקוחות").
    // The account holder is the block that also carries personal details such as SHEM-MISHPACHA-KODEM / birth date.
    if (!into.clientName) {
        for (const el of Array.from(doc.getElementsByTagName('SHEM-PRATI'))) {
            const parent = el.parentElement;
            if (!parent) continue;
            const first = (el.textContent || '').trim();
            const last = txt(parent, 'SHEM-MISHPACHA');
            const looksPersonal = parent.getElementsByTagName('SHEM-MISHPACHA-KODEM').length > 0
                || parent.getElementsByTagName('TAARICH-LEIDA').length > 0 || parent.getElementsByTagName('MIN').length > 0;
            if (looksPersonal && first && !/מוקד|^-$/.test(first)) { into.clientName = `${first} ${last}`.trim(); break; }
        }
    }
    // פרטי לקוח מלאים לדוח המקוצר, מתוך בלוק YeshutLakoach (הערכים כפי שהם ב-XML; אין להשלים ממקור אחר)
    if (!into.client) {
        for (const el of Array.from(doc.getElementsByTagName('YeshutLakoach'))) {
            const first = txt(el, 'SHEM-PRATI');
            if (!first || /מוקד|^-$/.test(first)) continue;
            const id = normalizeIdNumber(txt(el, 'MISPAR-ZIHUY-LAKOACH'));
            const rawBirth = txt(el, 'TAARICH-LEYDA') || txt(el, 'TAARICH-LEIDA') || '';
            into.client = {
                name: `${first} ${txt(el, 'SHEM-MISHPACHA')}`.trim(),
                id,
                birthDate: /^\d{8}$/.test(rawBirth) ? `${rawBirth.slice(0, 4)}-${rawBirth.slice(4, 6)}-${rawBirth.slice(6, 8)}` : null,
                city: txt(el, 'SHEM-YISHUV'), street: txt(el, 'SHEM-RECHOV'),
                houseNo: txt(el, 'MISPAR-BAIT'), zip: txt(el, 'MIKUD'),
                cell: txt(el, 'MISPAR-CELLULARI'), email: txt(el, 'E-MAIL'),
            };
            break;
        }
    }
    let added = 0;
    for (const yz of Array.from(doc.getElementsByTagName('YeshutYatzran'))) {
        const yatzran = txt(yz, 'SHEM-YATZRAN') || 'גוף לא ידוע';
        const mutzarim = yz.getElementsByTagName('Mutzar');
        if (mutzarim.length) {
            for (const mz of Array.from(mutzarim)) {
                const sug = txt(mz, 'SUG-MUTZAR');
                for (const hop of Array.from(mz.getElementsByTagName('HeshbonOPolisa'))) {
                    into.accounts.push(parseAccount(hop, yatzran, sug));
                    added++;
                }
            }
        } else {
            for (const hop of Array.from(yz.getElementsByTagName('HeshbonOPolisa'))) {
                into.accounts.push(parseAccount(hop, yatzran, ''));
                added++;
            }
        }
    }
    into.fileCount++;
    report.push({ fileName, ok: added > 0, detail: added > 0 ? `נמצאו ${added} חשבונות/פוליסות` : 'לא נמצאו חשבונות בקובץ' });
    if (parseWarnings.length) {
        const shown = parseWarnings.slice(0, 3).join('; ');
        const more = parseWarnings.length > 3 ? ` (+${parseWarnings.length - 3} נוספות)` : '';
        report.push({ fileName, ok: true, warn: true, detail: `אזהרות קריאה: ${shown}${more}` });
    }
}
