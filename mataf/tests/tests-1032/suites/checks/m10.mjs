// Impact of D5 on the headline: 420k no-code bond/credit track (official 4.99% equity) beside 3 other holdings.
import { m, P, G, tr, acct, chk } from './common.mjs';
const bondTrue = Object.values(P).find(r => /מגדל מקפת אישית אשראי/.test(r.name));
const others = [acct('H','hishtalmut',[tr(968,180000,G)]), acct('M','pensia',[tr(2142,100000)])];
const mk = t => m.analyzePortfolio({ accounts: [acct('B','pensia',[t]), ...others] });
const withCode = mk(tr(bondTrue.fundId, 420000)), noCode = mk({ name: bondTrue.name, balance: 420000 });
const f = v => `weightedEquity=${v.weightedEquity.toFixed(2)} coverage=${(v.coverage*100).toFixed(1)}% bondEq=${v.holdings[0].equityPct} match=${v.holdings[0].match.officialId ? 'official-code' : 'name-only score ' + v.holdings[0].match.score.toFixed(2)}`;
console.log('with code   :', f(withCode)); console.log('without code:', f(noCode));
chk('no-code figure must not drift the headline by >5pp from the code-identified truth', Math.abs(withCode.weightedEquity - noCode.weightedEquity) <= 5, `diff=${(noCode.weightedEquity - withCode.weightedEquity).toFixed(2)}pp`);
