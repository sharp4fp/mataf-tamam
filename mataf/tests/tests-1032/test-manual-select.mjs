// היסטוריה (09/11/2026 22:16): סוויטת הבחירה הידנית למסלולים ללא קוד - המנגנון שהחליף את זיהוי השם האוטומטי.
// מכסה: סיווג חברה/סוג מוצר, אי-הרחבה לחברות אחרות, סוגי מוצרים שונים, טביעת אצבע, סימון התאמת-שם בלבד.
const B = process.env.BUILD || new URL('../js/', import.meta.url).pathname;
global.window = {};
await import(B + '/exposure-extra.js');
await import(B + '/joinable-extra.js');
const m = await import(B + '/analysis.js');
const { OFFICIAL_PENSION: P, OFFICIAL_GEMEL: G, OFFICIAL_INSURANCE: I } = await import(B + '/official.js');
let pass = 0, fail = 0;
const chk = (label, cond, extra = '') => { if (cond) { pass++; console.log('PASS', label, extra); } else { fail++; console.log('FAIL', label, extra); } };

// 1) הלכת מסלול מלאה: ללא קוד -> לא מזוהה -> בחירה -> מזוהה ומסומן userSelected -> ביטול (אין manualMatches) -> לא מזוהה שוב
const gRow = Object.values(G).find(r => r.cls === 'קרנות השתלמות' && r.eq !== null && /הפניקס/.test(r.name));
const acctH = () => ({ account: 'H1', plan: 'הפניקס השתלמות', kind: 'hishtalmut', yatzran: 'הפניקס חברה לביטוח בע"מ', tracks: [{ name: gRow.name, balance: 180000 }] });
const opts = m.selectorOptionsFor(acctH(), gRow.name);
chk('hishtalmut selector offers same-company hishtalmut tracks only', opts.status === 'ok' && opts.options.length > 0 && opts.options.every(o => /השתלמות/.test(G[o.id].cls)), `n=${opts.options.length}`);
const keyH = 'H1|' + gRow.name;
const selH = { [keyH]: { officialId: gRow.fundId, name: gRow.name, balance: 180000, account: 'H1', kind: 'hishtalmut', trackName: gRow.name } };
const vSel = m.analyzePortfolio({ accounts: [acctH()], manualMatches: selH });
chk('selection binds with userSelected flag and identity', vSel.holdings[0].match.userSelected === true && vSel.holdings[0].equityPct === gRow.eq && m.matchIdentityOf(vSel.holdings[0].match) === 'name:' + gRow.name);
const vClr = m.analyzePortfolio({ accounts: [acctH()], manualMatches: {} });
chk('cleared selection returns to unidentified', vClr.holdings[0].equityPct === null && !vClr.holdings[0].match.row);

// 2) טביעת אצבע: שם מסלול אחר באותו חשבון -> הבחירה לא מוחלת
const a2 = acctH(); a2.tracks[0] = { name: gRow.name + ' אחר', balance: 180000 };
const v2 = m.analyzePortfolio({ accounts: [a2], manualMatches: selH });
chk('track-name drift blocks the saved selection', v2.holdings[0].equityPct === null && (v2.manualDropped.length + v2.manualOrphans.length) === 1);

// 3) חשבון אחר, אותו מסלול -> לא מוחל
const a3 = acctH(); a3.account = 'H2';
const v3 = m.analyzePortfolio({ accounts: [a3], manualMatches: selH });
chk('account drift blocks the saved selection', v3.holdings[0].equityPct === null && v3.manualOrphans.length === 1);

// 4) סוג מוצר אחר -> לא מוחל
const a4 = acctH(); a4.kind = 'tagmulim';
const v4 = m.analyzePortfolio({ accounts: [a4], manualMatches: selH });
chk('product-kind drift blocks the saved selection', v4.holdings[0].equityPct === null && v4.manualDropped.length === 1);

// 5) ביטוח מנהלים: selector מוגבל לחברה (company field)
const iRow = Object.values(I).find(r => r.eq !== null);
const acctM = { account: 'M1', plan: 'x', kind: 'menahalim', yatzran: iRow.company, tracks: [{ name: 'מסלול כלשהו', balance: 50000 }] };
const optsM = m.selectorOptionsFor(acctM, 'מסלול כלשהו');
chk('menahalim selector scoped to the same insurance company', optsM.status === 'ok' && optsM.options.length > 0 && optsM.options.every(o => I[o.id].company === iRow.company), `n=${optsM.options.length}`);

// 6) סוג מוצר לא נתמך (risk) -> unsupported, לא נזרק
const optsR = m.selectorOptionsFor({ account: 'R1', plan: 'x', kind: 'risk', yatzran: 'y', tracks: [] }, 'x');
chk('risk kind -> unsupported-kind', optsR.status === 'unsupported-kind');

// 7) מסלול עם קוד לא מקבל selector (renderManualSelector מחזיר ריק) ולא מקבל manualMatches
const a7 = acctH(); a7.tracks[0] = { name: gRow.name, code: String(gRow.parentId) + String(gRow.fundId).padStart(7, '0'), balance: 180000 };
const v7 = m.analyzePortfolio({ accounts: [a7], manualMatches: selH });
chk('coded track ignores manualMatches (code identity wins)', v7.holdings[0].match.officialId === gRow.fundId && !v7.holdings[0].match.userSelected);

// 8) סימון התאמת-שם: מיון ראשון + דגל, בלי בחירה אוטומטית
const pRow = Object.values(P).find(r => r.eq !== null && /מגדל מקפת אישית/.test(r.name));
const optsP = m.selectorOptionsFor({ account: 'P1', plan: 'מגדל מקפת אישית', kind: 'pensia', yatzran: 'מגדל חברה לביטוח בע"מ', tracks: [] }, pRow.name);
chk('exact-name option sorted first and flagged, none preselected', optsP.options[0].nameMatch === true && optsP.options.filter(o => o.nameMatch).length === 1);

console.log(fail ? `${fail} FAILURES` : 'ALL PASS', `(${pass} assertions)`);
process.exit(fail ? 1 : 0);
