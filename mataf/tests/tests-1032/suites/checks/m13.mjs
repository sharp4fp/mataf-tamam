import { m, P, G, tr, acct, chk } from './common.mjs';
const rec = (no, bal, asOf='20260930', id=2142) => ({ ...acct(no,'pensia',[tr(id,bal)]), asOf, totalBalance: bal, yatzran:'Migdal', sugMutzar:'2' });
const an = (accts, res) => m.analyzePortfolio({ accounts: accts, conflictResolutions: res });
const pick = v => v.holdings.filter(h=>!h.blocked).map(h=>h.account.account+':'+h.track.balance).join('|');
// A default none
let v = an([rec('P1',100000), rec('P1',130000), rec('Z',50000, '20260930', 9647)]);
chk('default none: only non-conflicted counted', v.totalValue===50000 && v.blockedConflictValue===230000, `total=${v.totalValue} blocked=${v.blockedConflictValue}`);
console.log('  groups', JSON.stringify((v.conflictGroups||[]).map(g=>({key:g.key,chosen:g.chosen,opts:g.options.map(o=>o.idx+':'+o.balance)}))));
// B choose each idx
const g = v.conflictGroups[0]; for (const o of g.options) { const w = an([rec('P1',100000), rec('P1',130000), rec('Z',50000,'20260930',9647)], { [g.key]: o.idx }); chk(`choose ${o.idx} (${o.balance}) counts exactly that record`, w.totalValue===50000+o.balance, `total=${w.totalValue}`); }
// C input order independence
const a = an([rec('P1',130000), rec('P1',100000)], { [g.key]: 1 }), b = an([rec('P1',100000), rec('P1',130000)], { [g.key]: 1 });
chk('same choice index selects same record regardless of file order', a.totalValue===b.totalValue, `${a.totalValue} vs ${b.totalValue}`);
// D stale index out of range
const s = an([rec('P1',100000), rec('P1',130000)], { [g.key]: 3 });
chk('out-of-range stale choice counts nothing and does not claim a choice', s.totalValue===0 && !/נבחרה/.test((s.importNotes||[]).join(' ')), `total=${s.totalValue} notes=${(s.importNotes||[]).join(' ').slice(0,120)}`);
// E saved choice survives CONTENT CHANGE of records: user chose idx for the 130k version; new export has different numbers
const before = an([rec('P1',100000), rec('P1',130000)], { [g.key]: g.options.find(o=>o.balance===130000).idx });
const after = an([rec('P1',95000), rec('P1',130000)], { [g.key]: g.options.find(o=>o.balance===130000).idx });
const afterAlt = an([rec('P1',100000), rec('P1',140000)], { [g.key]: g.options.find(o=>o.balance===130000).idx });
console.log('  before', before.totalValue, 'after(100k->95k)', after.totalValue, 'after(130k->140k)', afterAlt.totalValue);
chk('saved choice is NOT silently re-applied to a changed record set (content-bound)', !(after.totalValue===95000) && !(afterAlt.totalValue===100000), `after=${after.totalValue} afterAlt=${afterAlt.totalValue}`);
// F independent per-account
const two = [rec('P1',100000), rec('P1',130000), rec('P2',70000,'20260930',9647), rec('P2',80000,'20260930',9647)];
const t0 = an(two); const k1 = t0.conflictGroups.map(x=>x.key);
const t1 = an(two, { [k1[0]]: 1 });
chk('two groups resolve independently', t0.conflictGroups.length===2 && t1.conflictGroups.filter(x=>x.chosen).length===1, k1.join(','));
// G three records
const th = an([rec('P1',1), rec('P1',2), rec('P1',3)]); chk('3-way conflict: 3 options, none counted', th.conflictGroups[0].options.length===3 && th.totalValue===0);
// H planner baseline: blocked never included, never in frozenKnown/estFrozen; partition holds
const inc = m.includedHoldingsOf(v.holdings, {}, {}); chk('blocked excluded from included set', !inc.some(x=>x.h.blocked));
// I conflict key collision with a genuinely different account literally named like suffix
const c = an([rec('P1',100000), rec('P1',130000), rec('P1 [רשומה מתנגשת 1]',5000)]); console.log('  suffix-named real account total', c.totalValue);
// J report
const R = await import((process.env.BUILD)+'/report.js');
