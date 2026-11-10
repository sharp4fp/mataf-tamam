import { m, P, G, chk } from './common.mjs';
const men = Object.values(P).find(r => r.name === 'מנורה מבטחים פנסיה - מסלול מניות');
const accounts = [
  { account: '100001', plan: 'מנורה', kind: 'pensia', tracks: [{ name: men.name, balance: 420000, code: String(men.parentId) + String(men.fundId).padStart(7,'0') }] },
  { account: '100002', plan: 'הפניקס', kind: 'hishtalmut', tracks: [{ name: 'הפניקס השתלמות מניות', balance: 180000, code: '5130264840000968' .slice(0,9)+'0000968' }] },
  { account: '100003', plan: 'מגדלור', kind: 'menahalim', tracks: [{ name: 'כללי', balance: 95000 }] },
];
const v = m.analyzePortfolio({ accounts });
console.log(v.holdings.map(h => `${h.track.name} eq=${h.equityPct} id=${h.match && h.match.officialId}`));
const inc = m.includedHoldingsOf(v.holdings, {}, {});
const est = v.holdings.filter(h => h.equityPct === null && h.estimate);
const whole = { totalValue: v.totalValue, frozenKnown: v.holdings.filter(h => h.equityPct !== null && !inc.some(x => x.h === h)).map(h => ({ bal: h.track.balance, eq: h.equityPct })), estFrozen: est.map(h => ({ bal: h.track.balance, eq: h.estimate.eq, lo: h.estimate.lo, hi: h.estimate.hi })), noBasisVal: 0, unknownAssumption: null };
// independent hand ledger from raw tables
const fnxPool = Object.values(G).filter(r => r.parentId === 513026484 && r.cls === 'קרנות השתלמות' && r.eq !== null && !/בניהול אישי|הלכה|שריעה/.test(r.name));
const loF = Math.min(...fnxPool.map(r => r.eq)), hiF = Math.max(...fnxPool.map(r => r.eq));
const menPool = Object.values(P).filter(r => r.parentCo === men.parentCo && r.parentId === men.parentId && r.eq !== null && !/קצבה/.test(r.name));
console.log('menora raw rows', menPool.map(r => r.fundId + ':' + r.eq + ':' + r.name));
const mig = est[0].estimate.eq;
const lo = (420000 * Math.min(...menPool.map(r => r.eq)) + 180000 * loF + 95000 * mig) / 695000;
const hi = (420000 * Math.max(...menPool.map(r => r.eq)) + 180000 * hiF + 95000 * mig) / 695000;
console.log('HAND range', lo.toFixed(2), hi.toFixed(2));
const plan = m.solveTargetPlan(inc, new Set(inc.map(x => x.key)), 77, 43, whole, 'any');
console.log('SOLVER', plan.status, plan.loAll.toFixed(2), plan.hiAll.toFixed(2), 'ach', plan.achievedWholeEst, 'gap', plan.gap);
chk('solver range == hand ledger', Math.abs(plan.loAll - lo) < 0.01 && Math.abs(plan.hiAll - hi) < 0.01);
// weighted ledger of proposals
let tot = 95000 * mig; for (const p of plan.per) { const pr = p.proposal; const a = pr.type === 'mix' ? pr.wHigh * pr.high.eq + pr.wLow * pr.low.eq : pr.type === 'stay' ? p.curEq : pr.track.eq; console.log(p.h.track.name, pr.type, a.toFixed(3), 'bal', p.bal); tot += a * p.bal; }
chk('weighted ledger of proposals == T=77', Math.abs(tot / 695000 - 77) < 0.01, (tot / 695000).toFixed(3));
for (const T of [51.3, 60, 77.13, 77.2]) { const q = m.solveTargetPlan(inc, new Set(inc.map(x => x.key)), T, 43, whole, 'foreign'); console.log('T', T, q.status, q.gap); }
// plan with one holding unselected
const q2 = m.solveTargetPlan(inc, new Set([inc[0].key]), 70, 43, whole, 'any'); console.log('only menora selected', q2.status, q2.loAll.toFixed(2), q2.hiAll.toFixed(2));
