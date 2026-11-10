// Mirror of m12 (the original m12.mjs is preserved verbatim in this directory) after the user-steered design change
// (09/11/2026 21:55-21:56): exact-unique-name auto identity removed entirely. Sections 1-3 of m12 still
// hold verbatim (no wrong-fund / no near-miss / code wins) and are re-asserted here; the name-only
// confirmation path is replaced by the manual selector (fingerprint-bound).
import { m, P, G, tr, acct, chk } from './common.mjs';
const run = (kind, t) => m.analyzePortfolio({ accounts: [acct('A', kind, [t])] }).holdings[0];
const norm = x => String(x||'').replace(/["'״׳.,()\-–;]/g,' ').split(/\s+/).filter(Boolean).join(' ');
// 1 no name-only identity at all: every official name without a code stays unidentified
const rows = Object.values(P).filter(r=>r.eq!==null);
let matchedAny = 0;
for (const r of rows) { const h = run('pensia', {name:r.name, balance:1e5}); if (h.match && h.match.row) matchedAny++; }
chk('pension: no name-only match for any official row', matchedAny===0, `rows=${rows.length} matched=${matchedAny}`);
// 2 near-miss variations must NOT match (conservative)
let leaks = 0, tried = 0;
for (const r of rows.slice(0, 120)) for (const v of [r.name.split(' ').slice(0,-1).join(' '), r.name + ' פלוס', r.name.replace('מניות','אג"ח'), r.name.replace(/מקפת|מיטב|הראל|כלל|הפניקס|מנורה/,'אלטשולר')]) { if (!v || v===r.name) continue; tried++;
  const h = run('pensia', {name:v, balance:1e5}); if (h.match && h.match.row) { leaks++; if (leaks<4) console.log('  leak:', v, '->', h.match.row.name); } }
chk('near-miss names produce no match', leaks===0, `tried=${tried} leaks=${leaks}`);
// 3 code present: code wins; unknown code stays unidentified even with exact official name
const mig = Object.values(P).find(r=>r.fundId===2142), cl = P[9647];
const hCode = run('pensia', {name:'שם אחר לגמרי', code:String(cl.parentId)+String(9647).padStart(7,'0'), balance:1e5});
chk('code identifies regardless of name', hCode.match && hCode.match.officialId === 9647 && Math.abs(hCode.equityPct - cl.eq) < 1e-9);
const hBad = run('pensia', {name:mig.name, code:'999999999999999', balance:1e5});
chk('unknown code + exact name stays unidentified (no name fallback)', !hBad.match.row && hBad.equityPct===null);
// 4 product-kind gate on manual selection: hishtalmut official row cannot be selected into a pension account
const gm = Object.values(G).find(r=>r.cls && /השתלמות/.test(r.cls));
if (gm) {
  const a = acct('A','pensia',[{name:gm.name,balance:1e5}]);
  const key = 'A|' + gm.name;
  const vv = m.analyzePortfolio({ accounts:[a], manualMatches: { [key]: { officialId: gm.fundId, name: gm.name, balance: 1e5, account: 'A', kind: 'pensia', trackName: gm.name } } });
  chk('gemel row not bindable into pension account', vv.holdings[0].equityPct===null && vv.manualDropped.length===1, `eq=${vv.holdings[0].equityPct}`);
}
// 5 selection is included in the planning set via its explicit confirmation (as the app's change handler sets)
const key2 = 'A|' + mig.name;
const v2 = m.analyzePortfolio({ accounts:[acct('A','pensia',[{name:mig.name,balance:1e5}])], manualMatches: { [key2]: { officialId: mig.fundId, name: mig.name, balance: 1e5, account: 'A', kind: 'pensia', trackName: mig.name } } });
const inc0 = m.includedHoldingsOf(v2.holdings, {}, {});
const inc1 = m.includedHoldingsOf(v2.holdings, { [key2]: m.matchIdentityOf(v2.holdings[0].match) }, {});
chk('user-selected identity enters the average only with its confirmation entry', inc0.length===0 && inc1.length===1 && inc1[0].cls==='confirmed', `inc0=${inc0.length} inc1=${inc1.length}`);
