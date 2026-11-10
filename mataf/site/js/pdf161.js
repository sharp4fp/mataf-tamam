// Text extraction for Israel Tax Authority form 161 PDFs, built on pdf.js (bundled, client-side only).
// Field locators are label-anchored: each value is matched to its printed label by column position.
// Every result is a candidate: the UI marks what was found and asks only for what was not.
// Scanned (image-only) forms yield no text items and get an honest message.

export const EMPTY_161 = {
    fullName: '', idNumber: '', birthDate: '', startWork: '', retireDate: '', workYears: '',
    salaryFull: '', salaryInsured: '', salarySeverance: '', grants: [],
    totalGrant: '', maxKtseva: '', maxPitzuim: '', maxExempt: '', taxableGrant: '',
};

export const FIELD_LABELS = {
    fullName: 'שם העובד', idNumber: 'מספר זהות', birthDate: 'תאריך לידה',
    startWork: 'תחילת עבודה', retireDate: 'תאריך פרישה', workYears: 'שנות עבודה',
    salaryFull: 'משכורת מלאה (א6)', salaryInsured: 'משכורת מבוטחת אחרונה', salarySeverance: 'משכורת חבות פיצויים',
    totalGrant: 'סכום המענק הכולל (א13)', maxKtseva: 'מרבי לרצף קצבה', maxPitzuim: 'מרבי לרצף פיצויים',
    maxExempt: 'מענק פטור מרבי (9א(7))', taxableGrant: 'מענק חייב במס',
};

const COMMA_NUM_RE = /^\d{1,3}(,\d{3})+(\.\d+)?$/;
const DATE_RE = /^\d{1,2}[/.]\d{1,2}[/.]\d{2,4}$/;
const hebrewCount = (s) => (s.match(/[א-ת]/g) || []).length;

function toLines(items) {
    const lines = [];
    const sorted = [...items].sort((a, b) => a.page - b.page || b.y - a.y);
    for (const it of sorted) {
        let line = lines.find(l => l.page === it.page && Math.abs(l.y - it.y) < 3);
        if (!line) { line = { page: it.page, y: it.y, items: [] }; lines.push(line); }
        line.items.push(it);
    }
    for (const l of lines) l.items.sort((a, b) => b.x - a.x);
    return lines;
}
const lineText = (l) => l.items.map(i => i.str).join(' ');
const hasLabel = (l, s) => l.items.some(i => i.str.includes(s));
const labelX = (l, s) => { const it = l.items.find(i => i.str.includes(s)); return it ? it.x : null; };

function nearestBelow(lines, labelLine, predicate, maxGap = 40) {
    const below = lines
        .filter(l => l.page === labelLine.page && l.y < labelLine.y && labelLine.y - l.y < maxGap && l.items.some(predicate))
        .sort((a, b) => (labelLine.y - a.y) - (labelLine.y - b.y));
    return below[0] || null;
}
function nearestByX(line, x, predicate, maxDist = Infinity) {
    if (x === null || x === undefined) return null;
    let best = null, bd = 1e9;
    for (const it of line.items) {
        if (!predicate(it)) continue;
        const d = Math.abs(it.x - x);
        if (d < bd) { bd = d; best = it; }
    }
    return bd <= maxDist ? best : null;
}
// גבול עמודה גאומטרי מכיתובי אותה שורה: ערך נקשר רק אם הוא בתוך מחצית המרחק לכיתוב השכן הקרוב.
// תא ריק אינו "שואב" ערך מעמודה שכנה, וכיתוב חסר משאיר את השדה ריק לעיון ידני - לא מנחשים.
function columnBound(ownX, siblingXs) {
    if (ownX === null || ownX === undefined) return 0;
    const known = siblingXs.filter(x => x !== null && x !== undefined && x !== ownX);
    if (!known.length) return Infinity;
    return Math.min(...known.map(x => Math.abs(x - ownX))) / 2;
}

// items: [{page, x, y, str}] in logical order (as pdf.js getTextContent returns them).
export function fieldsFromItems(items) {
    const lines = toLines(items);
    const f = { ...EMPTY_161, grants: [] };
    const found = {};
    const mark = (k, v) => { if (v) { f[k] = v; found[k] = true; } else { found[k] = false; } };

    // --- A1: employee identity (page 1) ---
    const a1 = lines.find(l => l.page === 1 && hasLabel(l, 'מספר זהות') && hasLabel(l, 'שם פרטי') && hasLabel(l, 'שם משפחה') && hasLabel(l, 'תאריך לידה'));
    if (a1) {
        const vals = nearestBelow(lines, a1, it => /^\d{9}$/.test(it.str));
        if (vals) {
            const a1xs = [labelX(a1, 'מספר זהות'), labelX(a1, 'שם פרטי'), labelX(a1, 'שם משפחה'), labelX(a1, 'תאריך לידה')];
            mark('idNumber', (nearestByX(vals, a1xs[0], it => /^\d{9}$/.test(it.str), columnBound(a1xs[0], a1xs)) || {}).str || '');
            const first = (nearestByX(vals, a1xs[1], it => hebrewCount(it.str) >= 2, columnBound(a1xs[1], a1xs)) || {}).str || '';
            const last = (nearestByX(vals, a1xs[2], it => hebrewCount(it.str) >= 2, columnBound(a1xs[2], a1xs)) || {}).str || '';
            mark('fullName', (first || last) ? `${first} ${last}`.trim() : '');
            mark('birthDate', (nearestByX(vals, a1xs[3], it => DATE_RE.test(it.str), columnBound(a1xs[3], a1xs)) || {}).str || '');
        } else { mark('idNumber', ''); mark('fullName', ''); mark('birthDate', ''); }
    } else { mark('idNumber', ''); mark('fullName', ''); mark('birthDate', ''); }

    // --- A4: work period ---
    const a4 = lines.find(l => hasLabel(l, 'תאריך התחלת העבודה') && hasLabel(l, 'תאריך הפרישה'));
    if (a4) {
        const vals = nearestBelow(lines, a4, it => DATE_RE.test(it.str));
        if (vals) {
            const a4xs = [labelX(a4, 'תאריך התחלת העבודה'), labelX(a4, 'תאריך הפרישה'), labelX(a4, 'תקופת העבודה')];
            mark('startWork', (nearestByX(vals, a4xs[0], it => DATE_RE.test(it.str), columnBound(a4xs[0], a4xs)) || {}).str || '');
            mark('retireDate', (nearestByX(vals, a4xs[1], it => DATE_RE.test(it.str), columnBound(a4xs[1], a4xs)) || {}).str || '');
            mark('workYears', (nearestByX(vals, a4xs[2], it => /^\d{1,3}\.\d{1,3}$/.test(it.str), columnBound(a4xs[2], a4xs)) || {}).str || '');
        } else { mark('startWork', ''); mark('retireDate', ''); mark('workYears', ''); }
    } else { mark('startWork', ''); mark('retireDate', ''); mark('workYears', ''); }

    // --- A6: salaries ---
    const a6 = lines.find(l => l.page === 1 && hasLabel(l, 'משכורת מבוטחת אחרונה'));
    if (a6) {
        const vals = nearestBelow(lines, a6, it => COMMA_NUM_RE.test(it.str));
        if (vals) {
            const a6xs = [labelX(a6, 'חודשית אחרונה') ?? labelX(a6, 'חודשית מלאה'), labelX(a6, 'מבוטחת אחרונה'), labelX(a6, 'חבות פיצויים')];
            mark('salaryFull', (nearestByX(vals, a6xs[0], it => COMMA_NUM_RE.test(it.str), columnBound(a6xs[0], a6xs)) || {}).str || '');
            mark('salaryInsured', (nearestByX(vals, a6xs[1], it => COMMA_NUM_RE.test(it.str), columnBound(a6xs[1], a6xs)) || {}).str || '');
            mark('salarySeverance', (nearestByX(vals, a6xs[2], it => COMMA_NUM_RE.test(it.str), columnBound(a6xs[2], a6xs)) || {}).str || '');
        } else { mark('salaryFull', ''); mark('salaryInsured', ''); mark('salarySeverance', ''); }
    } else { mark('salaryFull', ''); mark('salaryInsured', ''); mark('salarySeverance', ''); }

    // --- A9: grant rows (between the א.9 header and its total line) ---
    const a9head = lines.find(l => /א\.9/.test(lineText(l)) && /פירוט המענקים/.test(lineText(l)));
    if (a9head) {
        const a9total = lines.find(l => l.page === a9head.page && l.y < a9head.y && /סה"כ חלק א\.9/.test(lineText(l).replace(/\s/g, '')) );
        const rows = lines.filter(l => l.page === a9head.page && l.y < a9head.y && (!a9total || l.y > a9total.y));
        for (const l of rows) {
            const dateIt = l.items.find(i => DATE_RE.test(i.str));
            const amtIt = l.items.find(i => COMMA_NUM_RE.test(i.str));
            if (!dateIt || !amtIt) continue;
            const payerIt = l.items.find(i => hebrewCount(i.str) >= 4 && !/צבירה|תאריך|קוד|סכום|שם המשלם|מספר תיק|סוג התשלום|פירוט/.test(i.str));
            if (!payerIt) continue;
            const codeIt = l.items.find(i => /^\d{1,2}$/.test(i.str) && i.x < payerIt.x && i.x > dateIt.x);
            f.grants.push({ payer: payerIt.str, code: codeIt ? codeIt.str : '', amount: amtIt.str });
        }
    }
    found.grants = f.grants.length > 0;

    // --- A13: maxima line ---
    // קשר לפי סדר בלבד אסור: תא ריק מזיז ערכים לשדות הלא נכונים. מאושרת רק שורה מלאה של 5 ערכים בדיוק; אחרת כל החמישה ריקים לעיון ידני.
    const a13 = lines.find(l => hasLabel(l, 'הסכום המרבי'));
    const blankA13 = () => { mark('totalGrant', ''); mark('maxKtseva', ''); mark('maxPitzuim', ''); mark('maxExempt', ''); mark('taxableGrant', ''); };
    if (a13) {
        const nums = a13.items.filter(i => COMMA_NUM_RE.test(i.str)).sort((a, b) => b.x - a.x).map(i => i.str);
        if (nums.length === 5) {
            mark('totalGrant', nums[0]);
            mark('maxKtseva', nums[1]);
            mark('maxPitzuim', nums[2]);
            mark('maxExempt', nums[3]);
            mark('taxableGrant', nums[4]);
        } else blankA13();
    } else blankA13();

    const foundCount = Object.values(found).filter(Boolean).length;
    const totalFields = Object.keys(found).length;
    return { fields: f, found, foundCount, totalFields, marks: detectMarks161(lines) };
}

// זיהוי סימוני V בטופס 161 (חלקים א12/ב/ג). הטופס הרשמי שטוח (ללא שדות AcroForm): תיבת סימון ריקה
// מופיעה בשכבת הטקסט כגליף 'o' נפרד ממש לפני תווית האפשרות (סדר קריאה: x יורד).
// כל זיהוי הוא מועמד בלבד ומסומן כלא-מאומת: גליף שאינו 'o' ליד תווית אינו הוכחה לסימון בפועל
// (שכבות שטוחות וסימני פיסוק עלולים להטעות). בטופס סרוק לא יימצא טקסט כלל וכל הסימונים 'unknown'.
const MARK_GLYPHS = { o: 'unmarked', V: 'marked', v: 'marked', X: 'marked', x: 'marked', '✓': 'marked', '✔': 'marked', '☑': 'marked', '■': 'marked', '●': 'marked' };

// התאמה סובלת גליף ממוזג ('V מקורי') או גליף כפריט נפרד ('מקורי'). גליף בודד לעולם אינו תווית.
const stripGlyph = s => s.trim().replace(/^[oVvXx✓✔☑■●]\s+/, '');

const MARK_OPTIONS = [
    { key: 'formType_orig', part: 'כותרת הטופס', label: 'טופס מקורי', match: it => stripGlyph(it) === 'מקורי' },
    { key: 'formType_fix', part: 'כותרת הטופס', label: 'טופס מתקן', match: it => stripGlyph(it).startsWith('מתקן טופס קודם') },
    { key: 'a12_over', part: 'א12.1', label: 'עולה על התקרה לרצף קצבה ברירת מחדל', match: it => stripGlyph(it) === 'עולה', lineAnchor: 'רצף קצבה ברירת מחדל' },
    { key: 'a12_notover', part: 'א12.1', label: 'אינו עולה על התקרה', match: it => stripGlyph(it) === 'אינו עולה', lineAnchor: 'רצף קצבה ברירת מחדל' },
    { key: 'a12_ext_yes', part: 'א12.2', label: 'כן - קיימים מענקים ממשלמים אחרים', match: it => stripGlyph(it) === 'כן', lineAnchor: 'ממשלמים שאינם' },
    { key: 'a12_ext_no', part: 'א12.2', label: 'לא - אין מענקים ממשלמים אחרים', match: it => stripGlyph(it) === 'לא', lineAnchor: 'ממשלמים שאינם' },
    { key: 'b2_prisa', part: 'ב2', label: 'בקשת פריסת מס על המענק החייב (טופס 116ג)', match: it => stripGlyph(it).startsWith('בכוונתי לבקש לפרוס') },
    { key: 'b2_ritzPitz', part: 'ב2', label: 'ייעוד סכום לרצף פיצויים', match: it => stripGlyph(it).startsWith('אני מבקש לייעד סכום לרצף פיצויים') },
    { key: 'b3_noExempt', part: 'ב3', label: 'הצהרה: לא התקבלו מענקים פטורים ממעסיקים אחרים', match: it => it.includes('לא קיבלתי ממעסיקים אחרים') },
    { key: 'b3_noRitzPitz', part: 'ב3', label: 'הצהרה: לא הוגשה בקשת רצף פיצויים ממעסיקים אחרים', match: it => it.includes('לא הגשתי בקשה לרצף פיצויים') },
    { key: 'b3_kivua', part: 'ב3', label: 'הצהרה: טרם הוגשה בקשה לקיבוע זכויות', match: it => it.includes('קיבוע זכויות') },
    { key: 'g1_altA', part: 'ג1', label: "חלופה א' - רצף קצבה אוטומטי (ללא חלק ב')", match: it => stripGlyph(it).startsWith('חלופה א') },
    { key: 'g1_altB', part: 'ג1', label: "חלופה ב' - הנחיות לקופות לפי בחירות העובד", match: it => stripGlyph(it).startsWith('חלופה ב') },
    { key: 'g2_pakid', part: 'ג2', label: 'הנחיות יינתנו על ידי פקיד השומה', match: it => it.includes('ינתנו ע"י פקיד השומה') || it.includes('ינתנו ע”י פקיד השומה') },
];

export function detectMarks161(lines) {
    const out = [];
    for (const opt of MARK_OPTIONS) {
        const line = lines.find(l =>
            (!opt.lineAnchor || lineText(l).includes(opt.lineAnchor)) && l.items.some(i => opt.match(i.str)));
        if (!line) { out.push({ key: opt.key, part: opt.part, label: opt.label, state: 'unknown', page: 0, line: '' }); continue; }
        const idx = line.items.findIndex(i => opt.match(i.str));
        const it = line.items[idx];
        const txt = it.str.trim();
        let state = 'unknown';
        // מקרה 1: הגליף ממוזג בתוך פריט התווית עצמו (למשל 'V מקורי')
        const m1 = txt.match(/^([oVvXx✓✔☑■●])\s+/);
        if (m1 && MARK_GLYPHS[m1[1]]) state = MARK_GLYPHS[m1[1]];
        // מקרה 2: הגליף הוא פריט נפרד ממש לפני התווית בסדר הקריאה (x גבוה יותר)
        if (state === 'unknown' && idx > 0) {
            const g = line.items[idx - 1].str.trim();
            if (MARK_GLYPHS[g]) state = MARK_GLYPHS[g];
        }
        out.push({ key: opt.key, part: opt.part, label: opt.label, state, page: line.page, line: lineText(line).slice(0, 160) });
    }
    return out;
}

// בדיקות סתירה פנימיות בטופס 161 - רק כללים חד-משמעיים (לא פרשנות מס).
export function contradictions161(f) {
    const out = [];
    const parseD = (s) => {
        const m = /^(\d{1,2})[/.](\d{1,2})[/.](\d{2,4})$/.exec((s || '').trim());
        if (!m) return null;
        let y = +m[3]; if (y < 100) y += y < 50 ? 2000 : 1900;
        return new Date(y, +m[2] - 1, +m[1]);
    };
    const dStart = parseD(f.startWork), dRet = parseD(f.retireDate);
    if (dStart && dRet && dStart > dRet)
        out.push('תאריך תחילת העבודה (' + f.startWork + ') מאוחר מתאריך הפרישה (' + f.retireDate + ') - אחד מהם שגוי.');
    if (dStart && dRet && f.workYears) {
        const yrs = (dRet - dStart) / (365.25 * 24 * 3600 * 1000);
        const stated = parseFloat(String(f.workYears).replace(',', '.'));
        if (!isNaN(stated) && Math.abs(stated - yrs) > 1.5)
            out.push('שנות העבודה שדווחו (' + f.workYears + ') אינן מתאימות לפער בין התאריכים (' + yrs.toFixed(1) + ' שנים) - יש לבדוק מול הטופס.');
    }
    const id = (f.idNumber || '').replace(/\D/g, '');
    if (id.length === 9) {
        let sum = 0;
        for (let i = 0; i < 9; i++) {
            let d = +id[i] * (i % 2 === 0 ? 1 : 2);
            if (d > 9) d -= 9;
            sum += d;
        }
        if (sum % 10 !== 0) out.push('ספרת הביקורת של מספר הזהות (' + f.idNumber + ') אינה תקינה - כנראה שגיאת הקלדה בטופס או בחילוץ.');
    }
    return out;
}

export async function extract161(buf) {
    const pdfjsLib = globalThis.pdfjsLib;
    const empty = () => ({ fields: { ...EMPTY_161, grants: [] }, found: {}, foundCount: 0, totalFields: 0 });
    if (!pdfjsLib) return { ...empty(), error: 'ספריית קריאת ה-PDF לא נטענה. בדקו חיבור ורעננו את העמוד, או מלאו ידנית.' };
    try {
        const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buf.slice(0)), isEvalSupported: false }).promise;
        const items = [];
        for (let p = 1; p <= doc.numPages; p++) {
            const page = await doc.getPage(p);
            const tc = await page.getTextContent();
            for (const it of tc.items) {
                if (!it.str || !it.str.trim()) continue;
                items.push({ page: p, x: it.transform[4], y: it.transform[5], str: it.str.trim() });
            }
        }
        if (!items.length) {
            return { ...empty(), error: 'לא נמצא טקסט בקובץ - ככל הנראה מדובר בטופס סרוק (תמונה). הזינו ידנית את השדות מהטופס.' };
        }
        return fieldsFromItems(items);
    } catch (e) {
        return { ...empty(), error: 'חילוץ אוטומטי נכשל (' + ((e && e.message) || 'שגיאה') + ') - מלאו ידנית מהטופס' };
    }
}
