import { m, P, chk } from './common.mjs';
const ctx = m.fundMixContext({ officialId: 2105 }, 45, 'pensia'); // Meitav
for (const g of ['any','foreign','local']) for (const x of [58.0, 65, 70.9, 71.52, 80]) {
  const pr = m.proposalForTarget(ctx, x, 45, g, 71.52);
  const gm = pr.geoMix; const s = gm ? gm.foreign+gm.local+gm.unclassified : null;
  console.log(g, x, pr.type, pr.achieved && pr.achieved.toFixed(2), gm && JSON.stringify(gm), 'unmet', pr.geoUnmet, pr.type==='stay'?('stay track '+pr.track.name+' cappedAt '+pr.cappedAt):'');
  if (gm) chk(`geoMix sums to 1 (${g},${x})`, Math.abs(s-1)<1e-9);
  if (pr.type==='stay') chk(`stay achieved == current (${g},${x})`, pr.achieved===71.52);
}
// local pref: foreign-classified current stays when current is the S&P track?
const ctx2 = m.fundMixContext({ officialId: 13260 }, 45, 'pensia'); // Meitav S&P500 (foreign by name)
const pr = m.proposalForTarget(ctx2, 65, 45, 'local', 70.31);
console.log('current foreign, pref local, x=65:', pr.type, pr.low&&pr.low.name, pr.high&&pr.high.name, 'unmet', pr.geoUnmet, pr.geoNote&&pr.geoNote.slice(0,60));
