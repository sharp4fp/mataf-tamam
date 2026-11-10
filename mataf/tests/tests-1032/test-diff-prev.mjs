// test-diff-prev.mjs - הדוח הקודם בהשוואת מסלקות: גרסאות סותרות של אותו חשבון אינן נספרות כפול.
const B = process.env.BUILD || new URL('../js/', import.meta.url).pathname;
global.window = {};
await import(B + '/joinable-extra.js');
const { dedupeAccounts } = await import(B + '/analysis.js');
const { diffPortfolios } = await import(B + '/diffnifraim.js');
let pass = 0, fail = 0;
const chk = (l, c, x = '') => { console.log((c ? 'PASS ' : 'FAIL ') + l + (x ? ' :: ' + x : '')); c ? pass++ : fail++; };
const acct = (account, bal, extra = {}) => ({ account, kind: 'pensia', plan: 'x', yatzran: 'y', sugMutzar: '2', asOf: '20251031', totalBalance: bal, tracks: [{ name: 't', code: '', balance: bal }], ...extra });
const curr = { accounts: [acct('A', 210000), acct('B', 120000)] };
// קודם: A מופיע בשתי גרסאות שונות באותו תאריך ערך (200000 / 300000) + B תקין
const prevRaw = [acct('A', 200000), acct('A', 300000), acct('B', 100000)];
const rawDiff = diffPortfolios({ accounts: prevRaw }, curr);
chk('raw previous input is cleaned inside diffPortfolios - no double count even if the caller does not dedupe', rawDiff.prevTotal === 100000 && rawDiff.prevPartial === true, `prevTotal=${rawDiff.prevTotal}`);
chk('raw-input conflicting account is prev-rejected, not new', rawDiff.accounts.find(x => x.curr && x.curr.account === 'A').status === 'prev-rejected');
const dd = dedupeAccounts(prevRaw);
chk('conflicting same-date versions rejected, B kept', dd.accounts.length === 1 && dd.accounts[0].account === 'B' && dd.rejected.length === 1, JSON.stringify(dd.accounts.map(a => a.account)));
chk('rejected versions keep their own balances', dd.rejected[0].versions.map(v => v.balance).join() === '200000,300000');
chk('note explains rejection', dd.notes.length === 1 && /נדחה מהחישוב/.test(dd.notes[0]));
const d = diffPortfolios({ accounts: dd.accounts }, curr);
chk('prev total = accepted accounts only (no alternative-version sum)', d.prevTotal === 100000, `prevTotal=${d.prevTotal}`);
//MORE-CASES-BELOW


// 3) זהות נדחית בקודמת נשמרת: לא "חדש", סכום מסומן חלקי
const p2 = { accounts: dd.accounts, rejectedPrev: dd.rejected };
const d2 = diffPortfolios(p2, curr);
const ra = d2.accounts.find(x => x.curr && x.curr.account === 'A');
chk('account rejected in prev is not shown as new', ra && ra.status === 'prev-rejected', ra && ra.status);
chk('rejected version balances kept on the entry', ra && ra.prevRejected.versions.length === 2);
chk('prev total flagged partial', d2.prevPartial === true && d2.prevRejectedCount === 1 && d2.prevTotal === 100000, `prevTotal=${d2.prevTotal} partial=${d2.prevPartial}`);
const onlyPrev = diffPortfolios(p2, { accounts: [] });
chk('rejected-in-prev with no current account still listed, not dropped', onlyPrev.accounts.some(x => x.status === 'prev-rejected' && !x.curr));
console.log(`test-diff-prev: ${pass} pass, ${fail} fail`); if (fail) process.exit(1);
