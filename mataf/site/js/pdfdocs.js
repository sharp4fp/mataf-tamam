// Text extraction for official pension documents, built on pdf.js (bundled, client-side only).
// Supported profiles: insurer pension quote (ציטוט קצבה), legacy policy terms (פוליסה/קרן ותיקה),
// annual employer certificate 106 / payslip (טופס 106), ID supplement (ספח תעודת זהות),
// beneficiary confirmation from the managing body (אישור מוטבים).
// These documents have no single national layout - each body prints its own. Extraction is
// label-anchored heuristics over common Hebrew phrasings, not universal coverage. Every hit is
// a candidate with its page number and source line; nothing becomes data until the user adds it.
// Scanned (image-only) documents yield no text.

const COMMA_NUM_RE = /\d{1,3}(,\d{3})+(\.\d+)?/;
const DATE_RE = /\d{1,2}[/.]\d{1,2}[/.]\d{2,4}/;
const PCT_RE = /\d{1,3}(\.\d{1,2})?%/;
const IDNUM_RE = /\b\d{9}\b/;
const YEAR_RE = /\b20\d{2}\b/;

const ISSUERS = [
    'מנורה מבטחים', 'הפניקס', 'מגדל', 'הראל', 'כלל ביטוח', 'כלל פנסיה', 'אלטשולר שחם',
    'מיטב דש', 'פסגות', 'אנליסט', 'ילין לפידות', 'מור פנסיה', 'אקסלנס', 'הלמן אלדובי',
    'אינפיניטי', 'בנק לאומי', 'בנק הפועלים', 'דיסקונט', 'מזרחי טפחות', 'הבינלאומי',
];

const MATCHERS = {
    amount: (text) => {
        const m = text.match(COMMA_NUM_RE) || text.match(/(\d{4,7})(\.\d+)?\s*(?:₪|ש"ח|שח)/);
        return m ? m[0].replace(/\s*(₪|ש"ח|שח)/, '') : null;
    },
    date: (text) => { const m = text.match(DATE_RE); return m ? m[0] : null; },
    percent: (text) => { const m = text.match(PCT_RE); return m ? m[0] : null; },
    mekadem: (text) => { const m = text.match(/(\d{2,3}\.\d{1,2})/); return m ? m[1] : null; },
    guarantee: (text) => {
        const m = text.match(/(\d{1,4})\s*(חודשים|שנים|חודש|שנה)/);
        return m ? `${m[1]} ${m[2]}` : null;
    },
    months: (text) => {
        let m = text.match(/(?:חודשי עבודה|חודשי העבודה)\s*:?\s*(\d{1,2})(?!\d)/);
        if (m) return `${m[1]} חודשי עבודה`;
        m = text.match(/(?:^|[^\d])(\d{1,2})\s+(חודשי עבודה|חודשים)/);
        return m ? `${m[1]} ${m[2]}` : null;
    },
    year: (text) => { const m = text.match(YEAR_RE); return m ? m[0] : null; },
    idnum: (text) => { const m = text.match(IDNUM_RE); return m ? m[0] : null; },
    // A standalone 3-digit field number (as printed on computerized 106 forms) with an amount on the line.
    fieldnum: (num) => (text) => {
        if (!new RegExp(`(?:^|[^\\d])${num}(?:[^\\d]|$)`).test(text)) return null;
        const m = text.match(COMMA_NUM_RE);
        return m ? m[0] : null;
    },
    // Hebrew name on the line, minus the anchor words; attaches ID / birth date if printed there.
    name: (needles) => (text) => {
        let rest = ' ' + text + ' ';
        for (const n of needles) rest = rest.split(n).join(' ');
        rest = rest.replace(IDNUM_RE, ' ').replace(DATE_RE, ' ').replace(PCT_RE, ' ');
        const tokens = rest.split(/[^א-ת"]+/).filter(t => (t.match(/[א-ת]/g) || []).length >= 2);
        const stop = new Set(['שם', 'פרטי', 'משפחה', 'תאריך', 'לידה', 'מספר', 'זהות', 'מין', 'זכר', 'נקבה', 'הילדים', 'ילדים', 'ילד', 'בן', 'בת', 'זוג', 'רשום', 'רשומה', 'כנגד', 'מוטב', 'מוטבים', 'מוטבת', 'אחוז', 'שיעור', 'לאחר', 'מוות', 'קרבה', 'אישור', 'קרן', 'פנסיה', 'ביטוח', 'חברה', 'גוף', 'מנהל', 'מסמך', 'תעודת', 'בע\"מ', 'סך', 'הכל']);
        const words = tokens.filter(t => !stop.has(t)).slice(0, 4);
        if (!words.length) return null;
        const extras = [];
        const idm = text.match(IDNUM_RE); if (idm) extras.push(`ת.ז ${idm[0]}`);
        const dm = text.match(DATE_RE); if (dm) extras.push(`נולד/ה ${dm[0]}`);
        return words.join(' ') + (extras.length ? ` (${extras.join(', ')})` : '');
    },
};

const PROFILES = {
    quote: {
        issuer: true,
        anchors: [
            { key: 'amount', label: 'קצבה חודשית', needles: ['קצבה חודשית', 'הקצבה החודשית', 'קצבה צפויה', 'הקצבה הצפויה', 'קצבת זקנה', 'קצבה משוערת'], type: 'amount', suffix: ' ₪ לחודש' },
            { key: 'start', label: 'מועד תחילת הקצבה', needles: ['מועד תחילת הקצבה', 'תאריך תחילת הקצבה', 'מועד הזכאות לקצבה', 'מועד הזכאות', 'תחילת התשלום', 'תחילת הקצבה'], type: 'date' },
            { key: 'survivors', label: 'קצבת שאירים', needles: ['שאירים', 'שארים'], type: 'percent' },
            { key: 'guarantee', label: 'תקופת הבטחה', needles: ['תקופת הבטחה', 'תקופת ההבטחה', 'חודשי הבטחה', 'הבטחה של', 'מובטחת', 'תקופה מובטחת'], type: 'guarantee' },
        ],
    },
    policy: {
        issuer: true,
        anchors: [
            { key: 'redeem', label: 'ערך פדיון', needles: ['ערכי פדיון', 'ערך פדיון', 'סכום הפדיון', 'יתרת הפדיון', 'ערך הפדיון', 'סכום הפיצויים'], type: 'amount', suffix: ' ₪' },
            { key: 'fees', label: 'דמי ניהול מוסכמים', needles: ['דמי ניהול מוסכמים', 'דמי ניהול'], type: 'percent' },
            { key: 'guaranteed', label: 'מקדם/תשואה מובטחת', needles: ['מקדם מובטח', 'תשואה מובטחת', 'הבטחת תשואה', 'מקדם המובטח'], type: 'mekadem' },
            { key: 'start', label: 'תאריך תחילת הביטוח', needles: ['תאריך תחילת הביטוח', 'תחילת הביטוח', 'מועד תחילת הביטוח', 'תאריך הנפקה'], type: 'date' },
        ],
    },
    p106: {
        issuer: false,
        anchors: [
            { key: 'year', label: 'שנת מס', needles: ['שנת מס', 'שנת המס'], type: 'year' },
            { key: 'salary', label: 'שכר/הכנסה חייבת', needles: ['סך התשלומים', 'שכר חייב', 'הכנסה חייבת', 'שכר ברוטו'], type: 'amount', suffix: ' ₪' },
            { key: 'salary158', label: 'שדה 158/172 (שכר חייב)', needles: [], type: 'fieldnum', fieldnum: '158', suffix: ' ₪' },
            { key: 'tax', label: 'מס הכנסה שנוכה', needles: ['מס הכנסה שנוכה', 'מס שנוכה', 'ניכוי במקור', 'נוכה במקור'], type: 'amount', suffix: ' ₪' },
            { key: 'tax042', label: 'שדה 042 (מס שנוכה)', needles: [], type: 'fieldnum', fieldnum: '042', suffix: ' ₪' },
            { key: 'months', label: 'חודשי עבודה', needles: ['חודשי עבודה', 'חודשי העבודה'], type: 'months' },
            { key: 'idnum', label: 'מספר זהות', needles: ['מספר זהות', 'מ.ז', 'ת.ז'], type: 'idnum' },
        ],
    },
    idsup: {
        issuer: false,
        anchors: [
            { key: 'spouse', label: 'בן/בת זוג (מהספח)', needles: ['בן זוג', 'בת זוג', 'בן/בת זוג'], type: 'name' },
            { key: 'child', label: 'ילד/ה (מהספח)', needles: ['ילדים', 'ילד', 'בן', 'בת'], type: 'name', underHeader: 'ילדים' },
        ],
    },
    benefit: {
        issuer: false,
        anchors: [
            // A real beneficiary row carries a percent, an ID or a birth date; title/header lines do not.
            { key: 'benef', label: 'מוטב/ת (לפי המסמך)', needles: ['מוטב', 'מוטבים', 'מוטבת'], type: 'name', require: '\\d{9}|\\d{1,2}[/.]\\d{1,2}[/.]\\d{2,4}|\\d{1,3}(\\.\\d{1,2})?%' },
            { key: 'pct', label: 'שיעור לאחר מוות', needles: [], type: 'percent', underHeader: ['שיעור', 'אחוז'], require: '\\d{1,3}(\\.\\d{1,2})?%' },
        ],
    },
};

function toLines(items) {
    const lines = [];
    const sorted = [...items].sort((a, b) => a.page - b.page || b.y - a.y);
    for (const it of sorted) {
        let line = lines.find(l => l.page === it.page && Math.abs(l.y - it.y) < 3);
        if (!line) { line = { page: it.page, y: it.y, items: [] }; lines.push(line); }
        line.items.push(it);
    }
    for (const l of lines) l.items.sort((a, b) => b.x - a.x); // RTL: rightmost first
    return lines;
}
const lineText = (l) => l.items.map(i => i.str).join(' ');

// items: [{page, x, y, str}] as pdf.js getTextContent returns them.
export function docFromItems(items, profileKey) {
    const profile = PROFILES[profileKey];
    if (!profile) return [];
    const lines = toLines(items);
    const candidates = [];
    const seen = new Set();
    const push = (key, label, value, page, context) => {
        const sig = `${key}|${value}`;
        if (seen.has(sig)) return;
        seen.add(sig);
        candidates.push({ key, label, value, page, context });
    };

    for (const anchor of profile.anchors) {
        const matcher = anchor.type === 'fieldnum' ? MATCHERS.fieldnum(anchor.fieldnum)
            : anchor.type === 'name' ? MATCHERS.name(anchor.needles)
            : MATCHERS[anchor.type];
        let perKey = 0;
        const req = anchor.require ? new RegExp(anchor.require) : null;
        // underHeader anchors scan the header line itself plus lines below it (table rows).
        if (anchor.underHeader) {
            const heads = Array.isArray(anchor.underHeader) ? anchor.underHeader : [anchor.underHeader];
            const header = lines.find(l => heads.some(n => lineText(l).includes(n)));
            if (header) {
                const below = lines
                    .filter(l => l.page === header.page && header.y - l.y > -3 && header.y - l.y < 200)
                    .sort((a, b) => b.y - a.y);
                for (const l of below) {
                    if (perKey >= 6) break;
                    const text = lineText(l);
                    if (req ? !req.test(text) : (!IDNUM_RE.test(text) && !DATE_RE.test(text))) continue;
                    const value = matcher(text);
                    if (value) { push(anchor.key, anchor.label, (anchor.suffix ? value + anchor.suffix : value), l.page, text); perKey++; }
                }
            }
            continue;
        }
        for (const line of lines) {
            if (perKey >= 6) break;
            const text = lineText(line);
            if (anchor.needles.length && !anchor.needles.some(n => text.includes(n))) continue;
            if (!anchor.needles.length && anchor.type === 'fieldnum') {
                const v = matcher(text);
                if (v) { push(anchor.key, anchor.label, (anchor.suffix ? v + anchor.suffix : v), line.page, text); perKey++; }
                continue;
            }
            let value = req && req.test(text) ? matcher(text) : (req ? null : matcher(text));
            let page = line.page;
            let context = text;
            if (!value) {
                const below = lines
                    .filter(l => l.page === line.page && l.y < line.y && line.y - l.y < 40)
                    .sort((a, b) => (line.y - a.y) - (line.y - b.y));
                for (const b of below) {
                    const bt = lineText(b);
                    if (req && !req.test(bt)) continue;
                    const v = matcher(bt);
                    if (v) { value = v; context = bt; break; }
                }
            }
            if (value) { push(anchor.key, anchor.label, (anchor.suffix ? value + anchor.suffix : value), page, context); perKey++; }
        }
    }

    if (profile.issuer) {
        const p1 = lines.filter(l => l.page === 1).map(lineText).join(' ');
        const issuer = ISSUERS.find(name => p1.includes(name));
        if (issuer) push('issuer', 'גוף מנפיק (זוהה בשם)', issuer, 1, '');
    }

    // Field-number captures (042/158) duplicate the label-based capture when both find the same value.
    const labelVals = new Set(candidates.filter(c => !/158|042/.test(c.key)).map(c => `${c.value}|${c.page}`));
    return candidates.filter(c => !(/158|042/.test(c.key) && labelVals.has(`${c.value}|${c.page}`)));
}

export async function extractDoc(buf, profileKey) {
    const pdfjsLib = globalThis.pdfjsLib;
    if (!pdfjsLib) return { candidates: [], error: 'ספריית קריאת ה-PDF לא נטענה. בדקו חיבור ורעננו את העמוד, או הזינו ידנית.' };
    try {
        const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buf.slice(0)) }).promise;
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
            return { candidates: [], error: 'לא נמצא טקסט בקובץ - ככל הנראה מדובר במסמך סרוק (תמונה). הזינו ידנית את הערכים מהמסמך.' };
        }
        return { candidates: docFromItems(items, profileKey) };
    } catch (e) {
        return { candidates: [], error: 'חילוץ אוטומטי נכשל (' + ((e && e.message) || 'שגיאה') + ') - הזינו ידנית מהמסמך' };
    }
}
