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

// תבניות בנקים נוספים (לפי דוגמאות מושחרות שפורסמו; ערכים סינתטיים)
const L = (rows, head) => { let yy = 700; const out = head.map((t, k) => ({ page: 1, x: 400, y: 790 - k * 8, str: t })); for (const r of rows) { yy -= 20; r.forEach(([x, str]) => out.push({ page: 1, x, y: yy, str })); } return out; };
// לאומי: סוג פעילות | נכון לתאריך | יתרה בש"ח
const le = A.parseBalanceItems(L([[[500, 'עובר ושב'], [300, '22/07/12'], [150, '1,804.46']], [[500, 'פקדונות וחסכונות'], [300, '22/07/12'], [150, '4,303.92']], [[500, 'כרטיסי אשראי'], [300, '22/07/12'], [150, '-3,299.90']], [[500, 'סה"כ:'], [150, '1,714.23']]], ['בנק לאומי - ריכוז יתרות']));
ok(le.bank === 'בנק לאומי' && le.rows.map(r => r.key + '=' + r.amount).join() === 'cashIls=1804.46,deposits=4303.92,credit=-3299.9', 'leumi-layout', JSON.stringify(le.rows.map(r => [r.key, r.amount])));
// לאומי (תבנית ישנה): ניירות ערך, חשבון עו"ש, מסגרות אשראי (לא יתרה!), פקדונות שקליים
const le2 = A.parseBalanceItems(L([[[500, 'ניירות ערך'], [200, '23,947.00']], [[500, 'חשבון עו"ש'], [200, '1,092.04']], [[500, 'מסגרות אשראי'], [200, '10,000.00']], [[500, 'פקדונות שקליים'], [200, '2,506.41']]], ['leumi', 'ריכוז יתרות']));
ok(le2.rows.length === 3 && !le2.rows.some(r => r.amount === 10000) && le2.rows.find(r => r.key === 'sec').eq === null, 'credit-line-is-not-a-balance', JSON.stringify(le2.rows.map(r => [r.key, r.amount])));
// דיסקונט - ריכוז תיק השקעות: מרכיב % | שווי בש"ח | תווית -> השווי הוא הימני מבין המספרים
const di = A.parseBalanceItems(L([[[520, 'פק"מ שקלי'], [300, '952.64'], [200, '.23']], [[520, 'מניות'], [300, '120,000.00'], [200, '29.00']], [[520, 'אג"ח'], [300, '80,000.00'], [200, '19.00']], [[520, 'קופות גמל'], [300, '408,836.14'], [200, '99.77']], [[520, 'סה"כ ניירות ערך'], [300, '200,000.00']]], ['דיסקונט', 'ריכוז תיק השקעות']));
ok(di.bank === 'בנק דיסקונט' && di.rows.map(r => r.key + '=' + r.amount).join() === 'deposit=952.64,stocks=120000,bonds=80000,pensionDup=408836.14', 'discount-investment-layout (value not percent)', JSON.stringify(di.rows.map(r => [r.key, r.amount])));
ok(di.rows.find(r => r.key === 'stocks').eq === 100 && di.rows.find(r => r.key === 'bonds').eq === 0, 'stocks-100-bonds-0');
// מזרחי: יתרות ליום קודם | יתרות מעודכנות -> המעודכנות (ימנית); מסגרת אשראי מדולגת
const mz = A.parseBalanceItems(L([[[520, 'יתרה + ניכוי להיום:'], [330, '-590.41'], [230, '-590.41']], [[520, 'מסגרת אשראי:'], [330, '4,500.00'], [230, 'הריבה']], [[520, 'תיק ני"ע (סחירים):'], [330, '268.56'], [230, '267.90']]], ['מזרחי טפחות', 'ריכוז יתרות']));
ok(mz.rows.map(r => r.key + '=' + r.amount).join() === 'cashIls=-590.41,sec=268.56', 'mizrahi-layout-updated-column', JSON.stringify(mz.rows.map(r => [r.key, r.amount])));
// מרכנתיל: "1. עו"ש (ערבות פלת"ש)" ממוספר
const me = A.parseBalanceItems(L([[[520, '1. עו"ש'], [250, '1,571.29']], [[520, '1. פיקדונות שקליים (מכל הסוגים)'], [250, '0.00']]], ['מרכנתיל', 'ריכוז יתרות לתאריך 30/11/2017']));
ok(me.bank === 'מרכנתיל' && me.date === '30/11/2017' && me.rows.length === 1 && me.rows[0].amount === 1571.29 && me.zeros === 1, 'mercantile-numbered-rows', JSON.stringify(me));
// אוצר החייל (הבינלאומי): מהות | הערות | סכום | שווי -> שווי (שמאלי)
const oz = A.parseBalanceItems(L([[[520, 'עו"ש קרדיטורי'], [300, '5,000.00'], [150, '5,000.00']], [[520, 'הלוואה שקלית באינטרנט (פריים) עד 4'], [300, '30,000.00'], [150, '-21,500.00']]], ['אוצר החייל', 'הודעת ריכוז יתרות רבעוני']));
ok(oz.bank === 'אוצר החייל' && oz.rows.map(r => r.amount).join() === '5000,-21500', 'otzar-hahayal-value-column', JSON.stringify(oz.rows.map(r => [r.key, r.amount])));
// חישוב: פנסיה 1,000,000 ב-70% מניות; בנק: עו"ש 28,973.98, פיקדון 100,000, קרנות 50,000 (כללי 35-60), ני"ע 200,000 (מנייתי 80-100)
const banks = [{ bank: p.bank, rows: p.rows.map(r => ({ ...r, include: true, eqRange: r.key === 'funds' ? 'g' : r.key === 'sec' ? 'm' : '' })) }];
const r1 = A.computeTotal({ banks, q: {}, pension: { value: 1000000, eqLo: 70, eqHi: 70 } });
// lo = (700,000 + 50,000×35% + 200,000×80%) / 1,378,973.98 = 877,500 / 1,378,973.98 = 63.6%; hi = (700,000 + 30,000 + 200,000) / ... = 67.4%
ok(near(r1.equity.lo, 63.6) && near(r1.equity.hi, 67.4), 'true-equity-range-over-all-financial-assets', JSON.stringify(r1.equity));
ok(r1.pensionEquity.lo === 70, 'pension-alone-shown-for-comparison');
ok(near(r1.totals.debtsLo, 86175.31, 0.01), 'bank-credit-counted-as-debt', String(r1.totals.debtsLo));

// שאלון (7 נושאים): תיק בישראל 300-600 אלף מנייתי עם דמי ניהול 1-1.5%; דירה 2-5 מיליון (במאזן בלבד);
// נדל"ן מניב 1-2 מיליון עם שכירות 5-10 אלף; מניות ממקום העבודה 150-300 אלף; VC/PE 150-300 אלף + Capital Calls עד 50 אלף
const q = { il: 'd', ilEq: 'm', ilFee: 'f3', home: 'g', homeDebt: 'c', reIl: 'f', reIlRent: 'r2', emp: 'c', alt: 'c', altCalls: 'a', need: 'c', tol: 'sell', income: 'pension', debts: 'b', lev: 'b', bizPlan: 'exit', biz: 'd' };
const r2 = A.computeTotal({ banks, q, pension: { value: 1000000, eqLo: 70, eqHi: 70 } });
ok(r2.items.some(i => i.group === 'il' && i.lo === 300000 && i.hi === 600000 && i.eqLo === 80 && i.fee.lo === 1), 'securities-range-equity-and-fee');
ok(r2.totals.home && r2.totals.home.lo === 2000000 && !r2.items.some(i => i.group === 'home'), 'home-in-balance-sheet-not-in-risk (owner decision)');
const finMid = 1378973.98 + 450000 + 225000;
ok(near(r2.equity.lo, (877500 + 450000 * 0.8 + 225000) / finMid * 100), 'employer-stock-is-100pct-equity; range-midpoints', JSON.stringify(r2.equity));
ok(r2.items.find(i => i.group === 'reIl').kind === 'risk' && r2.items.find(i => i.group === 'alt').liquid === false, 'real-estate-and-alternatives-risk-not-liquid');
ok(r2.feeCost.lo === 3000 && r2.feeCost.hi === 9000, 'annual-fee-cost-range', JSON.stringify(r2.feeCost));
ok(r2.rentYear.lo === 60000 && r2.rentYear.hi === 120000, 'rent-income-per-year', JSON.stringify(r2.rentYear));
ok(r2.need.lo === 150001 && r2.need.hi === 350000, 'capital-calls-added-to-liquidity-need', JSON.stringify(r2.need));
ok(near(r2.totals.debtsLo, 86175.31 + 150000 + 50000, 0.01), 'debts-include-mortgage-leverage-and-bank-credit', String(r2.totals.debtsLo));
ok(r2.leveragePct > 0 && r2.notes.some(n => /Margin/.test(n)) && r2.notes.some(n => /אקזיט/.test(n)) && r2.notes.some(n => /סיכון כפול/.test(n)), 'leverage-exit-employer-notes');
ok(r2.verdict === 'above' && r2.tolerance[1] === 30, 'tolerance-sell-on-20pct-drop -> above', r2.verdict);
ok(/קצבה/.test(r2.capacityNote), 'capacity-note-for-pensioner');
ok(r2.concentration.includes('נדל"ן מניב בישראל'), 'concentration-over-25pct-flagged', r2.concentration.join());
const r3 = A.computeTotal({ banks: [], q: { abroad: 'b', abroadEq: 'u' } });
ok(r3.equity.lo === 0 && r3.equity.hi === 100 && r3.fxPct === 100, 'unknown-equity-is-0-100-and-abroad-is-fx');
ok(A.computeTotal({ banks: [], q: {} }).equity.lo === null, 'empty-input-no-fake-number');
ok(A.SECTIONS.length === 7 && A.SECTIONS.reduce((n, s) => n + s.rows.length, 0) <= 16 && !A.SECTIONS.some(s => s.rows.some(r => r.id === 'struct')) && A.SECTIONS.find(s => s.title === 'התחייבויות').rows.length === 1 && !A.SECTIONS.some(s => s.rows.some(r => r.id === 'pen')), 'questionnaire-7-sections-16-rows; no holding-structure question (13:18); liabilities one row (12:38); pension only from maslaka (12:36)');
ok(A.AMOUNT_RANGES.some(r => r.id === 'j') && A.FEE_RANGES.length === 5 && A.RENT_RANGES.length === 6, 'ranges-cover-high-net-worth-fees-and-rent');
console.log(`assets: PASS=${pass} FAIL=${fail}`);
process.exit(fail ? 1 : 0);
