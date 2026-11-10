// בדיקות אתר הספרייה אחרי בנייה. שימוש: node mataf/library-site/test.mjs <dist>
// כל בדיקה מדפיסה PASS/FAIL; יציאה 1 אם יש כשל.
import fs from 'fs';
import path from 'path';
import { normalize, search, snippet } from './src/search-core.js';

const OUT = path.resolve(process.argv[2] || 'mataf/library-site/dist');
let fails = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' - ' + detail : ''}`); if (!ok) fails++; };
const J = p => JSON.parse(fs.readFileSync(path.join(OUT, p), 'utf8'));

// מבנה
for (const f of ['index.html', 'app.js', 'search-core.js', 'style.css', '_headers', '_worker.js', 'gate/_middleware.js', 'css/heebo.css', 'data/sources.json', 'data/index.json', 'data/map.html', 'data/build.json'])
    check('קובץ קיים: ' + f, fs.existsSync(path.join(OUT, f)));

// שער כניסה: אותו שער של מתה"פ, נכשל סגור, כותרת הספרייה
const gate = fs.readFileSync(path.join(OUT, 'gate/_middleware.js'), 'utf8');
check('שער: כותרת הספרייה', gate.includes('ספריית המקורות - מתה"פ'));
check('שער: נכשל סגור בלי סודות', gate.includes("if (!env.AUTH_SECRET || !env.AUTH_HASH_OWNER || !env.AUTH_SALT_OWNER)"));
check('שער: הגבלת ניסיונות (D1)', gate.includes('AUTH_LIMITS'));
const headers = fs.readFileSync(path.join(OUT, '_headers'), 'utf8');
check('CSP: בלי unsafe-inline ובלי צד שלישי', /script-src 'self';/.test(headers) && !headers.includes('unsafe') && !/https?:\/\//.test(headers.replace(/Strict-Transport-Security.*/,'')));

// מקורות
const sources = J('data/sources.json');
check('23 מקורות לפחות', sources.length >= 23, String(sources.length));
for (const s of sources) {
    const pages = J(`data/pages/${s.id}.json`);
    check(`מקור ${s.id}: עמודים`, Array.isArray(pages) && pages.length === s.pages && pages.length > 0, `${pages.length}`);
    check(`מקור ${s.id}: PDF קיים`, !!s.pdf && fs.existsSync(path.join(OUT, s.pdf)));
    check(`מקור ${s.id}: סיווג`, !!s.source_class_he && !!s.text_class_he);
}

// חיפוש: מונחים שחייבים להימצא במקור הנכון
const norm = Object.fromEntries(sources.map(s => [s.id, J(`data/pages/${s.id}.json`).map(normalize)]));
const expect = [
    ['פיצויי פיטורים', 'severance-pay-law-btl'],
    ['קיבוע זכויות', 'tax-161d-2026'],
    ['שנות פריסה', 'ito-circular-2-2022'],
    ['רצף פיצויים', 'form161-official-currentlink20261109'],
    ['ניתוחים', 'moh-health-surgery-report-2026'],
];
for (const [q, id] of expect) {
    const hits = search(norm, q, { limit: 50 });
    check(`חיפוש "${q}" מוצא את ${id}`, hits.some(x => x.sourceId === id), `${hits.length} תוצאות`);
}
check('חיפוש עם תחילית ("והפיצויים" נמצא ב"פיצויים")', search(norm, 'פיצויים', { limit: 5 }).length > 0);
check('חיפוש ריק מחזיר כלום', search(norm, '   ').length === 0);
check('מילה שלא קיימת - אין תוצאות', search(norm, 'איןמילהכזאתבספריה').length === 0);
const sn = snippet('טקסט לפני מענק פרישה פטור טקסט אחרי', 'מענק');
check('קטע תצוגה מסמן את ההתאמה', sn.some(p => p.hit && p.text === 'מענק'));

// אינדקס ומפה
const idx = J('data/index.json');
check('אינדקס: 193 נושאים ו-29 תחומים', idx.topics.length === 193 && idx.domains.length === 29, `${idx.topics.length}/${idx.domains.length}`);
check('אינדקס: 72 משפחות מקורות', idx.manifest.length === 72, String(idx.manifest.length));
const map = fs.readFileSync(path.join(OUT, 'data/map.html'), 'utf8');
check('מפה: נבנתה עם טבלאות', map.includes('<table>') && map.includes('מקורות מקוריים'));
check('מפה: אין תגיות script', !/<script/i.test(map));

// מגבלות Cloudflare Pages
const all = []; const walk = d => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); e.isDirectory() ? walk(p) : all.push(p); } }; walk(OUT);
const big = all.filter(p => fs.statSync(p).size > 25 * 1024 * 1024);
check('אין קובץ מעל 25MB', big.length === 0, big.join(', '));
check('פחות מ-20,000 קבצים', all.length < 20000, String(all.length));

console.log(fails ? `${fails} FAIL` : `ALL PASS (${all.length} files)`);
process.exit(fails ? 1 : 0);
