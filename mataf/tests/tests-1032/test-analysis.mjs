// test-analysis.mjs - בדיקת ממשק analysis.js. היסטוריה (09/11/2026 20:58): היה probe ללא טענות שיצא 0 תמיד
// (נספר בטעות כ"לא נכשל"); הומר לטענות PASS/FAIL אמיתיות. provenance: הערת portability שהתקבלה 09/11/2026 20:51.
const B = process.env.BUILD || new URL('../js/', import.meta.url).pathname;
global.window = {};
await import(B + '/exposure-extra.js');
await import(B + '/joinable-extra.js');
const m = await import(B + '/analysis.js');
let pass = 0, fail = 0;
const chk = (l, c, x = '') => { console.log((c ? 'PASS ' : 'FAIL ') + l + (x ? ' :: ' + x : '')); c ? pass++ : fail++; };
chk('fundMixContext exported', typeof m.fundMixContext === 'function');
chk('proposalForTarget exported', typeof m.proposalForTarget === 'function');
chk('solveTargetPlan exported', typeof m.solveTargetPlan === 'function');
chk('classEstimate exported', typeof m.classEstimate === 'function');
chk('MIX_TAKANON covers exactly the six verified pension funds', JSON.stringify(Object.keys(m.MIX_TAKANON).sort()) === JSON.stringify(['162', '163', '168', '170', '209', '214']), Object.keys(m.MIX_TAKANON).join(','));
chk('every MIX_TAKANON entry cites clause + source URL', Object.values(m.MIX_TAKANON).every(e => typeof e.clause === 'string' && e.clause.length > 10 && /^https:\/\//.test(e.src)));
chk('plannerSnapshotOf/plannerRestoreOf exported', typeof m.plannerSnapshotOf === 'function' && typeof m.plannerRestoreOf === 'function');
chk('includedHoldingsOf/matchIdentityOf/trackKeyOf exported', typeof m.includedHoldingsOf === 'function' && typeof m.matchIdentityOf === 'function' && typeof m.trackKeyOf === 'function');
console.log(fail ? fail + ' FAILURES' : 'ALL PASS', '(' + pass + ' assertions)');
process.exit(fail ? 1 : 0);
