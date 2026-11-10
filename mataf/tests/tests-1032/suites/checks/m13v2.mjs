// Mirror of m13 (the original m13.mjs is preserved verbatim in this directory) after the user-steered design change
// (09/11/2026 21:55-21:56): the record-choice mechanism (conflictResolutions) was removed entirely;
// conflicting records are rejected before calculation. m13's stale/ORDER/OOS choice concerns are
// eliminated by construction; this mirror asserts the rejection semantics on m13's scenarios.
import { m, P, G, tr, acct, chk } from './common.mjs';
const rec = (no, bal, asOf='20260930', id=2142) => ({ ...acct(no,'pensia',[tr(id,bal)]), asOf, totalBalance: bal, yatzran:'Migdal', sugMutzar:'2' });
const an = (accts, res) => m.analyzePortfolio({ accounts: accts, conflictResolutions: res });
// A default: conflicting versions rejected, only the clean account counted
let v = an([rec('P1',100000), rec('P1',130000), rec('Z',50000, '20260930', 9647)]);
chk('default: conflicting account rejected, only non-conflicting counted', v.totalValue===50000 && v.rejectedImports.length===1 && v.rejectedImports[0].versions.length===2, `total=${v.totalValue}`);
chk('rejected versions keep both balances verbatim', v.rejectedImports[0].versions.map(x=>x.balance).sort((a,b)=>a-b).join(',')==='100000,130000');
// B no choice mechanism: conflictResolutions is ignored entirely (no error, no effect)
const w1 = an([rec('P1',100000), rec('P1',130000), rec('Z',50000,'20260930',9647)], { 'P1|20260930': 1 });
const w2 = an([rec('P1',100000), rec('P1',130000), rec('Z',50000,'20260930',9647)], { 'P1|20260930': 99 });
chk('out-of-range or present "choice" input has no effect', w1.totalValue===50000 && w2.totalValue===50000 && w1.rejectedImports.length===1 && w2.rejectedImports.length===1);
// C input order independence: same rejection, deterministic version order
const a = an([rec('P1',130000), rec('P1',100000)]), b = an([rec('P1',100000), rec('P1',130000)]);
chk('rejection deterministic regardless of file order', a.rejectedImports[0].versions[0].balance===b.rejectedImports[0].versions[0].balance && a.totalValue===b.totalValue, `first=${a.rejectedImports[0].versions[0].balance}`);
// D two groups reject independently; clean accounts still load
const two = an([rec('P1',100000), rec('P1',130000), rec('P2',70000), rec('P2',71000), rec('Z',50000,'20260930',9647)]);
chk('two conflicting groups rejected independently, clean account counted', two.totalValue===50000 && two.rejectedImports.length===2, `rej=${two.rejectedImports.length} total=${two.totalValue}`);
// E idempotence: re-analysis preserves the rejection list without duplicating
const p = { accounts: [rec('P1',100000), rec('P1',130000)] };
const a1 = m.analyzePortfolio(p), a2 = m.analyzePortfolio(p);
chk('re-analysis idempotent (same total, same rejection list)', a1.totalValue===a2.totalValue && a2.rejectedImports.length===1, `rej2=${a2.rejectedImports.length}`);
