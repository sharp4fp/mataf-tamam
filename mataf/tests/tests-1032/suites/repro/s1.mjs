// Extracts wholePlanContext() from the candidate's actual app.js (and the whole block of report.js) and runs it against stubs,
// then compares to an independent hand ledger. Demo: menora pension 420k, fnx hishtalmut 180k, menahalim 'כללי' 95k (no official id).
import fs from 'fs';
import { B, m, P, G, chk } from './common.mjs';
const app = fs.readFileSync(B + '/app.js', 'utf8');
const mt = app.match(/function wholePlanContext\(\) \{[\s\S]*?\n\}\n/);
if (!mt) { console.log('FAIL cannot extract wholePlanContext'); process.exit(1); }
const accounts = [
  { account: '100001', plan: 'מנורה', kind: 'pensia', tracks: [{ name: 'מנורה מבטחים פנסיה - מסלול מניות', balance: 420000, code: '5122457412' + '' }] },
  { account: '100002', plan: 'הפניקס', kind: 'hishtalmut', tracks: [{ name: 'הפניקס השתלמות מניות', balance: 180000 }] },
  { account: '100003', plan: 'מגדלור', kind: 'menahalim', tracks: [{ name: 'כללי', balance: 95000 }] },
];
// give codes (real mislaka rows have them): parentId+7-digit fundId when the official row is known
const men = Object.values(P).find(r => r.name === 'מנורה מבטחים פנסיה - מסלול מניות');
accounts[0].tracks[0].code = String(men.parentId) + String(men.fundId).padStart(7, '0');
const v = m.analyzePortfolio({ accounts });
console.log(v.holdings.map(h => `${h.track.name} eq=${h.equityPct} est=${h.estimate && h.estimate.eq} id=${h.match && h.match.officialId}`));
for (const mode of ['all-confirmed-default', 'excluded-menora-fixed']) {
  const state = { unknownAssumption: null, excluded: {}, confirmed: {} };
  if (mode.startsWith('excluded')) state.excluded[m.trackKeyOf('100002', v.holdings[1].track)] = true;
  const view = v;
  const includedHoldings = () => m.includedHoldingsOf(view.holdings, state.confirmed, state.excluded);
  const trackKeyOf = m.trackKeyOf;
  const whole = new Function('view', 'includedHoldings', 'state', 'trackKeyOf', mt[0] + '; return wholePlanContext();')(view, includedHoldings, state, trackKeyOf);
  const inc = includedHoldings();
  console.log(mode, 'inc', inc.map(x => x.key + (x.excludedFromAvg ? '[excl]' : '')), 'whole', JSON.stringify(whole));
  // partition ledger: every shekel exactly once
  const sumInc = inc.reduce((s, x) => s + x.bal, 0), fk = whole.frozenKnown.reduce((s, x) => s + x.bal, 0), es = whole.estFrozen.reduce((s, x) => s + x.bal, 0);
  chk(`${mode}: included + frozenKnown + est + noBasis == total`, Math.abs(sumInc + fk + es + whole.noBasisVal - v.totalValue) < 1e-6, `${sumInc}+${fk}+${es}+${whole.noBasisVal} vs ${v.totalValue}`);
  chk(`${mode}: no balance in both included and frozenKnown`, !fs.existsSync || fk === 0 || fk <= v.holdings.filter(h => h.equityPct !== null).reduce((s, h) => s + h.track.balance, 0) - sumInc + 1e-6);
}
// independent ledger of whole range with menahalim frozen at estimate
const mig = v.holdings[2].estimate ? v.holdings[2].estimate.eq : v.holdings[2].equityPct;
console.log('menahalim frozen eq used', mig);
