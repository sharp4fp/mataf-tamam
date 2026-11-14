// test-retire-engine.mjs - M-045 שלב 1: מנוע חלופות המס. מספרים צפויים מתוך מקורות הספרייה (עם עמוד) או מחישוב ידני מתועד.
import path from 'path';
import fs from 'fs';
const ROOT = path.resolve(process.env.BUILD || 'site/js');
const E = await import(path.join(ROOT, 'retire-engine.js'));
const D = await import(path.join(ROOT, 'retire-data.js'));
let pass = 0, fail = 0;
const ok = (c, n, d = '') => { if (c) { pass++; console.log('PASS ' + n); } else { fail++; console.log('FAIL ' + n + (d ? ' :: ' + d : '')); } };
const near = (a, b, eps = 0.01) => typeof a === 'number' && Math.abs(a - b) <= eps;

// 1. הנתונים במנוע זהים לקבצי הספרייה (אין עריכה ידנית)
const here = path.dirname(new URL(import.meta.url).pathname);
const lib = path.resolve(here, '../../knowledge/sources/mataf-library-20261109/prepared-increments/engine-data-20261111');
if (fs.existsSync(lib)) {
    const t = JSON.parse(fs.readFileSync(path.join(lib, 'tax-brackets-2020-2026.json'), 'utf8'));
    let same = true;
    for (const y of Object.keys(t).filter(k => k !== '_meta')) {
        const a = D.TAX_TABLES[y];
        same = same && a && a.creditPointAnnual === t[y].creditPointAnnual && a.surtax[0] === t[y].surtax.threshold && a.surtax[1] === t[y].surtax.rate
            && JSON.stringify(a.brackets) === JSON.stringify(t[y].brackets.map(b => [b.upTo, b.rate]));
    }
    ok(same, 'retire-data tax tables == library tax-brackets-2020-2026.json');
    const l = JSON.parse(fs.readFileSync(path.join(lib, 'life-expectancy-cbs.json'), 'utf8'));
    ok(['male', 'female'].every(s => Object.keys(l[s]).every(a => D.LIFE_EXPECTANCY[s][a] === l[s][a].ex)), 'retire-data life table == library life-expectancy-cbs.json');
} else { ok(true, 'library not in tree (deploy artifact) - data check skipped'); }

// 2. מס שנתי 2026: 100,000 ₪, 2.25 נקודות: 84,120×10% + 15,880×14% − 2.25×2,904 = 4,101.20
ok(near(E.annualTax(100000, 2026, 2.25), 4101.2), 'annual-tax-2026-100k', String(E.annualTax(100000, 2026, 2.25)));
ok(E.annualTax(30000, 2026, 2.25) === 0, 'annual-tax-credit-points-not-negative');
ok(near(E.annualTax(800000, 2026, 0) - E.annualTax(721560, 2026, 0), (800000 - 721560) * 0.5), 'surtax-3pct-above-threshold-on-top-of-47');
ok(E.taxTable(2031).year === 2026 && E.taxTable(2031).exact === false, 'future-years-use-2026-table');

// 3. קיבוע - מדריך 161ד 2026 (המדריך מעגל את הפטור החודשי לשקל לפני חישוב השיעור: 2,122/9,430 = 22.50%)
ok(E.K.BASKET === 976005 && near(E.K.MONTHLY_EXEMPT_MAX, 5422.25), '161d-basket-976005-and-max-5422 (p.4,6)');
const dani = E.pensionExemption({ exemptGrants: [{ amount: 550000, workYears: 40 }] });
ok(near(dani.basketUsed, 594000) && near(dani.basketLeft, 382005) && near(dani.monthlyExempt, 2122.25) && near(dani.rate, 22.5, 0.02), '161d-example-1-dani (p.6-7): 594,000 / 382,005 / 2,122 / 22.5%', JSON.stringify(dani));
const daniela = E.pensionExemption({ exemptGrants: [{ amount: 300000, workYears: 30 }] });
ok(near(daniela.basketUsed, 405000) && near(daniela.basketLeft, 571005) && near(daniela.monthlyExempt, 3172.25) && near(daniela.rate, 33.64), '161d-example-2-daniela (p.7): 405,000 / 571,005 / 3,172 / 33.64%', JSON.stringify(daniela));
ok(near(E.pensionExemption({}).monthlyExempt, 5422.25), '161d-avraham-no-grants-full-exemption (p.3)');

// 4. פטור מענק: הנמוך מ-1.5 משכורות ומ-13,750, כפול שנים
const g1 = E.grantExemption({ grant: 600000, workYears: 40, lastSalary: 20000 });
ok(g1.exempt === 550000 && g1.taxable === 50000, 'grant-exemption-cap-13750x40', JSON.stringify(g1));
const g2 = E.grantExemption({ grant: 600000, workYears: 40, lastSalary: 8000 });
ok(g2.perYear === 12000 && g2.exempt === 480000, 'grant-exemption-1.5-salary-lower', JSON.stringify(g2));

// 5. פריסה - חוזר 2/2022
ok([[12, 3], [32, 6], [15, 4], [21, 5], [10, 3], [5, 0], [6, 2]].every(([y, n]) => E.forwardSpreadYears(y) === n), '2/2022 4.3.3-4.3.4: 12→3, 32→6, 15→4, 21→5, 10→3, <6→0');
const nov = E.forwardSpreadOptions(12, 2020, 11).map(o => o.years.join(','));
ok(nov.includes('2020,2021,2022') && nov.includes('2021,2022,2023'), '2/2022 4.3.5 example: Nov-2020, 12y → 2020-22 or 2021-23', nov.join(' | '));
const jul = E.forwardSpreadOptions(10, 2020, 7).map(o => o.years.join(','));
ok(jul.includes('2020,2021,2022') && jul.includes('2021,2022') && !jul.includes('2021,2022,2023'), '2/2022 4.3.6 example: Jul-2020, 10y → 2020-22 or 2021-22 only', jul.join(' | '));
const bk = E.backSpreadOptions(24, 2021).map(o => o.years.join(','));
ok(bk.includes('2016,2017,2018,2019,2020,2021') && !bk.some(s => s.split(',').length > 6), '2/2022 4.2.1: back ≤ 6 years ending receipt year');

// 6. חישוב ידני - חלופה ד': מענק 300,000, 10 שנים, משכורת 30,000, בלי הכנסה אחרת
// פטור 137,500; חייב 162,500 בשנת 2026: 8,412 + 5,124 + 41,780×20% − 6,534 = 15,358
const base = { retireYear: 2026, retireMonth: 6, sex: 'male', age: 66, birthYear: 1960, birthMonth: 1, grant: 300000, workYears: 10, lastSalary: 30000, pensionMonthly: 0, annuityFactor: 200, retireYearIncome: 0, futureIncome: 0, horizonYears: 3 };
const r1 = E.evaluateRetirement(base);
const D1 = r1.alternatives.find(a => a.id === 'D');
ok(D1 && near(D1.taxNow, 15358) && D1.cashNow === 300000, 'alt-D-hand-calc-tax-now-15358', D1 && String(D1.taxNow));
const C1 = r1.alternatives.find(a => a.id === 'C1');
ok(C1 && C1.available && C1.taxNominal < D1.taxNominal, 'forward-spread-cheaper-than-no-spread', C1 && `${C1.taxNominal} vs ${D1.taxNominal}`);
ok(r1.ranked.every((a, i, arr) => i === 0 || arr[i - 1].taxPV <= a.taxPV + 1), 'ranking-ascending-by-tax-pv');
// מס זהה (למשל 0 כשנקודות הזיכוי מכסות): מי שמקבל יותר נטו קודם
const tie = E.evaluateRetirement({ retireYear: 2026, sex: 'male', age: 66, birthYear: 1960, birthMonth: 1, grant: 550000, workYears: 27, lastSalary: 18500, pensionMonthly: 6000, annuityFactor: 200, retireYearIncome: 0 });
const zero = tie.ranked.filter(a => a.taxPV < 1);
ok(zero.length >= 2 && zero.every((a, i) => i === 0 || zero[i - 1].netPV >= a.netPV), 'tax-tie-broken-by-higher-net', zero.map(a => a.id + ':' + a.netPV).join(','));
ok(r1.alternatives.find(a => a.id === 'E').available === false, 'rezef-pitzuyim-unavailable-without-new-employer');

// 7. תנאים: פחות מ-6 שנים - אין פריסה קדימה; בלי מקדם - אין חלופות רצף קצבה
const r2 = E.evaluateRetirement({ ...base, workYears: 5, grant: 200000 });
const c1b = r2.alternatives.find(a => a.id === 'C1');
ok(c1b && c1b.available === false && /4\.3\.3/.test(c1b.reason), 'forward-spread-unavailable-under-6-years', JSON.stringify(c1b));
const r3 = E.evaluateRetirement({ ...base, annuityFactor: null });
ok(r3.alternatives.find(a => a.id === 'A').available === false && r3.warnings.some(w => /מקדם/.test(w)), 'no-annuity-factor-rezef-unavailable-and-warned');

// 8. חלופה ו': קצבה קטנה (3,000) לא מנצלת את כל הסל - משיכה פטורה חלקית שומרת על פטור מלא לקצבה
// מענק 400,000 כולו פטור (30 × 13,750 = 412,500), מקדם 200: 976,005 − 1.35w = 180 × (3,000 + (400,000 − w)/200) → w = 168,900
const small = E.evaluateRetirement({ retireYear: 2026, eligibilityYear: 2026, sex: 'male', age: 66, grant: 400000, workYears: 30, lastSalary: 25000, pensionMonthly: 3000, annuityFactor: 200, retireYearIncome: 150000, futureIncome: 0 });
const F = small.alternatives.find(a => a.id === 'F'), B = small.alternatives.find(a => a.id === 'B'), A = small.alternatives.find(a => a.id === 'A');
ok(F && F.available && near(F.cashNow, 168900, 1) && F.cashNow < B.cashNow, 'alt-F-partial-withdraw-hand-calc-168900', F && String(F.cashNow));
ok(F && F.exemption.monthlyExempt >= Math.min(F.pensionMonthly, 5422.25) - 1, 'alt-F-keeps-pension-fully-exempt', F && JSON.stringify({ ex: F.exemption.monthlyExempt, p: F.pensionMonthly }));
ok(F && A && F.taxPV <= A.taxPV + 1, 'alt-F-not-more-tax-than-keeping-all (A)', F && `${F.taxPV} vs ${A.taxPV}`);

// 9. קצבה גדולה (12,000): כל שקל פטור שנמשך פוגע בפטור הקצבה - B מקטין את הפטור החודשי
const big = E.evaluateRetirement({ retireYear: 2026, eligibilityYear: 2026, sex: 'male', age: 66, grant: 400000, workYears: 30, lastSalary: 30000, pensionMonthly: 12000, annuityFactor: 200, retireYearIncome: 200000 });
const bB = big.alternatives.find(a => a.id === 'B'), bA = big.alternatives.find(a => a.id === 'A');
ok(bB.exemption.monthlyExempt < bA.exemption.monthlyExempt && near(bA.exemption.monthlyExempt, 5422.25), 'exempt-withdraw-reduces-pension-exemption (1.35 offset)');
ok(big.recommended && big.ranked[0].id === big.recommended.id && big.savingVsNext >= 0, 'recommended-is-rank-1-with-saving-vs-next');
ok(near(big.lifeExpectancy, 18.6) && big.endYear === 2026 + 19, 'horizon-from-cbs-life-table (male 66: 18.6)');

// 10. רצף פיצויים עם מעסיק חדש: זמין, מותנה, לא מדורג
const r4 = E.evaluateRetirement({ ...base, newEmployerWithinYear: true });
const e4 = r4.alternatives.find(a => a.id === 'E');
ok(e4.available && e4.conditional && !r4.ranked.includes(e4), 'rezef-pitzuyim-available-conditional-not-ranked');
// 11. מענק בפטירה (9(7א)(ב)): שתי משכורות לשנה, עד 27,520
const gd = E.grantExemption({ grant: 400000, workYears: 10, lastSalary: 20000, death: true });
ok(gd.perYear === 27520 && gd.exempt === 275200 && gd.taxable === 124800, 'death-grant-2-salaries-cap-27520', JSON.stringify(gd));
ok(E.grantExemption({ grant: 400000, workYears: 10, lastSalary: 10000, death: true }).perYear === 20000, 'death-grant-2-salaries-lower');
// 12. מחשבון הפיצויים בכרטסת מחשבונים משתמש במנוע
const C = await import(path.join(ROOT, 'calc.js'));
const html = C.renderCalcTab({ calc: { s_grant: '600000', s_years: '27', s_salary: '18500' }, calcSub: 'severance' }).replace(/<[^>]+>/g, ' ');
ok(/החלק הפטור\s+371,250/.test(html) && /החלק החייב במס\s+228,750/.test(html) && /עד 6 שנות מס/.test(html) && /ל-2,638/.test(html), 'severance-calculator-personal-result', html.match(/החלק הפטור[^₪]*₪/)?.[0] || '');
ok(/הזינו מענק ושנות עבודה/.test(C.renderCalcTab({ calc: {}, calcSub: 'severance' })), 'severance-calculator-empty-prompt');

// 10. M-067: שיעור הפטור לפי שנת המס מהחוק (9א(ב), 9א(ז), תיקון 275) - 2027 62.5%, 2028 ואילך 67%; תקרת 2026 (ערכים ריאליים)
ok(E.exemptPctForYear(2026) === 0.575 && E.exemptPctForYear(2027) === 0.625 && E.exemptPctForYear(2030) === 0.67 && E.exemptPctForYear(2010) === null, 'm067-rate-table');
ok(near(E.pensionExemption({ year: 2027 }).monthlyExempt, 5893.75) && near(E.pensionExemption({ year: 2028 }).monthlyExempt, 6318.1), 'm067-max-exempt-2027-5893.75-2028-6318.10');
ok(near(E.pensionExemption({}).monthlyExempt, 5422.25) && near(E.pensionExemption({ year: 2020 }).monthlyExempt, 5422.25), 'm067-default-and-pre-2025-fallback-2026');
// דני (מדריך 161ד דוגמה 1) בשנת 2028: סל 1,137,258 − 594,000 = 543,258; /180 = 3,018.10
const dani28 = E.pensionExemption({ exemptGrants: [{ amount: 550000, workYears: 40 }], year: 2028 });
ok(dani28.basket === 1137258 && near(dani28.monthlyExempt, 3018.1), 'm067-dani-2028-offset-on-67pct-basket', JSON.stringify(dani28));
// חלופה ו' בשנת זכאות 2027: 1,060,875 − 1.35w = 180 × (3,000 + (400,000 − w)/200) → w = 357,500
const small27 = E.evaluateRetirement({ retireYear: 2026, eligibilityYear: 2027, sex: 'male', age: 66, grant: 400000, workYears: 30, lastSalary: 25000, pensionMonthly: 3000, annuityFactor: 200, retireYearIncome: 150000, futureIncome: 0 });
const F27 = small27.alternatives.find(a => a.id === 'F');
ok(F27 && near(F27.cashNow, 357500, 3), 'm067-alt-F-2027-hand-calc-357500', F27 && String(F27.cashNow));
// קצבה 12,000, זכאות 2027: פטור 5,893.75 ב-2027, 6,318.10 ב-2028 (ההגדלה לקצבה)
const big27 = E.evaluateRetirement({ retireYear: 2026, eligibilityYear: 2027, sex: 'male', age: 66, grant: 400000, workYears: 30, lastSalary: 30000, pensionMonthly: 12000, annuityFactor: 200, retireYearIncome: 200000 });
const A27 = big27.alternatives.find(a => a.id === 'A');
const row = (y) => A27.rows.find(r => r.year === y);
ok(near(A27.exemption.monthlyExempt, 5893.75) && near(row(2027).exemptAnnual, 5893.75 * 12, 0.05) && near(row(2028).exemptAnnual, 6318.1 * 12, 0.05), 'm067-yearly-rate-in-rows-2027-2028', JSON.stringify([row(2027), row(2028)]));
ok(big27.warnings.some(w => w.includes('62.5%') && w.includes('9א(ז)') && w.includes('לא אומת')), 'm067-warning-states-law-and-unverified-ceiling');

// 11. M-070: גיל הפרישה ומועד הזכאות (פקודה 9א(א); מדריך 161ד עמ' 5; חוזר בל"ל 1544 עמ' 2-3)
const RA = (sex, y, m) => { const a = E.retirementAge(sex, y, m); return a ? `${a.years}/${a.months}` : null; };
ok(RA('male', 1960, 1) === '67/0' && RA('male', 1941, 12) === null, 'm070-male-67-from-5-1942');
ok(RA('female', 1947, 5) === '62/0' && RA('female', 1959, 12) === '62/0' && RA('female', 1960, 6) === '62/4' && RA('female', 1962, 5) === '63/0' && RA('female', 1963, 1) === '63/3' && RA('female', 1969, 12) === '64/9' && RA('female', 1975, 3) === '65/0', 'm070-female-table-samples');
{
    // טבלת הנשים זהה לטקסט החוזר (מלידה 5/1947 ואילך - הרלוונטי לפורשים היום)
    const libRoot = path.resolve(here, '../../knowledge/sources/mataf-library-20261109');
    const cat = JSON.parse(fs.readFileSync(path.join(libRoot, 'catalog/sources.json'), 'utf8')).find(x => x.id === 'btl-circular-1544-women-retirement-age');
    const txt = fs.readFileSync(path.join(libRoot, cat.text_path), 'utf8').replace(/[\u202a-\u202e\u200e\u200f]/g, '');
    const MON = { 'ינואר': 1, 'פברואר': 2, 'מרץ': 3, 'אפריל': 4, 'מאי': 5, 'יוני': 6, 'יולי': 7, 'אוגוסט': 8, 'ספטמבר': 9, 'אוקטובר': 10, 'נובמבר': 11, 'דצמבר': 12 };
    let n = 0, bad = [];
    for (const line of txt.split('\n')) {
        const m = line.trim().match(/^(\d\d)(?:ו\s*(\d)\s*-?\s*חודשים)?\s+(\S+)\s+(\d{4})/);
        if (!m || !MON[m[3]] || +m[4] < 1947 || (+m[4] === 1947 && MON[m[3]] < 5)) continue;
        n++; const got = RA('female', +m[4], MON[m[3]]), want = `${+m[1]}/${+(m[2] || 0)}`;
        if (got !== want) bad.push(`${m[3]} ${m[4]}: ${got} ≠ ${want}`);
    }
    ok(n >= 12 && !bad.length, 'm070-female-table-matches-circular-1544', `${n} שורות; ${bad.join('; ')}`);
}
const d63 = E.retirementAgeDate('female', 1963, 3);
ok(d63 && d63.year === 2026 && d63.month === 6, 'm070-age-date-female-1963-03-is-6-2026', JSON.stringify(d63));
// גבר בן 60 (יליד 1/1966), פורש 2026, קצבה מ-2027: הזכאות רק בגיל 67 - 1/2033; לפני כן הקצבה חייבת
const m60 = E.evaluateRetirement({ retireYear: 2026, sex: 'male', age: 60, birthYear: 1966, birthMonth: 1, grant: 400000, workYears: 30, lastSalary: 25000, pensionMonthly: 9000, annuityFactor: 200, retireYearIncome: 300000 });
const m60A = m60.alternatives.find(a => a.id === 'A');
ok(m60.input.eligibilityYear === 2033 && m60.input.eligibilityMonth === 1, 'm070-man-60-eligibility-2033', `${m60.input.eligibilityMonth}/${m60.input.eligibilityYear}`);
ok(m60A.rows.find(r => r.year === 2028).exemptAnnual === 0 && m60A.rows.find(r => r.year === 2033).exemptAnnual > 0 && m60A.taxPV > 1000, 'm070-no-exemption-before-retirement-age', String(m60A.taxPV));
// חודשים חלקיים: יליד 7/1959 מגיע ל-67 ב-7/2026; קצבה מ-1/2026 - בשנת 2026 פטור ל-6 חודשים בלבד
const part = E.evaluateRetirement({ retireYear: 2025, sex: 'male', age: 66, birthYear: 1959, birthMonth: 7, grant: 100000, workYears: 10, lastSalary: 20000, pensionMonthly: 4000, annuityFactor: 200, pensionStartYear: 2026, pensionStartMonth: 1, retireYearIncome: 0, horizonYears: 3 });
const pA = part.alternatives.find(a => a.id === 'A'), row26 = pA.rows.find(r => r.year === 2026);
ok(part.input.eligibilityYear === 2026 && part.input.eligibilityMonth === 7 && near(row26.exemptAnnual, Math.min(pA.pensionMonthly, pA.exemption.monthlyExempt) * 6, 0.05) && near(row26.pensionGross, pA.pensionMonthly * 12, 0.05), 'm070-partial-first-year-6-months', JSON.stringify(row26));
// נתונים חסרים - המנוע נעצר ומפרט
const noBirth = E.evaluateRetirement({ retireYear: 2026, grant: 100000, workYears: 10, lastSalary: 20000 });
ok(noBirth.missing && noBirth.missing.some(m => m.includes('תאריך לידה')) && !noBirth.alternatives, 'm070-missing-birth-stops');
const noSal = E.evaluateRetirement({ retireYear: 2026, birthYear: 1960, birthMonth: 1, grant: 100000, workYears: 10 });
ok(noSal.missing && noSal.missing.some(m => m.includes('משכורת')), 'm074-missing-salary-stops');
ok(E.grantExemption({ grant: 500000, workYears: 20, lastSalary: 0 }).missingSalary === true && E.grantExemption({ grant: 500000, workYears: 20, lastSalary: 0 }).exempt === 0, 'm074-grant-exemption-no-silent-full-cap');
const noPrior = E.evaluateRetirement({ retireYear: 2026, birthYear: 1960, birthMonth: 1, grant: 100000, workYears: 10, lastSalary: 20000, priorExemptGrants: null });
ok(noPrior.missing && noPrior.missing.some(m => m.includes('מעסיקים קודמים')), 'm071-unknown-prior-grants-stops');

// 12. M-073: 32 השנים על כל המענקים יחד, ורצפת הפטור הנוסף
const two = E.pensionExemption({ exemptGrants: [{ amount: 275000, workYears: 20 }, { amount: 275000, workYears: 20 }] });
// 275,000 × 1.35 + 275,000 × 12/20 × 1.35 = 371,250 + 222,750 = 594,000 → 382,005 / 180 = 2,122.25
ok(near(two.grantImpact, 594000) && near(two.monthlyExempt, 2122.25), 'm073-two-grants-32-years-total-2122', JSON.stringify(two.parts));
const capd = E.pensionExemption({ exemptGrants: [{ amount: 800000, workYears: 30 }] });
ok(capd.grantCapped && near(capd.grantImpact, 594090) && near(capd.monthlyExempt, (976005 - 594090) / 180), 'm073-grant-impact-capped-35pct', JSON.stringify(capd));
const capd28 = E.pensionExemption({ exemptGrants: [{ amount: 800000, workYears: 30 }], year: 2028 });
ok(near(capd28.monthlyExempt, 0.32 * 9430, 0.05), 'm073-additional-exemption-untouched-2028 (32% × 9,430)', String(capd28.monthlyExempt));
const hv = E.pensionExemption({ exemptGrants: [{ amount: 800000, workYears: 30 }], hivun: 200000 });
ok(near(hv.basketLeft, 976005 - 594090 - 200000), 'm073-hivun-reduces-beyond-cap');

// 13. M-072: פריסה אחורה בלי טופס 106 - הכנסה שנתית מלאה, והחלופה מסומנת "מבוסס הערכה"
const bk72 = E.evaluateRetirement({ retireYear: 2026, retireMonth: 3, retireDay: 31, sex: 'male', age: 66, birthYear: 1960, birthMonth: 1, grant: 600000, workYears: 30, lastSalary: 20000, pensionMonthly: 0, annuityFactor: 200, retireYearIncome: 60000 });
const c2 = bk72.alternatives.find(a => a.id === 'C2');
const past72 = c2 ? c2.rows.filter(r => r.year < 2026) : [];
ok(c2 && c2.estimatedIncome === true && past72.length > 0 && past72.every(r => r.base === 240000), 'm072-back-spread-uses-annual-salary-and-flagged', c2 && JSON.stringify(c2.plan.taxable) + JSON.stringify(past72));
console.log(`retire-engine: PASS=${pass} FAIL=${fail}`);
process.exit(fail ? 1 : 0);
