import { m, P, G, tr, acct, key, chk, B } from './common.mjs';
const R = await import(B + '/report.js');
const mk = () => m.analyzePortfolio({ accounts: [
  acct('A','pensia',[tr(2142,100000)]), acct('B','pensia',[tr(9647,200000)]), acct('H','hishtalmut',[tr(968,120000,G)]), acct('U','menahalim',[{name:'כללי',balance:50000}])] });
const strip = s => s.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ');
const run = (label, targetEq, selNames, exclNames, expectNote) => {
  const v = mk(); const accs0=[acct('A','pensia',[tr(2142,100000)]),acct('B','pensia',[tr(9647,200000)]),acct('H','hishtalmut',[tr(968,120000,G)]),acct('U','menahalim',[{name:'כללי',balance:50000}])]; v.accounts=accs0; const st = { targetEq, geoPref:'any', eligible:{}, excluded:{}, confirmed:{}, unknownAssumption:null, portfolio:{accounts:v.accounts||[],client:{name:'t'}}, files:[], manual:{} };
  for (const h of v.holdings) { const k = m.trackKeyOf(h.account.account,h.track); if (selNames.includes(h.account.account)) st.eligible[k]=true; if (exclNames.includes(h.account.account)) st.excluded[k]=true; }
  let html; try { html = R.renderReport(st, v, {name:'x'}); } catch(e){ chk(label+' renders',false,e.message); return; }
  const t = strip(html); const has = /הוצאו מממוצע הסיכון/.test(t);
  const sec = /יעד חשיפה מנייתית כולל/.test(t);
  console.log('  ',label,'section',sec,'note',has,'| says missing-data wrongly:', /חסר נתון חשיפה/.test(t));
  chk(label+' note presence == '+expectNote, has===expectNote);
  if (has) chk(label+' heading retained with note', sec);
};
run('ok: A excluded, B selected', 70, ['A','B'], ['A'], true);
run('infeasible target 5, A excl', 5, ['A','B'], ['A'], true);
run('only excluded selected', 70, ['A'], ['A'], true);
run('all eligible holdings excluded', 70, ['A','B','H'], ['A','B','H'], true);
run('no exclusion', 70, ['A','B'], [], false);
run('excluded not selected', 70, ['B'], ['A'], false);
