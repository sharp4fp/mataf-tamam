// test-f161-bind.mjs - כיסוי רגרסיה לקישור גאומטרי של שדות 161 (ממצאי סקירה: A13, A6, A1, A4)
// שימוש: BUILD=<path-to-js-dir> node test-f161-bind.mjs
global.window = {};
const { fieldsFromItems } = await import(process.env.BUILD + '/pdf161.js');
let pass = 0, fail = 0;
const ok = (cond, name) => { if (cond) { pass++; console.log('PASS ' + name); } else { fail++; console.log('FAIL ' + name); } };

// A13: שורת הסכום המרבי - 5 ערכים בדיוק נקשרים, פחות/יותר -> הכל ריק
const mk13 = (vals) => [{ page: 1, x: 500, y: 300, str: 'הסכום המרבי' }, ...vals.map((v, i) => ({ page: 1, x: 450 - i * 80, y: 300, str: v }))];
const full13 = fieldsFromItems(mk13(['100,000', '60,000', '30,000', '13,750', '10,000'])).fields;
ok(full13.totalGrant === '100,000' && full13.maxKtseva === '60,000' && full13.maxPitzuim === '30,000' && full13.maxExempt === '13,750' && full13.taxableGrant === '10,000', 'a13-full-5-bound-in-order');
const short13 = fieldsFromItems(mk13(['100,000', '60,000', '13,750', '10,000'])).fields;
ok(short13.totalGrant === '' && short13.maxKtseva === '' && short13.maxPitzuim === '' && short13.maxExempt === '' && short13.taxableGrant === '', 'a13-missing-cell-all-blank-no-guess');
const long13 = fieldsFromItems(mk13(['100,000', '60,000', '30,000', '13,750', '10,000', '9,999'])).fields;
ok(long13.totalGrant === '' && long13.maxExempt === '', 'a13-extra-cell-all-blank-no-guess');

// A6: משכורות - תא ריק אינו שואב ערך שכן; ערך יחיד נקשר רק לעמודתו
const lab6 = [{ x: 500, s: 'משכורת חודשית אחרונה' }, { x: 350, s: 'משכורת מבוטחת אחרונה' }, { x: 200, s: 'משכורת חבות פיצויים' }];
const run6 = (vals) => { const it = lab6.map(l => ({ page: 1, x: l.x, y: 400, str: l.s })).concat(vals.map(v => ({ page: 1, x: v.x, y: 380, str: v.s }))); return fieldsFromItems(it).fields; };
const all3 = run6([{ x: 500, s: '20,000' }, { x: 350, s: '18,000' }, { x: 200, s: '19,000' }]);
ok(all3.salaryFull === '20,000' && all3.salaryInsured === '18,000' && all3.salarySeverance === '19,000', 'a6-all-three-bound');
const insBlank = run6([{ x: 500, s: '20,000' }, { x: 200, s: '19,000' }]);
ok(insBlank.salaryFull === '20,000' && insBlank.salaryInsured === '' && insBlank.salarySeverance === '19,000', 'a6-blank-cell-stays-blank');
const only1 = run6([{ x: 500, s: '20,000' }]);
ok(only1.salaryFull === '20,000' && only1.salaryInsured === '' && only1.salarySeverance === '', 'a6-single-value-own-column-only');

// A1: זהות - ערך תחת הכיתוב הנכון בלבד
const lab1 = [{ x: 500, s: 'מספר זהות' }, { x: 380, s: 'שם פרטי' }, { x: 260, s: 'שם משפחה' }, { x: 140, s: 'תאריך לידה' }];
const a1 = fieldsFromItems(lab1.map(l => ({ page: 1, x: l.x, y: 200, str: l.s })).concat([{ page: 1, x: 500, y: 180, str: '123456782' }, { page: 1, x: 380, y: 180, str: 'ישראל' }, { page: 1, x: 260, y: 180, str: 'ישראלי' }, { page: 1, x: 140, y: 180, str: '01/02/1980' }])).fields;
ok(a1.idNumber === '123456782' && a1.fullName === 'ישראל ישראלי' && a1.birthDate === '01/02/1980', 'a1-all-bound-under-own-captions');
const a1gap = fieldsFromItems(lab1.map(l => ({ page: 1, x: l.x, y: 200, str: l.s })).concat([{ page: 1, x: 500, y: 180, str: '123456782' }, { page: 1, x: 260, y: 180, str: 'ישראלי' }])).fields;
ok(a1gap.idNumber === '123456782' && a1gap.fullName === 'ישראלי' && a1gap.birthDate === '', 'a1-missing-cells-not-pulled-from-neighbours');

// A4: תקופת עבודה - תאריך פרישה ריק נשאר ריק
const lab4 = [{ x: 500, s: 'תאריך התחלת העבודה' }, { x: 350, s: 'תאריך הפרישה' }, { x: 200, s: 'תקופת העבודה' }];
const a4 = fieldsFromItems(lab4.map(l => ({ page: 1, x: l.x, y: 250, str: l.s })).concat([{ page: 1, x: 500, y: 230, str: '01/01/2000' }, { page: 1, x: 200, y: 230, str: '25.6' }])).fields;
ok(a4.startWork === '01/01/2000' && a4.retireDate === '' && a4.workYears === '25.6', 'a4-blank-retire-date-stays-blank');

console.log(`f161-bind: PASS=${pass} FAIL=${fail}`);
process.exit(fail ? 1 : 0);
