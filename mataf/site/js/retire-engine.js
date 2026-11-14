// retire-engine.js - M-045 שלב 1: מנוע חלופות המס במענק הפרישה ובקצבה (פונקציות טהורות, בלי DOM)
// כל כלל מפנה למקור בספרייה (mataf/knowledge/sources). כל הסכומים בש"ח של 2026 (ריאלי): מדרגות שנים
// עתידיות = מדרגות 2026, והיוון בריבית ריאלית (ברירת מחדל 3%, החלטת הבעלים 11.11).
import { TAX_TABLES, LIFE_EXPECTANCY } from './retire-data.js';

// --- קבועי 2026 ---
// מדריך 161ד 2026 (tax-161d-2026), עמ' 3 ו-6-7: תקרת קצבה מזכה 9,430, שיעור פטור 57.5%, מכפיל 180, מקדם 1.35
export const K = {
    MAZKE: 9430, EXEMPT_PCT: 0.575, DIVISOR: 180, GRANT_FACTOR: 1.35, YEARS_LOOKBACK: 32,
    // תקרת הפטור למענק פרישה לשנת עבודה - פקודה 9(7א), לוח ניכויים 2026 (קפוא 2025-2027)
    GRANT_CAP_PER_YEAR: 13750,
};
K.BASKET = Math.round(K.MAZKE * K.EXEMPT_PCT * K.DIVISOR); // 976,005 (מדריך 161ד עמ' 4, 6)
K.MONTHLY_EXEMPT_MAX = K.MAZKE * K.EXEMPT_PCT; // 5,422.25

// M-065/M-067: שיעור הפטור על קצבה מזכה לפי שנת המס - קבוע בחוק: סעיף 9א(ב) לפקודה (67% - הנוסח הקבוע, משנת 2028)
// וסעיף 9א(ז)(4)-(6) כנוסחו בתיקון 275 (ס"ח 3336): 2025 57%, 2026 57.5%, 2027 62.5%.
// ספרייה: ito-consolidation-btl-retained20261109 עמ' 26-27; ito-amendment275-2024 עמ' 2 (נבדקו מול תמונה 14.11.2026).
// חובה לבדוק בכל ריצת ספרייה שהסעיף לא תוקן (L-030). לפני 2025 - null (אין כאן תקרות היסטוריות).
export const EXEMPT_PCT_BY_YEAR = { 2025: 0.57, 2026: 0.575, 2027: 0.625 };
export const EXEMPT_PCT_FROM_2028 = 0.67;
export function exemptPctForYear(year) {
    if (!Number.isFinite(year) || year < 2025) return null;
    return year >= 2028 ? EXEMPT_PCT_FROM_2028 : EXEMPT_PCT_BY_YEAR[year];
}
// תקרת הקצבה המזכה לשנים אחרי 2026 טרם פורסמה; המנוע עובד בערכי 2026 (ריאלי), ולכן התקרה 9,430 לכל שנה.
function exemptParams(year) {
    const pct = (year ? exemptPctForYear(year) : null) ?? K.EXEMPT_PCT;
    return { pct, basket: Math.round(K.MAZKE * pct * K.DIVISOR), max: K.MAZKE * pct };
}

export const REFS = {
    basket: 'מדריך 161ד 2026, עמ\' 4-7 (tax-161d-2026)',
    grantCap: 'פקודת מס הכנסה 9(7א); לוח ניכויים 2026',
    spreadFwd: 'חוזר מס הכנסה 2/2022, סעיפים 4.3.3-4.3.7 (ito-circular-2-2022)',
    spreadBack: 'חוזר מס הכנסה 2/2022, סעיף 4.2.1 (ito-circular-2-2022)',
    rezefKitzba: 'פקודה 9(7א)(ב) ו-7(9א)(ז) - ייעוד מענק לקצבה; חוזר 2/2022 סעיף 5',
    rezefPitzuyim: 'פקודה 9(7א)(ב)(1) - רצף זכויות לפיצויים (מעסיק חדש)',
    tax: 'לוחות הניכויים 2020-2026 (engine-data-20261111/tax-brackets-2020-2026.json)',
    life: 'למ"ס, לוח תמותה שלם 2018-2022, פרסום 1945 (engine-data-20261111/life-expectancy-cbs.json)',
};

const r2 = (x) => Math.round(x * 100) / 100;

// --- מס שנתי ---
export function taxTable(year) {
    const ys = Object.keys(TAX_TABLES).map(Number).sort((a, b) => a - b);
    const y = Math.min(Math.max(year, ys[0]), ys[ys.length - 1]);
    return { year: y, exact: y === year, ...TAX_TABLES[y] };
}
// מס על הכנסה מיגיעה אישית בשנה: מדרגות, פחות נקודות זיכוי (לא מתחת לאפס), ועוד מס יסף
export function annualTax(income, year, creditPoints = 2.25) {
    const t = taxTable(year);
    let tax = 0, prev = 0;
    for (const [upTo, rate] of t.brackets) {
        const top = upTo === null ? Infinity : upTo;
        if (income > prev) tax += (Math.min(income, top) - prev) * rate;
        prev = top;
        if (income <= top) break;
    }
    tax = Math.max(0, tax - creditPoints * t.creditPointAnnual);
    const [thr, srate] = t.surtax;
    if (income > thr) tax += (income - thr) * srate;
    return r2(tax);
}

// --- פטור על מענק פרישה: הנמוך מ-1.5 משכורות אחרונות לשנה ומהתקרה, כפול שנות העבודה ---
// פטירה (9(7א)(ב)): עד שתי משכורות אחרונות לכל שנת עבודה, ובשום מקרה לא מעל 27,520 ₪ לשנה (נוסח מאוחד, עמ' 20)
export const DEATH_CAP_PER_YEAR = 27520;
export function grantExemption({ grant = 0, workYears = 0, lastSalary = 0, death = false }) {
    const mult = death ? 2 : 1.5, capY = death ? DEATH_CAP_PER_YEAR : K.GRANT_CAP_PER_YEAR;
    const perYear = lastSalary > 0 ? Math.min(lastSalary * mult, capY) : capY;
    const cap = perYear * workYears;
    const exempt = Math.min(grant, cap);
    return { perYear, cap: r2(cap), exempt: r2(exempt), taxable: r2(Math.max(0, grant - exempt)) };
}

// --- קיבוע: הפטור החודשי על הקצבה אחרי נוסחת הקיזוז (מדריך 161ד 2026 עמ' 6-7) ---
// מענק פטור בגין יותר מ-32 שנה נלקח ביחס 32/שנים, כפול 1.35; יתרת הסל חלקי 180, עד שיעור הפטור של השנה מהתקרה
// year: שנת המס (ברירת מחדל - 2026). השיעור לפי exemptPctForYear; ההגדלה בשנה מאוחרת מיוחסת לקצבה (חלק ה בטופס 161ד, אפשרות 3).
export function pensionExemption({ exemptGrants = [], year = null }) {
    const P = exemptParams(year);
    let used = 0;
    for (const g of exemptGrants) {
        const ratio = g.workYears > K.YEARS_LOOKBACK ? K.YEARS_LOOKBACK / g.workYears : 1;
        used += (g.amount || 0) * ratio * K.GRANT_FACTOR;
    }
    const basketLeft = Math.max(0, P.basket - used);
    const monthly = Math.min(P.max, basketLeft / K.DIVISOR);
    return { basketUsed: r2(used), basketLeft: r2(basketLeft), monthlyExempt: r2(monthly), rate: r2(monthly / K.MAZKE * 100), exemptPct: P.pct, basket: P.basket };
}

// --- פריסה (חוזר 2/2022) ---
// קדימה: רק מ-6 שנות עבודה; שנה לכל 4 שנים, עיגול חצי כלפי מעלה, עד 6 (4.3.3-4.3.4)
export function forwardSpreadYears(workYears) {
    if (!(workYears >= 6)) return 0;
    return Math.min(6, Math.floor(workYears / 4 + 0.5));
}
// אפשרויות השנה הראשונה (4.3.5-4.3.6): משנת הפרישה; או מהשנה הבאה - בלי הפסד שנה אם הפרישה מ-30.9 ואילך
export function forwardSpreadOptions(workYears, retireYear, retireMonth, retireDay = 1) {
    const n = forwardSpreadYears(workYears);
    if (!n) return [];
    const lateQuarter = retireMonth > 9 || (retireMonth === 9 && retireDay >= 30);
    const out = [];
    for (let k = 1; k <= n; k++) out.push({ kind: 'fwd', years: Array.from({ length: k }, (_, i) => retireYear + i) });
    const nNext = lateQuarter ? n : n - 1;
    for (let k = 1; k <= nNext; k++) out.push({ kind: 'fwd-next', years: Array.from({ length: k }, (_, i) => retireYear + 1 + i) });
    return out;
}
// אחורה: בחלקים שווים על פני שנות העבודה, עד 6 שנות מס המסתיימות בשנת קבלת המענק (4.2.1)
export function backSpreadOptions(workYears, receiptYear) {
    const n = Math.min(6, Math.max(1, Math.ceil(workYears || 0)));
    const out = [];
    for (let k = 2; k <= n; k++) out.push({ kind: 'back', years: Array.from({ length: k }, (_, i) => receiptYear - k + 1 + i) });
    return out;
}

export function lifeExpectancy(sex, age) {
    const t = LIFE_EXPECTANCY[sex === 'female' ? 'female' : 'male'];
    const a = Math.min(100, Math.max(50, Math.round(age)));
    return t[String(a)];
}

// --- הערכת חלופה אחת ---
// plan: { exemptWithdraw, taxable: 'rezef' | 'now' | {kind, years} }
function evaluatePlan(inp, plan, ctx) {
    const { E, T, k } = ctx;
    const toPensionExempt = E - plan.exemptWithdraw;
    const taxableToPension = plan.taxable === 'rezef' ? T : 0;
    const toPension = toPensionExempt + taxableToPension;
    if (toPension > 0.005 && !(k > 0)) return { available: false, reason: 'חסר מקדם המרה לקצבה - אי אפשר לחשב את הקצבה מהכסף שנשאר בקופה' };
    const extraPension = toPension > 0 ? toPension / k : 0;
    const pensionMonthly = (inp.pensionMonthly || 0) + extraPension;
    const grants = (inp.priorExemptGrants || []).concat(plan.exemptWithdraw > 0 ? [{ amount: plan.exemptWithdraw, workYears: inp.workYears }] : []);
    const ex = pensionExemption({ exemptGrants: grants, year: inp.eligibilityYear });
    const exOf = (y) => pensionExemption({ exemptGrants: grants, year: Math.max(y, inp.eligibilityYear) }).monthlyExempt;
    // שיבוץ החלק החייב לשנים
    const grantByYear = {};
    if (T > 0 && plan.taxable !== 'rezef') {
        const years = plan.taxable === 'now' ? [inp.retireYear] : plan.taxable.years;
        for (const y of years) grantByYear[y] = (grantByYear[y] || 0) + T / years.length;
    }
    const firstYear = Math.min(inp.retireYear, ...Object.keys(grantByYear).map(Number));
    const rows = [];
    let taxNominal = 0, taxPV = 0, grossPV = 0, taxNow = 0;
    const r = inp.discountRate ?? 0.03;
    for (let y = firstYear; y <= ctx.endYear; y++) {
        const base = ctx.incomeOf(y);
        const pensionGross = y >= inp.pensionStartYear ? pensionMonthly * 12 : 0;
        const exemptAnnual = y >= inp.pensionStartYear && y >= inp.eligibilityYear ? Math.min(pensionMonthly, exOf(y)) * 12 : 0;
        const grantPart = grantByYear[y] || 0;
        const taxable = base + grantPart + pensionGross - exemptAnnual;
        const incr = annualTax(taxable, y, inp.creditPoints) - annualTax(base, y, inp.creditPoints);
        const t = Math.max(0, y - inp.retireYear);
        const disc = Math.pow(1 + r, t);
        taxNominal += incr; taxPV += incr / disc; grossPV += pensionGross / disc;
        if (y <= inp.retireYear) taxNow += incr;
        rows.push({ year: y, base: r2(base), grantPart: r2(grantPart), pensionGross: r2(pensionGross), exemptAnnual: r2(exemptAnnual), tax: r2(incr), estimatedIncome: !ctx.hasIncome(y) });
    }
    const cashNow = plan.exemptWithdraw + (plan.taxable === 'rezef' ? 0 : T);
    grossPV += cashNow;
    return {
        available: true, cashNow: r2(cashNow), toPension: r2(toPension), pensionMonthly: r2(pensionMonthly), extraPension: r2(extraPension),
        exemption: ex, taxNow: r2(taxNow), taxNominal: r2(taxNominal), taxPV: r2(taxPV), grossPV: r2(grossPV), netPV: r2(grossPV - taxPV), rows,
    };
}

// --- חלופה ו': כמה מהמענק הפטור אפשר למשוך בלי לפגוע בפטור על הקצבה ---
// הסל שהקצבה לא מנצלת: BASKET - min(קצבה, 5,422.25) × 180; חלקי 1.35 (ובהתאמת 32 שנה) = המענק הפטור "החינמי"
function freeExemptWithdraw(inp, ctx, taxableToPension) {
    const ratio = inp.workYears > K.YEARS_LOOKBACK ? K.YEARS_LOOKBACK / inp.workYears : 1;
    const prior = pensionExemption({ exemptGrants: inp.priorExemptGrants || [] }).basketUsed;
    const P = exemptParams(inp.eligibilityYear); // בשנת הזכאות - שמרני: ההגדלות המאוחרות רק מגדילות את המרווח
    let w = 0;
    for (let i = 0; i < 30; i++) { // הקצבה תלויה במה שנשאר בקופה - איטרציה קצרה עד התכנסות
        const toPension = (ctx.E - w) + taxableToPension;
        const pension = (inp.pensionMonthly || 0) + (ctx.k > 0 ? toPension / ctx.k : 0);
        const need = Math.min(pension, P.max) * K.DIVISOR;
        const free = Math.max(0, (P.basket - prior - need) / (K.GRANT_FACTOR * ratio));
        const nw = Math.min(ctx.E, free);
        if (Math.abs(nw - w) < 0.5) { w = nw; break; }
        w = nw;
    }
    return Math.floor(w);
}

// --- הכניסה הראשית ---
// inp: { retireYear, retireMonth, retireDay, sex, age, grant, workYears, lastSalary, priorExemptGrants:[{amount, workYears}],
//        pensionMonthly, annuityFactor, pensionStartYear, eligibilityYear, creditPoints,
//        incomeByYear: {שנה: הכנסה חייבת}, retireYearIncome, pastIncomeEstimate, futureIncome,
//        newEmployerWithinYear, discountRate, horizonYears }
export function evaluateRetirement(input) {
    const inp = Object.assign({
        retireMonth: 12, retireDay: 31, sex: 'male', age: 66, grant: 0, workYears: 0, lastSalary: 0, priorExemptGrants: [],
        pensionMonthly: 0, annuityFactor: null, creditPoints: 2.25, incomeByYear: {}, futureIncome: 0, discountRate: 0.03,
        newEmployerWithinYear: false,
    }, input);
    inp.pensionStartYear = inp.pensionStartYear ?? inp.retireYear + 1;
    inp.eligibilityYear = inp.eligibilityYear ?? inp.pensionStartYear;
    const ge = grantExemption(inp);
    const E = ge.exempt, T = ge.taxable, k = inp.annuityFactor;
    const le = lifeExpectancy(inp.sex, inp.age);
    const endYear = inp.retireYear + (inp.horizonYears ?? Math.round(le));
    const has = (y) => Object.prototype.hasOwnProperty.call(inp.incomeByYear, y);
    const incomeOf = (y) => has(y) ? +inp.incomeByYear[y] || 0
        : y < inp.retireYear ? (inp.pastIncomeEstimate ?? inp.retireYearIncome ?? 0)
        : y === inp.retireYear ? (inp.retireYearIncome ?? 0) : (inp.futureIncome || 0);
    const ctx = { E, T, k, endYear, incomeOf, hasIncome: has };

    const fwd = forwardSpreadOptions(inp.workYears, inp.retireYear, inp.retireMonth, inp.retireDay);
    const back = backSpreadOptions(inp.workYears, inp.retireYear);
    // ו' משאירה את החלק החייב בקופה (נכנס לקצבה); ז' פורסת אותו - לכן הסכום ה"חינמי" שונה
    const fFree = freeExemptWithdraw(inp, ctx, T);
    const gFree = freeExemptWithdraw(inp, ctx, 0);
    const alts = [];
    const add = (id, name, explain, plan, extra = {}) => {
        const res = evaluatePlan(inp, plan, ctx);
        alts.push(Object.assign({ id, name, explain, plan: { exemptWithdraw: r2(plan.exemptWithdraw), taxable: plan.taxable } }, res, extra));
    };
    // בוחר את וריאנט הפריסה עם חבות המס הנמוכה ביותר (בערך נוכחי)
    const bestSpread = (exW, opts) => {
        let best = null;
        for (const o of opts) {
            const res = evaluatePlan(inp, { exemptWithdraw: exW, taxable: o }, ctx);
            if (res.available && (!best || res.taxPV < best.res.taxPV - 0.005)) best = { o, res };
        }
        return best;
    };
    const spreadLabel = (o) => o.years.length === 1 ? `לשנת ${o.years[0]}` : `${o.years[0]}-${o.years[o.years.length - 1]} (${o.years.length} שנים)`;

    add('A', 'רצף קצבה לכל המענק', 'כל המענק נשאר בקופה ומוסיף לקצבה. סל הפטור נשאר מלא לקצבה.', { exemptWithdraw: 0, taxable: 'rezef' }, { refs: [REFS.rezefKitzba, REFS.basket] });
    if (E > 0) add('B', 'משיכת הפטור + רצף קצבה לחלק החייב', 'מושכים את החלק הפטור; החלק החייב נשאר בקופה לקצבה. כל שקל פטור שנמשך מקטין את סל הפטור ב-1.35.', { exemptWithdraw: E, taxable: 'rezef' }, { refs: [REFS.grantCap, REFS.rezefKitzba, REFS.basket] });
    if (T > 0) {
        const bf = bestSpread(E, fwd);
        if (bf) add('C1', `משיכת הפטור + פריסה קדימה של החלק החייב, ${spreadLabel(bf.o)}`, 'הכול במזומן. החלק החייב מתחלק בשווה לשנות הפריסה. נבחרה חלוקת השנים הזולה ביותר.', { exemptWithdraw: E, taxable: bf.o }, { refs: [REFS.spreadFwd], variants: fwd.length });
        else alts.push({ id: 'C1', name: 'משיכת הפטור + פריסה קדימה', available: false, reason: 'פריסה קדימה מותרת רק מ-6 שנות עבודה (חוזר 2/2022 סעיף 4.3.3)', refs: [REFS.spreadFwd] });
        const bb = bestSpread(E, back);
        if (bb) add('C2', `משיכת הפטור + פריסה אחורה של החלק החייב, ${spreadLabel(bb.o)}`, 'הכול במזומן. החלק החייב מיוחס לשנים שעבר עליהן, עד 6 שנים כולל שנת הקבלה. דורש את ההכנסה בכל שנה (טופסי 106).', { exemptWithdraw: E, taxable: bb.o }, { refs: [REFS.spreadBack], variants: back.length });
        add('D', 'משיכת הפטור + מס על החלק החייב בלי פריסה', 'הכול במזומן. החלק החייב ממוסה כולו בשנת הפרישה, מעל ההכנסה של אותה שנה.', { exemptWithdraw: E, taxable: 'now' }, { refs: [REFS.grantCap, REFS.tax] });
    }
    alts.push(inp.newEmployerWithinYear
        ? { id: 'E', name: 'רצף פיצויים', available: true, conditional: true, explain: 'הכסף נשאר בקופה בלי מס עכשיו, והפטור נדחה למשיכה העתידית. לא מדורג במספרים: המס תלוי במועד ובאופן המשיכה בעתיד.', refs: [REFS.rezefPitzuyim] }
        : { id: 'E', name: 'רצף פיצויים', available: false, reason: 'דורש מעסיק חדש תוך שנה והודעה תוך 3 חודשים', refs: [REFS.rezefPitzuyim] });
    if (E > 0 && fFree > 0 && fFree < E - 0.5) {
        add('F', `משיכה פטורה חלקית: ₪${fFree.toLocaleString('he-IL')} + רצף קצבה ליתרה`, 'מושכים רק את החלק מהמענק הפטור שהקצבה לא צריכה מהסל - כך הפטור על הקצבה נשמר מלא.', { exemptWithdraw: fFree, taxable: 'rezef' }, { refs: [REFS.basket] });
    }
    if (E > 0 && T > 0 && gFree > 0 && gFree < E - 0.5) {
        {
            const bf = bestSpread(gFree, fwd.concat(back));
            if (bf) add('G', `שילוב: משיכה פטורה חלקית + פריסת החלק החייב ${bf.o.kind === 'back' ? 'אחורה' : 'קדימה'}, ${spreadLabel(bf.o)}`, 'משיכה פטורה רק עד מה שהקצבה לא מנצלת, שאר הפטור לקצבה, והחלק החייב נפרס.', { exemptWithdraw: gFree, taxable: bf.o }, { refs: [REFS.basket, REFS.spreadFwd, REFS.spreadBack] });
        }
    }
    // מס זהה (בהפרש של עד שקל): מקדימים את החלופה שבה הלקוח מקבל יותר נטו
    const ranked = alts.filter(a => a.available && !a.conditional).sort((a, b) => (Math.abs(a.taxPV - b.taxPV) < 1 ? b.netPV - a.netPV : a.taxPV - b.taxPV));
    ranked.forEach((a, i) => { a.rank = i + 1; });
    const bestNet = ranked.slice().sort((a, b) => b.netPV - a.netPV)[0];
    const warnings = [];
    if (!(k > 0)) warnings.push('חסר מקדם המרה לקצבה: חלופות שמשאירות כסף בקופה לא חושבו.');
    for (let y = inp.retireYear - 5; y < inp.retireYear; y++) if (!has(y) && back.some(o => o.years.includes(y))) { warnings.push('בפריסה אחורה ההכנסה בשנים הקודמות היא הערכה - חסרים טופסי 106.'); break; }
    if (!taxTable(endYear).exact) warnings.push('לשנים אחרי 2026 נלקחו מדרגות 2026 (חישוב ריאלי בערכי 2026).');
    {
        const pE = exemptPctForYear(inp.eligibilityYear) ?? K.EXEMPT_PCT;
        warnings.push(`שיעור הפטור על הקצבה המזכה לפי החוק לכל שנת מס (סעיף 9א(ב) ו-9א(ז), תיקון 275): 2026 57.5%, 2027 62.5%, 2028 ואילך 67%. בשנת הזכאות (${inp.eligibilityYear}): ${(pE * 100).toLocaleString('he-IL')}%. ההגדלות שאחרי שנת הזכאות יוחסו כולן לקצבה (חלק ה בטופס 161ד, אפשרות 3 - בחירת הלקוח בטופס). תקרת הקצבה המזכה לשנים אחרי 2026 טרם פורסמה - נלקחה תקרת 2026 (9,430 ₪), בהתאם לחישוב הריאלי בערכי 2026; לא אומת.`);
    }
    return {
        input: inp, grant: ge, lifeExpectancy: le, endYear, alternatives: alts, ranked,
        recommended: ranked[0] || null, bestNet: bestNet || null,
        savingVsNext: ranked.length > 1 ? r2(ranked[1].taxPV - ranked[0].taxPV) : null,
        warnings, refs: REFS,
    };
}
