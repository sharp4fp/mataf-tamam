// Does the client report (report.js) and the account-level sections include/disclose suspended conflict records?
import { m, P, G, tr, acct, chk } from './common.mjs';
const R = await import(process.env.BUILD + '/report.js');
const rec = (no, bal, id=2142) => ({ ...acct(no,'pensia',[tr(id,bal)]), asOf:'20260930', totalBalance: bal, yatzran:'Migdal', sugMutzar:'2', plan:'x' });
const p = { accounts: [rec('P1',100000), rec('P1',300000), rec('Z',50000,9647)], clientName:'t', client:{name:'t'}, conflictResolutions:{} };
const v = m.analyzePortfolio(p);   // note: analyzePortfolio rewrites p.accounts with flags
console.log('view total', v.totalValue, 'blocked', v.blockedConflictValue, 'p.accounts', p.accounts.map(a=>a.account+':'+a.totalBalance+':'+(a.importFlag||'-')).join(' | '));
const st = { portfolio: p, targetEq: null, eligible:{}, excluded:{}, confirmed:{}, files:[], manual:{}, geoPref:'any' };
const model = R.buildReportModel(st, v);
console.log('report total', model.total, 'accounts in report', model.accs.length);
chk('report total equals the view total (conflict records excluded)', model.total === v.totalValue, `report=${model.total} view=${v.totalValue}`);
const html = R.renderReport(st, v, { name: 'x' }); const t = html.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ');
chk('report discloses suspended conflicting records when any exist', /מתנגש|מושה/.test(t), (t.match(/.{0,40}(מתנגש|מושה).{0,40}/)||['no mention'])[0]);
chk('report does not list conflicting suspended accounts as holdings', !/רשומה מתנגשת/.test(t), (t.match(/.{0,40}רשומה מתנגשת.{0,40}/)||['ok'])[0]);
