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
console.log(`critical-fixes: PASS=${pass} FAIL=${fail}`);
process.exit(fail ? 1 : 0);
