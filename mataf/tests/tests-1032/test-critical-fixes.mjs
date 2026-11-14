// test-critical-fixes.mjs - רגרסיה לבאגים הקריטיים M-001, M-003, M-004 (בדיקה עצמאית 11.11.2026)
// שימוש: BUILD=<path-to-js-dir> node test-critical-fixes.mjs
import { readFileSync } from 'node:fs';
global.window = {};
const B = process.env.BUILD;
const { normalizeIdNumber } = await import(B + '/maslaka.js');
const { grantRatio32, insights161 } = await import(B + '/analysis.js');
let pass = 0, fail = 0;
const ok = (cond, name) => { if (cond) { pass++; console.log('PASS ' + name); } else { fail++; console.log('FAIL ' + name); } };

// M-001: ת"ז עם אפס מוביל - אותו אדם בין המסלקה (18) לטופס 161 (000000018)
ok(normalizeIdNumber('000000018') === normalizeIdNumber('18'), 'm001-leading-zero-same-person');
ok(normalizeIdNumber('18') === '000000018', 'm001-pads-to-9');
// באג שהבעלים מצא 11.11: המסלקה מרפדת ל-15 ספרות
ok(normalizeIdNumber('000000317260826') === normalizeIdNumber('317260826'), 'm001-maslaka-15-digit-padding-same-person');
ok(normalizeIdNumber('000000317260826') === '317260826', 'm001-15-digit-normalized-to-9');
ok(normalizeIdNumber('0000000000000018') === normalizeIdNumber('18'), 'm001-long-padding-short-id');
ok(normalizeIdNumber('012-345-678') === '012345678', 'm001-strips-non-digits');
ok(normalizeIdNumber('') === '' && normalizeIdNumber('0000') === '', 'm001-empty-or-zero-is-absent');
ok(normalizeIdNumber('123456782') !== normalizeIdNumber('123456783'), 'm001-different-ids-differ');

// M-003: יחס 32/שנות עבודה (מדריך 161ד 2026, עמ' 6-7)
// דוגמה 1: 550,000 על 40 שנה -> 550,000 × 32/40 × 1.35 = 594,000
ok(Math.round(550000 * grantRatio32(40) * 1.35) === 594000, 'm003-guide-example-40-years');
// דוגמה 2: 30 שנה - אין הקטנה -> 300,000 × 1.35
ok(grantRatio32(30) === 1 && Math.round(300000 * grantRatio32(30) * 1.35) === 405000, 'm003-guide-example-30-years');
ok(grantRatio32(32) === 1 && grantRatio32(null) === 1, 'm003-boundary-and-missing');
const ins = insights161({ workYears: '40', maxExempt: '550,000', salarySeverance: '20,000', grants: [] });
const txt = JSON.stringify(ins);
ok(txt.includes('32/40'), 'm003-insight-shows-ratio');
ok(txt.includes((594000 / 180).toLocaleString('he-IL', { maximumFractionDigits: 0 })) || txt.includes(Math.round(594000 / 180).toLocaleString('he-IL')), 'm003-insight-monthly-uses-ratio');

// M-004: תרחיש C - המרת המשיכה הפטורה לפטור חודשי במחלק הסל (180), לא בתקופת ההשוואה
const app = readFileSync(B + '/app.js', 'utf8');
ok(/cap:\s*capFull\s*-\s*slackGrant\s*\*\s*FACTOR\s*\/\s*BASKET_DIVISOR/.test(app), 'm004-scenario-c-uses-basket-divisor');
ok(!/slackGrant\s*\*\s*FACTOR\s*\/\s*HORIZON/.test(app), 'm004-no-horizon-divisor');
// M-003 גם בקיבוע: השדה החדש וחישוב היחס
ok(/grantRatio32\(grantYears\)/.test(app) && /data-kib="grantYears"/.test(app), 'm003-kibua-uses-ratio-and-field');

// שיעור קצבה לבן/בת הזוג (בקשת הבעלים 11.11): 60% = הטבלה הכללית; שיעור בלי טבלה בתקנון - null (אין מספר)
const MK = await import(B + '/mekadem.js');
const menora = await MK.loadCompany('menora'), clal = await MK.loadCompany('clal');
ok(MK.scenarioForRate(menora, '60').scenario === 'with_spouse', 'surv-menora-60-generic-table');
ok(MK.scenarioForRate(menora, '30') === null && MK.scenarioForRate(menora, '100') === null, 'surv-menora-30-100-no-table');
ok(MK.scenarioForRate(menora, '0').scenario === 'no_spouse', 'surv-menora-0-no-spouse-table');
ok(['30', '60', '100'].every(r => MK.scenarioForRate(clal, r).scenario === 'spouse' + r), 'surv-clal-all-published');
const e60 = await MK.mekademEstimate({ company: 'clal', scenario: 'spouse60', guarantee: 'none', gender: 'm', birthYear: 1965, age: 67, spouseBirthYear: 1968 });
const e100 = await MK.mekademEstimate({ company: 'clal', scenario: 'spouse100', guarantee: 'none', gender: 'm', birthYear: 1965, age: 67, spouseBirthYear: 1968 });
ok(e100.k > e60.k, 'surv-higher-rate-higher-factor-lower-pension', `${e60.k} vs ${e100.k}`);
// שמירה/שחזור (11.11): החרגה (eligible=false) ובחירת מסלול מהשוק נשמרות
{
    const A = await import(B + '/analysis.js');
    const hold = [{ account: { account: 'A1' }, track: { code: 'T1', name: 'x' }, match: { officialId: null } }];
    const key = A.trackKeyOf('A1', hold[0].track);
    const anyFund = Object.values((await import(B + '/official.js')).OFFICIAL_PENSION)[0].fundId;
    const snap = A.plannerSnapshotOf({ targetEq: 60, geoPref: 'any', unknownAssumption: null, eligible: { [key]: false }, excluded: {}, confirmed: {}, selections: {}, marketPick: { [key]: anyFund } });
    const back = A.plannerRestoreOf(JSON.parse(JSON.stringify(snap)), hold);
    ok(back.eligible[key] === false, 'persist-exclusion-false-survives');
    ok(back.marketPick[key] === anyFund, 'persist-market-pick-survives');
    ok(Object.keys(A.plannerRestoreOf({ ...snap, marketPick: { [key]: 99999999 } }, hold).marketPick).length === 0, 'persist-unknown-fund-dropped');
}
// מקרה הבעלים 11.11 (מזהי מסלולים ציבוריים בלבד): פנסיה מגדל (8801, 13572) + השתלמות מגדל S&P (14668), יעד 35%.
// לפני התיקון: "מחוץ לטווח" בלי הצעה, כי ההשתלמות הוקפאה. אחרי: מעבר מלא בהשתלמות + איזון הפנסיה = 35%.
{
    const A = await import(B + '/analysis.js'); const O = await import(B + '/official.js');
    await import(B + '/joinable-extra.js').catch(() => {}); await import(B + '/scoring-extra.js').catch(() => {});
    const mk = (key, kind, id, bal, group) => { const T = kind === 'pensia' ? O.OFFICIAL_PENSION : O.OFFICIAL_GEMEL; const r = T[id]; return { key, kind, bal, eq: r.eq, matched: { officialId: id, row: { ...r }, group } }; };
    const inc = [mk('p1', 'pensia', 8801, 13100, 'mekipa'), mk('p2', 'pensia', 13572, 25500, 'mekipa'), mk('h1', 'hishtalmut', 14668, 8500, 'hishtalmut')];
    const plan = A.solveTargetPlan(inc, new Set(inc.map(x => x.key)), 35, 45, { totalValue: inc.reduce((s2, x) => s2 + x.bal, 0), estFrozen: [], noBasisVal: 0, frozenKnown: [], unknownAssumption: null }, 'any', { market: true, picks: {} });
    ok(plan.status === 'ok', 'owner-case-35-feasible', plan.status + ' ' + plan.loAll + '-' + plan.hiAll);
    ok(Math.abs(plan.achievedWholeEst - 35) < 0.5, 'owner-case-35-achieved', String(plan.achievedWholeEst));
    const h = plan.per.find(x => x.key === 'h1');
    ok(h && h.proposal && h.proposal.type === 'single' && h.proposal.singleOnly && h.proposal.track.eq < 40, 'owner-case-hishtalmut-full-switch-low-equity', h && JSON.stringify(h.proposal && { t: h.proposal.type, eq: h.proposal.track && h.proposal.track.eq }));
    const far = A.solveTargetPlan(inc, new Set(inc.map(x => x.key)), 2, 45, { totalValue: inc.reduce((s2, x) => s2 + x.bal, 0), estFrozen: [], noBasisVal: 0, frozenKnown: [], unknownAssumption: null }, 'any', { market: true, picks: {} });
    ok(far.status === 'infeasible' && far.closestT != null && far.per.every(x => x.proposal), 'unreachable-target-gives-closest-plan', far.status + ' ' + far.closestT);
}

// M-065 (14.11.2026): שיעורי הפטור לפי שנת הזכאות קבועים בחוק - 9א(ב), 9א(ז), תיקון 275
{
    const A = await import(B + '/analysis.js');
    ok(A.exemptPctForYear(2025) === 0.57 && A.exemptPctForYear(2026) === 0.575, 'm065-rates-2025-2026');
    ok(A.exemptPctForYear(2027) === 0.625, 'm065-rate-2027-amendment275');
    ok(A.exemptPctForYear(2028) === 0.67 && A.exemptPctForYear(2035) === 0.67, 'm065-rate-2028-onward-67');
    ok(A.exemptPctForYear(2020) === null && A.exemptPctForYear(NaN) === null, 'm065-no-rate-before-2025');
    const tax = (o) => A.pensionNetMonthly2026({ gross: 20000, eligible: true, certExemptRatePct: 62.5, creditPoints: 0, ...o }).pensionTax;
    ok(tax({ exemptPct: 0.625 }) < tax({}), 'm065-net-uses-year-rate-not-capped-at-57.5');
    ok(!app.includes('לא אומתו בכתבי קליטה'), 'm065-no-unverified-claim-for-legislated-rates');
    ok(app.includes("eligYear < 2026 && k.sim2026 !== 'yes'") && app.includes('exemptPctForYear(eligYear)'), 'm065-kibua-computes-2027-plus-by-law');
    ok(Math.round(9430 * A.exemptPctForYear(2026) * 180) === 976005, 'm065-basket-2026-unchanged');
}
// M-066 (14.11.2026): רצף קצבה ברירת מחדל - הגבוה מבין 405,900 לבין תקרת הפיצויים × שנות העבודה (9(7א)(ז1))
{
    const A = await import(B + '/analysis.js');
    const r1 = A.insights161({ workYears: '30', salaryInsured: '20,000', grants: [{ code: '5', amount: '500,000' }] });
    ok(r1.contCap === 600000 && r1.contCapBasis === 'severance-ceiling' && r1.mustFillPartB === false, 'm066-alternative-b-higher-no-part-b', JSON.stringify([r1.contCap, r1.mustFillPartB]));
    const r2 = A.insights161({ workYears: '10', salaryInsured: '20,000', grants: [{ code: '5', amount: '500,000' }] });
    ok(r2.contCap === 405900 && r2.contCapBasis === 'fixed' && r2.mustFillPartB === true, 'm066-alternative-a-higher-part-b');
    const r3 = A.insights161({ workYears: '30', salaryInsured: '60,000', grants: [{ code: '5', amount: '1,300,000' }] });
    ok(r3.contCapAlt === 45600 * 30 && r3.mustFillPartB === false, 'm066-severance-ceiling-capped-45600');
    const r4 = A.insights161({ workYears: '30', grants: [{ code: '5', amount: '500,000' }] });
    ok(r4.contCap === 405900 && r4.contCapAlt === null && r4.notes.some(n => n.includes('לא חושבה')), 'm066-missing-insured-salary-flagged');
    ok(r1.notes.some(n => n.includes('405,900') && n.includes('600,000') && n.includes('חלופה ב')), 'm066-note-shows-both-alternatives');
    const r5 = A.insights161({ workYears: '30', salaryInsured: '20,000', grants: [{ code: '1', amount: '1,000' }, { code: '5', amount: '100,000' }] });
    ok(r5.mustFillPartB === true, 'm066-direct-employer-grant-still-part-b');
}
console.log(`critical-fixes: PASS=${pass} FAIL=${fail}`);
process.exit(fail ? 1 : 0);
