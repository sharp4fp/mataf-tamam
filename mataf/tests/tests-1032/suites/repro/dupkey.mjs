import { m, P, tr, acct, whole, key, chk } from './common.mjs';
// two tracks with identical name in one account
const t1 = tr(2105,100000), t2 = tr(2105,300000);
const v = m.analyzePortfolio({ accounts: [acct('A1','pensia',[t1,t2])] });
const keys = v.holdings.map(key);
console.log('keys', keys);
const inc = m.includedHoldingsOf(v.holdings, {}, {});
console.log('included', inc.length, inc.map(x=>x.key+':'+x.bal));
chk('distinct keys for distinct tracks', new Set(keys).size === keys.length);
// selecting key selects both
const plan = m.solveTargetPlan(inc, new Set([inc[0].key]), 60, 45, whole(v), 'any');
console.log(plan.status, 'selected S_bal', plan.S_bal, '(only one 100000 intended)');
chk('selecting one track does not select both', plan.S_bal === 100000);
// view.holdings.find as used by app UI
const found = v.holdings.find(x => x.account === v.holdings[1].account && x.track.name === v.holdings[1].track.name);
chk('lookup by (account,name) returns the right second track', found === v.holdings[1]);
