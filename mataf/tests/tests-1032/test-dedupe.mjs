// test-dedupe.mjs - כפילויות ייבוא
// היסטוריה (09/11/2026 22:14): מנגנון בחירת-גרסה (conflictResolutions/מושהות) הוחלף בדחייה מלאה של רשומות מתנגשות לפני החישוב + rejectedImports; סעיפים 3-3c שוכתבו לסמנטיקה החדשה.
// היסטוריה 21:50: קונפליקט באותו תאריך מושהה מהצבירה עד בחירת משתמש + בדיקות סתירה לזיהוי שם מדויק  21:44). (מקור 09/11/2026): זהות=יצרן+חשבון+סוג מוצר, דוח=תאריך ערך.
// עותק זהה->דילוג+ספירה גלויה; תאריך שונה->עדכני נטען; אותו תאריך מתנגש->שתיהן נטענות ומסומנות, מפתחות ייחודיים.
const B = process.env.BUILD || new URL('../js/', import.meta.url).pathname;
global.window = {};
await import(B + '/joinable-extra.js');
const m = await import(B + '/analysis.js');
const { OFFICIAL_PENSION: P } = await import(B + '/official.js');
let pass = 0, fail = 0;
const chk = (l, c, x = '') => { console.log((c ? 'PASS ' : 'FAIL ') + l + (x ? ' :: ' + x : '')); c ? pass++ : fail++; };
const tr = (id, bal) => ({ name: P[id].name, code: String(P[id].parentId) + String(id).padStart(7, '0'), balance: bal });
const acct = (account, kind, tracks, extra = {}) => ({ account, kind, plan: 'x', yatzran: 'y', sugMutzar: '2', asOf: '20251031', ...extra, tracks });
const clone = a => ({ ...a, tracks: a.tracks.map(t => ({ ...t })) });

// 1) עותקים זהים (אותה מסלקה פעמיים): לא מכפיל, נספר גלוי
const one = [acct('POL-1', 'pensia', [tr(2142, 100000)]), acct('POL-2', 'pensia', [tr(9647, 200000)])];
const dup = [...one, ...one.map(clone)];
const v1 = m.analyzePortfolio({ accounts: one.map(clone) });
const v2 = m.analyzePortfolio({ accounts: dup });
chk('identical duplicates skipped - no double counting', Math.abs(v2.totalValue - v1.totalValue) < 1e-6, `single=${v1.totalValue} dup=${v2.totalValue}`);
chk('skip count visible in import notes', v2.importNotes.length === 2 && v2.importNotes.every(n => /דולגו 1/.test(n)), JSON.stringify(v2.importNotes));
chk('no notes when nothing duplicated', v1.importNotes.length === 0);

// 2) תאריכי ערך שונים: העדכני נטען, הקודם מדולג עם תאריכים גלויים
const oldR = acct('POL-9', 'pensia', [tr(2142, 50000)], { asOf: '20250831' });
const newR = acct('POL-9', 'pensia', [tr(2142, 70000)], { asOf: '20251031' });
const v3 = m.analyzePortfolio({ accounts: [oldR, newR] });
chk('newer report wins, total = newest only', Math.abs(v3.totalValue - 70000) < 1e-6, `total=${v3.totalValue}`);
chk('provenance note names both dates', v3.importNotes.length === 1 && /20251031/.test(v3.importNotes[0]) && /20250831/.test(v3.importNotes[0]), v3.importNotes[0]);

// 3) אותו תאריך ערך, תוכן שונה: החשבון נדחה לחלוטין מהחישוב לפני כל צבירה; הגרסאות נשמרות
// כפי שהן ברשימת rejectedImports (ללא סכום מצרפי - סכום גרסאות חלופיות אינו שווי נכסים);
// אין מנגנון בחירת-גרסה - המשתמש מעלה קובץ אחד לא-חופף. חשבון אחר באותו קובץ נטען כרגיל.
const c1 = acct('POL-7', 'pensia', [tr(2142, 50000)]);
const c2 = acct('POL-7', 'pensia', [tr(2105, 60000)]);
const other = acct('POL-8', 'pensia', [tr(2142, 20000)]);
const p4 = { accounts: [c1, c2, other] };
const v4 = m.analyzePortfolio(p4);
chk('conflicting same-date records rejected before calculation - no holdings from them', v4.holdings.every(h => h.account.account !== 'POL-7'));
chk('rejected versions preserved verbatim with balances (no silent discard)', v4.rejectedImports.length === 1 && v4.rejectedImports[0].versions.length === 2 && v4.rejectedImports[0].versions.map(x => x.balance).sort((a, b) => a - b).join(',') === '50000,60000', JSON.stringify(v4.rejectedImports));
chk('only the non-conflicting account counted', Math.abs(v4.totalValue - 20000) < 1e-6, `total=${v4.totalValue}`);
chk('no summed blocked value exposed as asset figure', !('blockedConflictValue' in v4));
chk('rejection note is actionable (re-upload single non-overlapping file)', v4.importNotes.some(n => /נדחה מהחישוב/.test(n) && /קובץ אחד לא-חופף/.test(n)), v4.importNotes.join(' / '));
chk('rejected records never reach planning set', m.includedHoldingsOf(v4.holdings, {}, {}).every(x => x.h.account.account !== 'POL-7'));
// 3b) אידמפוטנטיות דחייה: ניתוח חוזר על אותו תיק שומר את רשימת הדחיות ואינו כופל אותה
const v4b = m.analyzePortfolio(p4);
chk('re-analysis keeps the same rejection list (idempotent)', v4b.rejectedImports.length === 1 && Math.abs(v4b.totalValue - 20000) < 1e-6, `rej=${v4b.rejectedImports.length} total=${v4b.totalValue}`);
// 3c) לאחר העלאת גרסה אחת נקייה - החשבון נטען ונספר רגיל
const v4c = m.analyzePortfolio({ accounts: [acct('POL-7', 'pensia', [tr(2142, 50000)]), acct('POL-8', 'pensia', [tr(2142, 20000)])] });
chk('clean re-upload loads the account normally', Math.abs(v4c.totalValue - 70000) < 1e-6 && v4c.rejectedImports.length === 0);

// 4) רשומה ללא מספר חשבון לעולם אינה מקובצת/מדולגת
const a1 = acct('', 'pensia', [tr(2142, 10000)]);
const a2 = acct('', 'pensia', [tr(2142, 10000)]);
const v5 = m.analyzePortfolio({ accounts: [a1, a2] });
chk('no account number -> never deduped', Math.abs(v5.totalValue - 20000) < 1e-6 && v5.importNotes.length === 0);

// 5) אידמפוטנטיות: ניתוח חוזר על אותו תיק (recompute) לא משנה תוצאה ולא מייצר הערות חדשות
const p6 = { accounts: [...one.map(clone), ...one.map(clone)] };
const va = m.analyzePortfolio(p6), vb = m.analyzePortfolio(p6);
chk('re-analysis idempotent (same total, no repeated notes)', Math.abs(va.totalValue - vb.totalValue) < 1e-6 && vb.importNotes.length === 0, `notes2=${vb.importNotes.length}`);

// 6) מחיצת הסולבר נשמרת לאחר דה-דופ (m6): כל שקל בדיוק פעם אחת
const inc = m.includedHoldingsOf(v2.holdings, {}, {});
chk('solver ledger partition intact after dedup', Math.abs(inc.reduce((s, x) => s + x.bal, 0) - v2.totalValue) < 1e-6);

// 7) אין שיוך זהות אוטומטי לפי שם כלל - גם שם רשמי מדויק; הבחירה הידנית מסוננת לאותה חברה+מוצר
const bondRow = Object.values(P).find(r => /מגדל מקפת אישית אשראי/.test(r.name));
const mkY = (no, yz, plan) => ({ account: no, kind: 'pensia', plan, yatzran: yz, tracks: [{ name: bondRow.name, balance: 1000 }] });
const okY = m.analyzePortfolio({ accounts: [mkY('B1', 'מגדל חברה לביטוח בע"מ', 'מגדל מקפת אישית')] });
chk('exact official name never auto-resolves (consistent provider)', !okY.holdings[0].match.row && okY.holdings[0].equityPct === null, JSON.stringify(okY.holdings[0].equityPct));
const badY = m.analyzePortfolio({ accounts: [mkY('B2', 'הפניקס חברה לביטוח', 'מגדל מקפת אישית')] });
chk('exact name never auto-resolves (other provider)', !badY.holdings[0].match.row && badY.holdings[0].equityPct === null);
const noY = m.analyzePortfolio({ accounts: [mkY('B4', '', 'x')] });
chk('exact name never auto-resolves (unknown provider)', !noY.holdings[0].match.row && noY.holdings[0].equityPct === null);
const selOk = m.selectorOptionsFor(mkY('B1', 'מגדל חברה לביטוח בע"מ', 'מגדל מקפת אישית'), bondRow.name);
chk('selector scoped to same company+product: true row offered, marked name-match only', selOk.status === 'ok' && selOk.options.some(o => o.id === bondRow.fundId) && selOk.options[0].nameMatch === true && selOk.options.every(o => /מגדל/.test(o.name)), `n=${selOk.options.length}`);
const selBad = m.selectorOptionsFor(mkY('B2', 'הפניקס חברה לביטוח', 'הפניקס פנסיה מקיפה'), bondRow.name);
chk('selector never offers another company track', selBad.status !== 'ok' || !selBad.options.some(o => o.id === bondRow.fundId));
const selNone = m.selectorOptionsFor(mkY('B4', '', 'x'), bondRow.name);
chk('unknown provider -> unresolved, not widened across companies', selNone.status === 'unresolved-company' && selNone.options.length === 0);
const selPlan = m.selectorOptionsFor(mkY('B5', 'מגדל חברה לביטוח בע"מ', 'מגדל מקפת משלימה'), bondRow.name);
chk('product filter: משלימה account not offered מקיפה tracks', selPlan.status !== 'ok' || selPlan.options.every(o => /משלימה/.test(o.name)));

console.log(`${pass} PASS, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
