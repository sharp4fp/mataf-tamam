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
    { id: 'h', label: '5-10 מיליון', lo: 5000000, hi: 10000000 },
    { id: 'i', label: '10-25 מיליון', lo: 10000000, hi: 25000000 },
    { id: 'j', label: 'מעל 25 מיליון', lo: 25000000, hi: 50000000 },
];
export const EQUITY_RANGES = [
    { id: 's', label: 'סולידי (0-15% מניות)', lo: 0, hi: 15 },
    { id: 'l', label: '15-35% מניות', lo: 15, hi: 35 },
    { id: 'g', label: 'כללי (35-60% מניות)', lo: 35, hi: 60 },
    { id: 'h', label: '60-80% מניות', lo: 60, hi: 80 },
    { id: 'm', label: 'מנייתי (80-100% מניות)', lo: 80, hi: 100 },
    { id: 'u', label: 'לא יודע', lo: 0, hi: 100 },
];
// דמי ניהול ועלויות שנתיות כוללות (ניהול, משמרת, עמלות) באחוזים מהשווי
export const FEE_RANGES = [
    { id: 'f1', label: 'עד 0.5% בשנה', lo: 0, hi: 0.5 },
    { id: 'f2', label: '0.5-1% בשנה', lo: 0.5, hi: 1 },
    { id: 'f3', label: '1-1.5% בשנה', lo: 1, hi: 1.5 },
    { id: 'f4', label: 'מעל 1.5% בשנה', lo: 1.5, hi: 2.5 },
    { id: 'fu', label: 'דמי ניהול: לא יודע', lo: 0, hi: 2.5 },
];
// הכנסה חודשית נטו משכירות (אחרי תחזוקה)
export const RENT_RANGES = [
    { id: 'r0', label: 'אין הכנסה', lo: 0, hi: 0 },
    { id: 'r1', label: 'שכירות עד 5 אלף לחודש', lo: 1, hi: 5000 },
    { id: 'r2', label: '5-10 אלף לחודש', lo: 5000, hi: 10000 },
    { id: 'r3', label: '10-20 אלף לחודש', lo: 10000, hi: 20000 },
    { id: 'r4', label: '20-50 אלף לחודש', lo: 20000, hi: 50000 },
    { id: 'r5', label: 'מעל 50 אלף לחודש', lo: 50000, hi: 100000 },
];
const amountOf = (id) => AMOUNT_RANGES.find(r => r.id === id) || null;
const eqOf = (id) => EQUITY_RANGES.find(r => r.id === id) || EQUITY_RANGES[EQUITY_RANGES.length - 1];
const pick = (list, id) => list.find(r => r.id === id) || null;

// השאלון: עמוד אחד, 7 נושאים (לפי רשימת הבעלים, 12.11 11:02), כל שאלה בשורה אחת.
// fields: [מפתח, סוג]. סוגים: amount, eq, fee, rent, debt (משכנתא/מימון - טווח סכום), choice.
// בכל שורה השדה הראשון הוא העיקרי; השדות הנוספים מופיעים רק אחרי שנבחר סכום.
export const SECTIONS = [
    { title: 'נכסים נזילים', rows: [
        { id: 'cash', label: 'עו"ש ופיקדונות שאינם באישורי היתרות', fields: [['cash', 'amount']] },
        { id: 'il', label: 'תיק ני"ע בישראל - עצמאי או מנוהל (מניות, אג"ח, קרנות)', fields: [['il', 'amount'], ['ilEq', 'eq'], ['ilFee', 'fee']] },
        { id: 'abroad', label: 'תיק השקעות בחו"ל', fields: [['abroad', 'amount'], ['abroadEq', 'eq'], ['abroadFee', 'fee']] },
    ] },
    { title: 'השקעות אלטרנטיביות ופרטיות', rows: [
        { id: 'alt', label: 'קרנות VC, PE, גידור, חוב פרטי, השקעות אנג\'ל', fields: [['alt', 'amount'], ['altCalls', 'amount', 'התחייבות להזרמת הון עתידית (Capital Calls)']] },
        { id: 'crypto', label: 'קריפטו', fields: [['crypto', 'amount']] },
    ] },
    { title: 'נדל"ן', rows: [
        { id: 'home', label: 'דירת מגורים (במאזן בלבד, לא באחוז הסיכון)', fields: [['home', 'amount'], ['homeDebt', 'debt', 'משכנתא']] },
        { id: 'reIl', label: 'נדל"ן מניב בישראל', fields: [['reIl', 'amount'], ['reIlDebt', 'debt', 'משכנתא / מימון'], ['reIlRent', 'rent']] },
        { id: 'reAbroad', label: 'נדל"ן בחו"ל', fields: [['reAbroad', 'amount'], ['reAbroadDebt', 'debt', 'מימון'], ['reAbroadRent', 'rent']] },
    ] },
    { title: 'עסקים ומניות ממקום העבודה', rows: [
        { id: 'biz', label: 'חברה או עסק בבעלות המשפחה', fields: [['biz', 'amount'], ['bizPlan', 'choice', 'תכנית', [['', 'תכנית לעסק...'], ['none', 'אין שינוי צפוי'], ['exit', 'אקזיט או הנפקה תוך 3 שנים'], ['transfer', 'העברה בין-דורית'], ['other', 'אחר']]]] },
        { id: 'emp', label: 'מניות ואופציות ממקום העבודה (RSU, ESPP)', fields: [['emp', 'amount']] },
    ] },
    // פנסיה, גמל, השתלמות וביטוח מנהלים - רק מהמסלקה (החלטת הבעלים 12.11 12:36); כאן רק פוליסות פיננסיות שלא מופיעות בה
    { title: 'פנסיה וביטוח', rows: [
        { id: 'pol', label: 'פוליסות חיסכון וגמל להשקעה שאינם במסלקה', fields: [['pol', 'amount'], ['polEq', 'eq']] },
    ] },
    // שורה אחת לכל ההתחייבויות (החלטת הבעלים 12.11 12:38); המינוף נשאל בתוכה כי הוא משנה את הסיכון
    { title: 'התחייבויות', rows: [
        { id: 'debts', label: 'הלוואות, ערבויות אישיות וחובות מס צפויים (מס שבח, רווחי הון, שומות) - בלי משכנתאות', fields: [['debts', 'amount'], ['lev', 'amount', 'מתוכם הלוואה כנגד תיק השקעות (מינוף)']] },
    ] },
    { title: 'מבנה, צרכים וסבילות', rows: [
        { id: 'struct', label: 'איך מוחזק ההון', fields: [['struct', 'choice', '', [['', 'לא נבחר'], ['private', 'פרטית בלבד'], ['holding', 'גם דרך חברת אחזקות (ארנק)'], ['trust', 'גם דרך נאמנות (Trust)'], ['partner', 'גם דרך שותפות'], ['mixed', 'שילוב של כמה']]]] },
        { id: 'need', label: 'כמה כסף נדרש ב-3 השנים הקרובות', fields: [['need', 'amount']] },
        { id: 'income', label: 'מקור ההכנסה העיקרי', fields: [['income', 'choice', '', [['', 'לא נבחר'], ['stable', 'שכיר יציב'], ['self', 'עצמאי / הכנסה משתנה'], ['pension', 'פנסיונר עם קצבה'], ['capital', 'חי מההון / מהעסק'], ['none', 'ללא הכנסה קבועה']]]] },
        { id: 'tol', label: 'התיק ירד 20% - מה תעשה?', fields: [['tol', 'choice', '', [['', 'לא נבחר'], ['sell', 'אמכור כדי לעצור את ההפסד'], ['wait', 'אחכה שיתאושש'], ['buy', 'אקנה עוד']]]] },
    ] },
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
const sum = (arr, f) => arr.reduce((t, x) => t + f(x), 0);
// inp: { banks: [{bank, rows:[{cat, amount, eq, eqRange, fx, include}]}], q: {מפתח: id}, pension: {value, eqLo, eqHi} }
export function computeTotal(inp) {
    const q = inp.q || {};
    // items: {name, group, lo, hi, eqLo, eqHi, liquid, fx, kind: 'fin'|'risk'|'home', fee:{lo,hi}}
    const items = [];
    if (inp.pension && inp.pension.value > 0) items.push({ name: 'פנסיה, גמל והשתלמות (מסלקה)', group: 'pension', lo: inp.pension.value, hi: inp.pension.value, eqLo: inp.pension.eqLo, eqHi: inp.pension.eqHi, liquid: false, kind: 'fin' });
    let liabBanks = 0;
    for (const b of inp.banks || []) for (const r of b.rows || []) {
        if (r.include === false) continue;
        if (r.cat === 'liability') { liabBanks += Math.abs(r.amount); continue; }
        if (!(r.amount > 0)) continue;
        const e = r.eq !== null && r.eq !== undefined ? { lo: r.eq, hi: r.eq } : eqOf(r.eqRange);
        items.push({ name: `${b.bank || 'בנק'}: ${r.label}`, group: 'bank', lo: r.amount, hi: r.amount, eqLo: e.lo, eqHi: e.hi, liquid: true, fx: !!r.fx, kind: 'fin' });
    }
    const add = (key, name, o = {}) => {
        const a = amountOf(q[key]);
        if (!a || a.hi === 0) return null;
        const e = o.eq !== undefined ? { lo: o.eq, hi: o.eq } : eqOf(q[key + 'Eq']);
        const fee = o.fee ? pick(FEE_RANGES, q[key + 'Fee']) : null;
        const it = { name, group: key, lo: a.lo, hi: a.hi, eqLo: e.lo, eqHi: e.hi, liquid: o.liquid !== false, fx: !!o.fx, kind: o.kind || 'fin', fee: fee ? { lo: fee.lo, hi: fee.hi } : null };
        items.push(it);
        return it;
    };
    add('cash', 'עו"ש ופיקדונות (ידני)', { eq: 0 });
    add('il', 'תיק ני"ע בישראל', { fee: true });
    add('abroad', 'תיק השקעות בחו"ל', { fee: true, fx: true });
    add('alt', 'השקעות אלטרנטיביות ופרטיות', { eq: 0, liquid: false, kind: 'risk' });
    add('crypto', 'קריפטו', { eq: 0, kind: 'risk' });
    add('reIl', 'נדל"ן מניב בישראל', { eq: 0, liquid: false, kind: 'risk' });
    add('reAbroad', 'נדל"ן בחו"ל', { eq: 0, liquid: false, kind: 'risk', fx: true });
    add('biz', 'חברה / עסק משפחתי', { eq: 0, liquid: false, kind: 'risk' });
    add('emp', 'מניות ממקום העבודה', { eq: 100 });
    add('pol', 'פוליסות חיסכון וגמל להשקעה', {});
    const home = amountOf(q.home);
    const debtKeys = ['homeDebt', 'reIlDebt', 'reAbroadDebt', 'debts']; // lev הוא "מתוכם" של debts - לא נספר פעמיים
    const debt = (k) => { const a = amountOf(q[k]); return a ? { lo: a.lo, hi: a.hi } : { lo: 0, hi: 0 }; };
    const debtsLo = sum(debtKeys, k => debt(k).lo) + liabBanks, debtsHi = sum(debtKeys, k => debt(k).hi) + liabBanks;

    const fin = items.filter(i => i.kind === 'fin');
    const finMid = sum(fin, i => mid(i.lo, i.hi));
    const allMid = sum(items, i => mid(i.lo, i.hi));
    const r1 = (x) => x === null ? null : Math.round(x * 10) / 10;
    const eqLo = finMid > 0 ? sum(fin, i => mid(i.lo, i.hi) * i.eqLo) / finMid : null;
    const eqHi = finMid > 0 ? sum(fin, i => mid(i.lo, i.hi) * i.eqHi) / finMid : null;
    const riskyShare = (side) => allMid > 0 ? (sum(fin, i => mid(i.lo, i.hi) * (side ? i.eqHi : i.eqLo) / 100) + sum(items.filter(i => i.kind === 'risk'), i => mid(i.lo, i.hi))) / allMid * 100 : null;
    const pen = items.find(i => i.group === 'pension');
    const liquidMid = sum(items.filter(i => i.liquid), i => mid(i.lo, i.hi));
    const fxMid = sum(items.filter(i => i.fx), i => mid(i.lo, i.hi));
    const need = amountOf(q.need), calls = amountOf(q.altCalls);
    const needLo = (need ? need.lo : 0) + (calls ? calls.lo : 0), needHi = (need ? need.hi : 0) + (calls ? calls.hi : 0);
    const conc = items.filter(i => allMid > 0 && mid(i.lo, i.hi) / allMid > 0.25 && i.group !== 'pension').map(i => i.name);
    // דמי ניהול: עלות שנתית משוערת על התיקים הסחירים
    const feeItems = items.filter(i => i.fee);
    const feeCost = feeItems.length ? { lo: Math.round(sum(feeItems, i => i.lo * i.fee.lo / 100)), hi: Math.round(sum(feeItems, i => i.hi * i.fee.hi / 100)) } : null;
    const rentOf = (k) => pick(RENT_RANGES, q[k]);
    const rents = ['reIlRent', 'reAbroadRent'].map(rentOf).filter(Boolean);
    const rentYear = rents.length ? { lo: sum(rents, r => r.lo) * 12, hi: sum(rents, r => r.hi) * 12 } : null;
    const lev = debt('lev');
    const tol = { sell: [0, 30], wait: [30, 60], buy: [60, 100] }[q.tol] || null;
    const capacityNote = { stable: 'הכנסה יציבה - יכולת גבוהה יותר לשאת סיכון', pension: 'קצבה קבועה היא נכס דמוי אג"ח, ומאפשרת יותר סיכון בשאר התיק', self: 'הכנסה משתנה - כדאי כרית נזילה גדולה יותר', capital: 'ההון הוא מקור המחיה - נדרשת זהירות בסיכון ובנזילות', none: 'אין הכנסה קבועה - יכולת נמוכה לשאת סיכון' }[q.income] || '';
    const notes = [];
    if (q.bizPlan === 'exit') notes.push('אקזיט או הנפקה צפויים: אירוע נזילות גדול - כדאי לתכנן מראש את הפיזור ואת המס');
    if (q.bizPlan === 'transfer') notes.push('העברה בין-דורית: לבדוק מבנה אחזקות ומיסוי');
    if (amountOf(q.emp) && amountOf(q.emp).hi > 0) notes.push('מניות ממקום העבודה: סיכון כפול - ההכנסה וההון תלויים באותה חברה');
    if (lev.hi > 0) notes.push('הלוואה כנגד תיק (מינוף): ירידה בשווקים עלולה לחייב מכירה בהפסד (Margin Call)');
    if (calls && calls.hi > 0) notes.push('התחייבות להזרמת הון (Capital Calls) נוספה לצורך הנזילות');
    if (['holding', 'trust', 'partner', 'mixed'].includes(q.struct)) notes.push('החזקה דרך חברה, נאמנות או שותפות: לבדוק השלכות מס ודיווח, וסמכות חתימה וירושה');
    return {
        items,
        totals: { assetsLo: sum(items, i => i.lo) + (home ? home.lo : 0), assetsHi: sum(items, i => i.hi) + (home ? home.hi : 0), debtsLo, debtsHi, home: home && home.hi > 0 ? { lo: home.lo, hi: home.hi } : null },
        equity: { lo: r1(eqLo), hi: r1(eqHi) },
        pensionEquity: pen ? { lo: r1(pen.eqLo), hi: r1(pen.eqHi) } : null,
        risky: { lo: r1(riskyShare(false)), hi: r1(riskyShare(true)) },
        liquid: Math.round(liquidMid), need: needHi > 0 ? { lo: needLo, hi: needHi } : null,
        fxPct: allMid > 0 ? r1(fxMid / allMid * 100) : null,
        concentration: conc, feeCost, rentYear,
        leveragePct: finMid > 0 && lev.hi > 0 ? r1(mid(lev.lo, lev.hi) / finMid * 100) : null,
        tolerance: tol, capacityNote, notes,
        verdict: tol && eqLo !== null ? (eqHi < tol[0] ? 'below' : eqLo > tol[1] ? 'above' : 'within') : null,
    };
}
