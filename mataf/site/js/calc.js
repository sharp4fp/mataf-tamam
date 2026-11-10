// כרטסת מחשבונים - מחשבונים קטנים וממוקדים, כל אחד עם תווית מקור.
// פעיל: דמי ניהול לאורך זמן (אריתמטיקה על נתוני משתמש). הסבר בלבד ללא חישוב אישי: פיצויים, קצבה מוכרת (מודול חינוכי), גיל פרישה (טבלת מקור).
// מושהים לאימות מקור: קצבה מוכרת, גיל פרישה - מוצג הסבר בלבד, בלי נוסחה שאומצה בלי גיבוב.
import { EXEMPT_CAP_2026 } from './analysis.js';

const escC = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const fmtC = (n) => Math.round(n).toLocaleString('he-IL');

// --- מחשבון 1: דמי ניהול לאורך זמן (אריתמטי בלבד) ---
// הדמיה חודשית פשוטה: הפקדה נטו אחרי דמי הפקדה, תשואה חודשית קבועה, ניכוי דמי צבירה והוצאות ישירות.
// ההשוואה לאפס דמי ניהול מחזירה את העלות השקלית המצטברת. אין כאן תחזית תשואה - התשואה היא קלט של המשתמש.
export function feeCostOverTime({ balance = 0, monthly = 0, feeDepositPct = 0, feeAccPct = 0, directAnnual = 0, returnPct = 0, years = 0 }) {
    const r = (returnPct || 0) / 100 / 12;
    const months = Math.max(0, Math.round((years || 0) * 12));
    const grow = (b0, withFees) => {
        let b = Math.max(0, balance);
        for (let m = 0; m < months; m++) {
            const dep = withFees ? monthly * (1 - (feeDepositPct || 0) / 100) : monthly;
            b += dep;
            b *= (1 + r);
            if (withFees) {
                b -= b * (feeAccPct || 0) / 100 / 12;
                b -= (directAnnual || 0) / 12;
            }
            if (b < 0) b = 0;
        }
        return b;
    };
    const withFees = grow(balance, true);
    const zeroFee = grow(balance, false);
    return { withFees, zeroFee, cost: zeroFee - withFees, months };
}

// --- מחשבון 2: פיצויים - תקרת הפטור (קבועי 2026 מאומתים במערכת) ---
// אותה נוסחה כבר מוטמעת בבדיקת השכפול של טופס 161: תקרה = מינימום(שכר אחרון x 1.5, 13,750) לכל שנת עבודה.
// תקרת 13,750 ₪ לשנת עבודה קפואה 2025-2027 (סעיף 9(7א)(א)); מאומת מול לוח הניכויים ינואר 2026, gov.il.
export function severanceExemptCap({ years = 0, salaryLast = 0, grant = 0 }) {
    const cap = Math.min((salaryLast || 0) * 1.5, EXEMPT_CAP_2026) * (years || 0);
    const exempt = Math.min(grant || 0, cap);
    return { cap, exempt, taxable: Math.max(0, (grant || 0) - exempt) };
}

function cField(state, key, label, extra = '') {
    const v = state.calc[key] ?? '';
    return `<label class="ins-field">${label}<input type="number" data-calc="${key}" value="${escC(v)}" ${extra}></label>`;
}
function num(state, key) { const v = parseFloat(state.calc[key]); return isNaN(v) ? 0 : v; }
function has(state, key) { const v = state.calc[key]; return v !== undefined && v !== ''; }

export function renderCalcTab(state) {
    const c = state.calc;
    // דמי ניהול
    let feeRes = '';
    if (has(state, 'f_years') && num(state, 'f_years') > 0 && (has(state, 'f_balance') || has(state, 'f_monthly'))) {
        const r = feeCostOverTime({
            balance: num(state, 'f_balance'), monthly: num(state, 'f_monthly'),
            feeDepositPct: num(state, 'f_feedep'), feeAccPct: num(state, 'f_feeacc'),
            directAnnual: num(state, 'f_direct'), returnPct: num(state, 'f_ret'), years: num(state, 'f_years'),
        });
        feeRes = `<div class="track-line"><span>עלות דמי הניהול המצטברת עד הפרישה</span><b>${fmtC(r.cost)} ₪</b></div>
            <div class="muted small">צבירה עם דמי ניהול: ${fmtC(r.withFees)} ₪ מול ${fmtC(r.zeroFee)} ₪ באפס דמי ניהול, לאורך ${r.months} חודשים. ההפרש הוא איבוד תשואה מצטברת על הדמי, לא רק סכום הדמי שנגבו.</div>`;
    }
    // פיצויים - תצוגת תקרה והסבר בלבד (ללא תוצאה אישית מחושבת עד אכיפת כל תנאי הסף)
    // קצבה מוכרת - מודול חינוכי: פטור מלא ב-9א(ב1) רק עם סיווג קופה + עובדת זכאות; אחרת מצב לא-ידוע
    let recRes = '';
    if (has(state, 'r_amount') && num(state, 'r_amount') > 0) {
        if (c.r_elig === 'yes') recRes = `<div class="track-line"><span>חלק פטור (לפי 9א(ב1))</span><b>${fmtC(num(state, 'r_amount'))} ₪ לחודש</b></div><div class="muted small">בכפוף לסיווג הקופה בפועל ולעובדת הזכאות שהוזנה. סיווג או תנאי שמשתנים משנים את התשובה.</div>`;
        else if (c.r_elig === 'no') recRes = `<div class="muted small">על פי הסימון, לא מתקיים אף תנאי מ-9א(ב1) (לא גיל 60+, לא גיל פרישה, לא נכות) ולכן לא מוצג חלק פטור בסעיף זה. אם זכאות נכות לא נבדקה או שהסימון אינו ודאי - התשובה עלולה להשתנות; יש לוודא מול הקופה לפני מסקנה.</div>`;
        else recRes = `<div class="muted small">תנאי הזכאות לא ידוע - לא מוצג חלק פטור עד שיסומן.</div>`;
    }
    return `
        <div class="group-label">מחשבונים</div>
        <h2>מחשבונים ממוקדים</h2>
        <div class="note small">כל מחשבון עובד רק על הערכים שמוזנים בו, עם תווית מקור משלו. הערכים בזיכרון הדפדפן בלבד ונמחקים ברענון. קיבוע זכויות נשאר בכרטסת תכנון פרישה.</div>
        <div class="card">
            <div class="group-label">1 · דמי ניהול לאורך זמן</div>
            <div class="ins-grid">
                ${cField(state, 'f_balance', 'צבירה נוכחית (₪)', 'min="0"')}
                ${cField(state, 'f_monthly', 'הפקדה חודשית (₪)', 'min="0"')}
                ${cField(state, 'f_feedep', 'דמי ניהול מהפקדה (%)', 'min="0" max="100" step="0.01"')}
                ${cField(state, 'f_feeacc', 'דמי ניהול מצבירה (%)', 'min="0" max="100" step="0.001"')}
                ${cField(state, 'f_direct', 'הוצאות ישירות (₪ לשנה)', 'min="0"')}
                ${cField(state, 'f_ret', 'תשואה שנתית להדמיה (%)', 'step="0.1"')}
                ${cField(state, 'f_years', 'שנים עד הפרישה', 'min="0" max="50"')}
            </div>
            ${feeRes}
            <div class="muted small">מקור: חישוב אריתמטי בלבד על ערכי המשתמש (תשואה קבועה להדמיה, חיוב דמי צבירה חודשי). נוסחה נבדקה 10.11.2026. כדי להזין את דמי הניהול בפועל של הלקוח, ראו תיק הנכסים בכרטסת תיק פנסיוני.</div>
        </div>
        <div class="card">
            <div class="group-label">2 · פיצויים - תקרת הפטור (הסבר, ללא חישוב אישי עדיין)</div>
            <div class="muted small">תקרת הפטור על מענק פיצויים ב-2026: <b>${fmtC(EXEMPT_CAP_2026)} ₪ לכל שנת עבודה</b> (סעיף 9(7א)(א) לפקודה; לוח הניכויים הרשמי של רשות המסים ל-2026, עמ׳ 13). לפי טופס 161 הרשמי (הערה 28): הפטור הוא מינימום המענק בפועל מול מינימום(שכר אחרון x1.5, התקרה השנתית) כפול תקופת העבודה - בכפוף לכל תנאי הסף שבטופס (כולל שבע הכתובות בחלופה ב׳), לחלקי שנים יחסית, ובמקרה פטירה תקרה אחרת (27,520 ₪ לשנה).</div>
            <div class="muted small"><b>מחשבון אישי אינו פעיל עדיין</b> - לא יוצג פטור אישי מחושב בלי אכיפת כל התנאים. הבחירה בין פטור עכשיו, רצף קצבה, רצף פיצויים ופריסת מס מחושבת בכרטסת תכנון פרישה מתוך טופס 161. מקורות: <a href="https://www.gov.il/BlobFolder/generalpage/income-tax-monthly-deductions-booklet/he/generalInformation_income-tax-monthly-deductions-booklet_monthly-deductions-booklet-2026.pdf" target="_blank" rel="noopener">לוח הניכויים 2026</a> · <a href="https://www.gov.il/BlobFolder/service/notice-of-retirement/he/tofes-161.pdf" target="_blank" rel="noopener">טופס 161 הרשמי</a> (gov.il), נקראו 10.11.2026.</div>
        </div>
        <div class="card">
            <div class="group-label">3 · קצבה מוכרת</div>
            <div class="muted small">קצבה מוכרת היא החלק שמקורו בהפקדות שלא זכו בהטבת מס ("תשלומים פטורים"), והיא אינה חלק מהקצבה המזכה. לפי סעיף 9א(ב1) לפקודה היא <b>פטורה ממס</b> למי שמלאו לו 60 שנה, שפרש ב"גיל פרישה" כהגדרתו, או במקרה של נכות כאמור בסעיף. היא שונה מהקצבה המזכה, שפטורה בחלקה (57.5% מתקרת 9,430 ₪ ב-2026, 9א(ב)) ותלויה בקיבוע זכויות - אין ליישם נוסחה אחת על השנייה.</div>
            <div class="ins-grid">
                ${cField(state, 'r_amount', 'קצבה מוכרת חודשית כפי שסווגה על ידי הקופה (₪)', 'min="0"')}
                <label class="ins-field">תנאי זכאות 9א(ב1)<select data-calc="r_elig"><option value=""${!c.r_elig ? ' selected' : ''}>לא ידוע / לא נבדק</option><option value="yes"${c.r_elig === 'yes' ? ' selected' : ''}>כן - גיל 60+, גיל פרישה, או נכות</option><option value="no"${c.r_elig === 'no' ? ' selected' : ''}>נבדק - לא מתקיים אף תנאי (לא 60+, לא גיל פרישה, לא נכות)</option></select></label>
            </div>
            ${recRes}
            <div class="muted small">מקור: פקודת מס הכנסה (נוסח מעודכן 2026) סעיף 9א, ומדריך קיבוע הזכויות הרשמי 161ד 2026 עמ׳ 2-4 (gov.il) - נקראו 10.11.2026. הסיווג והגובה מאומתים רק מול אישור הקופה; אין לגזור את החלק המוכר מיתרה או מקצבה כוללת.</div>
        </div>
        <div class="card">
            <div class="group-label">4 · גיל פרישה - טבלת מקור (הקשר קצבת זקנה)</div>
            <div class="muted small">הטבלה מועתקת מדף הביטוח הלאומי הרשמי (נקרא 10.11.2026), בהקשר קצבת הזקנה - <b>זו אינה תאריך זכאות אישי אוניברסלי</b>: גיל פרישה אינו בהכרח חודש התשלום הראשון (כלל ה-15 בחודש), מבחן הכנסה חל בגיל הפרישה (הכנסה מקצבה אינה נספרת, לפי הדף), ובגיל 70 הזכאות לשני המינים ללא מבחן הכנסה. ילידי שנים מוקדמות יותר - לפי הטבלה המלאה במקור בלבד.</div>
            <table class="altstbl">
                <thead><tr><th>שנת לידה (נשים)</th><th>גיל פרישה</th><th>שנת לידה (נשים)</th><th>גיל פרישה</th></tr></thead>
                <tbody>
                    <tr><td>1960</td><td>62 ו-4 חודשים</td><td>1966</td><td>64</td></tr>
                    <tr><td>1961</td><td>62 ו-8 חודשים</td><td>1967</td><td>64 ו-3 חודשים</td></tr>
                    <tr><td>1962</td><td>63</td><td>1968</td><td>64 ו-6 חודשים</td></tr>
                    <tr><td>1963</td><td>63 ו-3 חודשים</td><td>1969</td><td>64 ו-9 חודשים</td></tr>
                    <tr><td>1964</td><td>63 ו-6 חודשים</td><td>1970 ואילך</td><td>65</td></tr>
                    <tr><td>1965</td><td>63 ו-9 חודשים</td><td><b>גברים (כל השנים)</b></td><td><b>67</b></td></tr>
                </tbody>
            </table>
            <div class="muted small">מקור: ביטוח לאומי, <a href="https://www.btl.gov.il/benefits/old_age/Conditions_of_eligibility/gilMezake/Pages/gilPrisha.aspx" target="_blank" rel="noopener">גיל פרישה</a> ו-<a href="https://www.btl.gov.il/benefits/old_age/Conditions_of_eligibility/gilMezake/Pages/gilZakaut.aspx" target="_blank" rel="noopener">גיל זכאות (70)</a> (btl.gov.il). <b>מחשבון אישי אינו פעיל עדיין</b> - החוק והמבחנים המלאים לא אומתו; דף ישן של הביטוח הלאומי עם נוסח סותר (1956) זוהה ואינו בשימוש.</div>
        </div>`;
}

export function calcApply(state, key, value) { state.calc[key] = value; }
export const CALC_INIT = {};
