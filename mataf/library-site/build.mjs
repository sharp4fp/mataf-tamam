// בניית אתר ספריית המקורות מתוך המאגר. בלי תלויות חיצוניות (Node 20+, tar).
// שימוש: node mataf/library-site/build.mjs [תיקיית-פלט]   (ברירת מחדל: mataf/library-site/dist)
// מקור האמת: mataf/knowledge/sources/mataf-library-20261109/catalog/sources.json, אינדקס המקצוע 1.3
// ו-mataf/knowledge/LIBRARY-MAP-HE.md. כל מסמך שנוסף לקטלוג מופיע באתר בבנייה הבאה.
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MATAF = path.resolve(HERE, '..');
const LIB = path.join(MATAF, 'knowledge/sources/mataf-library-20261109');
const OUT = path.resolve(process.argv[2] || path.join(HERE, 'dist'));
const IDX = path.join(LIB, 'profession-index/v1.3-20261110');

const rd = p => fs.readFileSync(p, 'utf8');
const wj = (p, o) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify(o)); };
const cp = (a, b) => { fs.mkdirSync(path.dirname(b), { recursive: true }); fs.copyFileSync(a, b); };

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

// 1. קבצי האתר, גופנים ושער הכניסה (אותו שער של מתה"פ, כותרת הספרייה)
for (const f of fs.readdirSync(path.join(HERE, 'src'))) cp(path.join(HERE, 'src', f), path.join(OUT, f));
cp(path.join(MATAF, 'site/css/heebo.css'), path.join(OUT, 'css/heebo.css'));
for (const f of fs.readdirSync(path.join(MATAF, 'site/fonts'))) cp(path.join(MATAF, 'site/fonts', f), path.join(OUT, 'fonts', f));
const gate = rd(path.join(MATAF, 'site/gate/_middleware.js'))
    .replace('<title>כניסה - מתה"פ</title>', '<title>כניסה - ספריית המקורות</title>')
    .replace('<h1>מתה"פ - מערכת תומכת החלטה פנסיונית</h1>', '<h1>ספריית המקורות - מתה"פ</h1>')
    .replace('background:#10243e', 'background:#0f3b32').replace('border-top:4px solid #c9a227', 'border-top:4px solid #c6a564')
    .replace(/color:#10243e/g, 'color:#0f3b32').replace('background:#10243e;color:#fff', 'background:#0f3b32;color:#fff')
    .replace('button:hover{background:#1a3362}', 'button:hover{background:#164c41}');
if (!gate.includes('ספריית המקורות - מתה"פ')) throw new Error('gate title replacement failed');
fs.mkdirSync(path.join(OUT, 'gate'), { recursive: true });
fs.writeFileSync(path.join(OUT, 'gate/_middleware.js'), gate);
cp(path.join(MATAF, 'site/_worker.js'), path.join(OUT, '_worker.js'));

// 2. מקורות: טקסט לפי עמוד + PDF
const catalog = JSON.parse(rd(path.join(LIB, 'catalog/sources.json')));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lib-'));
const archives = new Set(catalog.filter(s => s.pdf_archive).map(s => path.resolve(LIB, s.pdf_archive)));
for (const a of archives) execFileSync('tar', ['-xzf', a, '-C', tmp, '--wildcards', '*.pdf']);
const findInTmp = name => {
    const walk = d => { for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) { const r = walk(p); if (r) return r; } else if (e.name === name) return p;
    } return null; };
    return walk(tmp);
};

const sources = [];
let totalPages = 0;
for (const s of catalog) {
    let pages = rd(path.resolve(LIB, s.text_path)).split('\f');
    while (pages.length && !pages[pages.length - 1].trim()) pages.pop();
    if (s.pdf_pages && pages.length < s.pdf_pages) pages = pages.concat(Array(s.pdf_pages - pages.length).fill(''));
    wj(path.join(OUT, 'data/pages', s.id + '.json'), pages);
    totalPages += pages.length;
    let pdfSrc = s.pdf_path ? path.resolve(LIB, s.pdf_path) : (s.pdf_archive_member ? findInTmp(s.pdf_archive_member) : null);
    let pdf = null;
    if (pdfSrc && fs.existsSync(pdfSrc)) { pdf = 'pdf/' + s.id + '.pdf'; cp(pdfSrc, path.join(OUT, pdf)); }
    sources.push({
        id: s.id, title: s.title, publisher: s.publisher || null, edition: s.edition || null, url: s.url || null,
        retained_on: s.retained_on || null, effective_scope: s.effective_scope || null, verification: s.verification || '',
        source_class: s.source_class, source_class_he: s.source_class_he, text_class: s.text_class, text_class_he: s.text_class_he,
        checked_pages: s.checked_pages || [], pdf, pages: pages.length, sha256: s.sha256 || null,
    });
}
fs.rmSync(tmp, { recursive: true, force: true });
wj(path.join(OUT, 'data/sources.json'), sources);

// 3. אינדקס המקצוע 1.3
const idx = JSON.parse(rd(path.join(IDX, 'profession-index.json')));
const manifest = JSON.parse(rd(path.join(IDX, 'collection-manifest.json')));
wj(path.join(OUT, 'data/index.json'), {
    title: idx.title, version: idx.version, as_of: idx.as_of, purpose: idx.purpose, scope: idx.scope,
    counts: idx.counts, completion_statement: idx.completion_statement, status_legend: idx.status_legend,
    quality_gate: idx.quality_gate, domains: idx.domains, topics: idx.topics, priority_queue: idx.priority_queue,
    manifest: Array.isArray(manifest) ? manifest : (manifest.collection_manifest || manifest.families || []),
});

// 4. מפת הספרייה (Markdown פשוט ל-HTML; כל הטקסט עובר escape)
const esc = t => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const inline = t => esc(t).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
function md(src) {
    const out = []; const lines = src.split('\n'); let i = 0;
    while (i < lines.length) {
        const l = lines[i];
        if (/^#{1,4} /.test(l)) { const n = l.match(/^#+/)[0].length; out.push(`<h${n + 1}>${inline(l.slice(n + 1))}</h${n + 1}>`); i++; continue; }
        if (l.startsWith('|')) {
            const rows = []; while (i < lines.length && lines[i].startsWith('|')) rows.push(lines[i++]);
            const cells = r => r.replace(/^\||\|$/g, '').split('|').map(c => c.trim());
            const body = rows.filter((_, k) => k !== 1);
            out.push('<div class="tblwrap"><table><thead><tr>' + cells(body[0]).map(c => `<th>${inline(c)}</th>`).join('') + '</tr></thead><tbody>' +
                body.slice(1).map(r => '<tr>' + cells(r).map(c => `<td>${inline(c)}</td>`).join('') + '</tr>').join('') + '</tbody></table></div>');
            continue;
        }
        if (/^\s*- /.test(l)) {
            const items = []; while (i < lines.length && /^\s*(- |  )/.test(lines[i]) && lines[i].trim()) {
                if (/^\s*- /.test(lines[i])) items.push(lines[i].replace(/^\s*- /, '')); else items[items.length - 1] += ' ' + lines[i].trim();
                i++;
            }
            out.push('<ul>' + items.map(x => `<li>${inline(x)}</li>`).join('') + '</ul>'); continue;
        }
        if (!l.trim()) { i++; continue; }
        const para = []; while (i < lines.length && lines[i].trim() && !/^(#|\||\s*- )/.test(lines[i])) para.push(lines[i++]);
        out.push(`<p>${inline(para.join(' '))}</p>`);
    }
    return out.join('\n');
}
fs.writeFileSync(path.join(OUT, 'data/map.html'), md(rd(path.join(MATAF, 'knowledge/LIBRARY-MAP-HE.md'))));

// 5. פרטי הבנייה
let commit = process.env.GITHUB_SHA || '';
if (!commit) { try { commit = execFileSync('git', ['-C', MATAF, 'rev-parse', 'HEAD']).toString().trim(); } catch { commit = 'local'; } }
wj(path.join(OUT, 'data/build.json'), { built_at: new Date().toISOString(), commit: commit.slice(0, 7), sources: sources.length, pages: totalPages, topics: idx.topics.length, families: idx.counts?.source_families });
console.log(`built ${OUT}: ${sources.length} sources, ${totalPages} pages, ${sources.filter(s => s.pdf).length} PDFs, ${idx.topics.length} topics`);
