// Replicates app.js wholePlanContext (frozenKnown) + report.js targetPlanSection exactly as written in the candidate.
// HISTORY: the 20:26 candidate filtered frozenKnown with 'account|track.name' while incKeys used trackKeyOf (code-based)
// -> every coded holding was double-counted (range 113-117%); this replication FAILED on that candidate.
// Updated 20:31 to mirror the corrected candidate (both sides use trackKeyOf); the expression below must stay
// byte-equivalent to app.js wholePlanContext / report.js targetPlanSection.
import { m, P, tr, acct, key, chk } from './common.mjs';
const v = m.analyzePortfolio({ accounts: [acct('A1','pensia',[tr(2105,100000)]), acct('A2','pensia',[tr(2142,100000)]), acct('A3','pensia',[tr(8803,100000)])] });
const inc = m.includedHoldingsOf(v.holdings, {}, {});            // includedHoldings() in app
const incKeys = new Set(inc.map(x => x.key));                      // app.js ~1372
const frozenKnown = v.holdings.filter(h => h.equityPct !== null && !incKeys.has(m.trackKeyOf(h.account.account, h.track))).map(h => ({ bal: h.track.balance, eq: h.equityPct })); // mirrors corrected app.js/report.js
console.log('inc keys', [...incKeys]); console.log('frozenKnown (should be empty: nothing is unconfirmed/excluded)', frozenKnown);
chk('no holding counted twice (frozenKnown empty)', frozenKnown.length === 0);
const u = v.holdings.filter(h => h.equityPct === null);
const whole = { totalValue: v.totalValue, frozenKnown, estFrozen: [], noBasisVal: 0, unknownAssumption: null };
const p = m.solveTargetPlan(inc, new Set([inc[0].key]), 60, 45, whole, 'any');
console.log(p.status, 'F', p.F, 'expected F', 100000*73.81+100000*30.86, 'range', p.loAll, p.hiAll);
chk('F equals frozen A2+A3 once', Math.abs(p.F - (100000*73.81+100000*30.86)) < 1);
