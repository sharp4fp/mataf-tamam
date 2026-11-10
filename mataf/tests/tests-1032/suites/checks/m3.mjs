import { m, P, G, tr, acct, whole, chk } from './common.mjs';
const J = window.JOINABILITY, AGE = /לבני\s*\d|מותאם גיל|תלוי גיל/, age = 45;
const mk = (parent, co) => Object.values(P).filter(r => r.parentId===parent && r.parentCo===co && r.eq!==null && !/קצבה/.test(r.name))
  .filter(r => { const j = J[r.fundId]; if (!j || j.s==='closed') return false; if (AGE.test(r.name) && !m.MIX_TAKANON[co]?.ageElection) return false; if (j.s==='age' && !((j.ageMin==null||age>=j.ageMin)&&(j.ageMax==null||age<=j.ageMax))) return false; return true; });
const spec = [[2142,100000],[9647,200000],[2187,150000]];
const accts = spec.map(([id,b],i)=>acct('P'+i,'pensia',[tr(id,b)])).concat([acct('H','hishtalmut',[tr(968,120000,G)]), acct('U','menahalim',[{name:'כללי',balance:50000}])]);
const v = m.analyzePortfolio({ accounts: accts }); const inc = m.includedHoldingsOf(v.holdings,{},{});
let lo = 0, hi = 0;
for (const x of inc) { const row = x.kind==='pensia' ? P[x.h.match.officialId] : G[x.h.match.officialId];
  let pool; if (x.kind==='pensia') pool = mk(row.parentId,row.parentCo); else pool = Object.values(G).filter(r=>r.parentId===row.parentId&&r.cls===row.cls&&r.eq!==null&&!/בניהול אישי|הלכה|שריעה/.test(r.name)&&(!r.pop||/כלל האוכלוסיה/.test(r.pop)));
  const eqs = pool.map(r=>r.eq).concat([x.eq]); lo += x.bal*Math.min(...eqs); hi += x.bal*Math.max(...eqs); console.log(x.h.track.name, 'pool', pool.length, Math.min(...eqs), Math.max(...eqs)); }
const est = v.holdings.find(h=>h.equityPct===null).estimate.eq*50000; lo += est; hi += est;
const p = m.solveTargetPlan(inc, new Set(inc.map(x=>x.key)), 60, age, { ...whole(v), frozenKnown: [] }, 'any');
console.log('HAND', (lo/v.totalValue).toFixed(3), (hi/v.totalValue).toFixed(3), 'SOLVER', p.loAll.toFixed(3), p.hiAll.toFixed(3));
chk('solver range == independent gated hand range (clientAge 45)', Math.abs(lo/v.totalValue-p.loAll)<1e-6 && Math.abs(hi/v.totalValue-p.hiAll)<1e-6);
