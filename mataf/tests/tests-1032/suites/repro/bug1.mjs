import { m, P, tr, acct, whole, key, chk } from './common.mjs';
const v = m.analyzePortfolio({ accounts: [acct('A1','pensia',[tr(2105,100000)]), acct('A2','pensia',[tr(2142,100000)]), acct('A3','pensia',[tr(8803,100000)])] });
const exc = { [key(v.holdings[1])]: true };
const inc = m.includedHoldingsOf(v.holdings, {}, exc);
const plan = m.solveTargetPlan(inc, new Set([inc[0].key]), 60, 45, whole(v), 'any');
// expected F = exactly the frozen contributions: A2 73.81%*100k + A3 30.86%*100k = 10,467,000 if excluded fund counted at its known eq
console.log(plan.status, 'F', plan.F, 'range', plan.loAll, plan.hiAll);
chk('excluded identified holding not silently 0% (F should include 7,381,000 or be explicitly bucketed)', plan.F >= 10467000 - 1);
