// מנוע החיפוש של ספריית המקורות - משותף לאתר (דפדפן) ולבדיקות (Node).
// חיפוש לפי עמוד: עמוד מתאים אם הוא מכיל את כל המילים בשאילתה (כתת-מחרוזת, כך ש"פיצויים"
// מוצא גם "והפיצויים"). הדירוג לפי מספר ההופעות. בלי תלויות חיצוניות.

// אותה נרמול כמו search.py: NFKC, הסרת ניקוד, טעמים ותווי כיווניות.
export function normalize(text) {
    return String(text || '')
        .normalize('NFKC')
        .replace(/[֑-ֽֿ-ׇ‎‏‪-‮]/g, '')
        .replace(/[״"]/g, '"')
        .replace(/[׳']/g, "'")
        .toLowerCase();
}

export function terms(query) {
    return normalize(query).split(/\s+/).map(t => t.replace(/^["'(]+|["'),.:;]+$/g, '')).filter(t => t.length > 0);
}

function countOf(hay, needle) {
    let n = 0, i = hay.indexOf(needle);
    while (i !== -1 && n < 1000) { n++; i = hay.indexOf(needle, i + needle.length); }
    return n;
}

// pagesBySource: { [sourceId]: string[] } (טקסט מנורמל לכל עמוד)
// filter(sourceId) -> boolean, אופציונלי
export function search(pagesBySource, query, { limit = 50, filter = null } = {}) {
    const ts = terms(query);
    if (!ts.length) return [];
    const hits = [];
    for (const [sid, pages] of Object.entries(pagesBySource)) {
        if (filter && !filter(sid)) continue;
        pages.forEach((text, i) => {
            let score = 0;
            for (const t of ts) {
                const c = countOf(text, t);
                if (!c) return;
                score += c;
            }
            hits.push({ sourceId: sid, page: i + 1, score });
        });
    }
    hits.sort((a, b) => b.score - a.score || a.sourceId.localeCompare(b.sourceId) || a.page - b.page);
    return hits.slice(0, limit);
}

// קטע תצוגה סביב ההופעה הראשונה. מחזיר מערך חלקים [{text, hit}] לבנייה בטוחה ב-DOM.
export function snippet(rawText, query, radius = 90) {
    const ts = terms(query);
    const clean = String(rawText || '').replace(/[‎‏‪-‮]/g, '').replace(/\s+/g, ' ').trim();
    const norm = normalize(clean);
    let at = -1;
    for (const t of ts) { const i = norm.indexOf(t); if (i !== -1 && (at === -1 || i < at)) at = i; }
    if (at === -1) return [{ text: clean.slice(0, radius * 2), hit: false }];
    const start = Math.max(0, at - radius), end = Math.min(clean.length, at + radius);
    const piece = clean.slice(start, end), npiece = norm.slice(start, end);
    const marks = [];
    for (const t of ts) {
        let i = npiece.indexOf(t);
        while (i !== -1) { marks.push([i, i + t.length]); i = npiece.indexOf(t, i + t.length); }
    }
    marks.sort((a, b) => a[0] - b[0]);
    const out = []; let pos = 0;
    for (const [s, e] of marks) {
        if (s < pos) continue;
        if (s > pos) out.push({ text: piece.slice(pos, s), hit: false });
        out.push({ text: piece.slice(s, e), hit: true });
        pos = e;
    }
    if (pos < piece.length) out.push({ text: piece.slice(pos), hit: false });
    if (start > 0) out.unshift({ text: '… ', hit: false });
    if (end < clean.length) out.push({ text: ' …', hit: false });
    return out;
}
