import { matchTrack, mandateOf, bucketOf } from './analysis.js';
// השוואת עמיתים מול נתונים רשמיים: גמל-נט ופנסיה-נט של רשות שוק ההון ביטוח וחיסכון (data.gov.il).
// מקור חי: CKAN datastore API (נבדק CORS מהדומיין ב-8.11.2026). גיבוי: תמונת נתונים מתוארכת js/peers-snapshot.js.
// התשואות במאגר נומינליות ברוטו - לפני דמי ניהול. מדד שארפ כפי שמפורסם על ידי הרשות.

const PENSIA_RID = '6d47d6b5-cb08-488b-b333-f1e717b1e1bd';
const GEMEL_RID = 'a30dcbea-a1d2-482c-ae29-8f781f5025fb';
// פנסיה-נט אינו מחזיק עמודות TARGET_POPULATION/SPECIALIZATION/SUB_SPECIALIZATION (קיימות רק בגמל-נט) -
// בקשה עם עמודות שלא קיימות במשאב נכשלת, לכן רשימת שדות נפרדת לכל מאגר.
const FIELDS_PENSIA = 'REPORT_PERIOD,FUND_ID,FUND_NAME,FUND_CLASSIFICATION,MANAGING_CORPORATION,AVG_ANNUAL_MANAGEMENT_FEE,AVG_DEPOSIT_FEE,YIELD_TRAILING_3_YRS,YIELD_TRAILING_5_YRS,SHARPE_RATIO,STANDARD_DEVIATION,STOCK_MARKET_EXPOSURE,TOTAL_ASSETS';
const FIELDS_GEMEL = 'REPORT_PERIOD,FUND_ID,FUND_NAME,FUND_CLASSIFICATION,MANAGING_CORPORATION,TARGET_POPULATION,SPECIALIZATION,SUB_SPECIALIZATION,AVG_ANNUAL_MANAGEMENT_FEE,AVG_DEPOSIT_FEE,YIELD_TRAILING_3_YRS,YIELD_TRAILING_5_YRS,SHARPE_RATIO,STANDARD_DEVIATION,STOCK_MARKET_EXPOSURE,TOTAL_ASSETS';

export const PEERS_SOURCE_NOTE = 'מקור: מאגרי גמל-נט ופנסיה-נט, רשות שוק ההון ביטוח וחיסכון (data.gov.il). תשואות נומינליות ברוטו לפני דמי ניהול.';

async function fetchLatest(rid, fields) {
    const url = `https://data.gov.il/api/3/action/datastore_search?resource_id=${rid}&fields=${fields}&sort=REPORT_PERIOD%20desc&limit=1200`;
    const res = await fetch(url, { mode: 'cors' });
    if (!res.ok) throw new Error('http ' + res.status);
    const j = await res.json();
    const recs = j.result.records;
    const period = Math.max(...recs.map(r => r.REPORT_PERIOD));
    return { rows: recs.filter(r => r.REPORT_PERIOD === period), period };
}

export async function loadPeerData() {
    try {
        const [p, g] = await Promise.all([fetchLatest(PENSIA_RID, FIELDS_PENSIA), fetchLatest(GEMEL_RID, FIELDS_GEMEL)]);
        const period = Math.min(p.period, g.period);
        const rows = [
            ...p.rows.filter(r => r.REPORT_PERIOD === period).map(r => ({ ...r, SRC: 'pensia' })),
            ...g.rows.filter(r => r.REPORT_PERIOD === period).map(r => ({ ...r, SRC: 'gemel' })),
        ];
        return { rows, period, src: 'live' };
    } catch (e) {
        const s = globalThis.PEERS_SNAPSHOT;
        if (!s) throw new Error('no peer data');
        return { rows: s.rows, period: s.meta.report_period, src: 'snapshot', snapDate: s.meta.downloaded };
    }
}

export function periodLabel(period) {
    const s = String(period);
    return `${s.slice(4, 6)}/${s.slice(0, 4)}`;
}

// --- התאמת שמות ---
const STOP = ['מסלול', 'קרן', 'קופת', 'קופה', 'גמל', 'פנסיה', 'השתלמות', 'מקיפה', 'כללית', 'להשקעה', 'בעמ', 'בע"מ', 'חברה', 'לביטוח', 'לבטוח', 'ניהול', 'וגמל', 'ופנסיה', 'מבטחים', '-', '–', 'ה'];
function toks(s) {
    return String(s || '').replace(/[0-9"'״׳.,()\-–]/g, ' ').split(/\s+/).map(t => t.trim()).filter(t => t.length >= 2 && !STOP.includes(t));
}
const TYPE_TOKENS = ['מניות', 'כללי', 'סחיר', 'אגח', 'מדדי', 'מדד', 'עוקב', 'הלכה', 'שקלי', 'צמוד', 'משולב', 'הון'];

function ageBand(name) {
    const m = String(name).match(/לבני\s*(\d+)\s*ומטה/) || String(name).match(/לבני\s*(\d+)-(\d+)/) || String(name).match(/לבני\s*(\d+)\s*ומעלה/);
    if (!m) return '';
    return m[0].replace(/\s+/g, ' ');
}

export function findOwnRow(trackName, kind, rows, trackCode = '', account = {}) {
    const m = matchTrack({ ...account, kind }, trackName, trackCode);
    if (!m.officialId || !m.row) return null;
    const src = kind === 'pensia' ? 'pensia' : 'gemel';
    const row = rows.find(r => r.SRC === src && Number(r.FUND_ID) === m.officialId);
    return row ? { row, score: 1 } : null;
}

function nameSpec(name) {
    const n = String(name || '');
    if (/עוקב|מדדי/.test(n)) return 'מדדי';
    if (n.includes('מניות')) return 'מניות';
    if (n.includes('אג"ח') || n.includes('אגח')) return 'אגח';
    if (n.includes('סחיר')) return 'סחיר';
    if (n.includes('הלכה')) return 'הלכה';
    if (n.includes('כללי')) return 'כללי';
    return '';
}

function exposureBucket(row) {
    const assets = Number(row.TOTAL_ASSETS), eq = Number(row.STOCK_MARKET_EXPOSURE);
    if (row.TOTAL_ASSETS == null || row.STOCK_MARKET_EXPOSURE == null || !Number.isFinite(assets) || assets <= 0 || !Number.isFinite(eq)) return null;
    return bucketOf(eq / assets * 100)?.key ?? null;
}
export function peerGroup(row) {
    return [row.SRC, row.FUND_CLASSIFICATION || '', mandateOf(row.FUND_NAME), exposureBucket(row), row.REPORT_PERIOD].join('|');
}

function mean(xs) {
    if (!xs.length) return null;
    return xs.reduce((a, b) => a + b, 0) / xs.length;
}
function median(xs) {
    if (!xs.length) return null;
    const a = [...xs].sort((x, y) => x - y);
    const m = a.length >> 1;
    return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

export function compareTrack(ownRow, rows) {
    const key = peerGroup(ownRow);
    // קבוצת השוואה: אותו סיווג, התמחות וקובץ גיל, באותה תקופת דיווח (09/2026), רק קופות עם נתוני 3 שנים ושארפ מלאים.
    // קופות סקטוריאליות/מפעליות אינן פתוחות להצטרפות חופשית; ערך ריק (שכיח בפנסיה-נט) נחשב פתוח.
    const numeric = v => v != null && v !== '' && Number.isFinite(Number(v));
    const comparable = exposureBucket(ownRow) == null ? [] : rows.filter(r => peerGroup(r) === key && (!r.TARGET_POPULATION || r.TARGET_POPULATION === 'כלל האוכלוסיה'));
    const peers = comparable.filter(r => numeric(r.SHARPE_RATIO) && numeric(r.YIELD_TRAILING_3_YRS));
    const y3s = peers.map(r => Number(r.YIELD_TRAILING_3_YRS));
    const sharps = peers.map(r => Number(r.SHARPE_RATIO));
    // ממוצע פשוט (שווה-משקל): כל קופה נספרת פעם אחת, ללא שקלול לפי נכסים. חציון מוצג בנפרד ומסומן.
    const avgY3 = mean(y3s), avgSharpe = mean(sharps);
    const medY3 = median(y3s), medSharpe = median(sharps);
    const belowAvgY3 = ownRow.YIELD_TRAILING_3_YRS !== null && avgY3 !== null && ownRow.YIELD_TRAILING_3_YRS < avgY3;
    const belowAvgSharpe = ownRow.SHARPE_RATIO !== null && avgSharpe !== null && ownRow.SHARPE_RATIO < avgSharpe;
    const others = peers.filter(r => r.FUND_ID !== ownRow.FUND_ID);
    // שתי רשימות דירוג נפרדות: לפי תשואת 3 שנים, ולפי שארפ. אין שקלול שרירותי בין המדדים.
    const topByY3 = [...others].sort((a, b) => b.YIELD_TRAILING_3_YRS - a.YIELD_TRAILING_3_YRS).slice(0, 3);
    const topBySharpe = [...others].sort((a, b) => b.SHARPE_RATIO - a.SHARPE_RATIO).slice(0, 3);
    return {
        comparisons: comparable.filter(r => Number(r.FUND_ID) !== Number(ownRow.FUND_ID)).slice(0, 3), peersCount: peers.length, avgY3, avgSharpe, medY3, medSharpe,
        belowAvgBoth: belowAvgY3 && belowAvgSharpe, topByY3, topBySharpe,
    };
}

// שערי בדיקה לפני כל שקלול ניוד - מקורות רשמיים, נבדקו 8.11.2026.
export const TRANSFER_GATES = {
    title: 'שערי בדיקה לפני שקלול העברה (לא המלצה ולא הוראת פעולה)',
    src: 'מקורות (נקראו מול הנוסח ב-8.11.2026): חוזר רשות שוק ההון, ביטוח וחיסכון "העברת כספים בין קופות גמל" מיום 17.9.2017, סעיפים 3-4 (עותק: https://www.prisha.co.il/UserFiles/File/pdf/hoz/hoz2017917.pdf ; המקור הרשמי: cma.gov.il); תקנות הפיקוח על שירותים פיננסיים (קופות גמל) (העברת כספים בין קופות גמל), תשס"ח-2008 (עותק: https://www.nevo.co.il/law_html/law01/999_929.htm); תקנון הקרן הרלוונטית.',
    items: [
        'ותק ותקופת אכשרה: בעברה של עמית פעיל, חודשי הביטוח שנצברו עוברים לקרן החדשה (סעיף 4.ב(1) לחוזר). העברה כשהעמית לא פעיל עלולה לאפס את הותק ולהתחיל תקופת אכשרה חדשה של 60 חודשים.',
        'גידול בכיסוי: אם קצבת הנכות או קצבת השאירים בקופה המקבלת עולה ביותר מ-10% על הרעיונית - על התוספת לא ייחשבו חודשי הותק, ותחול אכשרה חדשה (סעיף 4.ב(2)).',
        'החרגות ותוספות חיתום: אם נקבעה בקופה המעבירה החרגה רפואית או תוספת חיתום לסיכון מסוים, הותק לא ייחשב לאותו סיכון בקופה המקבלת (סעיף 4.ב(3)).',
        'חסימות ניוד: הלוואה פתוחה על החשבון, עיקול/שעבוד, קצבת זקנה שכבר משולמת מהיתרה, או תביעת נכות בטיפול - חוסמים העברה (תקנות הניוד).',
        'מועד קובע לכיסוי: הכיסוי הביטוחי עובר בין הקופות במועד הקובע; בקשה מלאה וחתומה מוגשת לקופה המקבלת, ולה 10 ימי עסקים להעברה.',
        'קרן פנסיה מקיפה: מעבר למקיפה תוך המשך הפקדות לקופה הישנה אינו אפשרי; בקופת גמל להשקעה - העברה לקופה לקצבה רק מגיל 60.',
        'פוליסת ביטוח מנהלים/חיסכון: אינה קופת גמל; יציאה ממנה היא פדיון עם מס רווחי הון, לא ניוד, ויש לבדוק אובדן זכויות (מקדם מובטח, תשואה מובטחת, דמי ניהול מוסכמים) לפני כל פעולה.',
    ],
};

export const EXISTING_VS_FUTURE_NOTE = 'ההשוואה מתייחסת לכסף הקיים (הצבירה). הפקדות עתידיות הן החלטה נפרדת: אפשר לנייד את הצבירה למסלול אחד ולהפנות הפקדות חדשות למסלול אחר באותה קופה או בקופה אחרת, בכפוף לכללי הקופה.';

export const BASELINE_NOTE = 'קו הבסיס להשוואה הוא תמיד "ללא שינוי": שמירת הכסף במסלול הנוכחי. כל חלופה מוצגת מולו, כולל דמי הניהול המוצעים בפועל מול דמי הניהול הנוכחיים.';
