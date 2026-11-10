import fs from 'fs'; import { B, m, P, tr, acct, key, chk } from './common.mjs';
const v = m.analyzePortfolio({ accounts: [acct('A1','pensia',[tr(2105,100000)]), acct('A2','pensia',[tr(2142,100000)])] });
const inc = m.includedHoldingsOf(v.holdings, {}, { [m.trackKeyOf('A1', v.holdings[0].track)]: true });
const x = inc.find(i => i.excludedFromAvg); console.log('excluded holding has known eq', x.eq, 'excludedFromAvg', x.excludedFromAvg);
const p = m.solveTargetPlan(inc, new Set(inc.map(i=>i.key)), 60, 45, { totalValue: v.totalValue, estFrozen: [], noBasisVal: 0, unknownAssumption: null, frozenKnown: [] }, 'any');
console.log('per keys', p.per && p.per.map(q=>q.key));
chk('excluded known holding absent from per (so UI falls to "else" branch)', !p.per || !p.per.some(q => q.key === x.key));
const src = fs.readFileSync(B + '/app.js','utf8');
chk('else-branch text does not claim missing verified data for excluded known holdings', !/אינה נכללת בממוצע הסיכון \(חסר נתון חשיפה מאומת\)/.test(src) || /excludedFromAvg|state\.excluded/.test(src.slice(src.indexOf('function renderAlternatives'), src.indexOf('function renderAlternatives')+1800)));
// hidden pre-selection hazard: exclude + re-include keeps eligible[key]
