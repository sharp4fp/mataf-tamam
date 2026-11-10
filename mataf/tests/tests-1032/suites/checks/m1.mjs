// Independent exact-residual movement test. Achieved is recomputed from the PROPOSALS (components x weights), never from plan.achievedWholeEst.
import { m, P, G, tr, acct, whole, key, chk } from './common.mjs';
const J = window.JOINABILITY, AGE = /לבני\s*\d|מותאם גיל|תלוי גיל/;
const mig = Object.values(P).find(r=>r.fundId===2142), cl = P[9647], fx = P[2187], men = P[2063];
const accts = [
  acct('M','pensia',[tr(2142,100000)]), acct('C','pensia',[tr(9647,200000)]), acct('X','pensia',[tr(2187,150000)]),
  acct('H','hishtalmut',[tr(968,120000,G)]), acct('U','menahalim',[{name:'כללי',balance:50000}]),
];
const v = m.analyzePortfolio({ accounts: accts });
console.log(v.holdings.map(h=>h.track.name+' eq='+h.equityPct+' est='+(h.estimate&&h.estimate.eq)+' id='+(h.match&&h.match.officialId)));
const inc = m.includedHoldingsOf(v.holdings, {}, {});
const W = whole(v); W.frozenKnown = [];
const keys = inc.map(x=>x.key);
const subsets = [keys, keys.slice(0,1), keys.slice(1,3), [keys[3]], keys.slice(0,2).concat(keys[3])];
let worst = 0, n = 0, fails = 0;
for (const geo of ['any','foreign','local']) for (const sel of subsets) for (const assumption of [null]) {
  const W2 = { ...W, unknownAssumption: assumption };
  const p0 = m.solveTargetPlan(inc, new Set(sel), 50, 45, W2, geo);
  if (p0.status !== 'ok' && p0.status !== 'infeasible') { console.log('status', p0.status, geo, sel.length); continue; }
  const lo = p0.loAll, hi = p0.hiAll;
  for (let i = 0; i <= 20; i++) {
    const T = lo + (hi - lo) * i / 20; // attainable by construction (incl. endpoints)
    const p = m.solveTargetPlan(inc, new Set(sel), T, 45, W2, geo);
    if (p.status !== 'ok') { console.log('NOT OK at attainable T', T.toFixed(3), geo, sel.length, p.status); fails++; continue; }
    // independent ledger
    let tot = 0;
    const selSet = new Set(p.per.map(q=>q.key));
    for (const x of inc) { if (!selSet.has(x.key)) tot += x.bal * x.eq; }
    for (const e of W2.estFrozen) tot += e.bal * e.eq;
    for (const q of p.per) { const pr = q.proposal; const a = pr.type==='mix' ? pr.wHigh*pr.high.eq + pr.wLow*pr.low.eq : pr.type==='single' ? pr.track.eq : q.curEq; tot += a * q.bal; }
    const resid = tot / v.totalValue - T; worst = Math.max(worst, Math.abs(resid)); n++;
    if (Math.abs(resid) > 1e-6) { fails++; console.log('RESIDUAL', geo, sel.length, 'T', T.toFixed(4), 'ledger', (tot/v.totalValue).toFixed(4), 'resid', resid.toFixed(6)); }
    // weights valid
    for (const q of p.per) if (q.proposal.type==='mix' && !(q.proposal.wHigh>=-1e-12 && q.proposal.wHigh<=1+1e-12)) { fails++; console.log('bad weight', q.proposal.wHigh); }
  }
  // just outside range must be infeasible, never "ok"
  for (const T of [lo-0.01, hi+0.01]) { const p = m.solveTargetPlan(inc, new Set(sel), T, 45, W2, geo); if (p.status==='ok') { fails++; console.log('outside range reported ok', T); } }
}
console.log('cases', n, 'worst |residual| pp', worst);
chk('all attainable targets hit with exact residual < 1e-6 pp', fails === 0 && n > 100, 'fails '+fails+' n '+n);
