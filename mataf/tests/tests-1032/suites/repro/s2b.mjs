// s2 left unchanged (its HAND range is RAW menora rows and FAILs by design vs the gated solver). This script is the gated ledger my report described.
// Gates replicated inline from raw tables + JOINABILITY, NOT via fundMixContext: pension track needs a JOINABILITY record, not closed, age-band names need takanon ageElection (menora has none), age-restricted only inside band.
import { m, P, G, chk } from './common.mjs';
const men = Object.values(P).find(r => r.name === 'מנורה מבטחים פנסיה - מסלול מניות');
const J = window.JOINABILITY; const AGE = /לבני\s*\d|מותאם גיל|תלוי גיל/;
const menPool = Object.values(P).filter(r => r.parentId === men.parentId && r.parentCo === men.parentCo && r.eq !== null && !/קצבה/.test(r.name))
  .filter(r => { const j = J[r.fundId]; if (!j || j.s === 'closed') return false; if (AGE.test(r.name)) return false; return true; });
console.log('gated menora pool', menPool.map(r => r.fundId + ':' + r.eq));
const fnxPool = Object.values(G).filter(r => r.parentId === 513026484 && r.cls === 'קרנות השתלמות' && r.eq !== null && !/בניהול אישי|הלכה|שריעה/.test(r.name) && (!r.pop || /כלל האוכלוסיה/.test(r.pop)));
const mig = 51.42;
const lo = (420000 * Math.min(...menPool.map(r => r.eq)) + 180000 * Math.min(...fnxPool.map(r => r.eq)) + 95000 * mig) / 695000;
const hi = (420000 * Math.max(...menPool.map(r => r.eq), 73.59) + 180000 * Math.max(...fnxPool.map(r => r.eq)) + 95000 * mig) / 695000;
console.log('GATED HAND', lo.toFixed(2), hi.toFixed(2));
chk('gated hand lo == 51.29', Math.abs(lo - 51.29) < 0.005); chk('gated hand hi == 77.13', Math.abs(hi - 77.13) < 0.005);
