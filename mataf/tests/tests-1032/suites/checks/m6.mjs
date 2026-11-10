// Realistic: same clearing-house XML loaded twice (or overlapping exports). Same account number+track appears twice.
import { m, P, tr, acct, chk } from './common.mjs';
const one = [acct('POL-1','pensia',[tr(2142,100000)]), acct('POL-2','pensia',[tr(9647,200000)])];
const dup = [...one, ...one.map(a=>({...a, tracks:a.tracks.map(t=>({...t}))}))];
const v1 = m.analyzePortfolio({accounts:one}), v2 = m.analyzePortfolio({accounts:dup});
chk('duplicate accounts should not double the total (v1 total vs dup total)', Math.abs(v2.totalValue - v1.totalValue) < 1e-6, `single=${v1.totalValue} dup=${v2.totalValue}`);
const keys = v2.holdings.map(h=>m.trackKeyOf(h.account.account,h.track));
console.log('keys', keys);
// even if duplicated, solver must stay internally consistent (ledger partition)
const inc = m.includedHoldingsOf(v2.holdings,{},{});
const p = m.solveTargetPlan(inc, new Set(inc.map(x=>x.key)), 65, 45, {totalValue:v2.totalValue, estFrozen:[], noBasisVal:0, frozenKnown:[], unknownAssumption:null}, 'any');
console.log('status', p.status, 'included', inc.length, 'per', p.per && p.per.length, 'S_bal', p.S_bal, 'V', p.V);
chk('included holdings cover whole duplicated total (no silent loss by key collision)', Math.abs(inc.reduce((s,x)=>s+x.bal,0) - v2.totalValue) < 1e-6, `inc=${inc.reduce((s,x)=>s+x.bal,0)} total=${v2.totalValue}`);
