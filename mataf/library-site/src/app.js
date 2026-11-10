// ספריית המקורות - אפליקציית עמוד יחיד. כל הנתונים נטענים מ-data/ (נבנה מהמאגר ב-build.mjs).
// כל טקסט מוצג דרך textContent - אין הזרקת HTML מתוכן המסמכים.
import { normalize, search, snippet } from './search-core.js';

const app = document.getElementById('app');
const cache = { sources: null, byId: null, raw: {}, norm: {}, index: null, map: null, build: null };
const getJSON = async (u) => { const r = await fetch(u, { cache: 'no-cache' }); if (!r.ok) throw new Error(u + ' ' + r.status); return r.json(); };

function h(tag, attrs = {}, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
        if (v == null || v === false) continue;
        if (k === 'class') el.className = v;
        else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
        else el.setAttribute(k, v === true ? '' : v);
    }
    for (const k of kids.flat()) if (k != null && k !== false) el.append(k instanceof Node ? k : document.createTextNode(String(k)));
    return el;
}
const fmt = n => Number(n).toLocaleString('he-IL');

async function loadSources() {
    if (!cache.sources) {
        cache.sources = await getJSON('data/sources.json');
        cache.byId = Object.fromEntries(cache.sources.map(s => [s.id, s]));
    }
    return cache.sources;
}
async function loadPages(id) {
    if (!cache.raw[id]) cache.raw[id] = await getJSON(`data/pages/${encodeURIComponent(id)}.json`);
    return cache.raw[id];
}
async function loadAllPages(onProgress) {
    const src = await loadSources();
    let done = 0;
    await Promise.all(src.map(async s => {
        if (!cache.norm[s.id]) cache.norm[s.id] = (await loadPages(s.id)).map(normalize);
        onProgress && onProgress(++done, src.length);
    }));
}

function badges(s) {
    return h('span', { class: 'badges' },
        h('span', { class: 'badge ' + (s.source_class === 'original_provider' ? 'b-provider' : 'b-official') }, s.source_class_he || ''),
        h('span', { class: 'badge ' + (s.text_class === 'derived_auto_partial_checked' ? 'b-checked' : 'b-auto'),
            title: s.text_class_he || '' }, s.text_class === 'derived_auto_partial_checked' ? 'טקסט נבדק חלקית' : 'טקסט אוטומטי'));
}
const pdfLink = (s, page, label = 'PDF מקורי') => s.pdf ? h('a', { class: 'btn ghost sm', href: s.pdf + (page ? '#page=' + page : ''), target: '_blank', rel: 'noopener' }, label) : null;

// ---------- חיפוש ----------
const CLASS_FILTERS = [['all', 'הכול'], ['original_official', 'מקורות רשמיים'], ['original_provider', 'תקנוני ספקים']];
let lastQuery = '', lastFilter = 'all';

async function viewSearch(params) {
    await loadSources();
    const q = params.get('q') || lastQuery;
    const filt = params.get('f') || lastFilter;
    const input = h('input', { type: 'search', value: q, placeholder: 'למשל: פריסה, קיבוע זכויות, מענק פרישה, 9א', 'aria-label': 'חיפוש בספרייה' });
    const go = () => { location.hash = '#/?q=' + encodeURIComponent(input.value.trim()) + '&f=' + filt; };
    input.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
    const chips = h('div', { class: 'filters', role: 'group', 'aria-label': 'סינון' }, CLASS_FILTERS.map(([k, label]) =>
        h('button', { class: 'chip' + (k === filt ? ' on' : ''), type: 'button', onclick: () => { lastFilter = k; location.hash = '#/?q=' + encodeURIComponent(input.value.trim()) + '&f=' + k; } }, label)));
    const results = h('div', { class: 'card' });
    const totalPages = cache.sources.reduce((a, s) => a + s.pages, 0);
    app.replaceChildren(
        h('h2', {}, 'חיפוש בכל הספרייה'),
        h('p', { class: 'muted small' }, `${fmt(cache.sources.length)} מקורות, ${fmt(totalPages)} עמודים. החיפוש מוצא עמודים שמכילים את כל המילים, גם עם תחיליות (ו, ה, ב, ל). היעדר תוצאה אינו היעדר דין.`),
        h('div', { class: 'searchbar' }, input, h('button', { class: 'btn', type: 'button', onclick: go }, 'חיפוש')),
        chips, results);
    input.focus();
    if (!q) {
        results.append(h('p', { class: 'muted' }, 'נסו:'), h('div', { class: 'examples' },
            ['קיבוע זכויות', 'פריסה קדימה', 'מענק פרישה פטור', 'רצף קצבה', 'פיצויי פיטורים', 'קצבת שאירים', 'הנחות בביטוח חיים'].map(t =>
                h('a', { class: 'chip', href: '#/?q=' + encodeURIComponent(t) + '&f=' + filt }, t))));
        return;
    }
    lastQuery = q;
    results.append(h('div', { class: 'loading' }, 'טוען את טקסט הספרייה…'));
    await loadAllPages((d, n) => { results.firstChild.textContent = `טוען את טקסט הספרייה… ${d}/${n}`; });
    const hits = search(cache.norm, q, { limit: 60, filter: filt === 'all' ? null : (id => cache.byId[id].source_class === filt) });
    results.replaceChildren(h('p', { class: 'muted small' }, hits.length ? `${hits.length === 60 ? '60 התוצאות הראשונות' : hits.length + ' תוצאות'} לפי רלוונטיות` : 'לא נמצאו עמודים שמכילים את כל המילים.'));
    for (const hit of hits) {
        const s = cache.byId[hit.sourceId];
        const parts = snippet(cache.raw[s.id][hit.page - 1], q).map(p => p.hit ? h('mark', {}, p.text) : p.text);
        results.append(h('div', { class: 'hit' },
            h('a', { class: 'hit-t', href: `#/source/${encodeURIComponent(s.id)}/${hit.page}?q=${encodeURIComponent(q)}` }, `${s.title} · עמוד ${hit.page}`),
            ' ', badges(s),
            h('div', { class: 'hit-s' }, parts),
            pdfLink(s, hit.page, `פתיחת עמוד ${hit.page} ב-PDF`)));
    }
}

// ---------- רשימת מקורות ----------
async function viewSources() {
    const src = await loadSources();
    const groups = [['original_official', 'מקורות רשמיים'], ['original_provider', 'תקנוני קרנות פנסיה (מסמכי ספקים)']];
    app.replaceChildren(h('h2', {}, 'המקורות בספרייה'),
        h('div', { class: 'note' }, 'ה-PDF המקורי הוא המקור המחייב. הטקסט הוא עזר לקריאה ולחיפוש, ובחילוץ אוטומטי מספרים, סוגריים וטבלאות עלולים להשתבש. סיווג מלא ומה עדיין לא מאומת - בלשונית "מפת הספרייה".'),
        ...groups.map(([cls, title]) => [
            h('h3', { class: 'group-h' }, `${title} (${src.filter(s => s.source_class === cls).length})`),
            ...src.filter(s => s.source_class === cls).map(s => h('div', { class: 'card src' },
                h('div', {},
                    h('a', { class: 'src-t', href: `#/source/${encodeURIComponent(s.id)}/1` }, s.title), ' ', badges(s),
                    h('div', { class: 'src-meta' }, [s.publisher, s.edition, `${fmt(s.pages)} עמודים`, s.retained_on ? 'נשמר ' + s.retained_on : null].filter(Boolean).join(' · '))),
                h('div', { class: 'src-acts' },
                    h('a', { class: 'btn sm', href: `#/source/${encodeURIComponent(s.id)}/1` }, 'קריאה'),
                    pdfLink(s, null, 'PDF'),
                    s.pdf ? h('a', { class: 'btn ghost sm', href: s.pdf, download: s.id + '.pdf' }, 'הורדה') : null)))
        ]).flat());
}

// ---------- צופה במקור ----------
async function viewSource(id, page, params) {
    await loadSources();
    const s = cache.byId[id];
    if (!s) { app.replaceChildren(h('h2', {}, 'המקור לא נמצא'), h('a', { href: '#/sources' }, 'לרשימת המקורות')); return; }
    const pages = await loadPages(id);
    const n = Math.min(Math.max(1, page || 1), pages.length || 1);
    const q = params.get('q') || '';
    const go = p => { location.hash = `#/source/${encodeURIComponent(id)}/${p}` + (q ? '?q=' + encodeURIComponent(q) : ''); };
    const num = h('input', { type: 'number', min: 1, max: pages.length, value: n, 'aria-label': 'מספר עמוד' });
    num.addEventListener('change', () => go(Math.min(Math.max(1, +num.value || 1), pages.length)));
    const raw = pages[n - 1] || '';
    let body;
    if (!raw.trim()) body = h('div', { class: 'pagetext empty' }, 'אין טקסט לעמוד הזה (עמוד תמונה או ריק). יש לקרוא אותו ב-PDF המקורי.');
    else if (q) {
        const nq = normalize(q).split(/\s+/).filter(Boolean);
        const parts = []; let rest = raw;
        const re = new RegExp('(' + nq.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')', 'g');
        // שומרים את תווי הכיווניות של pdftotext - בלעדיהם מספרים וסוגריים מתהפכים בתצוגה.
        const clean = rest;
        let last = 0, m; const low = clean.toLowerCase();
        while ((m = re.exec(low))) { parts.push(clean.slice(last, m.index), h('mark', {}, clean.slice(m.index, m.index + m[0].length))); last = m.index + m[0].length; if (!m[0].length) re.lastIndex++; }
        parts.push(clean.slice(last));
        body = h('div', { class: 'pagetext' }, parts);
    } else body = h('div', { class: 'pagetext' }, raw);
    const checked = s.checked_pages.includes(n);
    app.replaceChildren(
        h('p', { class: 'small' }, h('a', { href: '#/sources' }, 'כל המקורות'), q ? [' · ', h('a', { href: '#/?q=' + encodeURIComponent(q) }, 'חזרה לתוצאות')] : null),
        h('h2', {}, s.title), badges(s),
        h('dl', { class: 'meta' },
            s.publisher ? [h('dt', {}, 'מנפיק'), h('dd', {}, s.publisher)] : null,
            s.edition ? [h('dt', {}, 'מהדורה'), h('dd', {}, s.edition)] : null,
            s.effective_scope ? [h('dt', {}, 'תחולה'), h('dd', {}, s.effective_scope)] : null,
            [h('dt', {}, 'אימות'), h('dd', {}, s.verification)],
            s.url ? [h('dt', {}, 'מקור'), h('dd', {}, h('a', { href: s.url, target: '_blank', rel: 'noopener noreferrer' }, s.url))] : null),
        h('div', { class: 'note' + (checked ? '' : ' warn') }, checked ? 'הטקסט של עמוד זה נבדק מול תמונת העמוד.' : 'טקסט עזר בחילוץ אוטומטי - לא נבדק מול העמוד. לפני שימוש מקצועי: לקרוא ב-PDF.'),
        h('div', { class: 'viewer-head' },
            h('div', { class: 'pager' },
                h('button', { class: 'btn ghost sm', type: 'button', disabled: n >= pages.length, onclick: () => go(n + 1) }, 'הבא ‹'),
                h('span', {}, 'עמוד '), num, h('span', {}, ` מתוך ${pages.length}`),
                h('button', { class: 'btn ghost sm', type: 'button', disabled: n <= 1, onclick: () => go(n - 1) }, '› הקודם')),
            h('div', { class: 'pager' }, pdfLink(s, n, `עמוד ${n} ב-PDF`), s.pdf ? h('a', { class: 'btn ghost sm', href: s.pdf, download: s.id + '.pdf' }, 'הורדת PDF') : null)),
        body);
}

// ---------- מפת המקצוע ----------
async function viewIndex(params) {
    if (!cache.index) cache.index = await getJSON('data/index.json');
    const d = cache.index;
    const fam = Object.fromEntries(d.manifest.map(f => [f.id, f]));
    const tq = normalize(params.get('t') || '');
    const filterIn = h('input', { type: 'search', value: params.get('t') || '', placeholder: 'סינון נושאים', 'aria-label': 'סינון נושאים' });
    filterIn.addEventListener('keydown', e => { if (e.key === 'Enter') location.hash = '#/index?t=' + encodeURIComponent(filterIn.value.trim()); });
    const held = d.manifest.filter(f => /פורסם|נשמר|שמור עם/.test(f.acquisition_status || '') && !/לא שמור/.test(f.acquisition_status || '')).length;
    const topicsBy = {}; for (const t of d.topics) (topicsBy[t.domain_id] ||= []).push(t);
    const match = t => !tq || normalize(t.title + ' ' + t.id).includes(tq);
    app.replaceChildren(
        h('h2', {}, `מפת המקצוע - גרסה ${d.version}`),
        h('p', { class: 'muted small' }, d.scope),
        h('div', { class: 'kpis' },
            [[d.counts.domains, 'תחומים'], [d.counts.topics, 'נושאי עבודה'], [d.counts.source_families, 'משפחות מקורות'], [held, 'משפחות עם מקור שמור (חלקי)']].map(([v, l]) =>
                h('div', { class: 'kpi' }, h('div', { class: 'kpi-v' }, fmt(v)), h('div', { class: 'kpi-l' }, l)))),
        h('div', { class: 'note warn' }, d.completion_statement),
        h('h3', {}, 'תור עדיפויות'),
        h('ol', { class: 'prio' }, d.priority_queue.map(p => h('li', {}, p.task, ' ', h('span', { class: 'muted small' }, '(' + p.topic_ids.join(', ') + ')')))),
        h('h3', {}, 'תחומים ונושאים'),
        h('div', { class: 'searchbar' }, filterIn, h('button', { class: 'btn ghost', type: 'button', onclick: () => { location.hash = '#/index?t=' + encodeURIComponent(filterIn.value.trim()); } }, 'סינון')),
        ...d.domains.filter(dm => (topicsBy[dm.id] || []).some(match)).map(dm => h('details', { class: 'dom', open: !!tq },
            h('summary', {}, h('span', { class: 'dom-id' }, dm.id), h('span', {}, dm.title), h('span', { class: 'dom-n' }, `${(topicsBy[dm.id] || []).length} נושאים`)),
            (topicsBy[dm.id] || []).filter(match).map(t => h('div', { class: 'topic' },
                h('div', { class: 'topic-t' }, t.id + ' · ' + t.title),
                h('div', { class: 'small' }, h('span', { class: 'badge b-open' }, t.readiness)),
                h('ul', {}, (t.source_checklist || []).map(c => h('li', {}, c))),
                (t.required_source_family_ids || []).map(fid => fam[fid] ? h('div', { class: 'fam' }, h('strong', {}, fid + ' '), fam[fid].title, h('span', { class: 'muted' }, ' - ' + (fam[fid].acquisition_status || ''))) : null),
                t.next_action ? h('div', { class: 'small muted' }, 'הצעד הבא: ' + t.next_action) : null)))));
}

// ---------- מפת הספרייה ----------
async function viewMap() {
    if (!cache.map) { const r = await fetch('data/map.html', { cache: 'no-cache' }); cache.map = await r.text(); }
    const doc = h('div', { class: 'mapdoc' });
    // התוכן נבנה מ-LIBRARY-MAP-HE.md במאגר, וכל הטקסט בו עבר escape בבנייה.
    doc.innerHTML = cache.map;
    app.replaceChildren(doc);
}

// ---------- ניתוב ----------
async function route() {
    const raw = location.hash.replace(/^#/, '') || '/';
    const [p, qs] = raw.split('?');
    const params = new URLSearchParams(qs || '');
    const parts = p.split('/').filter(Boolean).map(decodeURIComponent);
    const tab = parts[0] === 'sources' || parts[0] === 'source' ? 'sources' : parts[0] === 'index' ? 'index' : parts[0] === 'map' ? 'map' : 'search';
    document.querySelectorAll('.tabs a').forEach(a => a.classList.toggle('on', a.dataset.tab === tab));
    app.replaceChildren(h('div', { class: 'loading' }, 'טוען…'));
    try {
        if (parts[0] === 'sources') await viewSources();
        else if (parts[0] === 'source') await viewSource(parts[1], parseInt(parts[2], 10) || 1, params);
        else if (parts[0] === 'index') await viewIndex(params);
        else if (parts[0] === 'map') await viewMap();
        else await viewSearch(params);
    } catch (e) {
        app.replaceChildren(h('div', { class: 'note warn' }, 'שגיאה בטעינת הנתונים. רעננו את הדף.'));
        console.error(e);
    }
    window.scrollTo(0, 0);
}
window.addEventListener('hashchange', route);
route();
getJSON('data/build.json').then(b => {
    document.getElementById('foot').textContent = `נבנה ${new Date(b.built_at).toLocaleString('he-IL')} מהמאגר (${b.commit}) · ${b.sources} מקורות · ${fmt(b.pages)} עמודים. הספרייה אינה כיסוי מלא של הדין; היעדר תוצאה אינו היעדר דין.`;
}).catch(() => {});
