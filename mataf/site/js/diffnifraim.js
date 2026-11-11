// ===== השוואת מסלקות (חדשה מול קודמת) והתאמת נפרעים =====
// כל הנתונים מוצגים כפי שחולצו מהקבצים שהועלו בלבד; ערך חסר מוצג כ"לא התקבל מידע"
// ואינו מומצא. כל העיבוד בדפדפן בלבד.

const escH = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const fmtN = (n) => (n === null || n === undefined || !isFinite(n)) ? null : Math.round(n).toLocaleString('he-IL');
import { dedupeAccounts } from './analysis.js';
import { normalizeIdNumber } from './maslaka.js';

const NOINFO = 'לא התקבל מידע';

// ---------- השוואת מסלקות ----------

function acctKey(a) { return `${a.yatzran || ''}|${a.account || ''}`; }

function prevCount(r) { return r.accounts.filter(a => a.prev).length; }
function currCount(r) { return r.accounts.filter(a => a.curr).length; }

function rejectedCardHtml(a, label, dates) {
    const side = a.status === 'both-rejected' ? 'בשתי המסלקות' : a.status === 'prev-rejected' ? 'במסלקה הקודמת' : 'במסלקה הנוכחית';
    const list = (rr, tag) => rr ? (rr.versions || []).map(v => `${tag} ${escH(v.record.asOf || 'תאריך לא ידוע')}: ₪${(v.balance || 0).toLocaleString('he-IL')}`).join(', ') : '';
    const vers = [list(a.prevRejected, 'קודמת'), list(a.currRejected, 'נוכחית')].filter(Boolean).join(' · ');
    return `<div class="diff-acct"><div class="diff-acct-head">⚠ ${label} <span class="muted small">(${dates})</span></div>
        <div class="muted small">החשבון נדחה ${side} עקב גרסאות סותרות של אותו דוח (${vers}) - אינו ניתן להשוואה. אין לפרש אותו כחשבון חדש או כחשבון שהוסר; טענו דוח אחד לא-חופף כדי להשוות.</div></div>`;
}

function missingCell(pv, cv) {
    const pMiss = pv === null || pv === undefined;
    const cMiss = cv === null || cv === undefined;
    if (pMiss && cMiss) return '<td class="diff-na">לא ניתן להשוות - חסר בשני הקבצים</td>';
    if (pMiss) return '<td class="diff-na">חסר במסלקה הקודמת</td>';
    if (cMiss) return '<td class="diff-na">חסר במסלקה הנוכחית</td>';
    return null;
}

function deltaCell(pv, cv, suffix = ' ₪') {
    const miss = missingCell(pv, cv);
    if (miss) return miss;
    const d = cv - pv;
    if (!isFinite(d) || d === 0) return '<td class="diff-same">ללא שינוי</td>';
    const cls = d > 0 ? 'diff-up' : 'diff-down';
    const pctPart = pv !== 0 ? ` (${d > 0 ? '+' : ''}${(Math.round(d / pv * 1000) / 10).toLocaleString('he-IL')}%)` : '';
    return `<td class="${cls}">${d > 0 ? '+' : ''}${fmtN(d)}${suffix}${pctPart}</td>`;
}

function rowNum(label, pv, cv, suffix = ' ₪') {
    const pvTxt = pv === null || pv === undefined ? NOINFO : fmtN(pv) + suffix;
    const cvTxt = cv === null || cv === undefined ? NOINFO : fmtN(cv) + suffix;
    return `<tr><td>${label}</td><td>${pvTxt}</td><td>${cvTxt}</td>${deltaCell(pv, cv, suffix)}</tr>`;
}

// סכומים מקבוצות שונות מוצגים ללא עמודת שינוי כלל - לא מחשבים ולא מציגים דלתא ביניהם.
function rowNumNoDelta(label, pv, cv, suffix = ' ₪') {
    const pvTxt = pv === null || pv === undefined ? NOINFO : fmtN(pv) + suffix;
    const cvTxt = cv === null || cv === undefined ? NOINFO : fmtN(cv) + suffix;
    return `<tr><td>${label}</td><td>${pvTxt}</td><td>${cvTxt}</td><td class="muted small">לא ניתן להשוואה</td></tr>`;
}

function rowPctVal(label, pv, cv) {
    const f = (v) => v === null || v === undefined ? NOINFO : v.toLocaleString('he-IL') + '%';
    return `<tr><td>${label}</td><td>${f(pv)}</td><td>${f(cv)}</td>${deltaCell(pv, cv, '%')}</tr>`;
}

function rowTxt(label, pv, cv) {
    const blank = (v) => v === null || v === undefined || v === '';
    const f = (v) => blank(v) ? NOINFO : escH(v);
    let cell;
    if (blank(pv) && blank(cv)) cell = '<td class="diff-na">לא ניתן להשוות - חסר בשני הקבצים</td>';
    else if (blank(pv)) cell = '<td class="diff-na">חסר במסלקה הקודמת</td>';
    else if (blank(cv)) cell = '<td class="diff-na">חסר במסלקה הנוכחית</td>';
    else if (pv === cv) cell = '<td class="diff-same">ללא שינוי</td>';
    else cell = '<td class="diff-up">שונה</td>';
    return `<tr><td>${label}</td><td>${f(pv)}</td><td>${f(cv)}</td>${cell}</tr>`;
}

export function diffPortfolios(prev, curr) {
    // שני הצדדים מנוקים מרשומות מתנגשות לפני ההשוואה (אידמפוטנטי - אצל קורא שכבר ניקה אין שינוי).
    // רשימות הדחייה נשמרות משני הצדדים: חשבון שנדחה אינו "חדש" ואינו "הוסר", והסכומים אינם ברי-השוואה.
    const ddP = dedupeAccounts(prev.accounts || []);
    const prevRej = [...new Set([...(prev.rejectedPrev || []), ...((prev.accounts || []).rejectedVersions || []), ...ddP.rejected])];
    const ddC = dedupeAccounts(curr.accounts || []);
    const currRej = [...new Set([...(curr.rejectedImports || []), ...((curr.accounts || []).rejectedVersions || []), ...ddC.rejected])];
    prev = { ...prev, accounts: ddP.accounts, rejectedPrev: prevRej };
    curr = { ...curr, accounts: ddC.accounts, rejectedImports: currRej };
    const idOf = (p) => p && p.client && p.client.id ? normalizeIdNumber(p.client.id) : '';
    const nameOf = (p) => (p && (p.clientName || (p.client && p.client.name)) || '').trim();
    let identityWarning = null;
    const pid = idOf(prev), cid = idOf(curr);
    if (pid && cid && pid !== cid) identityWarning = `מספרי הזהות בשני הקבצים שונים (${escH(pid)} מול ${escH(cid)}).`;
    else {
        const pn = nameOf(prev), cn = nameOf(curr);
        if (pn && cn && pn !== cn) identityWarning = `שם הלקוח שונה בין הקבצים ("${escH(pn)}" מול "${escH(cn)}").`;
    }
    const prevMap = new Map(prev.accounts.map(a => [acctKey(a), a]));
    const currMap = new Map(curr.accounts.map(a => [acctKey(a), a]));
    // חשבונות שהיו במסלקה הקודמת ונדחו ממנה (גרסאות סותרות): נשמרים כזהות קיימת-לא-פתורה.
    // אין להציג אותם כ"חדשים" ואין להשליך אותם מהסכום ולהציג גידול מלא.
    const rejectedPrev = new Map();
    for (const r of (prev.rejectedPrev || [])) {
        for (const v of (r.versions || [])) {
            if (v.record) rejectedPrev.set(acctKey(v.record), r);
        }
    }
    const rejectedCurr = new Map();
    for (const r of (curr.rejectedImports || [])) {
        for (const v of (r.versions || [])) {
            if (v.record) rejectedCurr.set(acctKey(v.record), r);
        }
    }
    const accounts = [];
    for (const [k, c] of currMap) {
        const p = prevMap.get(k);
        if (rejectedCurr.has(k) && rejectedPrev.has(k)) accounts.push({ key: k, curr: null, prev: null, prevRejected: rejectedPrev.get(k), currRejected: rejectedCurr.get(k), status: 'both-rejected' });
        else if (rejectedCurr.has(k)) accounts.push({ key: k, curr: null, prev: prevMap.get(k) || null, currRejected: rejectedCurr.get(k), prevRejected: rejectedPrev.get(k) || null, status: 'curr-rejected' });
        else if (p) accounts.push({ key: k, curr: c, prev: p, status: 'matched' });
        else if (rejectedPrev.has(k)) accounts.push({ key: k, curr: c, prev: null, prevRejected: rejectedPrev.get(k), status: 'prev-rejected' });
        else accounts.push({ key: k, curr: c, prev: p || null, status: 'new' });
    }
    for (const [k, p] of prevMap) {
        if (!currMap.has(k) && !rejectedCurr.has(k) && !rejectedPrev.has(k)) accounts.push({ key: k, curr: null, prev: p, status: 'removed' });
        else if (!currMap.has(k) && rejectedCurr.has(k) && !rejectedPrev.has(k)) accounts.push({ key: k, curr: null, prev: p, currRejected: rejectedCurr.get(k), status: 'curr-rejected' });
    }
    for (const [k, r] of rejectedPrev) {
        if (!currMap.has(k) && !rejectedCurr.has(k)) accounts.push({ key: k, curr: null, prev: null, prevRejected: r, status: 'prev-rejected' });
    }
    const sum = (p) => p ? p.accounts.reduce((n2, a) => n2 + (a.totalBalance || 0), 0) : null;
    const prevRejectedCount = (prev.rejectedPrev || []).length;
    const currRejectedCount = (curr.rejectedImports || []).length;
    // סכום משותף: רק חשבונות עם רשומה תקינה משני הצדדים. אין דלתא כוללת בין קבוצות שונות.
    const matched = accounts.filter(a => a.status === 'matched');
    return { accounts, prevTotal: sum(prev), currTotal: sum(curr), identityWarning,
        prevPartial: prevRejectedCount > 0, prevRejectedCount, currPartial: currRejectedCount > 0, currRejectedCount,
        matchedCount: matched.length, cmpPrevTotal: matched.reduce((n2, a) => n2 + (a.prev.totalBalance || 0), 0), cmpCurrTotal: matched.reduce((n2, a) => n2 + (a.curr.totalBalance || 0), 0) };
}

function trackRows(prevAcct, currAcct) {
    const pm = new Map((prevAcct.tracks || []).map(t => [t.name, t.balance]));
    const cm = new Map((currAcct.tracks || []).map(t => [t.name, t.balance]));
    const names = [...new Set([...pm.keys(), ...cm.keys()])].sort();
    return names.map(n => {
        const pv = pm.has(n) ? pm.get(n) : null;
        const cv = cm.has(n) ? cm.get(n) : null;
        const tag = pv === null ? ' (מסלול חדש)' : cv === null ? ' (הוסר)' : '';
        return rowNum(`מסלול: ${escH(n)}${tag}`, pv, cv);
    }).join('');
}

export function renderDiffBody(state) {
    const d = state.diff;
    if (!state.portfolio) {
        return `<div class="muted small">כדי להשוות, טענו קודם את המסלקה הנוכחית (החדשה) בחלק "קובץ המסלקה". לאחר מכן העלו כאן את המסלקה הקודמת.</div>`;
    }
    let inner = `
        <div class="muted small">מעלים כאן את קובץ המסלקה <b>הקודמת</b> (ZIP או XML) של אותו הלקוח; המערכת משווה מול המסלקה הטעונה כרגע ומציגה מה השתנה: יתרות, הפקדות, דמי ניהול וכיסויים. ההשוואה היא לפי מספרי פוליסה/חשבון זהים בשני הקבצים. כל העיבוד בדפדפן בלבד.</div>
        <div class="drop"><input type="file" id="diff-input" accept=".zip,.xml" multiple></div>`;
    if (d.busy) inner += `<div class="muted">מעבד את המסלקה הקודמת...</div>`;
    if (d.reports && d.reports.length) {
        inner += d.reports.map(r => `<div class="muted small">${r.ok ? '✓' : '⚠'} ${escH(r.fileName)}: ${escH(r.detail || (r.ok ? 'נקרא' : ''))}</div>`).join('');
    }
    if (d.result) {
        const r = d.result;
        if (r.prevPartial || r.currPartial) {
            inner += `<div class="diff-na" style="padding:8px 10px;border-radius:8px;margin-bottom:8px">⚠ יש חשבונות שנדחו (${r.prevRejectedCount ? 'במסלקה הקודמת: ' + r.prevRejectedCount : ''}${r.prevRejectedCount && r.currRejectedCount ? ', ' : ''}${r.currRejectedCount ? 'בנוכחית: ' + r.currRejectedCount : ''}) - הסכומים הכוללים אינם על אותה קבוצת חשבונות ואין דלתא כוללת ביניהם.</div>`;
            inner += `<div class="alts-scroll"><table class="altstbl"><thead><tr><th>שדה</th><th>מסלקה קודמת</th><th>מסלקה נוכחית</th><th>שינוי</th></tr></thead><tbody>
                ${r.matchedCount ? rowNum(`סכום משותף בלבד - ${r.matchedCount} חשבונות תקינים משני הצדדים (מתוך ${prevCount(r)} קודמת / ${currCount(r)} נוכחית)`, r.cmpPrevTotal, r.cmpCurrTotal) : rowNum('אין חשבון תקין משותף לשני הצדדים - אין סכום ניתן להשוואה', null, null)}
                ${rowNumNoDelta('סכום כל הרשומות התקינות בכל צד (קבוצות שונות)', r.prevTotal, r.currTotal)}
            </tbody></table></div>`;
        } else {
            inner += `<div class="alts-scroll"><table class="altstbl"><thead><tr><th>שדה</th><th>מסלקה קודמת</th><th>מסלקה נוכחית</th><th>שינוי</th></tr></thead><tbody>
                ${rowNum('סה"כ יתרה (כל החשבונות)', r.prevTotal, r.currTotal)}
            </tbody></table></div>`;
        }
        if (r.identityWarning) inner += `<div class="diff-na" style="padding:8px 10px;border-radius:8px;margin-bottom:8px">⚠ ${escH(r.identityWarning)} ההשוואה מוצגת לפי חשבונות בלבד - יש לוודא שמדובר באותו לקוח לפני הסקת מסקנות.</div>`;
        for (const a of r.accounts) {
            const srcA = a.curr || a.prev || (a.prevRejected && a.prevRejected.versions && a.prevRejected.versions[0] ? a.prevRejected.versions[0].record : {}) || {};
            const label = `${escH(srcA.yatzran || '')} · ${escH(srcA.plan || '')} · חשבון ${escH(srcA.account || '')}`;
            const dates = `נכון ל: ${escH((a.prev && a.prev.asOf) || (a.prevRejected && 'נדחה') || NOINFO)} ← ${escH((a.curr && a.curr.asOf) || NOINFO)}`;
            if (a.status === 'prev-rejected' || a.status === 'curr-rejected' || a.status === 'both-rejected') {
                inner += rejectedCardHtml(a, label, dates);
                continue;
            }
            if (a.status === 'new') {
                inner += `<div class="diff-acct"><div class="diff-acct-head">🆕 חשבון חדש שלא היה במסלקה הקודמת: ${label} <span class="muted small">(${dates})</span></div>
                    <div class="alts-scroll"><table class="altstbl"><tbody>${rowNum('יתרה', null, a.curr.totalBalance)}</tbody></table></div></div>`;
                continue;
            }
            if (a.status === 'removed') {
                inner += `<div class="diff-acct"><div class="diff-acct-head">➖ חשבון שהיה במסלקה הקודמת ואינו בנוכחית: ${label}</div>
                    <div class="alts-scroll"><table class="altstbl"><tbody>${rowNum('יתרה אז', a.prev.totalBalance, null)}</tbody></table></div></div>`;
                continue;
            }
            const p = a.prev, c = a.curr;
            const monthly = (x) => {
                if (!x || !x.deposits) return null;
                const reg = x.deposits.filter(dp => dp.sug === '1' && dp.total !== null);
                return reg.length ? reg.reduce((n2, dp) => n2 + dp.total, 0) : null;
            };
            inner += `<div class="diff-acct"><div class="diff-acct-head">${label} <span class="muted small">(${dates})</span></div>
                <div class="alts-scroll"><table class="altstbl"><thead><tr><th>שדה</th><th>קודמת</th><th>נוכחית</th><th>שינוי</th></tr></thead><tbody>
                ${rowNum('יתרה כוללת', p.totalBalance, c.totalBalance)}
                ${trackRows(p, c)}
                ${rowPctVal('דמי ניהול מהפקדה (בפועל)', p.feeDeposit, c.feeDeposit)}
                ${rowPctVal('דמי ניהול מצבירה (בפועל)', p.feeAcc, c.feeAcc)}
                ${rowNum('הפקדה חודשית שוטפת (סה"כ)', monthly(p), monthly(c))}
                ${rowTxt('תקופת הפקדה אחרונה', p.lastDepositPeriod, c.lastDepositPeriod)}
                ${rowNum('כיסוי אכ"ע (קצבה חודשית)', p.disability, c.disability)}
                ${rowNum('קצבת שאירים לבן/בת זוג', p.survivors && p.survivors.almana, c.survivors && c.survivors.almana)}
                ${rowTxt('מעסיק מדווח', p.employer, c.employer)}
                </tbody></table></div></div>`;
        }
        if (!r.accounts.length) inner += `<div class="muted">לא נמצאו חשבונות להשוואה.</div>`;
    }
    return inner;
}

// ---------- התאמת נפרעים ----------

const NIF_SYNONYMS = {
    policy: ['מספר פוליסה', 'מס פוליסה', 'פוליסה', 'מספר חשבון', 'מס חשבון', 'חשבון', 'מספר חוזה', 'מספר תיק'],
    company: ['חברה', 'יצרן', 'גוף', 'שם חברה', 'חברת ביטוח'],
    client: ['שם מבוטח', 'מבוטח', 'שם לקוח', 'לקוח', 'שם'],
    idnum: ['ת.ז', 'תז', 'תעודת זהות', 'מספר זהות', 'זהות'],
    amount: ['עמלה', 'סכום', 'נפרע', 'תשלום', 'סה"כ', 'סה״כ', 'סכום נפרע', 'סכום עמלה'],
    date: ['תאריך', 'חודש', 'תקופה', 'מועד', 'תקופת דיווח'],
    product: ['מוצר', 'סוג מוצר', 'סוג', 'תיאור'],
};

function splitCsvLine(line, delim) {
    const out = [];
    let cur = '', inQ = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (inQ) {
            if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else inQ = false; }
            else cur += ch;
        } else if (ch === '"') inQ = true;
        else if (ch === delim) { out.push(cur); cur = ''; }
        else cur += ch;
    }
    out.push(cur);
    return out.map(s => s.trim());
}

function normHeader(h) { return h.replace(/["״]/g, '"').replace(/\s+/g, ' ').trim(); }

export function parseNifraimText(text) {
    const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
    if (!lines.length) return { error: 'הקובץ ריק' };
    const first = lines[0];
    const delims = [';', '\t', ','];
    let delim = delims[0], best = 0;
    for (const d of delims) { const c = splitCsvLine(first, d).length; if (c > best) { best = c; delim = d; } }
    if (best < 2) return { error: 'לא זוהה מבנה טבלה (CSV עם מפרידים). נפרעים בפורמט Excel יש לשמור תחילה כ-CSV.' };
    const grid = lines.map(l => splitCsvLine(l, delim));
    // חיפוש שורת כותרות: שורה עם לפחות 2 התאמות לשמות שדות מוכרים
    const map = {};
    let headerIdx = -1;
    for (let i = 0; i < Math.min(grid.length, 10); i++) {
        const row = grid[i].map(normHeader);
        const tryMap = {};
        let hits = 0;
        for (const [field, syns] of Object.entries(NIF_SYNONYMS)) {
            for (let c = 0; c < row.length; c++) {
                if (tryMap[field] !== undefined) break;
                if (syns.some(s => row[c] === s || row[c].includes(s))) { tryMap[field] = c; hits++; }
            }
        }
        if (hits >= 2) { headerIdx = i; Object.assign(map, tryMap); break; }
    }
    if (headerIdx < 0) return { error: 'לא זוהתה שורת כותרות מוכרת (מספר פוליסה / עמלה / חברה וכו\'). ייתכן שהפורמט שונה - מומלץ לשלוח דוגמה לבדיקה.' };
    const headers = grid[headerIdx].map(normHeader);
    const rows = grid.slice(headerIdx + 1).filter(r => r.some(c => c.length > 0));
    return { headers, rows, map, delim };
}

function digitsOnly(s) { return String(s || '').replace(/\D/g, ''); }

export function matchNifraim(parsed, portfolio) {
    const accounts = portfolio && portfolio.accounts ? portfolio.accounts : [];
    const byPol = new Map();
    for (const a of accounts) {
        const pol = digitsOnly(a.account);
        if (pol) byPol.set(pol, a);
    }
    const matched = [], unmatched = [];
    const seenPol = new Set();
    for (const row of parsed.rows) {
        const rawPol = parsed.map.policy !== undefined ? row[parsed.map.policy] : '';
        const pol = digitsOnly(rawPol);
        let acct = pol ? byPol.get(pol) : null;
        let ambiguous = false;
        if (!acct && pol && pol.length >= 5) {
            // התאמה רופפת: ספרות מכילות זו את זו - רק אם יש מועמד יחיד; כמה מועמדים = לא חד-משמעי, לא נכפתת התאמה
            const cands = [];
            for (const [k, a] of byPol) { if (k.includes(pol) || pol.includes(k)) cands.push(a); }
            if (cands.length === 1) acct = cands[0];
            else if (cands.length > 1) ambiguous = true;
        }
        if (acct) { matched.push({ row, acct }); seenPol.add(digitsOnly(acct.account)); }
        else unmatched.push({ row, ambiguous });
    }
    const missingAccounts = accounts.filter(a => {
        const pol = digitsOnly(a.account);
        return pol && !seenPol.has(pol) && (a.totalBalance || 0) >= 1;
    });
    return { matched, unmatched, missingAccounts };
}

function nifCell(parsed, row, field) {
    const i = parsed.map[field];
    return i === undefined ? '' : escH(row[i] || '');
}

export function renderNifraimBody(state) {
    const n = state.nif;
    let inner = `
        <div class="muted small"><b>מטרת החלק (בבנייה):</b> העלאת דוחות הכספת של חברות הביטוח והצגת <b>כמה נפרעים צפוי להגיע מכל חברה, וסה"כ</b> - ללא קשר לתיק לקוח מסוים. בשלב מאוחר יותר - התאמה מול תשלומים בפועל ובקרת חשבוניות.</div>
        <div class="diff-na" style="padding:8px 10px;border-radius:8px;margin:6px 0"><b>כרגע לא מחושב שום צפי:</b> חישוב עמלה צפויה דורש את פורמט דוח הכספת בפועל ונתוני בסיס עמלות/הסכמי עמלה מול כל חברה - נתונים שעדיין לא התקבלו, ובלעדיהם לא יוצג מספר כדי לא להמציא.</div>
        <div class="muted small">בינתיים זמינה קריאת דוח שהועלה (CSV; מקובץ Excel יש לבחור "שמירה בשם ← CSV") והצגת שורותיו כפי שהן - זיהוי בלבד, לא חישוב כספי. <b>שימו לב: הפורמט טרם אומת מול דוח כספת אמיתי.</b> כל העיבוד בדפדפן בלבד.</div>
        <div class="drop"><input type="file" id="nif-input" accept=".csv,.txt"></div>`;
    if (n.status) inner += `<div class="muted small">${escH(n.status)}</div>`;
    if (n.parsed) {
        const p = n.parsed;
        const showCols = ['company', 'policy', 'client', 'product', 'date', 'amount'].filter(f => p.map[f] !== undefined);
        const head = showCols.map(f => `<th>${escH(p.headers[p.map[f]])}</th>`).join('');
        const bodyRows = p.rows.slice(0, 200).map(row => `<tr>${showCols.map(f => `<td>${nifCell(p, row, f)}</td>`).join('')}</tr>`).join('');
        inner += `<div class="alts-scroll"><table class="altstbl"><thead><tr>${head}</tr></thead><tbody>${bodyRows}</tbody></table></div>`;
        inner += `<div class="muted small">נקראו ${p.rows.length} שורות מהדוח (הצגה בלבד, ללא חישוב צפי).</div>`;
        if (p.rows.length > 200) inner += `<div class="muted small">מוצגות 200 השורות הראשונות מתוך ${p.rows.length}.</div>`;
    }
    return inner;
}
