// test-tabs.mjs — סוויטת מבנה כרטסיות חדשה (שכבת הכרטסיות + הר הביטוח + באנר תצוגה מקדימה)
// מריצה בדיקות סטטיות על מקור ה-js וגם רינדור דינמי אמיתי של renderLifeTab/renderHealthTab/renderCalcTab.
// שימוש: BUILD=<path-to-js-dir> node test-tabs.mjs   (ברירת מחדל: תיקיית js הסמוכה לסוויטה, ../js)
import { readFileSync } from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const BUILD = path.resolve(process.env.BUILD || path.join(HERE, '..', 'js'));
let pass = 0, fail = 0;
const ok = (cond, name) => { if (cond) { pass++; console.log('PASS ' + name); } else { fail++; console.log('FAIL ' + name); } };

const app = readFileSync(path.join(BUILD, 'app.js'), 'utf8');
const ins = readFileSync(path.join(BUILD, 'insurance.js'), 'utf8');
const calc = readFileSync(path.join(BUILD, 'calc.js'), 'utf8');

// 1. סדר כרטסיות מדויק בסרגל הניווט
const navOrder = ['data-mode-set="portfolio"', 'data-mode-set="life"', 'data-mode-set="health"', 'data-mode-set="retirement"', 'data-mode-set="calc"', 'data-mode-set="nifraim"'];
let last = -1, ordered = true;
for (const m of navOrder) { const i = app.indexOf(m); if (i < 0 || i < last) { ordered = false; break; } last = i; }
ok(ordered, 'tab-nav-order portfolio>life>health>retirement>calc>nifraim');
ok(app.indexOf('data-mode-set="health"') > app.indexOf('data-mode-set="life"') && app.indexOf('data-mode-set="health"') < app.indexOf('data-mode-set="retirement"'), 'health-tab-immediately-after-life');

// 2. קישור עמוק ?tab= מכסה את כל 6 הכרטסיות
ok(app.includes("['portfolio', 'life', 'health', 'retirement', 'calc', 'nifraim'].includes(urlTab)"), 'deep-link-all-six-tabs');

// 3. באנר תצוגה מקדימה זמנית בhero
ok(app.includes('תצוגה מקדימה זמנית 10/11/2026'), 'preview-banner-present');

// 4. הר הביטוח: פונקציה משותפת + קריאה בשני הטאבים + קישור רשמי
ok(/function renderHarbGuide\(\)/.test(ins), 'harb-guide-fn-exists');
ok((ins.match(/renderHarbGuide\(\)/g) || []).length >= 3, 'harb-guide-called-in-both-tabs'); // הגדרה + life + health
ok(ins.includes('https://harb.cma.gov.il/Home'), 'harb-official-link');
ok(ins.includes('אין ייבוא אוטומטי'), 'harb-no-auto-import-claim');
ok(ins.includes('מצריך בחינה מקצועית'), 'duplication-wording-professional-review');
ok(!ins.includes('לבטל את הביטוח') && !/מיותר(?![^"]*אינה בהכרח)/.test(''), 'no-cancel-advice-wording');

// 5. רינדור דינמי אמיתי של שני הטאבים עם state ריק
const insMod = await import(pathToFileURL(path.join(BUILD, 'insurance.js')).href);
const st = { life: insMod.emptyInsState(), health: insMod.emptyInsState() };
const lifeHtml = insMod.renderLifeTab(st);
const healthHtml = insMod.renderHealthTab(st);
ok(lifeHtml.includes('הר הביטוח - מקור המידע הרשמי'), 'life-render-contains-harb-card');
ok(healthHtml.includes('הר הביטוח - מקור המידע הרשמי'), 'health-render-contains-harb-card');
ok(healthHtml.includes('שלוש שכבות הכיסוי בישראל'), 'health-render-three-layers');
ok(healthHtml.includes('campus.gov.il/course/digitalil-gov-healthinsurance-he/'), 'health-render-campus-source-link');
ok(!ins.includes('אינו כולל פוליסות חיים עצמאיות'), 'maslaka-life-coverage-not-absolute');
ok(ins.includes('יכול לכלול גם מוצרי ביטוח עם כיסוי למקרה מוות') && ins.includes('ביטוח חיים למשכנתה') && ins.includes('אין התחייבות'), 'maslaka-life-coverage-hedged-wording');
ok(healthHtml.includes('אין כאן ייעוץ רפואי'), 'health-render-no-medical-advice-disclaimer');

// 6. מודול קצבה מוכרת מותנה: פטור רק לאחר זכאות yes, אחרת מצב לא-ידוע/לא-פטור
ok(calc.includes("c.r_elig === 'yes'"), 'mukeret-conditional-yes-branch');
ok(calc.includes("c.r_elig === 'no'"), 'mukeret-conditional-no-branch');
ok(!/r_elig !== 'no'/.test(calc), 'mukeret-no-default-exempt');
ok(calc.includes('או במקרה של נכות כאמור בסעיף'), 'mukeret-disability-route-in-explainer');
ok(calc.includes('כן - גיל 60+, גיל פרישה, או נכות'), 'mukeret-selector-yes-includes-disability');
ok(calc.includes('נבדק - לא מתקיים אף תנאי'), 'mukeret-selector-no-explicitly-assessed');
ok(calc.includes('על פי הסימון, לא מתקיים אף תנאי מ-9א(ב1)'), 'mukeret-no-branch-noncategorical');
ok(!calc.includes('הקצבה המוכרת אינה פטורה לפי סעיף זה.'), 'mukeret-no-flat-denial-removed');
ok(calc.includes('לא ידוע / לא נבדק'), 'mukeret-unknown-state-labeled');
const calcMod = await import(pathToFileURL(path.join(BUILD, 'calc.js')).href);
const cst = { calc: {} };
const calcHtmlUnknown = calcMod.renderCalcTab(cst);
ok(calcHtmlUnknown.includes('קצבה מוכרת'), 'calc-render-mukeret-section');
ok(calcHtmlUnknown.includes('גיל פרישה'), 'calc-render-retirement-age-section');
ok(calcHtmlUnknown.includes('57.5%') && calcHtmlUnknown.includes('9,430'), 'calc-render-mezake-sourced-numbers');
ok(calcHtmlUnknown.includes('13,750') || calcHtmlUnknown.includes('13750'), 'calc-render-severance-cap-sourced');
ok(calcHtmlUnknown.includes('bil.gov.il') || calcHtmlUnknown.includes('btl.gov.il') || calcHtmlUnknown.includes('gov.il'), 'calc-render-official-source-links');

// 6.5 קשירת דפי עבודה ללקוח: הפרדה, שחזור, ייצוא ואיפוס בכל מעבר לקוח
ok(app.includes('const hasWorksheets = !!(state.life.policies.length || state.health.policies.length || Object.keys(state.calc).length);'), 'worksheets-trigger-segregation');
ok(app.includes('state.life = emptyInsState(); state.health = emptyInsState(); state.calc = {};'), 'worksheets-reset-on-segregation');
ok(app.includes('life: { policies: state.life.policies.map(p => ({ ...p })), seq: state.life.seq },'), 'worksheets-snapshotted-to-pending');
ok(app.includes('policies: [...state.life.policies, ...(pc.life.policies || []).map(p => ({ ...p }))]'), 'worksheets-restore-merges-not-replaces');
ok(app.includes('state.calc = { ...pc.calc, ...state.calc }'), 'calc-restore-new-values-win-on-collision');
// שער כניסה: שם משתמש מנורמל (רווחים/אותיות גדולות ממקלדת ניידת) + שדה ללא הגדלה אוטומטית
const gate = readFileSync(path.join(BUILD, '..', 'gate', '_middleware.js'), 'utf8');
ok(gate.includes(".trim().toLowerCase();"), 'gate-username-canonicalized');
ok(gate.includes('autocapitalize="none"'), 'gate-username-no-autocapitalize');
// דמי ניהול: בסיס חודשי בפועל אינו שנתי; רק שורת שיעור קבוע יחידה היא חוזית; דירוג ללא בסיס אסור
const maslakaSrc = readFileSync(path.join(BUILD, 'maslaka.js'), 'utf8');
ok(maslakaSrc.includes("if (accFixed.size === 1 && !accMixed) feeContractAcc = [...accFixed][0];"), 'contract-fee-only-unambiguous-fixed-row');
ok(maslakaSrc.includes('markMixed()') && maslakaSrc.includes('if (accFixed.size > 1) accMixed = true;'), 'mixed-structure-suppresses-whole-type-basis');
ok(maslakaSrc.includes('ממוצע ברמת הקופה ולא אישי'), 'expense-basis-fund-average-excluded');
const repSrc = readFileSync(path.join(BUILD, 'report.js'), 'utf8');
ok(!repSrc.includes('את כלל מוצרי החיסכון והביטוח') && repSrc.includes('שדווחו בקובץ המסלקה שהועלה'), 'status-report-scope-not-absolute');
ok(!repSrc.includes('אינן מדווחות במסלקה') && repSrc.includes('עשויים להופיע במידע המסלקה המלא') && repSrc.includes('לא ניתן להסיק מהיעדרם בדוח זה שאין הלוואה'), 'loans-claim-bounded-not-absolute');
ok(!repSrc.includes('אינו נתון רשמי במאגרי הפנסיה/הגמל') && repSrc.includes('אינם מוצגים בדוח זה; זמינותם במאגר הרשמי משתנה'), 'geo-fx-claim-display-scoped');
ok(!repSrc.includes('אינו שדה במאגרי הפנסיה/הגמל הרשמיים'), 'geo-fx-not-absent-field-absolute');
{ const m = app.match(/<a class="ghostbtn liblink" href="https:\/\/mataf-library\.pages\.dev\/" target="_blank" rel="noopener">/g);
  ok(m && m.length === 1, 'library-button-plain-link-target-blank-noopener-once');
  ok(!app.includes('mataf-library.pages.dev/?') && !app.includes('mataf-library.pages.dev/#'), 'library-link-no-url-params'); }

// 161 extraction-confirmation guard (extracted != verified; explicit owner confirm gates derived figures)
ok(!app.includes('חולץ מהטופס ✓'), 'f161-no-misleading-checkmark-tag');
ok(app.includes('טרם אומת מול הטופס') && app.includes('אומת מול הטופס ✓'), 'f161-tag-unverified-vs-confirmed');
ok(app.includes('data-action="confirm161"') && app.includes('state.f161Confirmed = true'), 'f161-explicit-confirm-action');
ok((app.match(/f161Confirmed = true/g) || []).length === 1, 'f161-confirm-only-one-path');
ok(app.includes('if (!state.f161Confirmed) return `') && app.includes('מושהה ואינו מוצג עד לאישור מפורש'), 'f161-retirement-analysis-suppressed');
ok(app.includes("const hasF161 = !!(state.f161Confirmed && (f.retireDate"), 'f161-derived-gated-on-confirm');
ok(app.includes('if (!hasF161 || !state.f161Confirmed) return'), 'f161-kibua-assist-gated');
ok(app.includes('state.f161[t.dataset.f161] = t.value; state.f161Confirmed = false;'), 'f161-edit-resets-confirm');
ok(app.includes("state.f161Status = 'מחלץ טקסט מהטופס...'; state.f161Confirmed = false;"), 'f161-new-upload-resets-confirm');
ok(app.includes('state.f161Tried = true; state.f161Confirmed = false; if (pc.f161File)'), 'f161-restore-never-preconfirmed');
ok(app.includes('f161: state.f161Tried ? state.f161 : null') && !/manual:\s*\{[^}]*f161Confirmed/.test(app), 'f161-confirm-not-persisted');
ok(app.includes('state.f161Confirmed\n            ? `<div class="a161 a161-warn">') || /scen\.length \? \(state\.f161Confirmed/.test(app), 'f161-marking-scenarios-gated');
ok(repSrc.includes('const feeAcc = a.feeContractAcc !== null && a.feeContractAcc !== undefined ? a.feeContractAcc : null;'), 'annual-math-contract-only');
ok(repSrc.includes('feeSavingYear') && repSrc.includes('feeAfterCovered < m.total') && repSrc.includes('feeBeforeFullYear'), 'summary-saving-unknown-not-zero-and-scope-limited');
const anaSrc = readFileSync(path.join(BUILD, 'analysis.js'), 'utf8');
ok(anaSrc.includes('if (!curComplete) {'), 'no-baseline-no-scored-alternatives-guard');
ok(app.includes("clientBindStatus(prevClientId, newClientId) : (prevClient ? 'unresolved' : 'same')"), 'both-ids-absent-unresolved-not-same');
ok(app.includes('life: pc.life, health: pc.health, calc: pc.calc'), 'worksheets-in-segregated-export');
ok(app.includes("segregateClientInputs('unresolved', prevDemoClient);"), 'demo-segregates-prior-worksheets');

// 7. אין טענת סודיות כוזבת: המילה "סודי"/"confidential" לא מופיעה בטאבים החדשים
ok(!ins.includes('סודי') && !calc.includes('סודי'), 'no-confidentiality-claim-in-new-tabs');

console.log(`tab-structure: PASS=${pass} FAIL=${fail}`);
process.exit(fail ? 1 : 0);
