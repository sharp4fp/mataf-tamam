// test-assets.mjs - מחשבון "תמונת נכסים וסיכון כולל": פענוח אישור יתרות (פריטים סינתטיים במבנה "ריכוז יתרות" של בנק הפועלים)
// וחישוב אחוז המניות האמיתי. בלי נתוני לקוח.
import path from 'path';
const ROOT = path.resolve(process.env.BUILD || 'site/js');
const A = await import(path.join(ROOT, 'assets.js'));
let pass = 0, fail = 0;
const ok = (c, n, d = '') => { if (c) { pass++; console.log('PASS ' + n); } else { fail++; console.log('FAIL ' + n + (d ? ' :: ' + d : '')); } };
const near = (a, b, e = 0.05) => typeof a === 'number' && Math.abs(a - b) <= e;

// שורה בטבלה מימין לשמאל: תווית ב-x גבוה, "קרן" באמצע, "יתרה בש"ח" משמאל (x נמוך)
let y = 800;
const row = (label, bal, keren) => { y -= 20; const it = [{ page: 1, x: 500, y, str: label }, { page: 1, x: 150, y, str: bal }]; if (keren !== undefined) it.push({ page: 1, x: 300, y, str: keren }); return it; };
const items = [
    { page: 1, x: 300, y: 820, str: 'bankhapoalim.co.il' },
    { page: 1, x: 400, y: 810, str: 'ריכוז יתרות לסוף שנת 2025' },
    { page: 1, x: 400, y: 805, str: 'נכון לתאריך 31/12/2025' },
    ...row('סה"כ 28,973.98 חשבונות שוטפים', '28,973.98'),
    ...row('עו"ש שקל', '25,056.66'),
    ...row('עו"ש מט"ח', '3,917.32'),
    ...row('פקדון לזמן קצוב', '100,000.00', '99,500.00'),
    ...row('קרנות נאמנות', '50,000.00'),
    ...row('ניירות ערך סחירים', '200,000.00'),
    ...row('מט"ח פקדון', '0.00'),
    ...row('אשראי שקל שערוך', '-57,081.32', '-56,860.14'),
    ...row('ישראכרט חובה', '-29,093.99'),
];
const p = A.parseBalanceItems(items);
ok(p.bank === 'בנק הפועלים' && p.date === '31/12/2025', 'bank-and-date-detected', JSON.stringify({ b: p.bank, d: p.date }));
const by = Object.fromEntries(p.rows.map(r => [r.key + (r.amount < 0 ? '-' + Math.abs(Math.round(r.amount)) : ''), r]));
ok(p.rows.find(r => r.key === 'cashIls').amount === 25056.66 && p.rows.find(r => r.key === 'cashFx').fx === true, 'cash-ils-and-fx-rows');
ok(p.rows.find(r => r.key === 'deposit').amount === 100000, 'balance-column-not-principal (leftmost number)', String(p.rows.find(r => r.key === 'deposit').amount));
ok(p.rows.find(r => r.key === 'sec').eq === null && p.rows.find(r => r.key === 'funds').eq === null, 'securities-and-funds-need-equity-range');
ok(p.rows.filter(r => r.cat === 'liability').map(r => r.amount).join() === '-57081.32,-29093.99', 'credit-rows-are-liabilities');
ok(!p.rows.some(r => /סה"כ/.test(r.source)), 'total-lines-skipped');
const tm = A.parseBalanceItems([{ page: 1, x: 500, y: 100, str: 'ישראכרט חובה' }, { page: 1, x: 100, y: 100, str: '12,000.00-' }]);
ok(tm.rows[0] && tm.rows[0].amount === -12000, 'trailing-minus-rtl', JSON.stringify(tm.rows));
ok(p.zeros === 1 && !p.rows.some(r => r.amount === 0), 'zero-rows-counted-not-shown');
ok(p.rows.some(r => r.label === 'ישראכרט חובה'), 'credit-row-keeps-bank-label');

// חישוב: פנסיה 1,000,000 ב-70% מניות; בנק: עו"ש 28,973.98, פיקדון 100,000, קרנות 50,000 (כללי 35-60), ני"ע 200,000 (מנייתי 80-100)
const banks = [{ bank: p.bank, rows: p.rows.map(r => ({ ...r, include: true, eqRange: r.key === 'funds' ? 'g' : r.key === 'sec' ? 'm' : '' })) }];
const r1 = A.computeTotal({ banks, q: {}, pension: { value: 1000000, eqLo: 70, eqHi: 70 } });
// lo = (700,000 + 50,000×35% + 200,000×80%) / 1,378,973.98 = 877,500 / 1,378,973.98 = 63.6%; hi = (700,000 + 30,000 + 200,000) / ... = 67.4%
ok(near(r1.equity.lo, 63.6) && near(r1.equity.hi, 67.4), 'true-equity-range-over-all-financial-assets', JSON.stringify(r1.equity));
ok(r1.pensionEquity.lo === 70, 'pension-alone-shown-for-comparison');
ok(near(r1.totals.debtsLo, 86175.31, 0.01), 'bank-credit-counted-as-debt', String(r1.totals.debtsLo));

// שאלון: תיק מנוהל 300-600 אלף מנייתי; דירת מגורים 2-5 מיליון (במאזן בלבד); נדל"ן להשקעה 1-2 מיליון
const q = { q2: 'd', q2eq: 'm', q6: 'yes', q6v: 'g', q5: 'f', q10: 'c', q12: 'sell', q11: 'pension' };
const r2 = A.computeTotal({ banks, q, pension: { value: 1000000, eqLo: 70, eqHi: 70 } });
ok(r2.items.some(i => i.group === 'managed' && i.lo === 300000 && i.hi === 600000 && i.eqLo === 80), 'managed-portfolio-range-and-equity');
ok(r2.totals.home && r2.totals.home.lo === 2000000 && !r2.items.some(i => i.group === 'home'), 'home-in-balance-sheet-not-in-risk (owner decision)');
const finMid = 1378973.98 + 450000;
ok(near(r2.equity.lo, (877500 + 450000 * 0.8) / finMid * 100), 'questionnaire-uses-range-midpoints', JSON.stringify(r2.equity));
ok(r2.risky.lo > r2.equity.lo * 0 && r2.items.find(i => i.group === 're').risky, 'real-estate-counted-as-risk-asset-not-equity');
ok(r2.verdict === 'above' && r2.tolerance[1] === 30, 'tolerance-sell-on-20pct-drop -> above', r2.verdict);
ok(/קצבה/.test(r2.capacityNote), 'capacity-note-for-pensioner');
ok(r2.concentration.includes('נדל"ן להשקעה'), 'concentration-over-25pct-flagged', r2.concentration.join());
// לא יודע = 0-100%
const r3 = A.computeTotal({ banks: [], q: { q3: 'b', q3eq: 'u' } });
ok(r3.equity.lo === 0 && r3.equity.hi === 100 && r3.fxPct === 100, 'unknown-equity-is-0-100-and-abroad-is-fx');
ok(A.computeTotal({ banks: [], q: {} }).equity.lo === null, 'empty-input-no-fake-number');
console.log(`assets: PASS=${pass} FAIL=${fail}`);
process.exit(fail ? 1 : 0);
