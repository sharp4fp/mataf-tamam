// assets.js - מחשבון "תמונת נכסים וסיכון כולל" (הצעה docs/proposals/2026-11-12-total-assets-risk, אושרה 12.11.2026)
// חלק טהור: טווחים, פענוח אישור יתרות מבנק (פריטי טקסט של pdf.js), וחישוב המאזן ואחוז הסיכון האמיתי.
// העיקרון: אחוז המניות האמיתי = החשיפה המשוקללת על פני כל הנכסים הפיננסיים (CFA, "Economic balance sheet").
// כשהנתון מגיע מטווח, התוצאה היא טווח (מינימום-מקסימום) ולא מספר מדומה.

export const AMOUNT_RANGES = [
    { id: '0', label: 'אין', lo: 0, hi: 0 },
    { id: 'a', label: 'עד 50 אלף', lo: 1, hi: 50000 },
    { id: 'b', label: '50-150 אלף', lo: 50000, hi: 150000 },
    { id: 'c', label: '150-300 אלף', lo: 150000, hi: 300000 },
    { id: 'd', label: '300-600 אלף', lo: 300000, hi: 600000 },
    { id: 'e', label: '600 אלף - מיליון', lo: 600000, hi: 1000000 },
    { id: 'f', label: '1-2 מיליון', lo: 1000000, hi: 2000000 },
    { id: 'g', label: '2-5 מיליון', lo: 2000000, hi: 5000000 },
    { id: 'h', label: 'מעל 5 מיליון', lo: 5000000, hi: 10000000 },
];
export const EQUITY_RANGES = [
    { id: 's', label: 'סולידי (0-15% מניות)', lo: 0, hi: 15 },
    { id: 'l', label: '15-35% מניות', lo: 15, hi: 35 },
    { id: 'g', label: 'כללי (35-60% מניות)', lo: 35, hi: 60 },
    { id: 'h', label: '60-80% מניות', lo: 60, hi: 80 },
    { id: 'm', label: 'מנייתי (80-100% מניות)', lo: 80, hi: 100 },
    { id: 'u', label: 'לא יודע', lo: 0, hi: 100 },
];
const amountOf = (id) => AMOUNT_RANGES.find(r => r.id === id) || null;
const eqOf = (id) => EQUITY_RANGES.find(r => r.id === id) || EQUITY_RANGES[EQUITY_RANGES.length - 1];

// השאלון: 12 שאלות. kind: 'amount' (טווח סכום), 'amount+eq' (סכום + חשיפה), 'choice'
export const QUESTIONS = [
    { id: 'q1', kind: 'amount+eq', label: 'חשבונות בנק או ברוקר בישראל שאין עליהם אישור יתרות', bucket: 'il', why: 'שלמות התמונה' },
    { id: 'q2', kind: 'amount+eq', label: 'תיק מנוהל בבית השקעות או אצל מנהל תיקים (סכום + מסלול)', bucket: 'managed', why: 'לרוב החשיפה הגדולה ביותר מחוץ לפנסיה' },
    { id: 'q3', kind: 'amount+eq', label: 'נכסים בחו"ל (חשבון ברוקר או בנק בחו"ל)', bucket: 'abroad', why: 'סיכון וחשיפה למטבע', fx: true },
    { id: 'q4', kind: 'amount+eq', label: 'גמל להשקעה, פוליסות חיסכון או השתלמות שאינם בקובץ המסלקה', bucket: 'ltsav', why: 'בדרך כלל הם כבר במסלקה' },
    { id: 'q5', kind: 'amount', label: 'נדל"ן להשקעה (לא דירת המגורים) - שווי', bucket: 're', why: 'נכס סיכון לא נזיל' },
    { id: 'q5m', kind: 'amount', label: 'משכנתא על הנדל"ן להשקעה', bucket: 'reDebt', liability: true },
    { id: 'q6', kind: 'choice', label: 'דירת מגורים בבעלות', options: [['', 'לא נבחר'], ['no', 'אין'], ['yes', 'יש']], why: 'נכנסת למאזן בלבד, לא לאחוז הסיכון (החלטת הבעלים 12.11)' },
    { id: 'q6v', kind: 'amount', label: 'שווי דירת המגורים', bucket: 'home' },
    { id: 'q6m', kind: 'amount', label: 'משכנתא על דירת המגורים', bucket: 'homeDebt', liability: true },
    { id: 'q7', kind: 'amount', label: 'עסק או החזקה בחברה פרטית - שווי', bucket: 'business', why: 'סיכון דמוי מניות, ריכוזי' },
    { id: 'q8', kind: 'amount', label: 'קריפטו ונכסים אלטרנטיביים', bucket: 'crypto', why: 'סיכון גבוה' },
    { id: 'q9', kind: 'amount', label: 'הלוואות נוספות (לא משכנתא)', bucket: 'loans', liability: true },
    { id: 'q10', kind: 'amount', label: 'כמה כסף נדרש ב-3 השנים הקרובות', why: 'נזילות - כסף שאסור לסכן' },
    { id: 'q11', kind: 'choice', label: 'מקור ההכנסה העיקרי ויציבותו', options: [['', 'לא נבחר'], ['stable', 'שכיר יציב'], ['self', 'עצמאי / הכנסה משתנה'], ['pension', 'פנסיונר עם קצבה'], ['none', 'ללא הכנסה קבועה']], why: 'הכנסה יציבה מאפשרת לשאת יותר סיכון' },
    { id: 'q12', kind: 'choice', label: 'אם התיק יורד 20% - מה תעשה?', options: [['', 'לא נבחר'], ['sell', 'אמכור כדי לעצור את ההפסד'], ['wait', 'אחכה שיתאושש'], ['buy', 'אקנה עוד']], why: 'סבילות לסיכון' },
];

// --- פענוח אישור יתרות ---
// תוויות מוכרות -> קטגוריה. eq: חשיפה ידועה (באחוזים) או null = צריך לבחור טווח. נלמד מ"ריכוז יתרות לסוף שנה" של בנק הפועלים;
// בנקים אחרים יתווספו לפי דוגמאות.
export const BANK_LABELS = [
    { re: /עו"ש\s*שקל|עובר ושב/, key: 'cashIls', label: 'עו"ש שקל', cat: 'cash', eq: 0 },
    { re: /עו"ש\s*מט"ח/, key: 'cashFx', label: 'עו"ש מט"ח', cat: 'cash', eq: 0, fx: true },
    { re: /פקדון לזמן קצוב|פיקדון לזמן קצוב|פק"מ/, key: 'deposit', label: 'פיקדון לזמן קצוב', cat: 'deposit', eq: 0 },
    { re: /פר"י/, key: 'pri', label: 'פר"י', cat: 'deposit', eq: 0 },
    { re: /תוכנ\.?\s*חסכון מקושרות/, key: 'savLinked', label: 'תוכניות חיסכון מקושרות', cat: 'deposit', eq: 0 },
    { re: /תוכנית חסכון|תכנית חיסכון/, key: 'saving', label: 'תוכנית חיסכון', cat: 'deposit', eq: 0 },
    { re: /מט"ח פקדון|פקדון מט"ח/, key: 'fxDeposit', label: 'פיקדון מט"ח', cat: 'deposit', eq: 0, fx: true },
    { re: /קרנות נאמנות/, key: 'funds', label: 'קרנות נאמנות', cat: 'securities', eq: null },
    { re: /ניירות ערך לא סחירים/, key: 'secNon', label: 'ניירות ערך לא סחירים', cat: 'securities', eq: null },
    { re: /ניירות ערך סחירים/, key: 'sec', label: 'ניירות ערך סחירים', cat: 'securities', eq: null },
    { re: /מעוף לונג|מעוף שורט/, key: 'maof', label: 'אופציות מעו"ף', cat: 'derivatives', eq: null },
    { re: /אשראי שקל|ישראכרט חובה|ויזה חובה|כרטיס.*חובה|הלוואות|אשראי ספק|ערבויות/, key: 'credit', label: 'אשראי והלוואות', cat: 'liability', eq: 0 },
];
// סכום: 1,234.56 עם מינוס לפני או אחרי (בטקסט מימין לשמאל המינוס מופיע לפעמים בסוף), ₪ אופציונלי
const NUM_RE = /^[-−]?₪?\s*[-−]?(\d{1,3}(,\d{3})*|\d+)(\.\d{1,2})?\s*[-−]?$/;
const toNum = (s) => { const t = String(s).replace(/−/g, '-'); const n = parseFloat(t.replace(/[₪\s,-]/g, '')); return isFinite(n) ? (t.includes('-') ? -n : n) : null; };

function toLines(items) {
    const lines = [];
    for (const it of [...items].sort((a, b) => a.page - b.page || b.y - a.y)) {
        let line = lines.find(l => l.page === it.page && Math.abs(l.y - it.y) < 3);
        if (!line) { line = { page: it.page, y: it.y, items: [] }; lines.push(line); }
        line.items.push(it);
    }
    for (const l of lines) l.items.sort((a, b) => b.x - a.x);
    return lines;
}

// items: [{page, x, y, str}] כפי ש-pdf.js מחזיר. מחזיר שורות מזוהות; היתרה = המספר השמאלי בשורה (עמודת "יתרה בש"ח"
// היא השמאלית בטבלה מימין לשמאל; לידה עמודת "קרן").
export function parseBalanceItems(items) {
    const lines = toLines(items);
    const text = lines.map(l => l.items.map(i => i.str).join(' ')).join('\n');
    const bank = /הפועלים|bankhapoalim/.test(text) ? 'בנק הפועלים' : /לאומי|leumi/i.test(text) ? 'בנק לאומי' : /דיסקונט|discount/i.test(text) ? 'בנק דיסקונט'
        : /מזרחי|טפחות|mizrahi/i.test(text) ? 'מזרחי טפחות' : /הבינלאומי|fibi/i.test(text) ? 'הבינלאומי' : /בנק\s+12\b/.test(text) ? 'בנק הפועלים' : '';
    const dm = text.match(/נכון לתאריך\s*:?\s*(\d{1,2}\/\d{1,2}\/\d{4})/) || text.match(/(\d{1,2}\/\d{1,2}\/\d{4})\s*נכון לתאריך/) || text.match(/לסוף שנת\s*(\d{4})/);
    const rows = [];
    let zeros = 0;
    for (const l of lines) {
        const lt = l.items.map(i => i.str).join(' ');
        const def = BANK_LABELS.find(d => d.re.test(lt));
        if (!def || /סה"כ|סה''כ|סך הכל/.test(lt)) continue;
        const nums = l.items.filter(i => NUM_RE.test(i.str.trim())).sort((a, b) => a.x - b.x);
        if (!nums.length) continue;
        const amount = toNum(nums[0].str);
        if (amount === null) continue;
        if (amount === 0) { zeros++; continue; } // שורות אפס לא מוצגות; נספרות להודעה
        const shown = def.key === 'credit' || def.key === 'maof' ? lt.match(def.re)[0] : def.label;
        rows.push({ key: def.key, label: shown, source: lt.replace(/\s+/g, ' ').slice(0, 80), cat: def.cat, amount, eq: def.eq, fx: !!def.fx, page: l.page });
    }
    const tm = text.match(/בניכוי התח[י]?יבויות[^\n]*\n?[^\n]*?(-?₪?\s*-?[\d,]+\.\d{2})/);
    return { bank, date: dm ? dm[1] : '', rows, zeros, reportedNet: tm ? toNum(tm[1]) : null };
}

// --- החישוב ---
const mid = (lo, hi) => (lo + hi) / 2;
// inp: { banks: [{rows:[{cat, amount, eq, eqRange, fx, include}]}], q: {qid: rangeId, qid+'eq': eqId, ...}, pension: {value, eqLo, eqHi} }
export function computeTotal(inp) {
    const q = inp.q || {};
    const items = []; // {name, group, lo, hi, eqLo, eqHi, liquid, fx, risky}
    // פנסיה, גמל והשתלמות מהמסלקה
    if (inp.pension && inp.pension.value > 0) items.push({ name: 'פנסיה, גמל והשתלמות (מסלקה)', group: 'pension', lo: inp.pension.value, hi: inp.pension.value, eqLo: inp.pension.eqLo, eqHi: inp.pension.eqHi, liquid: false, fx: false });
    // בנקים
    let liabBanks = 0;
    for (const b of inp.banks || []) for (const r of b.rows || []) {
        if (r.include === false) continue;
        if (r.cat === 'liability') { liabBanks += Math.abs(r.amount); continue; }
        if (!(r.amount > 0)) continue;
        const e = r.eq !== null && r.eq !== undefined ? { lo: r.eq, hi: r.eq } : eqOf(r.eqRange);
        items.push({ name: `${b.bank || 'בנק'}: ${r.label}`, group: 'bank', lo: r.amount, hi: r.amount, eqLo: e.lo, eqHi: e.hi, liquid: true, fx: !!r.fx });
    }
    const addQ = (qid, name, group, opts = {}) => {
        const a = amountOf(q[qid]);
        if (!a || a.hi === 0) return;
        const e = opts.eq !== undefined ? { lo: opts.eq, hi: opts.eq } : eqOf(q[qid + 'eq']);
        items.push({ name, group, lo: a.lo, hi: a.hi, eqLo: e.lo, eqHi: e.hi, liquid: opts.liquid !== false, fx: !!opts.fx, risky: !!opts.risky, nonFinancial: !!opts.nonFinancial });
    };
    addQ('q1', 'חשבונות בישראל ללא אישור', 'il');
    addQ('q2', 'תיק מנוהל', 'managed');
    addQ('q3', 'נכסים בחו"ל', 'abroad', { fx: true });
    addQ('q4', 'גמל להשקעה / פוליסות שלא במסלקה', 'ltsav');
    addQ('q5', 'נדל"ן להשקעה', 're', { eq: 0, liquid: false, risky: true, nonFinancial: true });
    addQ('q7', 'עסק / חברה פרטית', 'business', { eq: 0, liquid: false, risky: true, nonFinancial: true });
    addQ('q8', 'קריפטו ואלטרנטיבי', 'crypto', { eq: 0, risky: true, nonFinancial: true });
    const home = q.q6 === 'yes' ? amountOf(q.q6v) : null;
    const debtOf = (id) => { const a = amountOf(q[id]); return a ? { lo: a.lo, hi: a.hi } : { lo: 0, hi: 0 }; };
    const debts = ['q5m', 'q6m', 'q9'].map(debtOf);
    const sum = (arr, f) => arr.reduce((t, x) => t + f(x), 0);

    // אחוז המניות האמיתי: על הנכסים הפיננסיים בלבד (בלי נדל"ן, עסק וקריפטו), לפי ערכי האמצע של הטווחים
    const fin = items.filter(i => !i.nonFinancial);
    const finMid = sum(fin, i => mid(i.lo, i.hi));
    const eqLo = finMid > 0 ? sum(fin, i => mid(i.lo, i.hi) * i.eqLo) / finMid : null;
    const eqHi = finMid > 0 ? sum(fin, i => mid(i.lo, i.hi) * i.eqHi) / finMid : null;
    // נכסי סיכון כוללים: מניות + נדל"ן להשקעה + עסק + קריפטו, מתוך כל הנכסים (בלי דירת המגורים)
    const allMid = sum(items, i => mid(i.lo, i.hi));
    const riskyLo = allMid > 0 ? (sum(fin, i => mid(i.lo, i.hi) * i.eqLo / 100) + sum(items.filter(i => i.risky), i => mid(i.lo, i.hi))) / allMid * 100 : null;
    const riskyHi = allMid > 0 ? (sum(fin, i => mid(i.lo, i.hi) * i.eqHi / 100) + sum(items.filter(i => i.risky), i => mid(i.lo, i.hi))) / allMid * 100 : null;
    const pen = items.find(i => i.group === 'pension');
    const liquidMid = sum(items.filter(i => i.liquid), i => mid(i.lo, i.hi));
    const fxMid = sum(items.filter(i => i.fx), i => mid(i.lo, i.hi));
    const need = amountOf(q.q10);
    const conc = items.filter(i => allMid > 0 && mid(i.lo, i.hi) / allMid > 0.25 && i.group !== 'pension').map(i => i.name);
    // סבילות לסיכון (שאלה 12) ויכולת (שאלה 11): טווח אחוז מניות מתאים, הערכה גסה בלבד
    const tol = { sell: [0, 30], wait: [30, 60], buy: [60, 100] }[q.q12] || null;
    const capacityNote = { stable: 'הכנסה יציבה - יכולת גבוהה יותר לשאת סיכון', pension: 'קצבה קבועה - היא נכס דמוי אג"ח, ומאפשרת יותר סיכון בשאר התיק', self: 'הכנסה משתנה - כדאי כרית נזילה גדולה יותר', none: 'אין הכנסה קבועה - התיק הוא מקור המחיה, יכולת נמוכה לשאת סיכון' }[q.q11] || '';
    const r1 = (x) => x === null ? null : Math.round(x * 10) / 10;
    return {
        items,
        totals: {
            assetsLo: sum(items, i => i.lo) + (home ? home.lo : 0), assetsHi: sum(items, i => i.hi) + (home ? home.hi : 0),
            debtsLo: sum(debts, d => d.lo) + liabBanks, debtsHi: sum(debts, d => d.hi) + liabBanks,
            home: home ? { lo: home.lo, hi: home.hi } : null,
        },
        equity: { lo: r1(eqLo), hi: r1(eqHi) },
        pensionEquity: pen ? { lo: r1(pen.eqLo), hi: r1(pen.eqHi) } : null,
        risky: { lo: r1(riskyLo), hi: r1(riskyHi) },
        liquid: Math.round(liquidMid), need: need ? { lo: need.lo, hi: need.hi } : null,
        fxPct: allMid > 0 ? r1(fxMid / allMid * 100) : null,
        concentration: conc,
        tolerance: tol, capacityNote,
        verdict: tol && eqLo !== null ? (eqHi < tol[0] ? 'below' : eqLo > tol[1] ? 'above' : 'within') : null,
    };
}
