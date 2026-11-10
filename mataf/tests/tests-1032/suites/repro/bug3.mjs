import { m, P, chk } from './common.mjs';
import fs from 'fs'; import { B } from './common.mjs';
const h = { key:'k', bal:100, eq:71.52, kind:'pensia', matched:{ officialId:2105, row:P[2105] } };
const r = m.solveTargetPlan([h], new Set(['k']), 65, 45, { totalValue:100, estFrozen:[], noBasisVal:0, unknownAssumption:null }, 'local');
const pr = r.per[0].proposal;
console.log(pr.type, 'geoNote set:', !!pr.geoNote);
const src = fs.readFileSync(B + '/report.js', 'utf8');
chk('report shows geoNote for mix too', !/pr\.geoNote && pr\.type !== 'mix'/.test(src));
