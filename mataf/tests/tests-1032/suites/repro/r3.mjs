import { m, P, chk } from './common.mjs';
// target within 0.005..0.01 of current: solver 'stay' threshold is <0.005 but proposal exact threshold is <0.01
const ctx = m.fundMixContext({ officialId: 2105 }, 45, 'pensia');
for (const x of [71.52+0.007, 71.60, 40]) {
  const pr = m.proposalForTarget(ctx, x, 45, 'any', 71.52);
  console.log(x, pr.type, pr.track && (pr.track.name+' isCurrent='+pr.track.isCurrent), pr.low && ('low '+pr.low.name+' cur='+pr.low.isCurrent), pr.high && ('high '+pr.high.name+' cur='+pr.high.isCurrent), 'achieved', pr.achieved, pr.cappedAt);
}
const pr = m.proposalForTarget(ctx, 71.527, 45, 'any', 71.52);
chk('target ~= current must not render as "full transfer to <current track>"', !(pr.type==='single' && pr.track.isCurrent));
