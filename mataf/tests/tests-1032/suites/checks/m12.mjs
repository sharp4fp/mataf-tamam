// D5 correction audit: exact-unique-name identity. Independent ground truth from official rows, per product table.
import { m, P, G, tr, acct, chk } from './common.mjs';
const run = (kind, t) => m.analyzePortfolio({ accounts: [acct('A', kind, [t])] }).holdings[0];
const norm = x => String(x||'').replace(/["'״׳.,()\-–;]/g,' ').split(/\s+/).filter(Boolean).join(' ');
// 1 independent ground truth: for every pension row, name-only result must be (a) exact same fund, (b) null when name is non-unique, never another fund
const rows = Object.values(P).filter(r=>r.eq!==null); const cnt = {}; rows.forEach(r=>cnt[norm(r.name)]=(cnt[norm(r.name)]||0)+1);
let wrongFund = 0, nonUniqMatched = 0, ok = 0, none = 0;
for (const r of rows) { const h = run('pensia', {name:r.name, balance:1e5}); const mt = h.match;
  if (!mt || !mt.row) { none++; continue; }
  if (cnt[norm(r.name)] > 1) { nonUniqMatched++; continue; }
  if (mt.row.fundId === r.fundId || Math.abs(h.equityPct - r.eq) < 1e-9) ok++; else wrongFund++; }
console.log({pensionRows: rows.length, ok, none, wrongFund, nonUniqMatched, duplicatedNames: Object.values(cnt).filter(c=>c>1).length});
chk('pension: no wrong-fund and no non-unique-name match', wrongFund===0 && nonUniqMatched===0);
// 2 near-miss variations must NOT match (conservative): drop last word, swap company, add a word, mandate change
let leaks = 0, tried = 0;
for (const r of rows.slice(0, 120)) for (const v of [r.name.split(' ').slice(0,-1).join(' '), r.name + ' פלוס', r.name.replace('מניות','אג"ח'), r.name.replace(/מקפת|מיטב|הראל|כלל|הפניקס|מנורה/,'אלטשולר')]) { if (!v || v===r.name) continue; tried++;
  const h = run('pensia', {name:v, balance:1e5}); const exactOfOther = rows.filter(q=>norm(q.name)===norm(v)); if (h.match && h.match.row && !exactOfOther.length) { leaks++; if (leaks<4) console.log('  leak:', v, '->', h.match.row.name); } }
chk('near-miss names produce no match unless they are another exact official name', leaks===0, `tried=${tried} leaks=${leaks}`);
// 3 code present but contradicting the name: code must win / name must not override a present-but-unknown code
const mig = Object.values(P).find(r=>r.fundId===2142), cl = P[9647];
const h1 = run('pensia', { name: cl.name, code: String(mig.parentId)+String(2142).padStart(7,'0'), balance: 1e5 });
chk('code (Migdal 2142) vs name of Clal 9647: code wins', h1.match.officialId===2142 && Math.abs(h1.equityPct-mig.eq)<1e-9, `eq=${h1.equityPct} id=${h1.match.officialId}`);
const h2 = run('pensia', { name: cl.name, code: '999999999' + '0000001', balance: 1e5 });
console.log('  unknown code + exact clal name ->', h2.equityPct, h2.match && h2.match.officialId, h2.match && h2.match.row && h2.match.row.name);
chk('present-but-unrecognised code is not silently overridden by name identity (equityPct null or flagged)', h2.equityPct===null || (h2.match.row && /לא אומת|שם/.test(h2.match.row.flag||'')), `eq=${h2.equityPct}`);
// 4 coverage + identity: exact-name figure is counted documented but needs confirmation in planner
const v = m.analyzePortfolio({accounts:[acct('A','pensia',[{name:cl.name,balance:1e5}])]});
const inc = m.includedHoldingsOf(v.holdings, {}, {}); chk('exact-name (no code) holding is NOT planner-included without confirmation', inc.length===0, 'included='+inc.length);
const inc2 = m.includedHoldingsOf(v.holdings, {[m.trackKeyOf('A',v.holdings[0].track)]: m.matchIdentityOf(v.holdings[0].match)}, {}); chk('...and is included after matching confirmation', inc2.length===1, 'included='+inc2.length);
// 5 gemel/hishtalmut: product-kind gate
const gm = Object.values(G).find(r=>r.cls && /השתלמות/.test(r.cls)); if (gm) { const a = run('hishtalmut', {name:gm.name,balance:1e5}), b = run('pensia', {name:gm.name,balance:1e5}); chk('hishtalmut official name does not match under pension kind', !(b.match&&b.match.row), `pension-kind eq=${b.equityPct}`); console.log('  hishtalmut exact name ->', a.equityPct, 'official', gm.eq); }
