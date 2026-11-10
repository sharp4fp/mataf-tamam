import { m, P, G, tr, acct, whole, key, chk } from './common.mjs';
// name-matched holding (no code) => needs confirmation. Saved: confirmed+eligible. File tampered/drifted: identity changed.
const v = m.analyzePortfolio({ accounts: [acct('A1','hishtalmut',[{ name:'הפניקס השתלמות מניות', balance:180000 }]), acct('A2','pensia',[tr(2105,100000)])] });
const k = m.trackKeyOf('A1', v.holdings[0].track), id = m.matchIdentityOf(v.holdings[0].match);
console.log('key', k, 'identity', id);
const pl = { v:1, targetEq:60, geoPref:'any', unknownAssumption:null, eligible:{ [k]:true }, excluded:{}, confirmed:{ [k]:'name:SOMETHING ELSE' } };
const r = m.plannerRestoreOf(pl, v.holdings);
console.log(JSON.stringify(r));
chk('eligible must not be restored for a holding whose confirmation was dropped (hidden pre-selection; re-confirming later silently re-selects it)', !r.eligible[k]);
// excluded roundtrip: known official holding excluded, planner restored, whole recomputed
const vv = m.analyzePortfolio({ accounts: [acct('A1','pensia',[tr(2105,100000)]), acct('A2','pensia',[tr(2142,100000)]), acct('A3','pensia',[tr(8803,100000)])] });
const k2 = m.trackKeyOf('A2', vv.holdings[1].track);
const snap = m.plannerSnapshotOf({ targetEq:60, geoPref:'any', unknownAssumption:null, eligible:{ [m.trackKeyOf('A1',vv.holdings[0].track)]:true }, excluded:{ [k2]:true }, confirmed:{} });
const rr = JSON.parse(JSON.stringify(snap)); const rs = m.plannerRestoreOf(rr, vv.holdings);
chk('excluded restored', rs.excluded[k2] === true);
const inc = m.includedHoldingsOf(vv.holdings, rs.confirmed, rs.excluded);
const frozenKnown = vv.holdings.filter(h => h.equityPct !== null && !inc.some(x => x.key === m.trackKeyOf(h.account.account, h.track)));
const plan = m.solveTargetPlan(inc, new Set(Object.keys(rs.eligible)), rs.targetEq, 45, { ...whole(vv), frozenKnown: frozenKnown.map(h => ({ bal:h.track.balance, eq:h.equityPct })) }, rs.geoPref);
console.log(plan.status, 'F', plan.F, 'range', plan.loAll.toFixed(2), plan.hiAll.toFixed(2), 'achieved', plan.achievedWholeEst);
chk('F = 73.81*100k + 30.86*100k once', Math.abs(plan.F - 10467000) < 1);
chk('excluded holding not selectable even if eligible flag restored', !plan.per.some(p => p.key === k2));
