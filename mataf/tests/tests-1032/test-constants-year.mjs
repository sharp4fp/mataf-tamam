// test-constants-year.mjs - M-069: רשימת הקבועים התלויים בשנה תואמת לקוד, והפס/הניטור מופיעים בתאריכים הנכונים.
import path from 'path';
import fs from 'fs';
import { execFileSync } from 'child_process';
global.window = {};
const ROOT = path.resolve(process.env.BUILD || 'site/js');
const C = await import(path.join(ROOT, 'constants-year.js'));
const A = await import(path.join(ROOT, 'analysis.js'));
const E = await import(path.join(ROOT, 'retire-engine.js'));
const D = await import(path.join(ROOT, 'retire-data.js'));
const app = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
let pass = 0, fail = 0;
const ok = (c, n, d = '') => { if (c) { pass++; console.log('PASS ' + n); } else { fail++; console.log('FAIL ' + n + (d ? ' :: ' + d : '')); } };
const norm = (v) => JSON.stringify(v, (k, x) => x === Infinity ? null : x);

// 1. כל קבוע ברשימה שווה לערך בקוד
const actual = {
    KITZBA_MAZKE_2026: A.KITZBA_MAZKE_2026, 'K.MAZKE': E.K.MAZKE, EXEMPT_CAP_2026: A.EXEMPT_CAP_2026, 'K.GRANT_CAP_PER_YEAR': E.K.GRANT_CAP_PER_YEAR,
    DEATH_CAP_PER_YEAR: E.DEATH_CAP_PER_YEAR, DEFAULT_CONT_CAP_2026: A.DEFAULT_CONT_CAP_2026, SEVERANCE_CEILING_2026: A.SEVERANCE_CEILING_2026,
    TAX_BRACKETS_2026_MONTHLY: A.TAX_BRACKETS_2026_MONTHLY, SURTAX_MONTHLY_THRESHOLD_2026: A.SURTAX_MONTHLY_THRESHOLD_2026,
    SURTAX_RATE_2026: A.SURTAX_RATE_2026, CREDIT_POINT_MONTHLY_2026: A.CREDIT_POINT_MONTHLY_2026,
    'TAX_TABLES (שנה אחרונה)': Math.max(...Object.keys(D.TAX_TABLES).map(Number)),
};
const appMazke = [...app.matchAll(/\bMAZKE = (\d+)/g)].map(m => +m[1]);
actual['MAZKE (app.js)'] = appMazke.length && appMazke.every(v => v === appMazke[0]) ? appMazke[0] : appMazke;
for (const c of C.YEAR_CONSTANTS) ok(c.name in actual && norm(actual[c.name]) === norm(c.value), 'list-matches-code: ' + c.name, norm(actual[c.name]) + ' vs ' + norm(c.value));
ok(appMazke.length >= 2, 'app-js-mazke-occurrences-found', String(appMazke.length));
ok(C.YEAR_CONSTANTS.every(c => c.source && c.label && Number.isInteger(c.validThrough)), 'every-constant-has-source-label-year');

// 2. מצב לפי תאריך
const at = (s) => new Date(s + 'T12:00:00');
ok(C.constantsStatus(at('2026-12-19')).stale.length === 0 && !C.constantsStatus(at('2026-12-19')).reminder, 'status-2026-12-19-ok');
ok(C.constantsStatus(at('2026-12-20')).reminder === true && C.constantsStatus(at('2026-12-20')).stale.length === 0, 'status-2026-12-20-reminder');
ok(C.constantsStatus(at('2027-01-01')).stale.length === C.YEAR_CONSTANTS.length, 'status-2027-01-01-all-stale');
ok(C.staleBannerHtml(at('2026-12-31')) === '', 'banner-hidden-in-2026');
const b = C.staleBannerHtml(at('2027-01-01'));
ok(b.includes('של 2026') && b.includes('ל-2027') && b.includes('לא אומת') && b.includes('תקרת הקצבה המזכה'), 'banner-shown-2027', b.slice(0, 120));
ok(app.includes('${staleBannerHtml()}'), 'banner-rendered-in-app');

// 3. סקריפט הניטור
const script = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../../.github/scripts/check-constants-year.mjs');
if (fs.existsSync(script)) {
    const run = (d) => execFileSync('node', [script, ROOT], { env: { ...process.env, NOW: d, GITHUB_OUTPUT: '' }, encoding: 'utf8' });
    ok(run('2026-12-19').startsWith('state=ok'), 'monitor-2026-12-19-ok');
    ok(run('2026-12-20').startsWith('state=reminder'), 'monitor-2026-12-20-reminder');
    const s27 = run('2027-01-01');
    ok(s27.startsWith('state=stale year=2027') && s27.includes('KITZBA_MAZKE_2026'), 'monitor-2027-01-01-stale-with-list');
} else ok(true, 'monitor-script-not-in-artifact (skipped)');
console.log(`constants-year: PASS=${pass} FAIL=${fail}`);
process.exit(fail ? 1 : 0);
