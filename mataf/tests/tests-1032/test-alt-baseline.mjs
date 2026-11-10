// test-alt-baseline.mjs - רגרסיה: ללא בסיס ציון מלא למסלול הנוכחי אין חלופות מדורגות ואין יעד "אחרי" אוטומטי;
// שיעור דמי ניהול "בפועל" (בסיס לא מאומת) אינו נכנס לחישוב חיסכון שנתי.
// שימוש: BUILD=<path-to-js-dir> node test-alt-baseline.mjs
global.window = {};
const B = process.env.BUILD;
await import(B + '/exposure-extra.js'); await import(B + '/joinable-extra.js'); await import(B + '/scoring-extra.js');
const m = await import(B + '/analysis.js'); const rp = await import(B + '/report.js'); const { OFFICIAL_PENSION: P } = await import(B + '/official.js');
let pass = 0, fail = 0;
const ok = (cond, name) => { if (cond) { pass++; console.log('PASS ' + name); } else { fail++; console.log('FAIL ' + name); } };

// קרן 2004 (כלל פנסיה הלכה) - בסיס ציון חסר לפי מבני הנתונים הרשמיים
const r = P[2004];
const grp = r.cls === 'קרנות כלליות' ? 'klalit' : 'hadasha';
const acct = { account: '1', kind: 'pensia', plan: 'x', yatzran: 'y' };
const a = m.alternativesFor(acct, { officialId: r.fundId, row: { ...r }, group: grp }, 40);
ok(a.scored === false && a.baselineIncomplete === true && (!a.items || a.items.length === 0) && a.curScore === null, 'no-baseline-no-scored-items');
ok(Array.isArray(a.rankedPeers), 'no-baseline-ranked-peers-kept-comparison-only');

// before/after: אין יעד "אחרי" ואין חיסכון מומצא כשאין בסיס
const tr = { name: r.name, code: String(r.parentId) + String(2004).padStart(7, '0'), balance: 300000 };
const p1 = { clientName: 'T', client: { name: 'T', id: '' }, accounts: [{ account: '1', kind: 'pensia', plan: 'x', yatzran: 'y', tracks: [tr], totalBalance: 300000, asOf: '20260930', deposits: [], covers: [], feeContractAcc: 1.0 }] };
const v1 = m.analyzePortfolio(p1);
const bm1 = rp.buildBeforeAfterModel({ portfolio: p1, targetEq: null, eligible: {}, confirmed: {}, excluded: {}, geoPref: 'any', selections: {} }, v1);
ok(!bm1.rows.some(x => x.alt && x.altMeta && x.altMeta.curScore == null), 'beforeafter-no-auto-after-without-baseline');
ok(bm1.feeAfterYear === null && bm1.feeSavingYear === null && bm1.feeBeforeYear === null && bm1.feeBeforeFullYear === 3000, 'no-baseline-summary-after-unknown-not-zero');
const html1 = rp.renderBeforeAfter({ portfolio: p1, targetEq: null, eligible: {}, confirmed: {}, excluded: {}, geoPref: 'any', selections: {} }, v1, { name: 'x' });
ok(!/חיסכון שנתי משוער:\s*0/.test(html1) && html1.includes('אין חלופה זכאית עם שיעור שנתי ידוע'), 'no-baseline-summary-no-fabricated-zero-saving');

// בסיס מלא: מסלול עם כל ארבעת המדדים עדיין מקבל חלופות מדורגות
const JUNE = window.JUNE26 || {}, ACT = window.ACT36M || {}, SRV = window.SERVICE25 || {};
const complete = Object.values(P).find(x => x.eq != null && (x.cls === 'קרנות חדשות' || x.cls === 'קרנות כלליות') && (() => { const j = JUNE[x.fundId]; return j && j.s != null && j.y != null && ACT[j.p] && ACT[j.p].v != null && SRV[j.p] && SRV[j.p].v != null; })());
const a2 = complete && m.alternativesFor(acct, { officialId: complete.fundId, row: { ...complete }, group: complete.cls === 'קרנות כלליות' ? 'klalit' : 'hadasha' }, 40);
ok(!!complete && a2.scored === true && !a2.baselineIncomplete, 'complete-baseline-still-scored');

// שיעור "בפועל" בלבד (ללא חוזי): לא נכנס לחישוב השנתי; עם חוזי: נכנס
const mk = (feeFields) => { const t2 = { name: r.name, code: tr.code, balance: 300000 }; return { clientName: 'T', client: { name: 'T', id: '' }, accounts: [{ account: '1', kind: 'pensia', plan: 'x', yatzran: 'y', tracks: [t2], totalBalance: 300000, asOf: '20260930', deposits: [], covers: [], ...feeFields }] }; };
const pOnlyActual = mk({ feeAcc: 0.5 });
const bmA = rp.buildBeforeAfterModel({ portfolio: pOnlyActual, targetEq: null, eligible: {}, confirmed: {}, excluded: {}, geoPref: 'any', selections: {} }, m.analyzePortfolio(pOnlyActual));
ok(bmA.feeBeforeYear === null && bmA.feeAfterYear === null, 'actual-only-rate-excluded-from-annual-savings');
const pContract = mk({ feeContractAcc: 1.0, feeAcc: 0.5 });
const bmC = rp.buildBeforeAfterModel({ portfolio: pContract, targetEq: null, eligible: {}, confirmed: {}, excluded: {}, geoPref: 'any', selections: {} }, m.analyzePortfolio(pContract));
ok(bmC.feeBeforeFullYear === 3000 && bmC.feeBeforeYear === null, 'contract-rate-drives-annual-math');
// תיק מעורב: 2002 (בסיס מלא, יש חלופה) + 2004 (בסיס חסר) - לפני/אחרי/חיסכון על אותה תת-קבוצה בלבד
const r2 = P[2002];
const tr2 = { name: r2.name, code: String(r2.parentId) + String(2002).padStart(7, '0'), balance: 300000 };
const pMix = { clientName: 'T', client: { name: 'T', id: '' }, accounts: [
    { account: '1', kind: 'pensia', plan: 'x1', yatzran: 'y', tracks: [tr2], totalBalance: 300000, asOf: '20260930', deposits: [], covers: [], feeContractAcc: 1.0 },
    { account: '2', kind: 'pensia', plan: 'x2', yatzran: 'y', tracks: [tr], totalBalance: 300000, asOf: '20260930', deposits: [], covers: [], feeContractAcc: 1.0 }] };
const bmMix = rp.buildBeforeAfterModel({ portfolio: pMix, targetEq: null, eligible: {}, confirmed: {}, excluded: {}, geoPref: 'any', selections: {} }, m.analyzePortfolio(pMix));
ok(Math.abs((bmMix.feeBeforeYear - bmMix.feeAfterYear) - bmMix.feeSavingYear) < 0.01, 'mixed-summary-same-covered-subset');
ok(bmMix.feeBeforeFullYear === 6000 && bmMix.feeAfterCovered === 300000, 'mixed-full-cost-preserved-separately');
const htmlMix = rp.renderBeforeAfter({ portfolio: pMix, targetEq: null, eligible: {}, confirmed: {}, excluded: {}, geoPref: 'any', selections: {} }, m.analyzePortfolio(pMix), { name: 'x' });
ok(htmlMix.includes('כיסוי 300,000 ₪ מתוך 600,000 ₪') && htmlMix.includes('העלות השנתית הנוכחית על כל המסלולים עם שיעור ידוע: 6,000 ₪'), 'mixed-coverage-explicit-in-html');

console.log(`alt-baseline: PASS=${pass} FAIL=${fail}`);
process.exit(fail ? 1 : 0);
