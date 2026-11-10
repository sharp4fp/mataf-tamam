import { m, G, tr, acct, whole, key, chk } from './common.mjs';
const fnx = Object.entries(G).filter(([k,r]) => r.parentId===513026484 && r.cls==='קרנות השתלמות');
console.log('fnx rows', fnx.map(([k,r])=>k+':'+r.eq+':'+r.name+' pop='+r.pop).join('\n'));
const mn = fnx.find(([k,r])=>r.name==='הפניקס השתלמות מניות')[0];
const v = m.analyzePortfolio({ accounts: [acct('H1','hishtalmut',[tr(+mn,100000,G)]), acct('H2','hishtalmut',[tr(+fnx.find(([k,r])=>/כללי/.test(r.name))?.[0] ?? +mn,100000,G)])] });
console.log(v.holdings.map(h=>h.track.name+' eq='+h.equityPct+' id='+h.match.officialId));
const inc = m.includedHoldingsOf(v.holdings, {}, {});
for (const T of [30, 50, 70, 99]) for (const g of ['any','foreign','local']) {
  const p = m.solveTargetPlan(inc, new Set([inc[0].key]), T, 43, whole(v), g);
  const pr = p.per?.[0]?.proposal;
  console.log('T',T,g,p.status, pr&&pr.type, pr&&pr.achieved, 'whole', p.achievedWholeEst, 'gap', p.gap, 'lo',p.loAll,'hi',p.hiAll);
  if (p.status==='ok') chk(`gemel T=${T} ${g} gap~0`, Math.abs(p.gap)<0.01 || (pr&&pr.cappedAt), 'gap '+p.gap);
}
// pension-only takanon mixing must not leak to unverified gemel parent
const other = Object.entries(G).find(([k,r])=>r.cls==='קרנות השתלמות' && r.parentId!==513026484 && r.eq!==null);
const c = m.fundMixContext({officialId:+other[0]}, 43, 'hishtalmut');
chk('unverified gemel fund is not mixVerified', c.ok && c.mixVerified===false, other[1].name);
const c2 = m.fundMixContext({officialId:+mn}, 43, 'tagmulim');
chk('hishtalmut row under kind=tagmulim rejected', c2.ok===false, c2.reason);
const geo = fnx.map(([k,r])=>r.name+' -> '+m.equityGeoOf(r.name).cls); console.log(geo.join('\n'));
