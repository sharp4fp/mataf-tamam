// היסטוריה (09/11/2026 20:55): נתיב הבנייה עובר ל-BUILD env (ניידות; ברירת מחדל תיקיית js/ של העץ).
// היסטוריה (09/11/2026 20:55): תיקון p1 - plannerRestoreOf אינו משחזר זכאות להחזקה ללא זיהוי אוטומטי/אישור משוחזר.
// היסטוריה (09/11/2026 22:15): זיהוי שם-אוטומטי בוטל; הזהות ללא-קוד נוצרת רק מבחירה ידנית (manualMatches,
// טביעת אצבע מלאה). הפיקסצ'ר עודכן: הזהויות דרך selections; סחף הזהות נבדק כאי-התאמת טביעת אצבע (יתרה השתנתה).
const B = process.env.BUILD || new URL('../js/', import.meta.url).pathname;
global.window = {};
await import(B + '/exposure-extra.js');
await import(B + '/joinable-extra.js');
const m = await import(B + '/analysis.js');
const { OFFICIAL_PENSION: P, OFFICIAL_GEMEL: G } = await import(B + '/official.js');
let pass = 0, fail = 0;
const chk = (label, cond, extra = '') => { if (cond) { pass++; console.log('PASS', label, extra); } else { fail++; console.log('FAIL', label, extra); } };

// פיקסצ'ר: שני מסלולים ללא קוד; הזהות נבחרת ידנית (manualMatches) לשורות רשמיות אמיתיות
const pRow = Object.values(P).find(r => r.eq !== null && /מנורה/.test(r.name));
const gRow = Object.values(G).find(r => r.cls === 'קרנות השתלמות' && r.eq !== null && /הפניקס/.test(r.name));
const mkAccounts = (bal1, bal2) => ([
  { account: '100001', plan: 'מנורה מבטחים פנסיה', kind: 'pensia', yatzran: 'מנורה מבטחים פנסיה וגמל בע"מ', tracks: [{ name: pRow.name, balance: bal1 }] },
  { account: '100002', plan: 'הפניקס השתלמות', kind: 'hishtalmut', yatzran: 'הפניקס חברה לביטוח', tracks: [{ name: gRow.name, balance: bal2 }] },
]);
const mkSel = (k, row, bal, acct, kind) => ({ [k]: { officialId: row.fundId, name: row.name, balance: bal, account: acct, kind, trackName: row.name } });
const p0 = { accounts: mkAccounts(420000, 180000) };
const pre = m.analyzePortfolio(p0);
const keyOf = h => m.trackKeyOf(h.account.account, h.track);
const k1 = keyOf(pre.holdings[0]), k2 = keyOf(pre.holdings[1]);
const selections = { ...mkSel(k1, pRow, 420000, '100001', 'pensia'), ...mkSel(k2, gRow, 180000, '100002', 'hishtalmut') };
const p = { accounts: mkAccounts(420000, 180000), manualMatches: selections };
const v = m.analyzePortfolio(p);
chk('manual selection binds identity before snapshot', v.holdings.every(h => h.match.userSelected === true && h.equityPct !== null), v.holdings.map(h => h.equityPct).join(','));
const id1 = m.matchIdentityOf(v.holdings[0].match);
const id2 = m.matchIdentityOf(v.holdings[1].match);

// snapshot -> restore round trip
const state = { targetEq: 77, geoPref: 'foreign', unknownAssumption: 40, eligible: { [k1]: true, [k2]: true, 'stale|key': true }, excluded: {}, confirmed: { [k1]: id1, [k2]: id2, 'stale|key2': 'name:ללא' }, selections };
const snap = m.plannerSnapshotOf(state);
const json = JSON.parse(JSON.stringify(snap)); // through manifest JSON serialization
chk('snapshot carries selections', json.selections && json.selections[k1] && json.selections[k1].officialId === pRow.fundId);
const restoredSel = m.plannerSelectionsOf(json);
chk('selections round trip structurally', Object.keys(restoredSel).length === 2 && restoredSel[k2].name === gRow.name);
chk('structurally invalid selections rejected', Object.keys(m.plannerSelectionsOf({ v: 1, selections: { 'a|b': { officialId: -3 }, 'c|d': { officialId: 5, name: '', balance: 1, account: 'c', kind: 'pensia', trackName: 'd' } } })).length === 0);
const r = m.plannerRestoreOf(json, v.holdings);
chk('round trip targetEq', r.targetEq === 77);
chk('round trip geoPref', r.geoPref === 'foreign');
chk('round trip unknownAssumption', r.unknownAssumption === 40);
chk('eligible kept for existing keys only', r.eligible[k1] === true && r.eligible[k2] === true && !('stale|key' in r.eligible) && r.dropped.keys === 1);
chk('confirmation kept on exact identity', r.confirmed[k2] === id2);
chk('stale confirmation dropped', r.dropped.confirms === 1 && !('stale|key2' in r.confirmed));

// fingerprint drift invalidates the selection itself: balance changed after save
const driftP = { accounts: mkAccounts(420000, 181000), manualMatches: restoredSel };
const drifted = m.analyzePortfolio(driftP);
chk('stale selection not applied (fingerprint mismatch)', drifted.holdings[1].equityPct === null && drifted.manualDropped.length === 1 && drifted.manualDropped[0].key === k2, JSON.stringify(drifted.manualDropped));
const r2 = m.plannerRestoreOf(json, drifted.holdings);
chk('drifted identity drops its confirmation', !r2.confirmed[k2] && r2.confirmed[k1] === id1, JSON.stringify(r2.dropped));
chk('p1: eligibility of drifted identity is dropped with it', !r2.eligible[k2] && r2.eligible[k1] === true && r2.dropped.eligUnconfirmed === 1, JSON.stringify(r2.dropped));
chk('p1: eligible without auto identity or restored confirmation is dropped', (() => { const rr = m.plannerRestoreOf({ v: 1, eligible: { [k1]: true } }, v.holdings); return !rr.eligible[k1] && rr.dropped.eligUnconfirmed === 1; })());

// old save (no planner key) -> defaults, no throw
const r3 = m.plannerRestoreOf(undefined, v.holdings);
chk('missing planner -> defaults', r3.targetEq === null && r3.geoPref === 'any' && Object.keys(r3.eligible).length === 0);
// wrong version -> defaults
const r4 = m.plannerRestoreOf({ v: 2, targetEq: 80 }, v.holdings);
chk('unknown version ignored', r4.targetEq === null);
// invalid values clamped/rejected
const r5 = m.plannerRestoreOf({ v: 1, targetEq: 140, geoPref: 'north', unknownAssumption: -5 }, v.holdings);
chk('invalid values rejected', r5.targetEq === null && r5.geoPref === 'any' && r5.unknownAssumption === null);
// dup keys round trip (two identical no-code rows) with per-row selections
const dupSel1 = { officialId: pRow.fundId, name: pRow.name, balance: 100000, account: 'A', kind: 'pensia', trackName: pRow.name };
const dupSel2 = { ...dupSel1, balance: 200000 };
const dupAccounts = [{ account: 'A', plan: 'x', kind: 'pensia', yatzran: 'מנורה מבטחים', tracks: [{ name: pRow.name, balance: 100000 }, { name: pRow.name, balance: 200000 }] }];
const dupPre = m.analyzePortfolio({ accounts: JSON.parse(JSON.stringify(dupAccounts)) });
const dk = dupPre.holdings.map(keyOf);
const dup = m.analyzePortfolio({ accounts: dupAccounts, manualMatches: { [dk[0]]: dupSel1, [dk[1]]: dupSel2 } });
const dId = m.matchIdentityOf(dup.holdings[1].match);
const r6 = m.plannerRestoreOf({ v: 1, eligible: { [dk[1]]: true }, confirmed: { [dk[1]]: dId } }, dup.holdings);
chk('dup rows keep distinct keys through persistence', dk[0] !== dk[1] && r6.eligible[dk[1]] === true && !(dk[0] in r6.eligible), dk.join(' | '));
chk('dup rows get their own selections applied', dup.holdings.every(h => h.match.userSelected === true));
// backward-compat manifest shape check: plannerSnapshot serializes small + plain JSON
chk('snapshot is plain JSON', JSON.stringify(snap).length < 4000 && JSON.parse(JSON.stringify(snap)).v === 1);
console.log(fail ? `${fail} FAILURES` : 'ALL PASS', `(${pass} assertions)`);
process.exit(fail ? 1 : 0);
