// constants-year.js - M-069: רשימה אחת של הקבועים התלויים בשנת מס, עם שנת תוקף ומקור בספרייה.
// כלל: כשמשנים קבוע בקוד - מעדכנים כאן (test-constants-year בודק התאמה לקוד ונכשל אחרת).
// "validThrough" = השנה האחרונה שבה הערך אומת מול מקור רשמי. שנה מאוחרת נרשמת רק אחרי בדיקה מול הפרסום של אותה שנה.
// הערה: חוק ההתייעלות הכלכלית (הקפאת עדכוני מס ומס יסף), ס"ח 3342, קובע שב-1 בינואר 2025-2027 לא יתואמו "מרבית" הסכומים
// לפי סעיף 120ב (לוח הניכויים 2026, עמ' 3). "מרבית" - לא כולם, ולכן גם ב-2027 כל ערך נבדק מול לוח הניכויים 2027.
// שיעורי הפטור על קצבה מזכה (exemptPctForYear ב-retire-engine.js) קבועים בחוק לכל שנה ואינם ברשימה זו;
// בדיקת תיקון לסעיף 9א נעשית בכל ריצת ספרייה (LIBRARY-PROGRESS-HE.md).

const BOOKLET = 'לוח הניכויים 2026 (tax-booklet-2026)';
const ITO = 'פקודת מס הכנסה, נוסח מאוחד בל"ל (ito-consolidation-btl-retained20261109)';

export const YEAR_CONSTANTS = [
    { name: 'KITZBA_MAZKE_2026', file: 'analysis.js', label: 'תקרת הקצבה המזכה (לחודש)', value: 9430, validThrough: 2026, source: ITO + ' סעיף 9א(א), עמ\' 26; מדריך 161ד 2026 עמ\' 3' },
    { name: 'K.MAZKE', file: 'retire-engine.js', label: 'תקרת הקצבה המזכה (מנוע הפרישה)', value: 9430, validThrough: 2026, source: 'כמו KITZBA_MAZKE_2026' },
    { name: 'MAZKE (app.js)', file: 'app.js', label: 'תקרת הקצבה המזכה (מחשבון הקיבוע וחלוקת הכספים)', value: 9430, validThrough: 2026, source: 'כמו KITZBA_MAZKE_2026' },
    { name: 'EXEMPT_CAP_2026', file: 'analysis.js', label: 'תקרת המענק הפטור לשנת עבודה', value: 13750, validThrough: 2026, source: ITO + ' סעיף 9(7א)(א)(2), עמ\' 19; ' + BOOKLET + ' עמ\' 12' },
    { name: 'K.GRANT_CAP_PER_YEAR', file: 'retire-engine.js', label: 'תקרת המענק הפטור לשנת עבודה (מנוע הפרישה)', value: 13750, validThrough: 2026, source: 'כמו EXEMPT_CAP_2026' },
    { name: 'DEATH_CAP_PER_YEAR', file: 'retire-engine.js', label: 'תקרת מענק פטור עקב מוות לשנת עבודה', value: 27520, validThrough: 2026, source: ITO + ' סעיף 9(7א)(ב)(2), עמ\' 20' },
    { name: 'DEFAULT_CONT_CAP_2026', file: 'analysis.js', label: 'תקרת רצף קצבה ברירת מחדל', value: 405900, validThrough: 2026, source: ITO + ' סעיף 9(7א)(ז1), עמ\' 21' },
    { name: 'SEVERANCE_CEILING_2026', file: 'analysis.js', label: 'תקרת הפיצויים (לחודש)', value: 45600, validThrough: 2026, source: ITO + ' סעיף 3(ה3), עמ\' 10; ' + BOOKLET + ' עמ\' 12' },
    { name: 'TAX_BRACKETS_2026_MONTHLY', file: 'analysis.js', label: 'מדרגות מס הכנסה (לחודש)', value: [[7010, 0.10], [10060, 0.14], [19000, 0.20], [25100, 0.31], [46690, 0.35], [null, 0.47]], validThrough: 2026, source: BOOKLET + ', סעיף 121' },
    { name: 'SURTAX_MONTHLY_THRESHOLD_2026', file: 'analysis.js', label: 'סף מס יסף (לחודש)', value: 60130, validThrough: 2026, source: BOOKLET + ', סעיף 121ב' },
    { name: 'SURTAX_RATE_2026', file: 'analysis.js', label: 'שיעור מס יסף', value: 0.03, validThrough: 2026, source: BOOKLET + ', סעיף 121ב' },
    { name: 'CREDIT_POINT_MONTHLY_2026', file: 'analysis.js', label: 'ערך נקודת זיכוי (לחודש)', value: 242, validThrough: 2026, source: BOOKLET },
    { name: 'TAX_TABLES (שנה אחרונה)', file: 'retire-data.js', label: 'טבלאות המס של מנוע הפרישה - השנה האחרונה', value: 2026, validThrough: 2026, source: 'engine-data-20261111/tax-brackets-2020-2026.json' },
];

// השנה הראשונה שבה לפחות קבוע אחד כבר לא בתוקף
export const CONSTANTS_YEAR = Math.min(...YEAR_CONSTANTS.map(c => c.validThrough));

// מצב הקבועים בתאריך נתון (ברירת מחדל: היום, לפי שעון המשתמש).
// stale - קבועים שתוקפם עבר; reminder - 20-31 בדצמבר של שנת התוקף האחרונה (לוח הניכויים לשנה הבאה צפוי).
export function constantsStatus(now = new Date()) {
    const y = now.getFullYear(), m = now.getMonth() + 1, d = now.getDate();
    const stale = YEAR_CONSTANTS.filter(c => y > c.validThrough);
    const reminder = !stale.length && m === 12 && d >= 20 && YEAR_CONSTANTS.some(c => c.validThrough === y);
    return { year: y, stale, reminder, constantsYear: CONSTANTS_YEAR };
}

// הפס בראש המסך. ריק כשהקבועים בתוקף. החישוב לא נחסם.
export function staleBannerHtml(now = new Date()) {
    const st = constantsStatus(now);
    if (!st.stale.length) return '';
    const years = [...new Set(st.stale.map(c => c.validThrough))].sort();
    return `<div class="note small" id="constants-stale" role="status"><b>קבועי המס בחישוב הם של ${years.join(', ')} ולא עודכנו ל-${st.year} - לא אומת.</b> `
        + `החישובים ממשיכים לעבוד בקבועים הישנים (${st.stale.length} קבועים: ${[...new Set(st.stale.map(c => c.label))].join(', ')}). `
        + `יש לבדוק מול לוח הניכויים הרשמי של ${st.year} לפני הסתמכות.</div>`;
}
