import { m, P, G, chk } from './common.mjs';
let n=0, pos=0, lev=0, bad=0, ex=[];
for (const T of [P,G]) for (const r of Object.values(T)) { if (r.eq==null) continue; n++; const b=m.geoBoundsOf(r); if(!b) continue;
  if (b.feLo>0.05) pos++; if (r.fo>100||r.eq>100) lev++;
  if (b.feLo>b.feHi+1e-9 || b.deLo>b.deHi+1e-9) { bad++; ex.push(r.name+' eq='+r.eq+' fo='+r.fo+' fx='+r.fx); } }
console.log({rows:n, rowsWithPositiveForeignLowerBound:pos, leveragedRows:lev, inconsistentBounds:bad}); console.log(ex.slice(0,10));
chk('no row yields feLo>feHi or deLo>deHi', bad===0);
// rows where fx (currency exposure) is far below fo: foreign assets heavily hedged - hypothesis: lower bound still counted as foreign "equity"
const hedged = Object.values(P).filter(r=>r.eq!=null&&m.geoBoundsOf(r).feLo>20&&r.fx!=null&&r.fx<r.fo-30).map(r=>r.name+' eq='+r.eq+' fo='+r.fo+' fx='+r.fx+' feLo='+m.geoBoundsOf(r).feLo.toFixed(1));
console.log('pension rows w/ feLo>20 and fx<fo-30:', hedged.length, hedged.slice(0,5));
