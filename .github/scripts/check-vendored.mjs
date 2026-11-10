// בדיקת הספריות המועתקות של מתה״פ מול מאגר הפגיעויות OSV (osv.dev).
// קורא את mataf/site/js/VENDORED.json, שואל את OSV על כל ספרייה וגרסה,
// ונכשל אם יש פגיעות שלא תועדה כ"סיכון מקובל" עם הסבר על הנטרול.
// שימוש: node .github/scripts/check-vendored.mjs [path-to-VENDORED.json]
import { readFileSync, existsSync } from 'fs';
import path from 'path';

const manifestPath = process.argv[2] || 'mataf/site/js/VENDORED.json';
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const dir = path.dirname(manifestPath);
let failed = 0;

for (const lib of manifest.libraries) {
    for (const f of lib.files) {
        if (!existsSync(path.join(dir, f))) { console.log(`FAIL ${lib.name}: הקובץ ${f} חסר`); failed++; }
    }
    const res = await fetch('https://api.osv.dev/v1/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version: lib.version, package: { name: lib.name, ecosystem: lib.ecosystem } }),
    });
    if (!res.ok) { console.log(`FAIL ${lib.name}: OSV החזיר ${res.status}`); failed++; continue; }
    const vulns = (await res.json()).vulns || [];
    const accepted = lib.accepted_risks || {};
    const open = vulns.filter(v => !accepted[v.id] && !(v.aliases || []).some(a => accepted[a]));
    console.log(`${open.length ? 'FAIL' : 'OK  '} ${lib.name}@${lib.version}: ${vulns.length} פגיעויות ידועות, ${vulns.length - open.length} מתועדות כמנוטרלות`);
    for (const v of open) {
        console.log(`     - ${v.id} ${(v.aliases || []).join(' ')}: ${v.summary || ''}`);
        failed++;
    }
}
if (failed) {
    console.log(`\n${failed} ממצאים פתוחים. לשדרג את הספרייה, או לנטרל ולתעד ב-accepted_risks עם הסבר.`);
    process.exit(1);
}
console.log('\nכל הספריות נקיות או מנוטרלות ומתועדות.');
