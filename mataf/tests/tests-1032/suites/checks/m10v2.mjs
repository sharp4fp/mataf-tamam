// Mirror of m10 (the original m10.mjs is preserved verbatim in this directory) after the user-steered design change
// (09/11/2026 21:55-21:56): no-code tracks get NO automatic identity - m10's premise (exact-name
// resolution should match code-identified headline) is superseded by: no-code = unidentified until
// explicit manual selection; after selecting the true identity, the headline equals the code-identified one.
import { m, P, G, tr, acct, chk } from './common.mjs';
const bondTrue = Object.values(P).find(r => /מגדל מקפת אישית אשראי/.test(r.name));
const others = [acct('H','hishtalmut',[tr(968,180000,G)]), acct('M','pensia',[tr(2142,100000)])];
const mk = (t, mm) => m.analyzePortfolio({ accounts: [acct('B','pensia',[t]), ...others], manualMatches: mm });
const withCode = mk(tr(bondTrue.fundId, 420000)), noCode = mk({ name: bondTrue.name, balance: 420000 });
const f = v => `weightedEquity=${v.weightedEquity.toFixed(2)} coverage=${(v.coverage*100).toFixed(1)}% bondEq=${v.holdings[0].equityPct} match=${v.holdings[0].match.officialId ? 'official-code' : (v.holdings[0].match.userSelected ? 'user-selected' : 'none')}`;
console.log('with code   :', f(withCode)); console.log('without code:', f(noCode));
chk('no-code track is unidentified: not in headline, not in coverage', noCode.holdings[0].equityPct === null && noCode.holdings[0].match.row === null && Math.abs((withCode.coverage - noCode.coverage) * 100 - (420000 / withCode.totalValue) * 100) < 0.5, f(noCode));
const keyB = 'B|' + bondTrue.name;
const sel = mk({ name: bondTrue.name, balance: 420000 }, { [keyB]: { officialId: bondTrue.fundId, name: bondTrue.name, balance: 420000, account: 'B', kind: 'pensia', trackName: bondTrue.name } });
chk('after manual selection of the true identity, headline equals code-identified', Math.abs(withCode.weightedEquity - sel.weightedEquity) < 1e-9 && sel.holdings[0].match.userSelected === true, f(sel));
const wrong = Object.values(P).find(r => r.fundId !== bondTrue.fundId && r.eq !== null && /מגדל מקפת אישית/.test(r.name));
const selWrong = mk({ name: bondTrue.name, balance: 420000 }, { [keyB]: { officialId: wrong.fundId, name: wrong.name, balance: 420000, account: 'B', kind: 'pensia', trackName: bondTrue.name } });
chk('a hand-forged selection for a different fund is NOT silently corrected nor applied as the true one', selWrong.holdings[0].equityPct === wrong.eq && selWrong.holdings[0].match.userSelected === true && selWrong.holdings[0].match.row.name === wrong.name, f(selWrong));
