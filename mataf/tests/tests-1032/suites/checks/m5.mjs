// Randomized realistic-portfolio invariants on real analysis.js. Seeded; prints first failures with minimal repro.
import { m, P, G, tr, acct, chk } from './common.mjs';
let seed = +(process.env.SEED||12345); const rnd = () => (seed = (seed*1664525+1013904223)>>>0)/2**32; const pick = a => a[Math.floor(rnd()*a.length)];
const pIds = Object.keys(P).filter(i=>P[i].eq!==null && !/קצבה/.test(P[i].name)), gIds = Object.keys(G).filter(i=>G[i].eq!==null);
const genericNames = ['כללי','מניות','מסלול כללי','לא ידוע','אג"ח','<b>x</b>&"\'', 'S&P 500 מדד','קרן כספית'];
const kinds = ['pensia','gemel','hishtalmut','menahalim'];
let bad = 0, N = +(process.env.N||3000), stats = {ok:0,infeasible:0,underdetermined:0,none_selected:0,empty:0,other:0,crash:0};
const fail = (msg, c) => { if (bad++ < 8) console.log('FAIL', msg, JSON.stringify(c).slice(0,600)); };
for (let it=0; it<N; it++) {
  const nA = 1+Math.floor(rnd()*5), accts = [];
  for (let a=0;a<nA;a++) { const kind = pick(kinds), nt = 1+Math.floor(rnd()*3), tracks=[];
    for (let t=0;t<nt;t++) { const r = rnd(); let bal = pick([0, 1, 500, 12345, 99999, 250000, 1.2e6, 8e6]); if (rnd()<.85) bal = Math.abs(bal)||pick([5000,50000,300000]);
      if (kind==='pensia' && r<.6) tracks.push(tr(+pick(pIds),bal)); else if (kind!=='pensia' && kind!=='menahalim' && r<.6) tracks.push(tr(+pick(gIds),bal,G));
      else if (r<.8 && kind==='pensia') tracks.push({ name: P[pick(pIds)].name, balance: bal }); // name only
      else tracks.push({ name: pick(genericNames), balance: bal }); }
    accts.push(acct('ACC'+a, kind, tracks)); }
  const c = { accts };
  let v; try { v = m.analyzePortfolio({ accounts: accts }); } catch(e) { stats.crash++; fail('analyze crash '+e.message, c); continue; }
  if (!isFinite(v.totalValue)) { fail('totalValue not finite', {tv:v.totalValue}); }
  const keys = v.holdings.map(h=>m.trackKeyOf(h.account.account,h.track));
  const excluded = {}, confirmed = {}, elig = new Set();
  v.holdings.forEach((h,i)=>{ if (rnd()<.1) excluded[keys[i]]=true; if (rnd()<.8) confirmed[keys[i]] = 'name:'+h.track.name; if (rnd()<.85) elig.add(keys[i]); });
  const inc = m.includedHoldingsOf(v.holdings, confirmed, excluded), incK = new Set(inc.map(x=>x.key));
  const un = v.holdings.filter(h=>h.equityPct===null);
  const W = { totalValue: v.totalValue, estFrozen: un.filter(h=>h.estimate).map(h=>({bal:h.track.balance,eq:h.estimate.eq,lo:h.estimate.lo,hi:h.estimate.hi})), noBasisVal: un.filter(h=>!h.estimate).reduce((s,h)=>s+h.track.balance,0),
    frozenKnown: v.holdings.filter((h,i)=>h.equityPct!==null && !incK.has(keys[i])).map(h=>({bal:h.track.balance,eq:h.equityPct})), unknownAssumption: pick([null,null,0,50,100]) };
  // partition check
  const incBal = inc.reduce((s,x)=>s+x.bal,0), fk = W.frozenKnown.reduce((s,x)=>s+x.bal,0), es = W.estFrozen.reduce((s,x)=>s+x.bal,0);
  if (Math.abs(incBal+fk+es+W.noBasisVal - v.totalValue) > 1e-6*Math.max(1,v.totalValue)) fail('partition', {incBal,fk,es,nb:W.noBasisVal,tv:v.totalValue,c});
  let T = Math.round(rnd()*1000)/10, geo = pick(['any','local','foreign']);
  const age = pick([null,30,45,58,64]), selS = new Set([...elig].filter(k=>incK.has(k))); let T2 = T;
  try { const q = m.solveTargetPlan(inc, selS, T, age, W, geo); if (q.loAll!=null && q.hiAll!=null && isFinite(q.loAll) && rnd()<.9) T2 = Math.round((q.loAll + rnd()*(q.hiAll-q.loAll))*10)/10; } catch(e) {}
  let p; try { p = m.solveTargetPlan(inc, selS, T2, age, W, geo); } catch(e) { stats.crash++; fail('solve crash '+e.message+' T='+T, c); continue; }
  T = T2; stats[p.status] = (stats[p.status]||0)+1;
  if (p.status==='ok') {
    // recompute from proposals
    let sel = 0, freeSel = 0;
    for (const x of p.per) { const pr = x.proposal; let ach = x.curEq;
      if (pr && pr.type==='single') ach = pr.track.eq; else if (pr && pr.type==='mix') { if (Math.abs(pr.wHigh+pr.wLow-1)>1e-9 || pr.wHigh<-1e-12 || pr.wLow<-1e-12) fail('mix weights', {pr:{wHigh:pr.wHigh,wLow:pr.wLow}}); ach = pr.wHigh*pr.high.eq+pr.wLow*pr.low.eq; }
      else if (pr && pr.type==='stay' && pr.cappedAt!=null) ach = x.curEq;
      sel += x.bal*ach; if (!isFinite(ach)) fail('ach NaN', c); }
    const sk = new Set(p.per.map(x=>x.key)); const frozenIncl = inc.filter(x=>!sk.has(x.key)).reduce((s,x)=>s+x.bal*x.eq,0);
    const whole = (sel + frozenIncl + W.frozenKnown.reduce((s,x)=>s+x.bal*x.eq,0) + W.estFrozen.reduce((s,x)=>s+x.bal*x.eq,0) + (W.unknownAssumption!=null?W.noBasisVal*W.unknownAssumption:0))/v.totalValue;
    if (Math.abs(whole - T) > 0.05 && !p.per.some(x=>x.proposal&&x.proposal.cappedAt!=null)) fail('ok but whole!=T', {T, whole, claimed:p.achievedWholeEst, geo, c});
    if (Math.abs(p.achievedWholeEst - whole) > 1e-6 && !p.per.some(x=>x.proposal&&x.proposal.cappedAt!=null)) fail('claimed!=recomputed', {T, whole, claimed:p.achievedWholeEst, c});
  }
  if (p.status==='infeasible' && p.loAll!=null && T>=p.loAll+1e-6 && T<=p.hiAll-1e-6) fail('infeasible inside own range', {T,lo:p.loAll,hi:p.hiAll,c});
}
console.log('stats', JSON.stringify(stats), 'bad', bad);
chk('fuzz '+N+' realistic portfolios, no invariant violation/crash', bad===0 && stats.crash===0);
