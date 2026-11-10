// D1 correction audit: same producer+account, same asOf, DIFFERENT contents (a real conflict). Must not be aggregated as reliable.
import { m, P, G, tr, acct, chk } from './common.mjs';
const mk = (bal2) => [
  { ...acct('POL-1','pensia',[tr(2142,100000)]), asOf:'20260930', totalBalance:100000, yatzran:'Migdal', sugMutzar:'2' },
  { ...acct('POL-1','pensia',[tr(2142,bal2)]), asOf:'20260930', totalBalance:bal2, yatzran:'Migdal', sugMutzar:'2' },
  acct('OTHER','pensia',[tr(9647,200000)]) ];
const v = m.analyzePortfolio({ accounts: mk(130000) });
console.log('notes', v.importNotes); console.log('total', v.totalValue, 'weightedEquity', v.weightedEquity.toFixed(2), 'holdings', v.holdings.map(h=>h.account.account+':'+h.track.balance+':'+(h.account.importFlag||'-')));
chk('conflicting same-date records are NOT both summed into totalValue (expected 300000 or 330000, not 430000)', v.totalValue !== 430000, 'total='+v.totalValue);
const inc = m.includedHoldingsOf(v.holdings, {}, {});
chk('conflicted holdings excluded from planner-included set until resolved', !inc.some(x=>x.h.account.importFlag==='conflict'), inc.map(x=>x.h.account.account).join('|'));
// older/newer different dates
const w = m.analyzePortfolio({ accounts: [ { ...acct('POL-1','pensia',[tr(2142,100000)]), asOf:'20260831', totalBalance:100000, yatzran:'Migdal', sugMutzar:'2' }, { ...acct('POL-1','pensia',[tr(2142,120000)]), asOf:'20260930', totalBalance:120000, yatzran:'Migdal', sugMutzar:'2' } ] });
chk('different dates: newest only', w.totalValue === 120000, 'total='+w.totalValue+' notes='+JSON.stringify(w.importNotes).slice(0,200));
// two distinct real accounts must not be merged (different account number)
const x = m.analyzePortfolio({ accounts: [ {...acct('POL-1','pensia',[tr(2142,100000)]), yatzran:'Migdal', asOf:'20260930'}, {...acct('POL-2','pensia',[tr(2142,100000)]), yatzran:'Migdal', asOf:'20260930'} ] });
chk('distinct account numbers both kept', x.totalValue === 200000, 'total='+x.totalValue);
// no account number: two real distinct products must not be merged
const y = m.analyzePortfolio({ accounts: [ {...acct('','pensia',[tr(2142,100000)]), yatzran:'Migdal'}, {...acct('','pensia',[tr(9647,100000)]), yatzran:'Migdal'} ] });
chk('no account number: not merged', y.totalValue === 200000, 'total='+y.totalValue);
// same account number across product kinds (pension vs hishtalmut with same number, real in insurers)
const z = m.analyzePortfolio({ accounts: [ {...acct('555','pensia',[tr(2142,100000)]), yatzran:'Migdal', asOf:'20260930'}, {...acct('555','hishtalmut',[tr(968,50000,G)]), yatzran:'Migdal', asOf:'20260930'} ] });
chk('same number, different product kind: both kept', z.totalValue === 150000, 'total='+z.totalValue);
// idempotence: analyzing twice must not rename again / change totals
const p = { accounts: mk(130000) }; const a1 = m.analyzePortfolio(p), a2 = m.analyzePortfolio(p);
chk('re-analysis idempotent (no repeated renaming, same total)', a1.totalValue === a2.totalValue && a1.holdings.map(h=>h.account.account).join() === a2.holdings.map(h=>h.account.account).join(), a2.holdings.map(h=>h.account.account).join('|'));
