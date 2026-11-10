import { m, chk } from './common.mjs';
const z = m.solveTargetPlan([{ key:'k', bal:0, eq:50, kind:'pensia', matched:null }], new Set(['k']), 50, 45, { totalValue:100, estFrozen:[], noBasisVal:100, unknownAssumption:50 });
console.log(z.status, z.reqSel);
chk('reqSel finite', Number.isFinite(z.reqSel));
