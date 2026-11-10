// test-movement.mjs - תנועת יעד אמיתית: לא רק 77 ליד נוכחי 77.1. provenance: דרישה שהתקבלה 09/11/2026 20:51.
// שתי החזקות פנסיה זכאיות עם חשיפות רשמיות רחוקות (30.86 / 73.81), קפואה קטנה - טווח כולל רחב.
const B = process.env.BUILD || new URL('../js/', import.meta.url).pathname;
global.window = {};
await import(B + '/joinable-extra.js');
const m = await import(B + '/analysis.js');
const { OFFICIAL_PENSION: P } = await import(B + '/official.js');
let pass = 0, fail = 0;
const chk = (l, c, x = '') => { console.log((c ? 'PASS ' : 'FAIL ') + l + (x ? ' :: ' + x : '')); c ? pass++ : fail++; };
const tr = (id, bal) => ({ name: P[id].name, code: String(P[id].parentId) + String(id).padStart(7, '0'), balance: bal });
// 2105=73.81, 2142=30.86 (כפי שאומת ב-p1); 8803 קפואה-מוכרת
const v = m.analyzePortfolio({ accounts: [
    { account: 'M1', kind: 'pensia', plan: 'x', yatzran: 'y', tracks: [tr(2105, 100000)] },
    { account: 'M2', kind: 'pensia', plan: 'x', yatzran: 'y', tracks: [tr(2142, 100000)] },
    { account: 'M3', kind: 'pensia', plan: 'x', yatzran: 'y', tracks: [tr(8803, 10000)] },
] });
const keyOf = h => m.trackKeyOf(h.account.account, h.track);
const inc = m.includedHoldingsOf(v.holdings, {}, {});
chk('all three official-identified and included', inc.length === 3);
const sel = new Set([keyOf(v.holdings[0]), keyOf(v.holdings[1])]);
const frozenKnown = [{ bal: 10000, eq: v.holdings[2].equityPct }];
const whole = { totalValue: 210000, estFrozen: [], noBasisVal: 0, unknownAssumption: null, frozenKnown };
const probe = m.solveTargetPlan(inc, sel, 52, 43, whole, 'any');
console.log('feasible whole range', probe.loAll.toFixed(2), '-', probe.hiAll.toFixed(2), 'status', probe.status);
const lo = probe.loAll, hi = probe.hiAll, mid = (lo + hi) / 2;
const targets = [lo - 25, lo + 2, mid, hi - 2, hi + 25];
const plans = targets.map(T => ({ T, p: m.solveTargetPlan(inc, sel, T, 43, whole, 'any') }));
for (const { T, p } of plans) console.log('T=' + T.toFixed(1), 'status=' + p.status, 'achieved=' + (p.achievedWholeEst == null ? 'null' : p.achievedWholeEst.toFixed(2)), 'per=' + (p.per || []).map(x => (x.targetEq != null ? x.targetEq : x.curEq).toFixed(1)).join('/'));
const inRange = plans.filter(x => x.T >= lo && x.T <= hi), outRange = plans.filter(x => x.T < lo || x.T > hi);
// 1) יעדים בטווח: שארית מדויקת. הסולבר מחפש xStar בביסקציה (80 איטרציות, שארית reqSel ~1e-20);
// הפער היחיד האפשרי נובע מקימטום proposal.achieved מול targetEq (שילוב רציף = ~1e-9; שילוב בדיד/קיפאון גדול יותר).
// plan.gap חושף את השארית המדויקת; דיוק התצוגה 0.1% - לכן טולרנס 0.05 (חצי צעד תצוגה). provenance: הערת דיוק שהתקבלה 21:00.
chk('in-range targets achieved within displayed precision (<=0.05)', inRange.every(x => x.p.achievedWholeEst != null && Math.abs(x.p.achievedWholeEst - x.T) <= 0.05), inRange.map(x => x.T.toFixed(2) + '->' + (x.p.achievedWholeEst == null ? 'null' : x.p.achievedWholeEst.toFixed(4)) + ' gap=' + (x.p.gap == null ? 'null' : x.p.gap.toExponential(2))).join(' '));
chk('plan exposes exact residual via gap field', inRange.every(x => typeof x.p.gap === 'number' && isFinite(x.p.gap)));
// 2) יעדים מחוץ לטווח: לא מוצגים כמושגים
chk('out-of-range targets NOT presented as achieved', outRange.every(x => x.p.achievedWholeEst == null || Math.abs(x.p.achievedWholeEst - x.T) > 1.0), outRange.map(x => x.T.toFixed(1) + ':' + x.p.status).join(' '));
// 3) תנועה אמיתית: הקצאת היעד של כל החזקה זכאית נעה מהותית בין קצות הטווח
const lowP = inRange[0].p, highP = inRange[inRange.length - 1].p;
const mv = lowP.per.map((x, i) => Math.abs((x.targetEq ?? x.curEq) - (highP.per[i].targetEq ?? highP.per[i].curEq)));
chk('allocations genuinely move across range (>=5 pts per holding)', mv.every(d => d >= 5), mv.map(d => d.toFixed(1)).join('/'));
// 4) מונוטוניות: achieved לא יורד כשהיעד עולה
const ach = inRange.map(x => x.p.achievedWholeEst);
chk('achieved monotone nondecreasing with target', ach.every((a, i) => i === 0 || a >= ach[i - 1] - 1e-9), ach.map(a => a == null ? 'null' : a.toFixed(2)).join(' '));
// 5) אין NaN/undefined בשום קצה
chk('no NaN at extremes', plans.every(x => isFinite(x.p.F) && isFinite(x.p.loAll) && isFinite(x.p.hiAll)));
console.log(fail ? fail + ' FAILURES' : 'ALL PASS', '(' + pass + ' assertions)');
process.exit(fail ? 1 : 0);
