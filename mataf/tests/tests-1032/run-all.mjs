// run-all.mjs <artifact-root-js-dir>
// מריץ את כל סוויטות הבדיקה שבתיקייה זו מול עץ js של הארטיפקט (ברירת מחדל: אין - חובה לציין נתיב).
// כל סוויטה חייבת: exit code 0, אפס שורות FAIL, ולפחות שורת PASS אחת מפוענחת (יציאה שקטה אינה עוברת).
// ריצה: node tests/run-all.mjs js
import { execFileSync } from 'child_process';
import path from 'path';
const ROOT = process.argv[2] ? path.resolve(process.argv[2]) : '';
if (!ROOT) { console.error('usage: node run-all.mjs <artifact-root-js-dir>'); process.exit(2); }
const here = path.dirname(new URL(import.meta.url).pathname);
const suites = [
    ['test-persist', here + '/test-persist.mjs'],
    ['test-mekadem-infer', here + '/test-mekadem-infer.mjs'],
    ['test-tonum', here + '/test-tonum.mjs'],
    ['test-diff-prev', here + '/test-diff-prev.mjs'],
    ['test-manual-select', here + '/test-manual-select.mjs'],
    ['test-geo', here + '/test-geo.mjs'],
    ['test-analysis', here + '/test-analysis.mjs'],
    ['uitest2', here + '/uitest2.mjs'],
    ['test-movement', here + '/test-movement.mjs'],
    ...['r1','r2','r3','bug1','bug2','bug3','bug4','dupkey','gemel-solver','s1','s2b','s3'].map(n => ['repro:' + n, here + '/suites/repro/' + n + '.mjs']),
    ...['p1','m1','m2','m3','m4','m4v2','m5','m6','m7','m8','m9','m10v2','m11','m12v2','m13v2','m14'].map(n => ['checks:' + n, here + '/suites/checks/' + n + '.mjs']),
    ['test-dedupe', here + '/test-dedupe.mjs'],
    ['test-mekadem-adj-integrity', here + '/test-mekadem-adj-integrity.mjs'],
    ['test-f161-bind', here + '/test-f161-bind.mjs'],
    ['test-alt-baseline', here + '/test-alt-baseline.mjs'],
    ['test-critical-fixes', here + '/test-critical-fixes.mjs'],
    ['test-retire-engine', here + '/test-retire-engine.mjs'],
    ['test-assets', here + '/test-assets.mjs'],
];
let bad = 0;
for (const [name, file] of suites) {
    let out = '', code = 0;
    try { out = execFileSync('node', [file], { env: { ...process.env, BUILD: ROOT }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); }
    catch (e) { code = e.status ?? 1; out = (e.stdout || '') + (e.stderr || ''); }
    const passes = (out.match(/^PASS/gm) || []).length;
    const fails = (out.match(/^FAIL/gm) || []).length;
    const ok = code === 0 && fails === 0 && passes > 0;
    if (!ok) bad++;
    console.log(`${ok ? 'OK  ' : 'BAD '} ${name.padEnd(20)} exit=${code} PASS=${passes} FAIL=${fails}`);
}
console.log(bad ? `${bad} SUITES BAD` : `ALL ${suites.length} SUITES OK`);
process.exit(bad ? 1 : 0);
