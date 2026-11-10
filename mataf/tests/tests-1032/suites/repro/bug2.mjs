import { m, P, chk } from './common.mjs';
const h = { key:'k', bal:100, eq:20, kind:'pensia', matched:{ officialId:2105, row:P[2105] } }; // synthetic cur=20, pool 58.4-71.52
const r = m.solveTargetPlan([h], new Set(['k']), 40, 45, { totalValue:100, estFrozen:[], noBasisVal:0, unknownAssumption:null }, 'any');
console.log(r.status, 'achieved', r.achievedWholeEst, 'gap', r.gap);
chk('T=40 unreachable (cur=20 or pool>=58.4) should not be ok with gap 0', !(r.status==='ok' && Math.abs(r.gap)>1));
