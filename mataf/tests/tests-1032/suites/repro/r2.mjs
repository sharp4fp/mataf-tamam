import { m, P, tr, acct, chk } from './common.mjs';
// two identical rows (dup) + analyze twice on same portfolio object (UI re-analyzes after load/reset paths: check callers)
const p = { accounts: [acct('A1','pensia',[tr(2105,100000), tr(2105,300000)])] };
const v1 = m.analyzePortfolio(p); const n1 = v1.holdings.map(h => h.track.name); const k1 = v1.holdings.map(h=>m.trackKeyOf('A1',h.track));
const v2 = m.analyzePortfolio(p); const n2 = v2.holdings.map(h => h.track.name); const k2 = v2.holdings.map(h=>m.trackKeyOf('A1',h.track));
console.log(n1, n2); console.log(k1, k2);
chk('names stable across re-analysis', JSON.stringify(n1) === JSON.stringify(n2));
chk('keys stable across re-analysis', JSON.stringify(k1) === JSON.stringify(k2));
