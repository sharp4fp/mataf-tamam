import { OFFICIAL_PENSION, OFFICIAL_GEMEL, OFFICIAL_INSURANCE } from './official.js';
import { readZip } from './zip.js';
import { parseMaslakaXml, KIND_LABEL, normalizeIdNumber } from './maslaka.js';
import { extract161, EMPTY_161, FIELD_LABELS, contradictions161 } from './pdf161.js';
import { COMPANIES, SCENARIO_LABELS, GUAR_LABELS, loadCompany, scenariosOf, guaranteesOf, hasSpouse, inferCompany, mekademEstimate, SURV_RATES, SURV_RATE_LABELS, scenarioForRate } from './mekadem.js';
import { extractDoc } from './pdfdocs.js';
import { marketCandidates, parentIdOfMatch, pensionFundIdOfMatch, analyzePortfolio, dedupeAccounts, topCandidates, insights161, toNum, GROUP_LABEL, GROUPS, REF_DATE, REF_NOTE, RULES_SRC, alternativesFor, pensionNetMonthly2026, survivorNetMonthly2026, CREDIT_POINT_MONTHLY_2026, solveTargetPlan, classEstimate, plannerSnapshotOf, plannerRestoreOf, plannerSelectionsOf, selectorOptionsFor, parseWorkYears, grantRatio32, SEVERANCE_CAVEAT, MIX_TAKANON, includedHoldingsOf, matchIdentityOf, trackKeyOf, equityGeoOf, GEO_LABEL } from './analysis.js';
import { loadPeerData, periodLabel, findOwnRow, compareTrack, TRANSFER_GATES, EXISTING_VS_FUTURE_NOTE, BASELINE_NOTE, PEERS_SOURCE_NOTE } from './peers.js';
import { renderReport, renderBeforeAfter, eligibleKeysOf } from './report.js';
import { renderTransferRules } from './transfer-rules.js';
import { renderDiffBody, diffPortfolios, renderNifraimBody, parseNifraimText, matchNifraim } from './diffnifraim.js';
import { renderLifeTab, renderHealthTab, insInit, insApply, emptyInsState } from './insurance.js';
import { renderCalcTab, renderCalcSubtabs, calcApply } from './calc.js';
import { evaluateRetirement } from './retire-engine.js';
import { AMOUNT_RANGES, EQUITY_RANGES, FEE_RANGES, RENT_RANGES, SECTIONS, parseBalanceItems, computeTotal } from './assets.js';

const fmt = (n) => Math.round(n).toLocaleString('he-IL');
const pct = (n) => (Math.round(n * 10) / 10).toLocaleString('he-IL') + '%';
const esc = (s) => String(s ?? '').replace(/S(?:1[;.]?|&)\s*P\s*500/gi, 'S&P 500').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Adaptive intake: prioritized missing inputs, each with the conclusion it unlocks.
const hasPensia = (p) => p.accounts.some(a => a.kind === 'pensia');
const hasLegacy = (p) => p.accounts.some(a => a.kind === 'menahalim' || a.kind === 'tagmulim');
const INTAKE = [
    { id: 'pension-start', cat: 'יעד פרישה', pri: 1, label: 'תאריך רצוי לקבלת קצבה ראשונה (חודש ושנה, למשל 01/2031)', why: 'מועד הזכאות הראשון קובע את גיל הפרישה, את המקדם לפי הטבלה, את תקופת ההבטחה ואת חישוב המס. בלי תאריך מבוקש אי אפשר להצמיד ציטוט או אומדן ליום הזכאות.' },
    { id: 'legacy-terms', cat: 'קרנות ותיקות', pri: 1, when: hasLegacy, label: 'תנאי הפוליסה או הקרן הוותיקה, ערכי פדיון נוכחיים, מסלולי מס והשלכות ניוד על זכויות (הבטחות תשואה, מקדמים, דמי ניהול מוסכמים)', why: 'השוואת קצבה מול הון ובדיקת אובדן זכויות אינן אפשריות בלי התנאים. אין כאן המלצת ניוד.' },
    { id: 'income-tax', cat: 'מעסיק ומס', pri: 1, label: 'מהמעסיק: תלוש שכר עדכני (שכר וניכויים מצטברים לשנת המס השוטפת), טופס 106 של השנה המלאה האחרונה, סידור תשלום המענקים, וחלוקת טופס 161 לפי הקופות', why: 'טופס 106 מסכם שנה קלנדרית שהסתיימה ולא יכול לשקף את 2026; לחישוב מס עדכני בנובמבר 2026 נדרש תלוש שכר שוטף (נתוני YTD) לצד ה-106 של 2025. בלעדיהם אי אפשר לחשב מס בפועל על מענקים, קצבה או פריסה.' },
    { id: 'family', cat: 'משפחה', pri: 1, label: 'אישורי מוטבים עדכניים בקופות, גיל בן/בת זוג, ילדים ותלויים, כוונת ירושה והתאמה לצוואה', why: 'קובעת מסלול הבטחה בקצבה, בחירת מוטבים, והאם להעדיף הון על קצבה. זכויות השאירים החוקיות אינן ניתנות לעקיפה בהצהרה.' },
    { id: 'work-after', cat: 'הכנסות עתידיות', pri: 2, label: 'תכנית עבודה אחרי הפרישה', why: 'הכנסה מעבודה משנה את מדרגות המס על קצבה ומענקים ואת כדאיות הפריסה.', attestation: 'מוצהר על ידי הלקוח: לא מתכנן להמשיך לעבוד אחרי הפרישה', attBtn: 'סמנו: הלקוח הצהיר שלא ימשיך לעבוד' },
    { id: 'future-income', cat: 'הכנסות ויעדים', pri: 2, label: 'הכנסות אחרות בפועל בשנת הפרישה ובשנה שאחריה', why: 'הכנסות אחרות משנות את מדרגות המס על קצבה ומענקים. היעדר תשובה אינו מוכיח שאין הכנסות.' },
    { id: 'target-net', cat: 'יעדים', pri: 2, label: 'יעד קצבה נטו חודשי וצרכי נזילות', why: 'מגדירים את פער הקצבה ואת התקציב לשאר הסכומים.' },
    { id: 'prior-161', cat: 'היסטוריית פרישות', pri: 2, label: 'כל טופסי 161 קודמים, פטורים שנוצלו, רצפים, קיבוע זכויות ומשיכות פטורות - או הצהרה שלא היו אירועי פרישה קודמים', why: 'הם קובעים את יתרת הפטור לקיבוע; בלעדיהם אין לסמוך על חישוב הפטור.' },
    { id: 'legal-continuity', cat: 'משפחה', pri: 3, label: 'הסדרי סמכות פעולה מול הגופים (ייפוי כוח וכדומה), אם רלוונטי', why: 'בלי סמכות פעולה מוסדרת, בקשות מידע או שינוי מסלול עלולים להיתקע.' },
    { id: 'risk-outside', cat: 'סיכון', pri: 3, label: 'חשיפה מנייתית מחוץ לחסכונות הפנסיוניים', why: 'החשיפה המשוקללת כאן היא חלקית; התמונה המלאה משנה את יעד הסיכון.' },
];

// Synthetic demo data - invented numbers, no real client data.
function demoPortfolio() {
    const mk = (yatzran, account, plan, kind, tracks, feeD, feeA, status) => ({
        yatzran, account, plan, sugMutzar: '', sugPolisa: '', sugTochnit: '', status, nechonut: '20260630',
        tracks: tracks.map(([name, balance]) => ({ name, code: '', balance })),
        feeDeposit: feeD, feeAcc: feeA, lastDepositPeriod: '', lastDepositTotal: null, tsuaNeto: null,
        covers: [], forecast: null, severanceBalance: null, kind,
        totalBalance: tracks.reduce((n, t) => n + t[1], 0),
    });
    return {
        clientName: 'לקוח לדוגמה (סינתטי)', fileCount: 0,
        accounts: [
            mk('מנורה מבטחים פנסיה וגמל בע"מ', '100001', 'מנורה מבטחים פנסיה', 'pensia', [['מנורה מבטחים פנסיה - מסלול מניות', 420000]], 1.5, 0.08, '1'),
            mk('הפניקס פנסיה וגמל בע"מ', '100002', 'הפניקס השתלמות', 'hishtalmut', [['הפניקס השתלמות מניות', 180000]], 0, 0.6, '1'),
            { ...mk('מגדל חברה לבטוח בע"מ', '100003', 'מגדלור', 'menahalim', [['כללי', 95000]], 0.3, 1.1, '2'),
                // מקדם מובטח סינתטי (ממסלקה מדומה) - להדגמת השוואת המוצר לקצבה (M-045)
                annuityFactor: { retireAge: 67, guaranteedFactor: 190, lifeGuarantee: true, lifeGuaranteeAtRetirement: true, yieldGuarantee: false, yieldGuaranteePeriod: false, lifeAffectsPension: false, yieldAffectsPension: true, track: '', limitYears: null, projectedSavings: 110000, pensionFromGuaranteed: 578.95 } },
        ],
    };
}
const DEMO_161 = {
    fullName: 'לקוח לדוגמה', idNumber: '000000000', birthDate: '01/01/1972', startWork: '01/01/2000',
    retireDate: '31/12/2026', workYears: '27', salaryFull: '22,000', salaryInsured: '20,000', salarySeverance: '18,500',
    grants: [{ payer: 'קופת גמל לדוגמה', code: '6', amount: '400,000' }, { payer: 'מעסיק ישיר לדוגמה', code: '1', amount: '150,000' }],
    totalGrant: '550,000', maxKtseva: '400,000', maxPitzuim: '550,000', maxExempt: '371,250', taxableGrant: '550,000',
};
const DEMO_FOUND = { fullName: true, idNumber: true, birthDate: true, startWork: true, retireDate: true, workYears: true, salaryFull: true, salaryInsured: true, salarySeverance: true, grants: true, totalGrant: true, maxKtseva: true, maxPitzuim: true, maxExempt: true, taxableGrant: true };

const state = {
    mode: 'portfolio',
    portfolio: null,
    reports: [],
    busy: false,
    f161: { ...EMPTY_161, grants: [] },
    retEng: {},
    assets: { banks: [], q: {}, status: '' },
    kibua: { eligDate: '', payers: '1', grantExempt: '', grantYears: '', grantYear: '', grantIndexed: '', sim2026: '', hivunPast: '', hivunPlan: '', empHistory: '' },
    alloc: { objective: '', horizon: '' },
    riskgoals: { balance: '', equity: '', equitySrc: '', income: '', resources: '', liq: '', liqDate: '', willing: '', behavior: '', goals: [{ desc: '', amount: '', date: '', importance: '', flex: '', alloc: '' }, { desc: '', amount: '', date: '', importance: '', flex: '', alloc: '' }, { desc: '', amount: '', date: '', importance: '', flex: '', alloc: '' }] },
    f161Found: {},
    f161Tried: false,
    f161Confirmed: false,
    f161Status: '',
    f161Pages: [],
    f161Marks: [],
    mekIn: {},
    mekResult: '',
    mekData: {},
    mekLast: null,
    mekAlts: [],
    docs: {},
    beneficiaries: [],
    familyExtra: [],
    demo: false,
    targetEq: null,
    geoPref: 'any',
    eligible: {},
    marketPick: {}, // M-037: בחירת מסלול מהשוק לכל החזקה (מפתח -> fundId)
    goals: { horizon: '', liquidity: 'בינוני', inheritance: false, consolidate: false, keepExemption: false, capitalFirst: false },
    confirmed: {},
    selections: {},
    excluded: {},
    pensionStartSel: null,
    intake: {},
    open: {},
    peers: null,
    peerBusy: false,
    mekManual: '',
    diff: { open: false, prev: null, reports: [], busy: false, result: null },
    pendingClient: null,
    nif: { parsed: null, match: null, status: '', fileName: '' },
    life: emptyInsState(),
    health: emptyInsState(),
    calc: {},
    netin: { kibuaMain: '0', kibuaSpouse: '0', certRateMain: '', certRateSpouse: '', simMain: '', simSpouse: '', pointsMain: '2.25', otherMain: '0', grossSpouse: '0', pointsSpouse: '2.75', otherSpouse: '0', eligMain: false, eligSpouse: false, survClass: '', survAssumeOk: false },
};

// Accordion: כל חלק נפתח/נסגר בלחיצה על הכותרת. המצב נשמר ב-state.open כך שרינדור מחדש לא סוגר חלקים.
// רשימה נגללת של מספרים (בקשת הבעלים 12.11 15:11 - "איפה שאפשר חלון גלילה"); ערך ישן שאינו ברשימה נשמר
function numSel(attr, from, to, step, cur, ph, fmtv = (v) => String(v)) {
    const vals = [];
    for (let v = from; v <= to + 1e-9; v += step) vals.push(Math.round(v * 100) / 100);
    const c = cur === undefined || cur === null ? '' : String(cur);
    const opts = vals.map(String);
    if (c && !opts.includes(c)) opts.push(c);
    return `<select ${attr}><option value="">${esc(ph)}</option>${opts.map(v => `<option value="${esc(v)}"${v === c ? ' selected' : ''}>${esc(fmtv(v))}</option>`).join('')}</select>`;
}
function acc(id, titleHtml, badge, body, forceOpen = false, aside = '') {
    const isOpen = forceOpen || state.open[id] === undefined ? (forceOpen || false) : state.open[id];
    return `<section class="card acc${aside ? ' acc-has-aside' : ''}" id="acc-${id}">${aside ? `<div class="acc-aside">${aside}</div>` : ''}
        <button type="button" class="acc-head" data-acc="${id}" aria-expanded="${isOpen ? 'true' : 'false'}" aria-controls="acc-body-${id}">
            <span class="acc-title">${titleHtml}</span>
            ${badge ? `<span class="acc-badge">${badge}</span>` : ''}
            <span class="acc-caret" aria-hidden="true">${isOpen ? '▾' : '◂'}</span>
        </button>
        <div class="acc-body" id="acc-body-${id}"${isOpen ? '' : ' hidden'}>${body}</div>
    </section>`;
}

let view = null;
const recompute = () => {
    if (state.portfolio) state.portfolio.manualMatches = state.selections || {};
    view = state.portfolio ? analyzePortfolio(state.portfolio) : null;
    // בחירות ידניות שטביעת האצבע שלהן אינה תואמת עוד את ההחזקה (יתרה/שם/חשבון השתנו) - מופסקות בהודעה, לא מוחלות בשקט
    if (view && ((view.manualDropped && view.manualDropped.length) || (view.manualOrphans && view.manualOrphans.length))) {
        for (const d of [...(view.manualDropped || []), ...(view.manualOrphans || [])]) {
            delete state.selections[d.key];
            if (state.confirmed) delete state.confirmed[d.key];
        }
        const nDrop = (view.manualDropped || []).length + (view.manualOrphans || []).length;
        state.manualDropNote = `${nDrop} בחירות זהות ידניות שמורות אינן תואמות עוד את ההחזקות (שם/יתרה/חשבון השתנו) ולכן הופסקו - יש לבחור מחדש.`;
        delete state.portfolio.manualMatches;
        view = analyzePortfolio(state.portfolio);
    } else {
        state.manualDropNote = '';
    }
    // הערות ייבוא (כפילויות שדולגו/סומנו) מוצגות במפורש מתחת לדו"ח הייבוא - לעולם לא בשקט
    state.importNotes = view && view.importNotes ? view.importNotes : [];
};

// ===== שמירת תיק מוצפנת (AES-256-GCM, מפתח מסיסמה - הכל בדפדפן) =====
// הבאיטים הגולמיים של קבצי הלקוח נשארים בזיכרון בלבד, כדי לאפשר אריזה לקובץ
// מוצפן. אין כתיבה לאחסון הדפדפן ואין שום שליחה לרשת.
const rawVault = { maslaka: [], f161: null, docs: {} };
function resetVault() { rawVault.maslaka = []; rawVault.f161 = null; rawVault.docs = {}; }

const ENC_MAGIC = 'PENC1';
const encState = { file: null, status: '', busy: false };

async function deriveEncKey(password, salt) {
    const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 310000, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

function packVault() {
    const files = [];
    const parts = [];
    let off = 0;
    const push = (slot, name, bytes) => { const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes); files.push({ slot, name, off, len: u8.length }); parts.push(u8); off += u8.length; };
    rawVault.maslaka.forEach(f => push('maslaka', f.name, f.bytes));
    if (rawVault.f161) push('f161', rawVault.f161.name, rawVault.f161.bytes);
    for (const [k, d] of Object.entries(rawVault.docs)) push('doc:' + k, d.name, d.bytes);
    const manifest = {
        v: 1, savedAt: new Date().toISOString(), mode: state.mode, files,
        manual: { netin: state.netin, kibua: state.kibua, retEng: state.retEng, assets: { banks: state.assets.banks, q: state.assets.q }, alloc: state.alloc, mekIn: state.mekIn, mekManual: state.mekManual, goals: state.goals, f161: state.f161Tried ? state.f161 : null }, // קלטים מופרדים (pendingClient) אינם נשמרים בתוך קובץ הלקוח החדש - ייצוא נפרד בלבד
        planner: plannerSnapshotOf(state),
    };
    const head = new TextEncoder().encode(JSON.stringify(manifest));
    const total = 4 + head.length + parts.reduce((sum, x) => sum + x.length, 0);
    const out = new Uint8Array(total);
    new DataView(out.buffer).setUint32(0, head.length, true);
    out.set(head, 4);
    let p2 = 4 + head.length;
    for (const part of parts) { out.set(part, p2); p2 += part.length; }
    return out;
}

async function saveEncryptedPortfolio() {
    const hasData = rawVault.maslaka.length || rawVault.f161 || Object.keys(rawVault.docs).length;
    if (!hasData) { encState.status = 'אין תיק טעון לשמירה. העלו קודם קבצי לקוח.'; render(); return; }
    const pw1 = (document.getElementById('enc-pw1') || {}).value || '';
    const pw2 = (document.getElementById('enc-pw2') || {}).value || '';
    if (pw1.length < 8) { encState.status = 'ביטוי הסיסמה קצר מדי - לפחות 8 תווים, ועדיף משמעותית ארוך יותר.'; render(); return; }
    if (pw1 !== pw2) { encState.status = 'שתי הסיסמאות שהוזנו אינן זהות.'; render(); return; }
    encState.busy = true; encState.status = ''; render();
    try {
        const plain = packVault();
        const salt = crypto.getRandomValues(new Uint8Array(16));
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const key = await deriveEncKey(pw1, salt);
        const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plain));
        plain.fill(0);
        const magic = new TextEncoder().encode(ENC_MAGIC);
        const blob = new Blob([magic, salt, iv, cipher], { type: 'application/octet-stream' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `tik-moozfan-${new Date().toISOString().slice(0, 10)}.penc`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 5000);
        encState.status = 'התיק המוצפן ירד למחשב. הסיסמה אינה נשמרת בשום מקום - בלעדיה אין דרך לפתוח את הקובץ.';
    } catch (e) {
        encState.status = 'ההצפנה נכשלה: ' + (e && e.message ? e.message : 'שגיאה לא ידועה');
    }
    encState.busy = false; render();
}

async function loadEncryptedPortfolio() {
    const pw = (document.getElementById('enc-pw-load') || {}).value || '';
    if (!encState.file) { encState.status = 'בחרו קודם קובץ תיק מוצפן (.penc).'; render(); return; }
    if (!pw) { encState.status = 'הזינו את הסיסמה שאיתה הקובץ נשמר.'; render(); return; }
    encState.busy = true; encState.status = ''; render();
    try {
        if (encState.file.size > 200 * 1024 * 1024) { encState.status = 'הקובץ גדול מדי לטעינה (מעל 200MB).'; encState.busy = false; render(); return; }
        const buf = new Uint8Array(await encState.file.arrayBuffer());
        if (buf.length < 40 || new TextDecoder().decode(buf.slice(0, 5)) !== ENC_MAGIC) throw new Error('not-penc');
        const salt = buf.slice(5, 21), iv = buf.slice(21, 33);
        const key = await deriveEncKey(pw, salt);
        let plain;
        try { plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, buf.slice(33))); }
        catch { throw new Error('bad-password'); }
        if (plain.length < 4) throw new Error('not-penc');
        const headLen = new DataView(plain.buffer).getUint32(0, true);
        if (headLen > plain.length - 4) throw new Error('not-penc');
        let manifest;
        state.pendingClient = null; // קלטים מופרדים מהסשן הקודם אינם עוברים לקובץ חדש; שער הזהות בשחזור יכול להפריד מחדש
        try { manifest = JSON.parse(new TextDecoder().decode(plain.slice(4, 4 + headLen))); }
        catch { throw new Error('not-penc'); }
        if (!manifest || manifest.v !== 1 || !Array.isArray(manifest.files) || manifest.files.length > 1000) throw new Error('not-penc');
        for (const f of manifest.files) {
            if (!f || typeof f.slot !== 'string' || !/^[a-z0-9:_-]{1,60}$/i.test(f.slot)) throw new Error('not-penc');
            if (typeof f.name !== 'string' || f.name.length > 300) throw new Error('not-penc');
            if (!Number.isInteger(f.off) || !Number.isInteger(f.len) || f.off < 0 || f.len < 0 || f.off + f.len > plain.length - 4 - headLen) throw new Error('not-penc');
        }
        const base = 4 + headLen;
        const fakeFile = (f) => { const b = plain.slice(base + f.off, base + f.off + f.len); return { name: f.name, arrayBuffer: async () => b.slice(0).buffer, text: async () => new TextDecoder('utf-8').decode(b) }; };
        // שחזור דרך אותם צינורות עיבוד בדיוק כמו העלאה רגילה
        resetVault();
        const maslakaFiles = manifest.files.filter(f => f.slot === 'maslaka').map(fakeFile);
        if (maslakaFiles.length) await onMaslaka(maslakaFiles);
        const f161f = manifest.files.find(f => f.slot === 'f161');
        if (f161f) await on161([fakeFile(f161f)]);
        for (const f of manifest.files.filter(f => f.slot.startsWith('doc:'))) await onDoc(f.slot.slice(4), [fakeFile(f)]);
        const m = (manifest.manual && typeof manifest.manual === 'object') ? manifest.manual : {};
        const safeObj = (o) => (o && typeof o === 'object' && !Array.isArray(o)) ? o : null;
        if (safeObj(m.netin)) Object.assign(state.netin, m.netin);
        if (safeObj(m.kibua)) Object.assign(state.kibua, m.kibua);
        if (safeObj(m.retEng)) state.retEng = { ...m.retEng };
        if (safeObj(m.assets)) state.assets = { banks: Array.isArray(m.assets.banks) ? m.assets.banks : [], q: safeObj(m.assets.q) || {}, status: '' };
        if (safeObj(m.alloc)) Object.assign(state.alloc, m.alloc);
        if (safeObj(m.mekIn)) { state.mekIn = m.mekIn; if (state.mekIn.companyBy !== 'user') { delete state.mekIn.company; delete state.mekIn.companyBy; } /* בחירה שאינה מפורשת (או מגרסה קודמת) מזוהה מחדש מהתיק */ }
        if (typeof m.mekManual === 'string') state.mekManual = m.mekManual;
        if (safeObj(m.goals)) Object.assign(state.goals, m.goals);
        if (safeObj(m.f161)) state.f161 = m.f161;
        if (['retirement', 'portfolio', 'life', 'health', 'calc', 'nifraim'].includes(manifest.mode)) state.mode = manifest.mode;
        // שחזור מצב בקר היעד (אם קיים בקובץ): רק מפתחות שקיימים בתיק המנותח מחדש, ואישורי-זהות רק בהתאמה מדויקת לזהות הנוכחית.
        state.selections = plannerSelectionsOf(safeObj(manifest.planner)); // בחירות ידניות משוחזרות קודם - הן חלק מהניתוח עצמו; טביעת האצבע נבדקת ב-recompute
        recompute(); // view טרי מהצינורות ששוחזרו - מפתחות/זהויות נמדדים מול הניתוח הנוכחי, לא מול מצב סטלה
        const restored = plannerRestoreOf(safeObj(manifest.planner), (view && view.holdings) || []);
        state.eligible = restored.eligible; state.excluded = restored.excluded; state.confirmed = restored.confirmed; state.marketPick = restored.marketPick || {};
        state.targetEq = restored.targetEq; state.geoPref = restored.geoPref; state.unknownAssumption = restored.unknownAssumption;
        planCache = { sig: null, plan: null };
        // שער קשירת לקוח גם על נתונים משוחזרים: קובץ שמירה (מדור קודם או ששונה חיצונית) עלול לשאת
        // טופס 161 של לקוח אחר. זהות שונה -> הפרדה; חסרה -> לא פתור. הכל נשמר במצב ממתין, לא נמחק.
        if (state.portfolio) {
            const pId2 = state.portfolio.client && state.portfolio.client.id ? state.portfolio.client.id : '';
            const hasF = !!(state.f161.retireDate || state.f161.totalGrant || (state.f161.grants && state.f161.grants.length) || state.f161.idNumber);
            if (pId2 && hasF && clientBindStatus(pId2, state.f161.idNumber) === 'mismatch') {
                // רק ה-161 הסותר מופרד; הקלטים הידניים נשמרו עם התיק עצמו ונשארים פעילים
                state.pendingClient = { reason: 'mismatch', savedAt: new Date().toISOString(), f161: { ...state.f161, grants: (state.f161.grants || []).map(g => ({ ...g })) }, f161File: rawVault.f161 ? { name: rawVault.f161.name, bytes: rawVault.f161.bytes } : null };
                state.f161 = { grants: [] }; state.f161Found = {}; state.f161Tried = false; state.f161Pages = []; rawVault.f161 = null; state.f161Confirmed = false;
                state.open['step2'] = true; // האזהרה חייבת להיות גלויה בפועל - פתיחת חלק ה-161 שבו באנר ההפרדה
                encState.status = (encState.status ? encState.status + ' ' : '') + 'טופס 161 בקובץ השמירה נושא מספר זהות שונה מהמסלקה - הופרד למצב ממתין ואינו בחישוב.';
            }
        }
        if (restored.dropped.keys || restored.dropped.confirms) encState.status = `התיק שוחזר; ${restored.dropped.keys + restored.dropped.confirms} בחירות/אישורים מקובץ השמירה לא הוחלו כי הזהות או ההחזקות השתנו - יש לבדוק ולאשר מחדש.`;
        plain.fill(0);
        encState.file = null;
        if (!encState.status) encState.status = 'התיק שוחזר בהצלחה מהקובץ המוצפן.';
    } catch (e) {
        const code = e && e.message;
        encState.status = code === 'bad-password' ? 'הסיסמה שגויה או שהקובץ פגום.' : code === 'not-penc' ? 'זהו לא קובץ תיק מוצפן תקין.' : 'פתיחת הקובץ נכשלה.';
    }
    encState.busy = false;
    recompute(); render();
}

function renderEncPanel() {
    return `
        <div class="enc-panel">
            <div class="note small"><b>אין להעלות כאן את המסלקה שוב.</b> המסלקה מועלית פעם אחת בלבד, בחלק קובץ המסלקה. החלק הזה אופציונלי לגמרי: הוא אורז את כל העבודה שכבר בוצעה (קבצים שהועלו והזנות ידניות) לקובץ מוצפן אחד שנשמר אצלכם במכשיר - כדי להמשיך את העבודה מאוחר יותר או ממכשיר אחר. טעינה של הקובץ המוצפן <b>במקום</b> העלאת המסלקה משחזרת הכל, ואינה העלאה נוספת.</div>
            <div class="note small">התיק נארז ומוצפן כאן בדפדפן (AES-256-GCM, מפתח שנגזר מהסיסמה בלבד). הקובץ המוצפן נשמר במכשיר שלכם, והסיסמה לא נשמרת בשום מקום - בלעדיה אין דרך לפתוח את הקובץ. בחרו ביטוי סיסמה ארוך וייחודי שאינו משמש אתכם בשום מקום אחר: ההצפנה חזקה רק כמו הסיסמה, וסיסמה קצרה או נפוצה ניתנת לניחוש גם עם הצפנה חזקה. שחזור מחזיר את קבצי המקור ואת ההזנות הידניות; בחירת מועמדים מתוך מסמכים (בלחיצה) תתבצע מחדש לאחר השחזור.</div>
            <div class="enc-row">
                <input type="password" id="enc-pw1" placeholder="ביטוי סיסמה ארוך לשמירה (8 תווים לפחות)" autocomplete="new-password">
                <input type="password" id="enc-pw2" placeholder="אימות סיסמה" autocomplete="new-password">
                <button type="button" class="ghostbtn" data-action="save-enc">שמירת תיק מוצפן</button>
            </div>
            <div class="enc-row">
                <input type="file" id="enc-input" accept=".penc">
                <input type="password" id="enc-pw-load" placeholder="סיסמה לפתיחה" autocomplete="off">
                <button type="button" class="ghostbtn" data-action="load-enc">טעינת תיק מוצפן</button>
            </div>
            ${encState.busy ? '<div class="muted small">מעבד...</div>' : ''}
            ${encState.status ? `<div class="status-line">${esc(encState.status)}</div>` : ''}
        </div>
    `;
}

async function readMaslakaFiles(files, into, report) {
    for (const f of files) {
        if (/\.zip$/i.test(f.name)) {
            try {
                const entries = await readZip(await f.arrayBuffer());
                let xmls = entries.filter(e => /\.(xml|dat)$/i.test(e.name));
                if (!xmls.length) xmls = entries.filter(e => new TextDecoder('utf-8').decode(e.data.slice(0, 400)).includes('<Mimshak'));
                if (!xmls.length) report.push({ fileName: f.name, ok: false, detail: `ה-ZIP נפתח אבל לא נמצאו בו קבצי ממשק מסלקה (נבדקו ${entries.length} קבצים)` });
                for (const e of xmls) parseMaslakaXml(`${f.name} › ${e.name}`, new TextDecoder('utf-8').decode(e.data), into, report);
            } catch (err) {
                report.push({ fileName: f.name, ok: false, detail: 'פתיחת ה-ZIP נכשלה: ' + (err?.message || 'שגיאה') });
            }
        } else {
            parseMaslakaXml(f.name, await f.text(), into, report);
        }
    }
}

function matchLabel(m) {
    if (m.row) {
        if (m.officialId) {
            const srcName = m.src === 'bituachnet' ? `ביטוח-נט (data.gov.il, רשות שוק ההון) ${REF_DATE}` : `האוצר ${REF_DATE}`;
            return `הותאם לפי קוד המסלול הרשמי (מזהה ${m.officialId}) לנתוני ${srcName}: <b>${esc(m.row.name)}</b>. חשיפה ${m.row.eq !== null ? m.row.eq + '%' : '—'} מחושבת מנכסים/חשיפה מדווחים.`;
        }
        if (m.userSelected) return `זהות נבחרה ידנית על-ידך מתוך רשימת המסלולים הרשמיים של אותה חברה וסוג מוצר (${REF_DATE}): <b>${esc(m.row.name)}</b>. חשיפה ${m.row.eq !== null ? m.row.eq + '%' : '—'} מהמאגר הרשמי. הזהות לא אומתה בקוד מסלול מהמסלקה.`;
        return `הצעת התאמה בלבד, לפי דמיון שמות: <b>${esc(m.row.name)}</b> (${GROUP_LABEL[m.group]}, ציון ${m.score.toFixed(2)}). לא מאומתת מול רשימת המסלולים הרשמית של הגוף.`;
    }
    return `<span class="muted">לא נמצאה הצעת התאמה בנתוני הייחוס - החשיפה לא נכללת בממוצע</span>`;
}

// תוויות מקור לחשיפה משלימה (exposure-extra.js): רשמי / נמצא במקור שאינו רשמי / הערכת מערכת - תמיד עם מקור ותאריך
function overrideSourceTag(ov) {
    return ov.sourceType === 'official' ? 'נתון רשמי'
        : ov.sourceType === 'web' ? 'נמצא במקור שאינו רשמי'
        : 'הערכת המערכת, לא נתון רשמי';
}
function overrideLabel(ov) {
    return `<b>${overrideSourceTag(ov)}</b>: חשיפה מנייתית ${ov.eq}% לפי ${esc(ov.label)} (${esc(ov.asOf)}). <a href="${esc(ov.url)}" target="_blank" rel="noopener">מקור</a>. ${esc(ov.basis)}`;
}

// ---------- section renderers ----------

function renderSrcBox() {
    return `<details class="srcbox"><summary>מקורות החישוב ותאריכי עדכון</summary><ul class="srcbox-list">
            <li>מדרגות מס הכנסה, מס יסף (סעיף 121ב) ונקודת זיכוי (33א) ל-2026 - רשות המסים, לוח הניכויים הרשמי 2026.</li>
            <li>פטור קצבה מזכה 2026: 57.5% מתקרת הקצבה המזכה - רשות המסים, מדריך לקיבוע זכויות (טופס 161ד) 2026, gov.il.</li>
            <li>קצבת שאירים - משטר מס נפרד: פקודת מס הכנסה סעיף 9(6ו) (תיקון 190), פטור מלא עד תקרת הקצבה המזכה 2026, לפי לוח הניכויים הרשמי.</li>
            <li>מקדמי המרה לקצבה - הטבלאות הרשמיות באתרי החברות, נכון לנתוני ייחוס ${REF_DATE}.</li>
            <li>השוואת עמיתים - גמל-נט / פנסיה-נט; תקופת הדיווח מוצגת בחלק ההשוואה עצמו.</li>
            <li>תקן קובץ המסלקה - ממשק הזדהות לקוח (מסלקה פנסיונית), רשות שוק ההון.</li>
        </ul></details>`;
}

function renderCallouts() {
    const hasF161 = !!(state.f161.retireDate || state.f161.totalGrant || state.f161.grants.length);
    let html = `<div class="callout warn">
        <b>גבולות האב-טיפוס.</b> זהו כלי עזר ראשון לבחינה, לא מנוע המלצות. נתוני הייחוס (תשואות, שארפ, חשיפות, דמי ניהול) הם תמונת ${REF_DATE} ואינם מתעדכנים לבד. מסלולים עם קוד רשמי מותאמים לנתוני האוצר (${REF_DATE}) לפי מזהה המסלול; מסלולים בלי קוד מזוהים רק בשם רשמי מלא ומדויק (אין ניחוש לפי דמיון חלקי) - שינוי דורש אישור מפורש. ${REF_NOTE}
    </div>`;
    if (view || hasF161) {
        html += `<div class="callout warn"><b>חשוב לדעת לפני שימוש בנתונים</b><ul class="notes">
            <li>שדות טופס 161 שחולצו אוטומטית הם מועמדים בלבד - יש לאשר אותם מול הטופס החתום לפני כל שימוש.</li>
            ${view ? `<li>כיסוי החשיפה בנתון מתועד (רשמי / מקור לא-רשמי מסומן): ${pct(view.coverage * 100)} משווי התיק. יתרת התיק מכוסה באומדן מחלקה מסומן * עם בסיס מצוין, או מסומנת "לא ידוע" כשאין נתון ולא בסיס להערכה - אינה נכנסת לממוצע כאילו חשיפתה אפס. מסלולים עם מזהה רשמי מותאמים לנתוני האוצר (${REF_DATE}); מוצרים שאינם במאגר מושלמים ממקורות פומביים מתועדים (מסמך רשמי של הגוף, אתר חיצוני מסומן כלא-רשמי, או הערכת מערכת עם בסיס מצוין). הצעות התאמה לפי שם דורשות אישור מפורש מול קוד המסלול הרשמי.</li>` : ''}
            <li>נתוני הייחוס מתומנת ${REF_DATE} ואינם עדכניים ליום הבדיקה; לחלק מהמסלולים אין נתוני 5 שנים.</li>
            <li>משלם בטופס 161 או גוף גביה במסלקה אינו בהכרח מעסיק, ואותו מספר ח"פ אינו הוכחה לרישום בטופס או לכיסוי הפיצויים - הזהויות והקצאות מסתמכות על המסמכים בלבד.</li>
        </ul></div>`;
    }
    // תכנון פרישה: שורה אחת שנפתחת בלחיצה (הצעת הפישוט 11.11.2026) - התוכן זהה, רק מקופל
    if (state.mode === 'retirement') return fold('limits', 'אב-טיפוס לבחינה מקצועית, לא ייעוץ - גבולות ומקורות', html);
    return html;
}

function renderStep1() {
    return `
        <div class="drop">
            <input type="file" id="maslaka-input" accept=".zip,.xml">
            <div class="drop-hint">בחרו קובץ אחד: ה-ZIP שהתקבל מהמסלקה הפנסיונית (או קובץ XML אחד). העלאה חדשה מחליפה את הקודמת - לא ניתן לטעון שני קבצי מסלקה באותה בדיקה. הקובץ נפתח כאן בדפדפן.</div>
        </div>
        ${state.busy ? '<div class="muted small">מעבד...</div>' : ''}
        ${state.reports.length ? `<ul class="reps">${state.reports.map(r => `<li class="${r.warn ? 'bad' : (r.ok ? 'ok' : 'bad')}">${r.warn ? '⚠' : (r.ok ? '✓' : '✕')} ${esc(r.fileName)} - ${esc(r.detail)}</li>`).join('')}</ul>` : ''}
        ${state.uploadError ? `<ul class="reps"><li class="bad">⚠ ${esc(state.uploadError)}</li></ul>` : ''}
        ${(state.importNotes || []).length ? `<ul class="reps">${state.importNotes.map(n => `<li class="bad">⚠ ${esc(n)}</li>`).join('')}</ul>` : ''}
        ${state.manualDropNote ? `<ul class="reps"><li class="bad">⚠ ${esc(state.manualDropNote)}</li></ul>` : ''}
        ${(view && view.rejectedImports ? view.rejectedImports : []).map(g => `<div class="callout warn"><b>${esc(g.label)}:</b> החשבון נדחה מהחישוב - נמצאו ${g.versions.length} רשומות מתנגשות${g.asOf ? ' באותו תאריך ערך' : ' ללא תאריך ערך בר-השוואה'} (${g.versions.map((vv, vi) => `גרסה ${vi + 1}: יתרה ${fmt(vv.balance)} ₪`).join(' · ')}). הנתונים נשמרים כפי שהם ואינם נספרים בשום חישוב. כדי לטעון את החשבון, העלו קובץ מסלקה אחד שבו הוא מופיע פעם אחת.</div>`).join('')}
        <button class="ghostbtn" data-action="demo">טענו תיק הדגמה (נתונים סינתטיים)</button>
        <div class="note small"><b>מה זה "תיק הדגמה"?</b> תיק לקוח מומצא עם נתונים סינתטיים בלבד - לא לקוח אמיתי ולא נתונים של אף אחד. הוא מאפשר לראות איך המערכת נראית ומה היא מציגה (תיק נכסים, רמת סיכון, ניתוח טופס 161) בלי להעלות מסמכים אמיתיים. כשתעלו קובץ מסלקה אמיתי, הנתונים יתחלפו בנתוני הקובץ.</div>
        ${state.demo ? '<div class="demo-banner">מוצג תיק הדגמה סינתטי - לא נתוני לקוח אמיתי.</div>' : ''}
        ${state.portfolio ? `<div class="report-cta">
            <button type="button" class="primarybtn" data-report-download>הורדת דוח ללקוח (PDF)</button>
            <span class="muted small">דוח "מצב טרום טיפול" מקוצר (3 עמודי A4) על בסיס קובץ המסלקה שהועלה. הקובץ מופק כאן בדפדפן ומורד ישירות למחשב.</span>
        </div>` : ''}
    `;
}

function renderField161(key) {
    const v = state.f161[key];
    const label = FIELD_LABELS[key];
    const wasFound = state.f161Tried && state.f161Found[key];
    const isMissing = state.f161Tried && !state.f161Found[key];
    if (wasFound) {
        const confTag = state.f161Confirmed ? '<em class="tag-ok">אומת מול הטופס ✓</em>' : '<em class="tag-miss">חולץ - טרם אומת מול הטופס</em>';
        return `<label class="fld found"><span>${label} ${confTag}</span>
            <div class="foundrow"><input data-f161="${key}" value="${esc(v)}" readonly><button type="button" class="mini" data-edit="${key}">תיקון</button></div></label>`;
    }
    const tag = isMissing ? '<em class="tag-miss">לא חולץ - הזינו מהטופס</em>' : '';
    const ph = isMissing ? 'חסר - הזינו ידנית מהטופס' : '';
    return `<label class="fld${isMissing ? ' missing' : ''}"><span>${label} ${tag}</span>
        <input data-f161="${key}" value="${esc(v)}" placeholder="${ph}"></label>`;
}

// שלב 2: 6 ערכי המפתח להחלטה למעלה; כל 15 השדות והמענקים בקיפול (פתוח כברירת מחדל כשטרם הועלה טופס)
const KEY161 = ['retireDate', 'workYears', 'salarySeverance', 'totalGrant', 'maxExempt', 'taxableGrant'];
function renderKey161() {
    const tag = (key) => !state.f161Found[key] ? '<em class="tag-miss">לא חולץ</em>'
        : state.f161Confirmed ? '<em class="tag-ok">אומת מול הטופס ✓</em>' : '<em class="tag-miss">חולץ - טרם אומת מול הטופס</em>';
    return `<table class="key161"><tbody>${KEY161.map(k => `<tr><th>${FIELD_LABELS[k]}</th><td>${state.f161[k] ? esc(state.f161[k]) : '<span class="muted">-</span>'}</td><td>${tag(k)}</td></tr>`).join('')}</tbody></table>`;
}
function fold161(body) {
    const def = state.open.f161fields === undefined && !state.f161Tried;
    return acc('f161fields', state.f161Tried ? 'כל השדות שחולצו, המענקים ותיקון' : 'הזנה ידנית של שדות הטופס', '', body, def).replace('class="card acc"', 'class="card acc sub"');
}

function renderStep2() {
    const g = state.f161.grants;
    const grantsFound = state.f161Tried && state.f161Found.grants;
    const grantsMissing = state.f161Tried && !state.f161Found.grants;
    const fields161 = `        <div class="fldgrid">
            ${renderField161('fullName')}
            ${renderField161('idNumber')}
            ${renderField161('birthDate')}
            ${renderField161('startWork')}
            ${renderField161('retireDate')}
            ${renderField161('workYears')}
            ${renderField161('salaryFull')}
            ${renderField161('salaryInsured')}
            ${renderField161('salarySeverance')}
        </div>
        <div class="subhead">מענקים (חלק א9)
            ${grantsFound ? (state.f161Confirmed ? `<em class="tag-ok">אומתו מול הטופס ✓</em>` : `<em class="tag-miss">חולצו ${g.length} מענקים מהטופס - טרם אומתו</em>`) : ''}
            ${grantsMissing ? '<em class="tag-miss">לא זוהו מענקים - אם קיימים בחלק א9, הוסיפו ידנית</em>' : ''}
        </div>
        ${g.map((gr, i) => `<div class="grantrow">
            <input placeholder="שם המשלם" data-grant="${i}|payer" value="${esc(gr.payer)}">
            <input placeholder="קוד" data-grant="${i}|code" value="${esc(gr.code)}" style="max-width:64px">
            <input placeholder="סכום" data-grant="${i}|amount" value="${esc(gr.amount)}">
            <button type="button" class="ghostbtn" data-rmgrant="${i}">הסרה</button>
        </div>`).join('')}
        <button type="button" class="ghostbtn" data-action="addgrant">הוספת מענק</button>
        <div class="fldgrid" style="margin-top:10px">
            ${renderField161('totalGrant')}
            ${renderField161('maxKtseva')}
            ${renderField161('maxPitzuim')}
            ${renderField161('maxExempt')}
            ${renderField161('taxableGrant')}
        </div>`;
    return `
        <div class="drop">
            <input type="file" id="f161-input" accept=".pdf">
            <div class="drop-hint">בחרו את טופס 161 שהופק ברשות המסים. המערכת מחלצת את השדות אוטומטית: מה שחולץ מוצג לאישור (לא תתבקשו להזין שוב), ורק מה שלא חולץ יסומן להזנה ידנית.</div>
        </div>
        ${state.f161Status ? `<div class="status-line">${esc(state.f161Status)}</div>` : ''}
        ${state.f161Tried ? renderKey161() : ''}
        ${fold161(`${fields161}`)}
        ${state.f161Tried && Object.keys(state.f161Found).length ? (state.f161Confirmed
            ? `<div class="a161 a161-ok"><b>השדות שחולצו אושרו מול הטופס החתום.</b> הנתונים המחושבים מהטופס (ניתוח פרישה, קיבוע זכויות, חלוקת כספים) פעילים על השדות כפי שאושרו. כל שינוי בשדה או העלאת טופס חדש מחזירים את החלק למצב "ממתין לאישור".</div>`
            : `<div class="a161 a161-red"><b>השדות שחולצו אינם מאומתים עדיין - חילוץ אוטומטי עלול לטעות.</b> עברו על כל שדה מול תמונת הטופס למטה (או מול הטופס החתום), תקנו ב"תיקון" מה שצריך, ורק אז אשרו. עד לאישור מפורש, הנתונים המחושבים מהטופס מושהים ואינם מוצגים.</div>
        <button type="button" class="primarybtn" data-action="confirm161" style="margin-top:8px">אישור מפורש: עיינתי בטופס והשדות המוצגים תואמים אותו</button>`) : ''}
        ${renderPendingClient()}
        ${renderF161Alerts()}
        ${state.f161Pages.length ? `<div class="f161pages">
            <div class="subhead">הטופס שהועלה - תמונה להשוואה מול השדות שחולצו</div>
            <div class="muted small">העיבוד נעשה בדפדפן בלבד והקובץ לא נשלח לשום שרת. גללו להשוואה מול השדות שחולצו למעלה.</div>
            ${state.f161Pages.map(pg => pg.img ? `<div class="f161pg"><div class="muted small">עמוד ${pg.page}</div><img class="f161img" src="${pg.img}" alt="טופס 161 עמוד ${pg.page}"></div>` : `<div class="muted small">הוצגו ${pg.shown} עמודים ראשונים מתוך ${pg.total}.</div>`).join('')}
        </div>` : ''}
    `;
}

// אזור התראות מרוכז בתחתית חלק 161: שדות שלא נקראו, סימונים לא מאומתים, סתירות ותרחישי בחירה לבחינה.
// לא משנה דבר בטופס ואינו קובע שהבחירה הנוכחית שגויה - תרחישים מותנים בלבד, עם מקור.
function renderPendingClient() {
    const pc = state.pendingClient;
    if (!pc) return '';
    const tail = (id) => { const d = (id || '').replace(/\D/g, ''); return d ? '...' + d.slice(-3) : 'אין'; };
    const oldSrc = pc.prevClient && (pc.prevClient.name || pc.prevClient.id)
        ? { name: pc.prevClient.name, id: pc.prevClient.id, label: 'במסלקה הקודמת' }
        : (pc.f161 && (pc.f161.fullName || pc.f161.idNumber) ? { name: pc.f161.fullName || '', id: pc.f161.idNumber || '', label: 'בטופס 161 המופרד' } : null);
    const newC = state.portfolio && state.portfolio.client ? state.portfolio.client : null;
    const cmp = oldSrc && newC ? `<div class="small">השוואת זהויות: ${oldSrc.label} - ${esc(oldSrc.name || 'שם לא חולץ')} (זהות ${tail(oldSrc.id)}); במסלקה הנוכחית - ${esc(newC.name || 'שם לא חולץ')} (זהות ${tail(newC.id)}).</div>` : '';
    const what = [pc.f161 ? 'טופס 161' : '', Object.keys(pc.netin || {}).length || Object.keys(pc.kibua || {}).length || Object.keys(pc.alloc || {}).length || Object.keys(pc.goals || {}).length || pc.mekManual ? 'קלטים ידניים (נטו/קיבוע/הקצאה/יעדים/מקדם)' : '', (pc.life && pc.life.policies && pc.life.policies.length) || (pc.health && pc.health.policies && pc.health.policies.length) || (pc.calc && Object.keys(pc.calc).length) ? 'דפי עבודה (ביטוח חיים/בריאות/מחשבונים)' : ''].filter(Boolean).join(' ו');
    if (pc.reason === 'mismatch') {
        return `<div class="callout warn" id="pending-client"><b>קלטים של לקוח קודם מופרדים ואינם בחישוב:</b> ${esc(what)}. מספר הזהות שונה מהמסלקה הנוכחית - אין לאחד בלחיצה. כדי להשתמש בקלטים יש לתקן את הזהות: העלו את הקובץ או הטופס הנכונים, או תקנו את מספר הזהות בטופס והעלו מחדש. הקלטים נשמרים לייצוא נפרד בלבד.
            ${cmp}
            <button type="button" class="mini" data-pending-save>ייצוא קלטים מופרדים לקובץ נפרד</button>
            <button type="button" class="mini" data-pending-discard>מחק קלטים מופרדים</button></div>`;
    }
    return `<div class="callout warn" id="pending-client"><b>קלטים של לקוח קודם מופרדים ואינם בחישוב:</b> ${esc(what)} (לא אומתה זהות מול המסלקה הנוכחית - מזהה חסר באחד המקורות). הם נשמרים כפי שהם. אם מדובר באותו לקוח, אשרו במפורש:
        ${cmp}
        <button type="button" class="mini" data-pending-restore>אותו לקוח - החזר קלטים לחישוב</button>
        <button type="button" class="mini" data-pending-save>ייצוא קלטים מופרדים לקובץ נפרד</button>
        <button type="button" class="mini" data-pending-discard>מחק קלטים מופרדים</button></div>`;
}

function renderF161Alerts() {
    if (!state.f161Tried) return '';
    const marks = state.f161Marks || [];
    const missing = Object.entries(state.f161Found).filter(([, v]) => !v).map(([k]) => k === 'grants' ? 'מענקים (חלק א9)' : FIELD_LABELS[k]);
    const markedC = marks.filter(m => m.state === 'marked');
    const unknownM = marks.filter(m => m.state === 'unknown');
    const contr = state.f161 && Object.keys(state.f161Found).length ? contradictions161(state.f161) : [];
    const numOf = (s) => parseFloat(String(s || '').replace(/[^\d.]/g, '')) || 0;
    const markState = (k) => (marks.find(m => m.key === k) || {}).state || 'unknown';
    const scen = [];
    if (markState('b2_ritzPitz') === 'marked')
        scen.push('אם סומן ייעוד סכום לרצף פיצויים (ב2): הבחירה דוחה את המס למעסיק הבא, אך מחייבת מציאת מעסיק חדש שמפקיד לפיצויים תוך שנה, וחזרה ממנה אפשרית רק בתוך שנתיים - חזרה מאוחרת יותר שוללת את הפטור (הערות הטופס (ב) בחלק ב1; סעיף 9א לפקודת מס הכנסה). שקלו מול האלטרנטיבה: פטור מיידי או רצף קצבה. בבירור מול איש מקצוע.');
    if (numOf(state.f161 && state.f161.maxExempt) > 0)
        scen.push('אם נבחר בחלק ב1 ניצול מענק פטור מיידי (עמודה ג): משיכת מענק בפטור עלולה להקטין את הפטור החודשי על הקצבה בעת קיבוע הזכויות (סעיף 9א לפקודת מס הכנסה; הערת הטופס (ג) בחלק ב1). האלטרנטיבה - ייעוד לרצף קצבה (עמודה א), ששומרת על הפטור העתידי אך נועלת את הכסף לקצבה. הבחירה תלויה בגיל, בצבירה ובתכנון המס - בבירור מול איש מקצוע.');
    if (numOf(state.f161 && state.f161.taxableGrant) > 0 && markState('b2_prisa') !== 'marked')
        scen.push('קיים מענק חייב במס ולא זוהה סימון פריסה: אפשר לשקול בקשת פריסת המס על עד 6 שנות מס בטופס 116ג (סעיף 8(ג)(3) לפקודת מס הכנסה), שעשויה להקטין את שיעור המס. זו אפשרות לבחינה, לא חישוב ולא המלצה.');
    // האזור מוצג תמיד לאחר ניסיון חילוץ - גם כשהכול ירוק, אזהרת הסימונים הלא-מאומתים נשארת
    return `<div class="alerts161">
        <div class="alerts161-title">בדיקות מרוכזות - אין צורך לעבור שדה שדה</div>
        ${Object.keys(state.f161Found).length ? (missing.length ? `<div class="a161 a161-red"><b>שדות שלא נקראו מהטופס (${missing.length}):</b> ${missing.join(' · ')}. השלימו רק אותם ידנית מהטופס; שאר השדות כבר חולצו ומוצגים למעלה לאישור.</div>` : '<div class="a161 a161-ok">כל שדות הטופס נקראו ומוצגים למעלה לאישור.</div>') : ''}
        ${marks.length ? `<div class="a161 a161-red"><b>סימוני ה-V בחלקים א12, ב' ו-ג' לא אומתו אוטומטית.</b>
            ${markedC.length ? `<br>זוהו סימונים אפשריים (לא מאומתים) ליד: ${markedC.map(m => `${esc(m.label)} (${esc(m.part)}, עמ' ${m.page})`).join(' · ')}.` : ''}
            ${unknownM.length ? `<br>לא זוהה סימון ליד ${unknownM.length} אפשרויות - ייתכן שאינן מסומנות, או שהטופס מולא ביד/נסרק.` : ''}
            <br>גם סימון שזוהה אינו אומת מול הטופס - השוו מול הטופס החתום לפני הסתמכות. המערכת אינה משנה סימונים בטופס.</div>` : ''}
        ${Object.keys(state.f161Found).length ? (() => {
            const checkable = ['startWork', 'retireDate', 'workYears', 'idNumber'].some(k => state.f161Found[k]);
            if (!checkable) return '<div class="a161">אין די נתונים לבדיקת סתירות פנימיות (לא חולצו תאריכים, שנות עבודה או מספר זהות) - הבדיקה תופעל לאחר השלמת השדות.</div>';
            return contr.length ? `<div class="a161 a161-red"><b>סתירות שדורשות בירור:</b><ul>${contr.map(c => `<li>${esc(c)}</li>`).join('')}</ul></div>` : '<div class="a161 a161-ok">לא נמצאו סתירות פנימיות בשדות שחולצו.</div>';
        })() : ''}
        ${scen.length ? (state.f161Confirmed
            ? `<div class="a161 a161-warn"><b>תרחישי סימון לבחינה בחלקים ב'/ג' (לא ממצא שהסימון הנוכחי שגוי):</b><ul>${scen.map(s => `<li>${esc(s)}</li>`).join('')}</ul></div>`
            : `<div class="a161">תרחישי הסימון לבחינה בחלקים ב'/ג' נגזרים מהשדות שחולצו, ויוצגו כאן לאחר אישורם המפורש מול הטופס החתום.</div>`) : ''}
    </div>`;
}

function renderStep3() {
    const g = state.goals;
    const chk = (key, label) => `<label><input type="checkbox" data-goal="${key}" ${g[key] ? 'checked' : ''}> ${label}</label>`;
    return `
        <div class="fldgrid">
            <label class="fld"><span>כמה שנים נשארו עד תחילת הקצבה</span>${numSel('data-goal-text="horizon"', 0, 45, 1, g.horizon, 'בחרו...', (v) => v === '0' ? 'כבר מקבל / השנה' : v === '1' ? 'שנה אחת' : v + ' שנים')}</label>
        </div>
        <div class="checks">
            ${chk('keepExemption', 'שמירה על הפטור החודשי על הקצבה')}
            ${chk('inheritance', 'העברה בין-דורית חלקה של הנכסים')}
            ${chk('capitalFirst', 'שמירה על ההון עבור הלקוח והיורשים ככל הניתן, גם על חשבון קצבה גבוהה יותר (ללא ערובה לשימור מלא של ההון)')}
            ${chk('consolidate', 'ריכוז הנכסים למסלול פנסיוני אחד')}
        </div>
        <div class="muted small">המטרות נרשמות כאן כדי שהבדיקות הפתוחות למטה ישקפו אותן. בשלב זה אין במערכת מסקנות מוכנות לגבי ניוד או העברה בין-דורית.</div>
    `;
}

// ---------- official document uploads (step 4) ----------
// Local pdf.js extraction per document profile (js/pdfdocs.js). Every hit is an
// unconfirmed candidate with its page number; adding is always the user's action.
const DOC_UPLOADS = {
    quote: { profile: 'quote', name: 'ציטוט קצבה', title: 'העלאת ציטוט קצבה רשמי מהגוף המנהל (PDF)', hint: 'במקום להקליד: העלו את קובץ הציטוט שקיבלתם מהגוף המנהל. החילוץ מתבצע כאן בדפדפן בלבד. כל ערך שיזוהה (קצבה חודשית, מועד תחילה, שאירים, תקופת הבטחה) יוצג כמועמד עם מספר העמוד שממנו נלקח. נוסחי ציטוט משתנים מאוד בין הגופים - מה שלא יזוהה יישאר להזנה ידנית, וציטוט סרוק (תמונה) אינו ניתן לחילוץ.' },
    'legacy-terms': { profile: 'policy', name: 'פוליסה / מסמך קרן ותיקה', title: 'העלאת פוליסה או מסמך תנאי הקרן הוותיקה (PDF)', hint: 'העלו את הפוליסה או מסמך התנאים שמתקבל מחברת הביטוח או הקרן. החילוץ מחפש ערכי פדיון, דמי ניהול מוסכמים, מקדם/תשואה מובטחת ותאריך תחילת הביטוח - כל ערך שיזוהה יוצג כמועמד עם מספר עמוד. פורמטים משתנים בין הגופים; מה שלא יזוהה יישאר להזנה ידנית. מסמך סרוק אינו ניתן לחילוץ.' },
    'income-tax': { profile: 'p106', name: 'טופס 106 / תלוש שכר', title: 'העלאת טופס 106 מהמעסיק או תלוש שכר (PDF)', hint: 'החילוץ מחפש שנת מס, שכר/הכנסה חייבת (שדה 158/172), מס הכנסה שנוכה (שדה 042), חודשי עבודה ומספר זהות. נוסחי 106 ממוחשבים משתנים בין חברות השכר; מה שלא יזוהה יישאר להזנה ידנית.' },
    'family-idsup': { profile: 'idsup', name: 'ספח תעודת זהות', title: 'העלאת ספח תעודת זהות (PDF)', hint: 'הספח מפרט בן/בת זוג וילדים. החילוץ מחפש שורות עם שם, מספר זהות או תאריך לידה ומוסיף אותם לרשימה כבני משפחה בלבד - לא כמוטבים. מסמך סרוק אינו ניתן לחילוץ.' },
    'family-benefit': { profile: 'benefit', name: 'אישור מוטבים מהגוף המנהל', title: 'העלאת אישור מוטבים עדכני מהגוף המנהל (PDF)', hint: 'אישור מוטבים מתקבל מקרן הפנסיה או חברת הביטוח. שמות שייזהו יסומנו כמוטבים רשומים; שיעור לאחר מוות שייזהה יתווסף לערך. נוסחים משתנים בין הגופים - מה שלא יזוהה יישאר להזנה ידנית.' },
};
const getDoc = (k) => state.docs[k] || { tried: false, status: '', fileName: '', candidates: [], added: {} };

const INCOME_TAX_GUIDE = `<div class="note small"><b>אילו מסמכים רשמיים לבקש, וממי:</b>
    <ul class="notes">
        <li><b>תלוש שכר עדכני</b> - מכיל את השכר והניכויים המצטברים (YTD) לשנת המס השוטפת. טופס 106 מסכם שנה קלנדרית שהסתיימה, ולכן בנובמבר 2026 אין תחליף לתלוש השוטף לנתוני 2026.</li>
        <li><b>טופס 106</b> ("אישור על משכורת וניכוי מס") של השנה המלאה האחרונה (2025) - מכל מעסיק. המעסיק חייב למסור אותו ביום סיום ההעסקה או עד 31.3 שלאחר שנת המס. מכיל את השכר השנתי החייב (שדה 158/172) ואת מס ההכנסה שנוכה במקור (שדה 042). טופסי 106 מ-6 השנים האחרונות ניתנים גם להורדה מהאזור האישי באתר רשות המסים.</li>
        <li><b>טופס 161 חתום</b> כולל חלק א9 (חלוקת המענקים לפי הקופות) - מופק על ידי המעסיק ומוזן בשלב 2.</li>
        <li><b>טופס 161א</b> - הודעת העובד למעסיק על הפרישה; העובד ממלא אותה כדי שהמעסיק יפיק את ה-161.</li>
    </ul>
    מקור: רשות המסים בישראל (gov.il - שירות טופס 106, מדריך פרישה מעבודה), נכון ל-11/2026.</div>`;

function renderDocUpload(key) {
    const cfg = DOC_UPLOADS[key];
    const d = getDoc(key);
    const isFamily = key.startsWith('family-');
    return `<div class="docbox">
        <div class="drop">
            <input type="file" id="doc-input-${key}" accept=".pdf">
            <div class="drop-hint"><b>${cfg.title}.</b> ${cfg.hint}</div>
        </div>
        ${d.status ? `<div class="status-line">${esc(d.status)}</div>` : ''}
        ${d.candidates.length ? `<div class="subhead small">מועמדים שזוהו - ${cfg.name}${d.fileName ? ` (${esc(d.fileName)})` : ''} <em class="tag-miss">מועמדים בלבד - יש לבדוק מול המסמך לפני ההוספה</em></div>` : ''}
        ${d.candidates.map((c, i) => `<div class="quotecand">
            <div class="qc-main"><div><b>${esc(c.label)}:</b> ${esc(c.value)} <span class="muted small">(עמ' ${c.page})</span></div>
            <button type="button" class="mini" data-doccand="${key}|${i}" ${d.added[i] ? 'disabled' : ''}>${d.added[i] ? 'נוסף ✓' : (isFamily && ['spouse', 'child', 'benef'].includes(c.key) ? 'הוספה לרשימה' : 'הוספה לאישור')}</button></div>
            ${c.context ? `<div class="muted small qc-context">נוסח במקור: ${esc(c.context)}</div>` : ''}
        </div>`).join('')}
        ${d.candidates.length ? `<button type="button" class="ghostbtn" data-action="docaddall|${key}">הוספת כל המועמדים</button>` : ''}
    </div>`;
}

function addDocCandidates(key, indices) {
    const d = state.docs[key];
    if (!d) return;
    const cfg = DOC_UPLOADS[key];
    if (key.startsWith('family-')) {
        let changed = false;
        for (const i of indices) {
            if (d.added[i] || !d.candidates[i]) continue;
            const c = d.candidates[i];
            if (['spouse', 'child', 'benef'].includes(c.key)) {
                const rel = c.key === 'spouse' ? 'בן/בת זוג' : c.key === 'child' ? 'ילד/ה' : 'מוטב/ת רשום/ה';
                state.beneficiaries.push({ name: c.value, relation: rel, source: `${cfg.name}${d.fileName ? ' - ' + d.fileName : ''} (עמ' ${c.page})` });
            } else {
                state.familyExtra.push(`${c.label}: ${c.value} (${cfg.name}${d.fileName ? ' - ' + d.fileName : ''}, עמ' ${c.page})`);
            }
            d.added[i] = true; changed = true;
        }
        if (changed) composeFamilyValue();
        return;
    }
    const cur = state.intake[key] || { value: '', source: '' };
    let value = cur.value.trim();
    for (const i of indices) {
        if (d.added[i] || !d.candidates[i]) continue;
        const c = d.candidates[i];
        const piece = `${c.label}: ${c.value}`;
        value = value ? value.replace(/[;.,\s]+$/, '') + '; ' + piece : piece;
        d.added[i] = true;
    }
    const pages = [...new Set(d.candidates.filter((_, j) => d.added[j]).map(c => c.page))].sort((a, b) => a - b).join(', ');
    state.intake[key] = { value, source: d.fileName ? `${cfg.name} - ${d.fileName}${pages ? ` (עמ' ${pages})` : ''}` : cur.source };
}

// קרבה: רשימה סגורה (בקשת הבעלים 12.11 13:58 - חלון נגלל כשהתשובה מתוך עד 20 אפשרויות); "אחר" פותח שדה טקסט
const RELATIONS = ['בן/בת זוג', 'ילד/ה', 'נכד/ה', 'הורה', 'אח/אחות', 'מוטב/ת רשום/ה', 'יורשים על פי דין', 'אחר'];
const relationText = (r) => r.relation === 'אחר' ? (r.relationOther || 'אחר') : r.relation;
function relationSelect(i, r) {
    const v = r.relation || '';
    const opts = ['', ...RELATIONS, ...(v && !RELATIONS.includes(v) ? [v] : [])];
    return `<select data-ben="${i}|relation">${opts.map(o => `<option value="${esc(o)}"${o === v ? ' selected' : ''}>${o ? esc(o) : 'קרבה...'}</option>`).join('')}</select>`
        + (v === 'אחר' ? `<input placeholder="פירוט הקרבה" data-ben="${i}|relationOther" value="${esc(r.relationOther || '')}">` : '');
}
function composeFamilyValue() {
    const parts = state.beneficiaries.filter(r => r.name.trim()).map(r => `${r.name} - ${relationText(r)} [${r.source}]`);
    const value = [...parts, ...state.familyExtra].join('; ');
    const docsUsed = [...new Set(state.beneficiaries.map(r => (r.source || '').replace(/ \(עמ'[^)]*\)/, '')).filter(s => s && !s.startsWith('הזנה ידנית')))];
    const source = docsUsed.length ? docsUsed.join(' + ') : (state.intake.family || {}).source || '';
    state.intake.family = { value, source };
}

function syncIntakeInputs(id) {
    const v = state.intake[id] || { value: '', source: '' };
    const vi = document.querySelector(`input[data-intake="${id}|value"]`);
    const si = document.querySelector(`input[data-intake="${id}|source"]`);
    if (vi) vi.value = v.value;
    if (si) si.value = v.source;
}

function renderFamilyBlock() {
    return `<div class="quotebox">
        <div class="callout note-c small"><b>חשוב לפני ההעלאה:</b> ספח תעודת הזהות מזהה בני משפחה בלבד - הוא אינו מוכיח מי רשום כמוטב בקופה. רישום מוטבים מתאשר רק מול אישור עדכני מהגוף המנהל. לכן מי שייזהה מהספח יסומן "מהספח" ולא "מוטב/ת", ומוטבים יסומנו כך רק לפי אישור הגוף המנהל.</div>
        ${renderDocUpload('family-idsup')}
        ${renderDocUpload('family-benefit')}
        <div class="subhead small">רשימת מוטבים ובני משפחה <em class="tag-miss">לעריכה ואישור</em></div>
        ${state.beneficiaries.map((r, i) => `<div class="benrow">
            <input placeholder="שם" data-ben="${i}|name" value="${esc(r.name)}">
            ${relationSelect(i, r)}
            <select data-ben-src="${i}">
                ${['אישור מוטבים מהגוף המנהל', 'ספח תעודת זהות', 'מסמך אחר', 'הזנה ידנית - ללא מסמך'].map(s => `<option ${r.source.startsWith(s) ? 'selected' : ''}>${s}</option>`).join('')}
            </select>
            <button type="button" class="ghostbtn" data-ben-rm="${i}">הסרה</button>
        </div>`).join('')}
        <button type="button" class="ghostbtn" data-action="benadd">הוספה ידנית (כולל מוטב/ת שאינו/ה מופיע/ה בספח)</button>
        <div class="muted small">הרשימה מעדכנת אוטומטית את שדה הערך של הסעיף; ניתן לערוך אותו גם ידנית.</div>
    </div>`;
}

async function onDoc(key, files) {
    if (!files || !files.length) return;
    const cfg = DOC_UPLOADS[key];
    const fileName = files[0].name;
    // קריאת הבאיטים לפני render: החלפת ה-input ב-DOM עלולה לבטל את גישת הדפדפן לקובץ שנבחר
    const buf = await files[0].arrayBuffer();
    rawVault.docs[key] = { name: fileName, bytes: new Uint8Array(buf.slice(0)) };
    state.docs[key] = { tried: true, status: 'מחלץ טקסט מהמסמך...', fileName, candidates: [], added: {} };
    render();
    const r = await extractDoc(buf, cfg.profile);
    const d = state.docs[key];
    d.candidates = r.candidates || [];
    d.added = {};
    if (r.error) {
        d.status = r.error;
    } else if (r.candidates.length === 0) {
        d.status = 'לא זוהו בקובץ שדות מוכרים. נוסחי המסמכים משתנים בין הגופים - הזינו ידנית מהמסמך.';
    } else {
        d.status = `זוהו ${r.candidates.length} מועמדים. אלה ערכים שחולצו אוטומטית בלבד - בדקו כל אחד מול המסמך (מספר העמוד ליד הערך) והוסיפו רק את הנכונים.`;
    }
    render();
}

function renderMekadem() {
    const v = state.mekIn;
    const gv = (k) => esc(v[k] !== undefined ? String(v[k]) : '');
    const manual = (state.mekManual || '').trim();
    const manualNum = parseFloat(manual);
    const manualValid = manual !== '' && !isNaN(manualNum) && manualNum > 50 && manualNum < 400;

    // ברירת מחדל לגוף: זיהוי מהתיק בלבד (יצרני חשבונות הפנסיה). (תוקן 09/11/2026: הלולאה קראה
    // state.accounts שאינו קיים ולכן הייתה מתה, והברירת-מחדל הייתה תמיד מנורה.) תיק עם כמה גופים
    // או ללא זיהוי אינו מקבל ברירת מחדל שקטה - המשתמש בוחר גוף בעצמו; בחירה קיימת נשמרת.
    if (!v.company) {
        const found = new Set();
        for (const a of ((state.portfolio && state.portfolio.accounts) || [])) {
            if (a.kind !== 'pensia') continue;
            const c = inferCompany(a.yatzran, a.plan);
            if (c) found.add(c);
        }
        if (found.size === 1) { v.company = [...found][0]; v.companyBy = 'portfolio'; }
    }
    let data = v.company ? state.mekData[v.company] : null;
    if (v.company && !data) {
        if (!state.mekLoading) {
            state.mekLoading = true;
            loadCompany(v.company).then(d => {
                state.mekData[v.company] = d;
                state.mekLoading = false;
                render();
            }).catch(() => {
                state.mekLoading = false;
                state.mekResult = '<div class="mekres err">טעינת הטבלאות נכשלה - בדקו חיבור ונסו שוב.</div>';
                render();
            });
        }
    }
    const scenarios = data ? scenariosOf(data) : [];
    // שיעור הקצבה לבן/בת הזוג קובע את טבלת התקנון (ברירת מחדל 60%). שיעור שהתקנון לא מפרסם לו טבלה - אין אומדן מספרי.
    if (!SURV_RATES.includes(v.survRate)) v.survRate = '60';
    const rateMap = data ? scenarioForRate(data, v.survRate) : null;
    const rateMissing = data && !rateMap;
    if (rateMap) v.scenario = rateMap.scenario;
    else if (data && !scenarios.includes(v.scenario)) v.scenario = scenarios[0];
    const guars = data ? guaranteesOf(data, v.scenario) : [];
    if (data && !guars.includes(v.guarantee)) v.guarantee = guars[0];
    const spouse = data ? hasSpouse(v.scenario) : false;

    const companyOptions = `${v.company ? '' : '<option value="" selected>— בחרו גוף מנהל —</option>'}` + ['makifa', 'klalit'].map(tp => `<optgroup label="${tp === 'makifa' ? 'קרנות פנסיה מקיפות' : 'קרנות כלליות/משלימות'}">${COMPANIES.filter(c => c.type === tp).map(c => `<option value="${c.key}"${v.company === c.key ? ' selected' : ''}>${c.label}</option>`).join('')}</optgroup>`).join('');
    const metaNote = data ? `<div class="muted small">הטבלאות חולצו מ<b>${esc(data.meta.label)}</b>, ${esc(data.meta.edition)} (${esc(data.meta.annex)}${data.meta.pages ? ', עמודים ' + esc(data.meta.pages) : ''}) ואומתו מספרית ב-8.11.2026 מול התקנון הרשמי (מלאי פנסיה-נט 09/2026). האומדן אינו ציטוט מחייב; לציטוט פונים לגוף המנהל. לפוליסות ותיקות עם מקדם מובטח - המקדם רשום בפוליסה עצמה.</div>` : '';

    return `<div class="card intake">
        <div class="track-line"><span><b>מקדם קצבה לפי טבלאות התקנון הרשמיות - כל הגופים</b></span><span class="small muted">אומדן - לא ציטוט</span></div>
        <div class="mekgrid">
            <label>גוף מנהל<select id="mek-company">${companyOptions}</select></label>
            ${!v.company ? '<div class="muted small">לא זוהה גוף מנהל יחיד מהתיק (או שזוהו כמה גופים) - בחרו גוף לצורך האומדן. לא נבחרה ברירת מחדל כדי לא לייחס טבלה של גוף אחר.</div>' : data ? `<label>שיעור הקצבה לבן/בת הזוג אחרי פטירה<select id="mek-survrate">${SURV_RATES.map(r => `<option value="${r}"${v.survRate === r ? ' selected' : ''}>${SURV_RATE_LABELS[r]}${scenarioForRate(data, r) ? '' : ' - אין טבלה בתקנון'}</option>`).join('')}</select></label>
            <label>תקופת הבטחה<select id="mek-guar">${guars.map(g => `<option value="${g}"${v.guarantee === g ? ' selected' : ''}>${GUAR_LABELS[g] || g}</option>`).join('')}</select></label>` : '<div class="muted small">טוען טבלאות...</div>'}
        </div>
        ${rateMissing ? `<div class="callout note-c"><b>לשיעור ${v.survRate}% אין טבלה בתקנון של ${esc(data.meta.label)}.</b> התקנון מאפשר לבחור שיעור (בדרך כלל 30%-100%), אבל המקדם לשיעור שאינו 60% נקבע ע"י אקטואר הקרן ואינו מפורסם - נדרש ציטוט מהקרן. לא מוצג אומדן מספרי. ההשוואה לגופים שמפרסמים טבלה לשיעור זה - בטבלת הגופים שמתחת לתוצאה.</div>`
            : rateMap && rateMap.note ? `<div class="muted small">${esc(rateMap.note)}</div>` : ''}
        ${data && !rateMissing ? `<div class="muted small">ככל ששיעור הקצבה לבן/בת הזוג גבוה יותר, הקצבה של הפנסיונר עצמו נמוכה יותר (ולהפך). ההשוואה בין השיעורים שהתקנון מפרסם מוצגת עם התוצאה.</div>` : ''}
        ${v.company ? `<div class="muted small" id="mek-company-src">${v.companyBy === 'user' ? 'הגוף נבחר ידנית על-ידי המשתמש (מתאפס בהחלפת קובץ מסלקה).' : 'הגוף זוהה מיצרן חשבון הפנסיה בתיק; ניתן לשנות.'}</div>` : ''}
        ${metaNote}
        ${v.company && data ? `
        <div class="mekgrid">
            <label>יתרה צבורה (₪)<input id="mek-balance" type="number" min="0" placeholder="1000000" value="${gv('balance')}"></label>
            <label>מין<select id="mek-gender"><option value="m"${v.gender !== 'f' ? ' selected' : ''}>זכר</option><option value="f"${v.gender === 'f' ? ' selected' : ''}>נקבה</option></select></label>
            <label>שנת לידה<input id="mek-by" type="number" placeholder="1963" value="${gv('birthYear')}"></label>
            <label>גיל פרישה<input id="mek-age" type="number" min="60" max="90" placeholder="${v.gender === 'f' ? 'חובה לאישה ילידת לפני 1970' : 'ריק = 67'}" value="${gv('age')}"></label>
            ${spouse ? `<label>שנת לידה בן/בת זוג<input id="mek-sby" type="number" placeholder="1966" value="${gv('spouseBirthYear')}"></label>` : ''}
        </div>
        <button type="button" class="mini" data-mek-calc>חשב אומדן</button>` : ''}
        ${state.mekResult}
        <div class="subhead">הזנה ידנית של מקדם (לכל גוף/מוצר)</div>
        <div class="mekgrid">
            <label>מקדם ידני<input id="mek-manual" type="number" step="0.01" placeholder="למשל 201.5" value="${esc(manual)}"></label>
            <label>יתרה לחישוב (₪)<input id="mek-manual-balance" type="number" min="0" placeholder="1000000" value="${gv('balance')}"></label>
        </div>
        <div class="muted small">ערך שהוזן ידנית מסומן כך: <span class="tag-manual">הזנה ידנית - לא אומת מול טבלה רשמית</span>. רשמו את מקור המספר (ציטוט, פוליסה, תאריך) בשדה המקור של הפריט.</div>
        ${manualValid ? `<div class="mekres manual"><span class="tag-manual">הזנה ידנית - לא אומת מול טבלה רשמית</span><br>מקדם שהוזן: <b>${manualNum}</b>${state.mekIn.balance ? ` · קצבה חודשית לפי הזנה זו: <b>₪${Math.round(+state.mekIn.balance / manualNum).toLocaleString('he-IL')}</b>` : ''}</div>` : ''}
    </div>`;
}

// בחירת חודש+שנה עתידיים בלבד לתאריך קצבה ראשונה. הגבולות נגזרים מהתאריך בעת השימוש, לא קבועים בקוד.
function renderPensionStart(st) {
    // גבולות לפי השעון בישראל (Asia/Jerusalem), לא לפי אזור הזמן של מכשיר המשתמש
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit' }).formatToParts(new Date());
    const curYear = +parts.find(p => p.type === 'year').value;
    const curMonth = +parts.find(p => p.type === 'month').value; // 1-12
    const m = (st.value || '').match(/^(\d{2})\/(\d{4})$/);
    let warn = '';
    let selM = '', selY = '';
    if (m) {
        const mm = +m[1], yy = +m[2];
        const future = yy > curYear || (yy === curYear && mm > curMonth);
        if (future) { selM = m[1]; selY = m[2]; }
        else warn = `התאריך הקיים (${esc(st.value)}) אינו עתידי - בחרו חודש ושנה עתידיים. הערך הקיים נשמר עד שיוחלף.`;
    } else if ((st.value || '').trim()) {
        warn = `הערך הקיים ("${esc(st.value)}") אינו בפורמט חודש/שנה - בחרו מהרשימות. הערך הקיים נשמר עד שיוחלף.`;
    }
    // בחירה חלקית (שנה בלבד או חודש בלבד) נשמרת בין רינדורים עד ששני החלקים נבחרו
    if (!selM && !selY && state.pensionStartSel) { selM = state.pensionStartSel.mm || ''; selY = state.pensionStartSel.yy || ''; }
    const years = [];
    for (let y = curYear; y <= curYear + 40; y++) years.push(y);
    const effYear = selY ? +selY : curYear;
    const firstMonth = effYear === curYear ? curMonth + 1 : 1;
    const months = [];
    for (let mm2 = firstMonth; mm2 <= 12; mm2++) months.push(String(mm2).padStart(2, '0'));
    return `<div>
        <div class="intakegrid">
            <select data-pension-part="month">
                <option value="">חודש</option>
                ${months.map(mm2 => `<option value="${mm2}" ${mm2 === selM ? 'selected' : ''}>${mm2}</option>`).join('')}
            </select>
            <select data-pension-part="year">
                <option value="">שנה</option>
                ${years.map(y => `<option value="${y}" ${String(y) === selY ? 'selected' : ''}>${y}</option>`).join('')}
            </select>
        </div>
        <div class="muted small">בתכנון זה ניתן לבחור רק חודשים עתידיים, החל מהחודש הבא.</div>
        ${warn ? `<div class="small" style="color:#8f1d12">${warn}</div>` : ''}
    </div>`;
}

// תרחישי משפחה (אושר על-ידי הלקוח 13:30 8.11.2026): פרישה, פטירה מוקדמת, אריכות ימים.
// כל המספרים נגזרים מהאומדן שחושב בכרטיס המקדם בלבד; אין המצאת זכויות או סכומים.
const FAM_TAKANON_SRC = {
    menora: 'תקנון מנורה מבטחים מקיפה (עדכון 26/7/2026), סעיפים 50, 58, 60',
    clal: 'תקנון כלל פנסיה מקיפה (y703, 5/2026), סעיפים 50, 58, 60',
    harel: 'תקנון הראל פנסיה (יוני 2025), סעיפים 50, 58, 60',
    migdal: 'תקנון מגדל מקפת אישית (06/2025), סעיפים 50, 58, 60',
    meitav: 'תקנון מיטב פנסיה (2026), סעיפים 50, 60',
    more: 'תקנון מור פנסיה (4/2026), סעיפים 50, 60',
    altshuler: 'תקנון אלטשולר שחם פנסיה (01/06/2025), סעיפים 50, 58, 60',
    infinity: 'תקנון אינפיניטי פנסיה (5/2025), סעיפים 50, 60',
    phoenix: 'תקנון הפניקס פנסיה (1/7/2024), סעיף 49 והוראות תקופת התשלומים המובטחים'
};

// אומתו מול התקנונים הכלליים/המשלימים של כל גוף (הורדו מאתרי החברות המנהלות, 8.11.2026): בכולם נמצאו הוראות תוספת התשלומים המובטחים לשאירים, הוראות פטירה ללא שאירים (סכום מהוון למוטבים/יורשים), וסעיפי עדכון הקצבאות למדד ולמאזן האקטוארי
const FAM_TAKANON_SRC_KLALIT = {
    menora: 'תקנון מנורה מבטחים פנסיה משלימה (ינואר 2026), סעיפים 59.4-59.6, 45, 108',
    clal: 'תקנון כלל פנסיה משלימה (y704, מאי 2026), הוראות תוספת התשלומים המובטחים, סעיפים 46, 109',
    harel: 'תקנון הראל פנסיה כללית (מהדורה 15, 07/2024), הוראות תוספת התשלומים המובטחים, סעיפים 44, 107',
    migdal: 'תקנון מגדל מקפת משלימה (יוני 2025), הוראות תוספת התשלומים המובטחים, סעיפים 46, 109',
    meitav: 'תקנון מיטב פנסיה כללית (מהדורת 05/2026), הוראות תוספת התשלומים המובטחים, סעיף 45 וסעיף העדכון האקטוארי',
    more: 'תקנון מור פנסיה כללית (אפריל 2026), הוראות תוספת התשלומים המובטחים, סעיף 46 וסעיף העדכון האקטוארי',
    altshuler: 'תקנון אלטשולר שחם פנסיה כללית (אפריל 2026), הוראות תוספת התשלומים המובטחים, סעיפים 46, 109',
    infinity: 'תקנון אינפיניטי פנסיה כללית (1.6.2025), הוראות תוספת התשלומים המובטחים, סעיפים 45, 108',
    phoenix: 'תקנון הפניקס פנסיה משלימה (1/7/2024), הוראות תוספת התשלומים המובטחים, סעיף 44 וסעיף העדכון האקטוארי'
};

// חישוב נטו 2026 - מדרגות, מס יסף וערך נקודת זיכוי מלוח הניכויים הרשמי של רשות המסים לינואר 2026 (gov.il); פטור קצבה מזכה ממדריך קיבוע הזכויות הרשמי (161ד) 2026. נקודות הזיכוי וניצול הקיבוע הם קלט מפורש של המשתמש - אין הנחות נתוני לקוח.
function renderNetBlock(grossMain) {
    const ni = state.netin;
    const simOptions = (sel) => `<option value=""${sel === '' ? ' selected' : ''}>לא נבחר - הפטור לא יחושב</option><option value="full"${sel === 'full' ? ' selected' : ''}>סל פטור מלא - לא נוצלו מענקים פטורים או היוון ב-32 השנים שקדמו לגיל הזכאות</option><option value="used"${sel === 'used' ? ' selected' : ''}>נוצל חלק מהסל - לפי אחוז הניצול הגסה למטה</option>`;
    return `<details class="netpanel"><summary>חישוב נטו חודשי מפורט - מס הכנסה בלבד (2026, מקורות רשמיים, כל הערכים להזנה ידנית)</summary><div class="netblock">
        <div class="netgrid">
            <label class="netcheck"><input type="checkbox" data-netcheck="eligMain"${ni.eligMain ? ' checked' : ''}> הקצבה של המבוטח סווגה כקצבה מזכה והזכאות אומתה (סיווג וגיל דורשים אימות מול המסמכים; לא חל על קצבת שאירים או קצבה מוכרת)</label>
            <label>שיעור הפטור מאישור קיבוע הזכויות בפועל (%, כולל הקצאה בין המשלמים; ריק = אין אישור) - המבוטח<input type="number" min="0" max="57.5" step="0.5" data-net="certRateMain" value="${esc(ni.certRateMain)}" placeholder="מהאישור"></label>
            <label>בלי אישור קיבוע - בחירת הנחיית הדמיה מפורשת (המבוטח)<select data-net="simMain">${simOptions(ni.simMain)}</select></label>
            <label>% ניצול מסל הפטור בגין מענקים פטורים והיוון קצבה בעבר (הערכה גסה בלבד; הגשת הקיבוע עצמה אינה צורכת פטור; מקבל שברי אחוז) - המבוטח<input type="number" min="0" max="100" step="0.0001" data-net="kibuaMain" value="${esc(ni.kibuaMain)}"></label>
            <label>נקודות זיכוי - המבוטח${numSel('data-net="pointsMain"', 0, 10, 0.25, ni.pointsMain, 'בחרו...')}</label>
            <label>הכנסה חודשית נוספת מיגיעה אישית בלבד - המבוטח (משכורת/עסק; לא שכירות או רווחי הון - משטרי המס שלהם שונים ואינם נתמכים) (₪)<input type="number" min="0" step="100" data-net="otherMain" value="${esc(ni.otherMain)}"></label>
            <label>קצבה ברוטו - בן/בת זוג (₪, 0 אם אין)<input type="number" min="0" step="100" data-net="grossSpouse" value="${esc(ni.grossSpouse)}"></label>
            <label class="netcheck"><input type="checkbox" data-netcheck="eligSpouse"${ni.eligSpouse ? ' checked' : ''}> הקצבה של בן/בת הזוג סווגה כקצבה מזכה והזכאות אומתה (לא חל על קצבת שאירים או קצבה מוכרת)</label>
            <label>שיעור הפטור מאישור קיבוע הזכויות בפועל (%, כולל הקצאה בין המשלמים; ריק = אין אישור) - בן/בת זוג<input type="number" min="0" max="57.5" step="0.5" data-net="certRateSpouse" value="${esc(ni.certRateSpouse)}" placeholder="מהאישור"></label>
            <label>בלי אישור קיבוע - בחירת הנחיית הדמיה מפורשת (בן/בת זוג)<select data-net="simSpouse">${simOptions(ni.simSpouse)}</select></label>
            <label>% ניצול מסל הפטור בגין מענקים פטורים והיוון קצבה בעבר (הערכה גסה בלבד, רק כשאין אישור קיבוע; מקבל שברי אחוז) - בן/בת זוג<input type="number" min="0" max="100" step="0.0001" data-net="kibuaSpouse" value="${esc(ni.kibuaSpouse)}"></label>
            <label>נקודות זיכוי - בן/בת זוג${numSel('data-net="pointsSpouse"', 0, 10, 0.25, ni.pointsSpouse, 'בחרו...')}</label>
            <label>הכנסה נוספת מיגיעה אישית בלבד - בן/בת זוג (₪)<input type="number" min="0" step="100" data-net="otherSpouse" value="${esc(ni.otherSpouse)}"></label>
        </div>
        <div id="net-result">${netResultHtml(grossMain)}</div>
        <div class="muted small"><b>כל הערכים בשדות הם הנחות ברירת מחדל לעריכה בלבד - אינם נתוני לקוח.</b> ללא סימון זכאות לא ניתן פטור כלל (הקצבה חייבת במלואה); הפטור מיושם רק אחרי שסיווג הקצבה כקצבה מזכה ותנאי הזכאות אומתו - אומדן המקדם כשלעצמו אינו מוכיח את משטר המס. ללא אישור קיבוע זכויות, הפטור מחושב רק לפי הנחיית ההדמיה שנבחרה במפורש ומסומן כלא מאומת. ברירות המחדל: נקודות זיכוי 2.25/2.75 (נהוג חוקית לתושב). <b>סל הפטור אחד לכל המשלמים של אותו אדם</b> - אם הקצבה מחולקת בין גופים יש להזין את שיעור ההקצאה מהאישור, לא את מלוא התקרה לכל משלם. המס על הקצבה מחושב שולית - מס על הכנסות נוספות אינו מיוחס לקצבה. מקורות: לוח הניכויים הרשמי של רשות המסים לינואר 2026 (מדרגות, מס יסף 3% מעל 60,130 ₪, נקודת זיכוי ${CREDIT_POINT_MONTHLY_2026} ₪) ומדריך קיבוע הזכויות הרשמי 161ד 2026 (הקצבה פטורה עד 5,422 ₪ לחודש - 57.5% מתקרת 9,430 ₪, ולכן קצבה הנמוכה מ-5,422 ₪ פטורה במלואה; ניצול סל הפטור מקטין קודם את התקרה החודשית - יתרת הסל חלקי 180), שניהם ב-gov.il. <b>החישוב הוא מס הכנסה בלבד</b> - אינו כולל ביטוח לאומי ומס בריאות, אינו מודל הכנסה חלקית או לא סדירה, ואינו תחזית של ניכוי במקור בפועל אצל משלם הקצבה. החישוב אינו תחליף לשומה.</div>
    </div></details>`;
}
function netRowHtml(label, r) {
    const eligNote = r.eligible ? '' : ' · <b>ללא פטור (זכאות לא סומנה)</b>';
    const srcNote = !r.eligible ? '' : (r.exemptSource === 'certificate' ? ' (לפי אישור קיבוע זכויות)' : r.exemptSource === 'sim-full' ? ' (הדמיה: סל מלא - לא אומת)' : r.exemptSource === 'sim-estimate' ? ' (הדמיה גסה לפי % ניצול - לא אומת)' : ' · <b>לא נבחרה הנחיית הדמיה - הפטור לא חושב</b>');
    return `<div class="netrow"><b>${label}:</b> ברוטו ₪${fmt(r.gross)} · פטור ₪${fmt(r.exempt)}${srcNote} · חייב ₪${fmt(r.taxablePension)}${eligNote} · מס שולי על הקצבה ₪${fmt(r.pensionTax)} · <b>נטו קצבה ₪${fmt(r.netPension)}</b>${r.taxOther > 0 || r.taxTotal > r.pensionTax ? ` · (מס על הכנסות נוספות בנפרד: ₪${fmt(r.taxOther)})` : ''}</div>`;
}
function netResultHtml(grossMain) {
    const ni = state.netin;
    const num = (v) => { const n = parseFloat(v); return isFinite(n) ? n : 0; };
    const rateOf = (v) => v === '' || v === undefined ? null : num(v);
    const main = pensionNetMonthly2026({ gross: grossMain, eligible: !!ni.eligMain, kibuaUsedPct: num(ni.kibuaMain), certExemptRatePct: rateOf(ni.certRateMain), simChoice: ni.simMain, creditPoints: num(ni.pointsMain), otherIncome: num(ni.otherMain) });
    let html = netRowHtml('המבוטח', main);
    const gs = num(ni.grossSpouse);
    if (gs > 0) {
        const sp = pensionNetMonthly2026({ gross: gs, eligible: !!ni.eligSpouse, kibuaUsedPct: num(ni.kibuaSpouse), certExemptRatePct: rateOf(ni.certRateSpouse), simChoice: ni.simSpouse, creditPoints: num(ni.pointsSpouse), otherIncome: num(ni.otherSpouse) });
        html += netRowHtml('בן/בת זוג', sp);
        html += `<div class="netrow nettotal"><b>נטו קצבאות משולב לבני הזוג: ₪${fmt(main.netPension + sp.netPension)}</b></div>`;
    }
    return html;
}
function updateNetResult() {
    if (!state.mekLast || !state.mekLast.pension) return;
    const el = document.getElementById('net-result');
    if (el) el.innerHTML = netResultHtml(state.mekLast.pension);
    const sm = document.getElementById('net-summary');
    if (sm) {
        const ni = state.netin;
        const num = (v) => { const n = parseFloat(v); return isFinite(n) ? n : 0; };
        const rateOf = (v) => v === '' || v === undefined ? null : num(v);
        const r = pensionNetMonthly2026({ gross: state.mekLast.pension, eligible: !!ni.eligMain, kibuaUsedPct: num(ni.kibuaMain), certExemptRatePct: rateOf(ni.certRateMain), simChoice: ni.simMain, creditPoints: num(ni.pointsMain), otherIncome: num(ni.otherMain) });
        sm.innerHTML = `<b>נטו משוער</b> (מס הכנסה בלבד): <b>₪${fmt(r.netPension)}</b> · ההזנות, ההנחות והפירוט בפאנל הנטו מתחת.`;
    }
    updateAlloc();
}

// נטו קצבת שאירים - משטר נפרד שאומת מול פקודת מס הכנסה 9(6ו) ולוח הניכויים הרשמי 2026:
// פטור מלא עד 9,430 ₪ (תקרת הקצבה המזכה), ללא קיבוע וללא ניצול סל פטור; העודף במס שולי.
// ההנחה השמרנית: הקצבה אינה מתשלומים פטורים (אחרת פטורה במלואה). נקודות הזיכוי וההכנסה הנוספת נלקחים משדות בן/בת הזוג.
// נטו קצבת שאירים - משטר מס נפרד (פקודת מס הכנסה 9(6ו)): פטור מלא עד תקרת הקצבה המזכה (9,430 ₪ ב-2026),
// ללא קיבוע וללא ניצול סל פטור; העודף במס שולי. סיווג המקור (מתשלומים פטורים = פטור מלא) הוא בחירה מפורשת -
// בלי בחירה מוצגות שתי האפשרויות, לא תשובה מספרית אחת על נתון חסר.
function survivorNetHtml(spouseP) {
    if (spouseP === null || !isFinite(spouseP) || spouseP <= 0) return '';
    const ni = state.netin;
    const num = (v) => { const n = parseFloat(v); return isFinite(n) ? n : 0; };
    const pts = num(ni.pointsSpouse), oth = num(ni.otherSpouse);
    const cls = ni.survClass || '';
    const r = survivorNetMonthly2026({ gross: spouseP, creditPoints: pts, otherIncome: oth });
    const taxPart = r.taxablePension > 0 ? ` · חייב ₪${fmt(r.taxablePension)} · מס שולי ₪${fmt(r.pensionTax)}` : '';
    const ok = !!ni.survAssumeOk;
    let body;
    if (cls === '') {
        body = `<b>נטו קצבת שאירים: לא מחושב.</b> הסכום לעיל הוא ברוטו בלבד. הנטו תלוי בשאלה אחת שצריך לבחור כאן: האם קצבת השאירים נובעת מתשלומים פטורים (אז פטורה במלואה) או לא (אז פטורה עד התקרה והעודף במס שולי). בלי בחירה מודעת לא יוצג מספר - התשובה נקבעת מול ציטוט הגוף המנהל או ייעוץ מס.`;
    } else if (!ok) {
        body = `<b>נטו קצבת שאירים: לא מחושב עדיין.</b> הסיווג נבחר, אך לא יוצג מספר עד אישור מפורש של הנחות ההדמיה שלהלן. ערכי ברירת המחדל (שנת מס, נקודות זיכוי, הכנסה נוספת) אינם נתון ידוע על השאיר/ה - רק האישור קובע שהמספר משקף תרחיש שאושר במודע, ולא ברירת מחדל שקטה.`;
    } else if (cls === 'exempt') {
        body = `<b>נטו קצבת שאירים (מס הכנסה בלבד): פטורה במלואה = ₪${fmt(spouseP)}</b> - קצבה הנובעת מתשלומים פטורים, סעיף 9(6ו)(א). נקודות הזיכוי וההכנסה הנוספת אינן משנות בפטור מלא, אך האישור מתעד שההנחות נבדקו.`;
    } else {
        body = `<b>נטו קצבת שאירים משוער (מס הכנסה בלבד): ₪${fmt(r.netPension)}</b> · פטור מלא עד התקרה ₪${fmt(r.exempt)}${taxPart}.`;
    }
    const confirmHtml = cls === '' ? '' : `<div><label><input type="checkbox" data-survassume${ok ? ' checked' : ''}> <b>אני מאשר/ת במפורש את הנחות ההדמיה:</b> חישוב לשנת מס <b>2026 בלבד</b> · ${pts} נקודות זיכוי לשאיר/ה · ${oth > 0 ? `הכנסה נוספת ₪${fmt(oth)}` : 'ללא הכנסה נוספת'}. הערכים ניתנים לשינוי בפאנל הנטו - כל שינוי בהם מבטל את האישור ודורש אישור מחדש.</label></div>`;
    return `<div class="muted small" style="margin-top:6px">
        <label>מקור קצבת השאירים (קובע את הפטור): <select data-survclass>
            <option value=""${cls === '' ? ' selected' : ''}>לא ידוע / לא נבדק</option>
            <option value="exempt"${cls === 'exempt' ? ' selected' : ''}>מתשלומים פטורים</option>
            <option value="regular"${cls === 'regular' ? ' selected' : ''}>לא מתשלומים פטורים (רגיל)</option>
        </select></label>
        <div>${body}</div>
        ${confirmHtml}
        <div>הנחות מס לחישוב (מפאנל הנטו, לשינוי שם - אינן נתון ידוע על השאיר/ה): ${pts} נקודות זיכוי${oth > 0 ? `, הכנסה נוספת ₪${fmt(oth)}` : ', ללא הכנסה נוספת'}. סימולציה לפי דין ומדרגות <b>2026 בלבד</b> (סעיף 9(6ו), תקרה ₪9,430 לחודש): התקרה והמדרגות מתעדכנות מדי שנה, ואין כאן תחזית לשנת הזכאות בפועל. משטר נפרד מקצבה מזכה - ללא קיבוע זכויות וללא ניצול סל הפטור; אומדן בלבד, אינו תחליף לשומה.</div>
    </div>`;
}

// השוואת תרחישי המשפחה מול חלופות זכאיות מדורגות: אותם קלטים (יתרה, תרחיש, הבטחה, גילאים) מול מקדמי גופים אחרים.
// החלופות מגיעות ממנוע החלופות - אותו סוג מוצר, אותה קטגוריית חשיפה, אותו מנדט מעקב וזכאות הצטרפות מאומתת בלבד.
function renderFamAlts(m, survPct) {
    const alts = state.mekAlts || [];
    if (!alts.length) return '<div class="famalts small">לא נמצאה חלופה זכאית בעלת דירוג גבוה יותר עם בסיס למקדם בתרחיש הזה. מסלולים מקבילים, לרבות בעלי דירוג זהה או חסר, מוצגים בתיק הנכסים להשוואה בלבד ואינם נבחרים אוטומטית להדמיית מעבר.</div>';
    // נטו לכל חלופה: אותו מודל המס המאומת של פאנל הנטו, אותן הנחות בן/בת זוג 1 בדיוק - להשוואה בין גופים בלבד
    const ni = state.netin;
    const nnum = (v) => { const n = parseFloat(v); return isFinite(n) ? n : 0; };
    const rateOf = (v) => v === '' || v === undefined ? null : nnum(v);
    const netOf = (gross) => pensionNetMonthly2026({ gross, eligible: !!ni.eligMain, kibuaUsedPct: nnum(ni.kibuaMain), certExemptRatePct: rateOf(ni.certRateMain), simChoice: ni.simMain, creditPoints: nnum(ni.pointsMain), otherIncome: nnum(ni.otherMain) }).netPension;
    // נטו משולב לכל חלופה: אותו מודל בדיוק. קצבת בן/בת זוג 2 קלט קבוע שאינו תלוי בחלופה, ולכן נטו בן/בת הזוג מחושב פעם אחת.
    const gs2 = nnum(ni.grossSpouse);
    const sp2Net = gs2 > 0 ? pensionNetMonthly2026({ gross: gs2, eligible: !!ni.eligSpouse, kibuaUsedPct: nnum(ni.kibuaSpouse), certExemptRatePct: rateOf(ni.certRateSpouse), simChoice: ni.simSpouse, creditPoints: nnum(ni.pointsSpouse), otherIncome: nnum(ni.otherSpouse) }).netPension : null;
    const netCell = (gross) => { const n1 = netOf(gross); return sp2Net !== null ? `₪${fmt(n1)}<div class="muted small">משולב עם בן/בת זוג: ₪${fmt(n1 + sp2Net)}</div>` : `₪${fmt(n1)}`; };
    const sp = (p) => survPct !== null && p !== null ? `₪${Math.round(p * survPct / 100).toLocaleString('he-IL')}` : 'לפי נספח הגוף';
    // פטירה בתוך תקופת ההבטחה - כללים שאומתו מילולית מול תקנון כל גוף (מקיפה וכללית/משלימה, 9 גופים):
    // עם שאירים - תוספת תשלומים מובטחים המשלימה לקצבה המלאה עד תום ההבטחה; ללא שאירים - היוון יתרת התשלומים למוטבים (סכום בציטוט בלבד).
    const guarText = (pension) => {
        if (m.guarantee === 'none') return 'לא נבחרה הבטחה - התשלום נפסק עם הפטירה';
        const gl = GUAR_LABELS[m.guarantee] || m.guarantee;
        return `עם שאירים זכאים: השלמה לקצבה המלאה (₪${pension.toLocaleString('he-IL')}) רק כל עוד קיים שאיר זכאי ורק עד תום ${gl}; לאחריה - קצבת השאירים בלבד; ללא שאירים: היוון היתרה למוטבים (בציטוט)`;
    };
    const comp = COMPANIES.find(c => c.key === m.company);
    const curRow = `<tr class="top"><td>${esc(comp ? comp.label : m.company)} <span class="tag-miss">נוכחי</span></td><td>${m.k}</td><td>₪${m.pension.toLocaleString('he-IL')}</td><td>${netCell(m.pension)}</td><td>${sp(m.pension)}</td><td class="small">${guarText(m.pension)}</td></tr>`;
    const rows = alts.map(a => a.error
        ? `<tr><td>${esc(a.label)}</td><td colspan="5" class="small muted">${esc(a.error)}${a.avail ? `<br>אפשרויות שאירים קיימות בטבלאות הגוף: ${esc(a.avail)} - שמות ואחוזים שונים בין גופים, ולכן אין להניח שקילות; להשוואה יש לבחור אפשרות קיימת במפורש.` : ''}</td></tr>`
        : a.baseOnly
        ? `<tr><td>${esc(a.label)}<div class="muted small">${esc(a.track)}</div></td><td colspan="5" class="small muted">בטבלאות שאומתו מול התקנון אין התאמה להפרש הגילאים שהוזן - לא מוצגים מקדם וקצבה כדי שלא ייקראו כקצבה בפועל.</td></tr>`
        : `<tr><td>${esc(a.label)}<div class="muted small">${esc(a.track)}</div></td><td>${a.k}</td><td>₪${a.pension.toLocaleString('he-IL')}</td><td>${netCell(a.pension)}</td><td>${sp(a.pension)}</td><td class="small">${guarText(a.pension)}</td></tr>`).join('');
    return `<div class="famalts" style="margin-top:10px">
        <div class="fam-t">אותם תרחישים מול חלופות זכאיות (אותם קלטים בדיוק)</div>
        <div class="alts-scroll"><table class="altstbl"><thead><tr><th>גוף</th><th>מקדם</th><th>קצבה ברוטו</th><th>נטו משוער*</th><th>קצבת שאירים</th><th>פטירה בתוך ההבטחה</th></tr></thead><tbody>${curRow}${rows}</tbody></table></div>
        <div class="muted small">*נטו משוער (מס הכנסה בלבד, ללא ביטוח לאומי ומס בריאות) מחושב באותו מודל המס המאומת של פאנל הנטו ובאותן ההנחות בדיוק (זכאות לפטור, ניצול קיבוע, נקודות זיכוי והכנסות נוספות של בן/בת זוג 1) - להשוואה בין גופים באותן הנחות בלבד, ואינו תחליף לשומה. כשהוזנה קצבה לבן/בת זוג 2 מוצגת גם שורת נטו משולב של משק הבית באותן ההנחות בדיוק; קצבת בן/בת זוג 2 היא קלט קבוע שאינו משתנה בין החלופות.</div>
        <div class="muted small">החלופות ממנוע החלופות המדורגות: אותו סוג מוצר, אותה קטגוריית חשיפה, אותו מנדט מעקב וזכאות הצטרפות שאומתה. המקדמים מטבלאות רשמיות של כל גוף (אומדן, לא ציטוט); מסלולי שאירים זהים באחוז אך כפופים לתקנון של כל גוף. כללי הפטירה בהבטחה (תוספת תשלומים מובטחים / היוון למוטבים) אומתו מילולית מול התקנון של כל אחד מ-9 הגופים, מקיפה וכללית/משלימה. אריכות ימים זהה בכולן במובן אחד בלבד: הקצבה משולמת כל החיים; מנגנוני ההצמדה למדד והאיזון האקטוארי נבדלים בין הגופים לפי תקנונם ואין להניח זהות תנאים. שמות אפשרויות השאירים והאחוזים נבדלים בין גופים - השוואה מוצגת רק לאותה אפשרות הקיימת בטבלאות הגוף, ואינה מניחה שקילות בין אפשרויות שונות. ההשוואה אינה המלצה להעברה - מעבר עלול לפגוע במקדם מובטח, בכיסויים ביטוחיים וברצף זכויות, שלא נבדקו כאן.</div>
    </div>`;
}

function renderFamilyScenarios() {
    const m = state.mekLast;
    const defs = `<div class="muted small">מונחים: <b>שאירים</b> - בן/בת זוג וילדים הזכאים לקצבה חודשית מהקרן על פי חוק (זכות חוקית שאינה ניתנת לעקיפה בהצהרה) · <b>מוטבים</b> - מי שמונו בקופה לקבל כספים שלא שולמו כקצבה (למשל תשלומי תקופת הבטחה) · <b>יורשים</b> - לפי צוואה או חוק הירושה. שלוש הקבוצות שונות ואין לבלבל ביניהן.</div>`;
    let body;
    if (!m || !m.pension) {
        body = `<div class="muted small">חשבו אומדן מקדם בכרטיס שלמעלה וכאן יוצגו שלושת התרחישים המשפחתיים מול המספרים שלו. בלי אומדן לא יוצגו מספרים.</div>${defs}`;
    } else {
        const comp = COMPANIES.find(c => c.key === m.company);
        const famBase = m.company.replace(/_klalit$/, '');
        const famSrc = m.company.endsWith('_klalit')
            ? (FAM_TAKANON_SRC_KLALIT[famBase] || FAM_TAKANON_SRC[famBase] || ('תקנון ' + (comp ? comp.label : m.company)))
            : (FAM_TAKANON_SRC[famBase] || ('תקנון ' + (comp ? comp.label : m.company)));
        const compLabel = comp ? `${comp.label} - ${comp.type === 'klalit' ? 'כללית/משלימה' : 'מקיפה'}` : m.company;
        const scenLabel = SCENARIO_LABELS[m.scenario] || m.scenario;
        const guarLabel = GUAR_LABELS[m.guarantee] || m.guarantee;
        const pctM = m.scenario.match(/^spouse(\d+)$/);
        const survPct = pctM ? +pctM[1] : null;
        const spouseP = survPct !== null ? Math.round(m.pension * survPct / 100) : null;
        const spouseScenario = hasSpouse(m.scenario);
        const hasGuar = m.guarantee !== 'none';
        let afterDeath;
        if (spouseP !== null) {
            afterDeath = `בן/בת הזוג יקבל/תקבל <b>₪${spouseP.toLocaleString('he-IL')}</b> לחודש (${survPct}% מהקצבה) לכל חייו/ה.`;
            if (hasGuar) afterDeath += ` נבחרה ${guarLabel}: אם הפטירה בתוך תקופת ההבטחה, יקבלו השאירים עד תומה <b>תוספת תשלומים מובטחים</b> המשלימה את קצבת השאירים לקצבה המלאה (₪${m.pension.toLocaleString('he-IL')} לחודש בסך הכול), ולאחריה תישאר קצבת השאירים בלבד.`;
        } else if (spouseScenario) {
            afterDeath = 'בן/בת הזוג זכאי/ת לקצבת שאירים באחוז הקבוע בנספח התקנון של הגוף שנבחר - האחוז המדויק לוודא בציטוט מהגוף.';
            if (hasGuar) afterDeath += ` נבחרה ${guarLabel}: אם הפטירה בתוכה, השאירים יקבלו עד תומה תוספת המשלימה לקצבה המלאה, ולאחריה את קצבת השאירים בלבד.`;
        } else if (hasGuar) {
            afterDeath = `לא נבחר מסלול שאירים - הקצבה נפסקת עם הפטירה. נבחרה ${guarLabel}: אם הפטירה בתוכה, המוטבים שיימנו (ובהיעדרם היורשים על פי דין) יקבלו את הערך המהוון של התשלומים המובטחים שנותרו כסכום חד-פעמי.`;
        } else {
            afterDeath = 'לא נבחר מסלול שאירים ולא נבחרה תקופת הבטחה - הקצבה נפסקת עם הפטירה ולא יישאר תשלום למשפחה.';
        }
        body = `
        <div class="famgrid">
            <div class="famcard"><div class="fam-t">1. פרישה בגיל ${m.age}</div>
                <div>קצבה חודשית <b>ברוטו</b> משוערת: <b>₪${m.pension.toLocaleString('he-IL')}</b> (יתרה ₪${m.balance.toLocaleString('he-IL')} · מקדם ${m.k} · ${esc(compLabel)}, ${esc(scenLabel)}, ${esc(guarLabel)}).</div>
                <div id="net-summary" class="netsummary"></div></div>
            <div class="famcard"><div class="fam-t">2. פטירה מוקדמת</div>
                <div><b>לפני תחילת הקצבה:</b> השאירים הזכאים מקבלים קצבת שאירים מהקרן לפי התקנון והצבירה בפועל; הסכום ניתן רק בציטוט מהגוף המנהל - בדיקה פתוחה.</div>
                <div><b>אחרי תחילת הקצבה:</b> ${afterDeath}</div>
                ${survivorNetHtml(spouseP)}</div>
            <div class="famcard"><div class="fam-t">3. אריכות ימים</div>
                <div>הקצבה משולמת <b>כל החיים</b> - ביטוח אריכות חיים מובנה בקרן הפנסיה: הקצבה ממשיכה גם בגיל 95 ומעלה ולא תיפסק בחיי המבוטח. חלופת משיכת היתרה כהון הייתה עלולה להיגמר במהלך החיים.</div>
                <div class="muted small">הקצבה מתעדכנת לפי המדד ובכפוף למנגנון האיזון האקטוארי בקרן - סכום נומינלי קבוע אינו מובטח; המובטח הוא רצף התשלום לכל החיים. מה שיישאר למשפחה תלוי במסלול השאירים ובתקופת ההבטחה שנבחרו.</div></div>
        </div>
        ${renderNetBlock(m.pension)}
        ${renderFamAlts(m, survPct)}
        ${defs}
        <div class="muted small">כל המספרים לעיל נגזרים מהאומדן שחושב בכרטיס המקדם (אומדן, לא ציטוט). כללי הפטירה וההבטחה אומתו מול ${famSrc}. החלטה סופית על מסלול קצבה דורשת ציטוט מחייב מהגוף המנהל.</div>`;
    }
    return `<div class="card intake">
        <div class="track-line"><span><b>תרחישי משפחה: פרישה, פטירה מוקדמת, אריכות ימים</b></span><span class="small muted">נגזר מהאומדן</span></div>
        ${body}
    </div>`;
}

// חישוב הקיבוע המשותף לסעיף הקיבוע ולסעיף חלוקת הכספים - מקור אחד בלבד לנוסחה ולשערים.
// מחזיר {missing} (קלט חסר), {blocked:'year'|'indexed'} (חישוב נעצר) או {ok:true,...} עם התוצאות.
function kibuaCalc(k) {
    const num = (v) => { const n = parseFloat(v); return isFinite(n) ? n : 0; };
    const rawNum = (v) => { const n = parseFloat(v); return isFinite(n) ? n : null; };
    const BASKET = 976005, MAZKE = 9430;
    // שער נתונים חסרים: שדה ריק אינו אפס. אין חישוב בלי חודש זכאות ובלי הצהרה מפורשת (ערך, כולל 0) בכל שדות המענקים/ההיוון
    const gRaw = rawNum(k.grantExempt), hPRaw = rawNum(k.hivunPast), hFRaw = rawNum(k.hivunPlan);
    const missing = [];
    if (!k.eligDate) missing.push('חודש הגעה לגיל זכאות');
    if (gRaw === null) missing.push('מענקים פטורים (0 = לא היו)');
    if (hPRaw === null) missing.push('היוון שבוצע בעבר (0 = לא בוצע)');
    if (hFRaw === null) missing.push('היוון מתוכנן (0 = לא מתוכנן)');
    if (missing.length) return { missing };
    // שער שנת זכאות: קבועי 2026 תקפים לשנת זכאות 2026 בלבד (שיעור הפטור עולה ב-2027/2028 לפי המדריך הרשמי, והתקרה מתמדדת מדי שנה)
    const eligYear = k.eligDate ? parseInt(k.eligDate.slice(0, 4), 10) : null;
    if (eligYear && eligYear !== 2026 && k.sim2026 !== 'yes') return { blocked: 'year', eligYear };
    const grant = num(k.grantExempt);
    // שער מידוד: אין מנוע מדד במערכת - נדרש סכום ממודד מוצהר
    if (grant > 0 && k.grantIndexed !== 'yes') return { blocked: 'indexed' };
    const hivP = num(k.hivunPast), hivF = num(k.hivunPlan);
    // M-003: מענק בגין יותר מ-32 שנות עבודה נלקח רק ביחס ל-32 השנים שקדמו לגיל הזכאות - מענק × 32/שנות עבודה × 1.35
    // (מדריך 161ד 2026, עמ' 6-7, דוגמה 1: 550,000 × 32/40 × 1.35 = 594,000). שנות העבודה: מהשדה, אחרת מטופס 161.
    const gy = rawNum(k.grantYears);
    const f161Years = parseWorkYears(state.f161 && state.f161.workYears);
    const grantYears = gy !== null && gy > 0 ? gy : (f161Years || null);
    const grantYearsFrom = gy !== null && gy > 0 ? 'field' : (f161Years ? 'f161' : null);
    const ratio32 = grantRatio32(grantYears);
    const uGrant = grant * ratio32 * 1.35;
    const used = uGrant + hivP + hivF;
    const usedPct = Math.min(100, used / BASKET * 100);
    const remain = Math.max(0, BASKET - used);
    const monthly = remain / 180;
    const rate = monthly / MAZKE * 100;
    return { ok: true, eligYear, grant, uGrant, ratio32, grantYears, grantYearsFrom, hivP, hivF, used, usedPct, pctRaw: used / BASKET * 100, remain, monthly, rate };
}
function kibuaResultHtml() {
    const k = state.kibua;
    const c = kibuaCalc(k);
    if (c.missing) {
        return '<div class="muted small">לא הוזנו נתונים; אין חישוב. שדה ריק אינו מתפרש כאפס ואינו הצהרה שאין מענקים או היוון. להצגת חישוב יש להשלים: ' + c.missing.join(' · ') + '.</div>';
    }
    if (c.blocked === 'year') {
        return '<div class="note small"><b>החישוב נעצר:</b> שנת הזכאות שהוזנה היא ' + c.eligYear + '. קבועי 2026 (תקרה 9,430 ₪, סל 976,005 ₪, שיעור 57.5%) אינם תקפים לשנת זכאות זו - שיעור הפטור משתנה לפי שנת הזכאות (2027: 62.5%, 2028 ואילך: 67%, לפי המדריך הרשמי) והתקרה מתמדדת מדי שנה. לחישוב משוער בקבועי 2026 בלבד, בחרו "הדמיית 2026" בשדה הייעודי; אחרת יש להשתמש בקבועים של שנת הזכאות מול מקור רשמי עדכני.</div>';
    }
    if (c.blocked === 'indexed') {
        return '<div class="note small"><b>החישוב נעצר:</b> הוזן סכום מענקים ללא הצהרת מידוד. נוסחת הקיזוז דורשת סכום <b>ממודד</b> לתחילת שנת הזכאות, והמערכת אינה מבצעת מידוד. הזינו את הסכום הממודד כפי שמופיע באישורי המעסיק/הקופה ובחרו "הסכום ממודד" בשדה המידוד - אחרת לא יוצג חישוב מספרי של יתרת הזכויות.</div>';
    }
    const { grant, uGrant, ratio32, grantYears, grantYearsFrom, hivP, hivF, used, usedPct, pctRaw, remain, monthly, rate, eligYear } = c;
    const ratioLabel = grant > 0
        ? (ratio32 < 1
            ? ` (× 32/${+grantYears.toFixed(2)} × 1.35 - שנות עבודה ${grantYearsFrom === 'f161' ? 'מטופס 161' : 'כפי שהוזנו'})`
            : (grantYears ? ' (× 1.35; עד 32 שנות עבודה - אין הקטנה יחסית)' : ' (× 1.35; שנות העבודה לא ידועות - אם מעל 32, הפגיעה קטנה יותר)'))
        : ' (× 1.35)';
    const simNote = (eligYear && eligYear !== 2026) ? '<div class="note small">הדמיית 2026 מפורשת: החישוב להלן משתמש בקבועי 2026 בלבד ואינו תקף לשנת הזכאות ' + eligYear + '.</div>' : '';
    return simNote + `<div class="kibres">
        <div class="track-line"><span>פגיעה בגין מענקים פטורים ממודדים${ratioLabel}</span><b>₪${Math.round(uGrant).toLocaleString('he-IL')}</b></div>
        <div class="track-line"><span>פגיעה בגין היוון קצבה פטור שבוצע בעבר</span><b>₪${Math.round(hivP).toLocaleString('he-IL')}</b></div>
        <div class="track-line"><span>פגיעה בגין היוון מתוכנן (בחירה עתידית של הלקוח בטופס הרשמי - ההדמיה אינה המלצה)</span><b>₪${Math.round(hivF).toLocaleString('he-IL')}</b></div>
        <div class="track-line"><span>פגיעה משוערת בסל הפטור - סה"כ</span><b>₪${Math.round(used).toLocaleString('he-IL')} (${usedPct.toFixed(1)}%)</b></div>
        <div class="track-line"><span>יתרת סל פטור משוערת</span><b>₪${Math.round(remain).toLocaleString('he-IL')}</b></div>
        <div class="track-line"><span>תקרת פטור חודשית משוערת (יתרה / 180)</span><b>₪${Math.round(monthly).toLocaleString('he-IL')}</b></div>
        <div class="track-line"><span>שיעור פטור משוער על הקצבה</span><b>${rate.toFixed(1)}%</b></div>
        <div class="muted small">להדמיה במחשבון הנטו (בכרטיס הפרישה): בחרו "נוצל חלק מהסל" והזינו בדיוק אחוז ניצול ${pctRaw.toFixed(4)}% (שדה הנטו מקבל שברי אחוז - עיגול משנה את התוצאה). תקרה חודשית מדויקת לבדיקה: ₪${monthly.toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}. את שדה "שיעור הפטור מאישור קיבוע" ממלאים רק מתוך אישור בפועל, לא מהדמיה. הערכה גסה בלבד: המידוד בפועל, חריגות התקופות (למשל מענקים ששולמו למעלה מ-15 שנה לפני הקצבה הראשונה) והשיעור הסופי נקבעים אצל פקיד השומה בלבד.</div>
    </div>`;
}
function updateKibua() {
    const el = document.getElementById('kib-result');
    if (el) el.innerHTML = kibuaResultHtml();
    updateAlloc();
}
// רענון חלקי של סעיף חלוקת הכספים כשקלטי קיבוע/נטו משתנים בלי רינדור מלא
function updateAlloc() {
    const ac = document.getElementById('alloc-scenarios');
    if (ac) ac.innerHTML = allocScenariosHtml();
    const am = document.getElementById('alloc-missing');
    if (am) am.innerHTML = allocMissingHtml();
}
// סיוע מילוי מטופס 161 שהועלה: הערכים המזוהים בטופס מוצגים עם מקור וסמנטיקה מדויקת (תקרה מול סכום בפועל).
// אין מילוי אוטומטי ואין אריתמטיקה בין בסיסים שונים - העתקה לשדה היא פעולה מפורשת של המשתמש, ושדה המידוד
// נשאר הצהרה נפרדת (הערכים בטופס נומינליים). סימון 'מקום עבודה יחיד' אינו הופך את התקרה המודפסת לסכום בפועל.
function kibAssist161Html() {
    const f = state.f161;
    const hasF161 = !!(f.retireDate || f.totalGrant || (f.grants && f.grants.length));
    if (!hasF161 || !state.f161Confirmed) return '';
    const num = (s) => { const n = parseFloat(String(s || '').replace(/[^\d.]/g, '')); return isFinite(n) ? n : null; };
    const items = [];
    const mx = num(f.maxExempt);
    if (mx !== null) items.push('<div class="track-line"><span>פטור מרבי מודפס בטופס (9א(7)) - <b>תקרה</b> לפי שנות העבודה והשכר בטופס זה; לא בהכרח הסכום הפטור שנבחר או ששולם בפועל, ולכן אין להעתיקה לשדה בלי אימות מול הטופס החתום</span><b>₪' + fmt(mx) + '</b></div>');
    const tx = num(f.taxableGrant);
    if (tx !== null) items.push('<div class="track-line"><span>מענק חייב במס כמודפס בטופס (סכום בפועל) - זהו החלק החייב, לא הפטור; אין להעתיקו לשדה הפטורים</span><b>₪' + fmt(tx) + '</b></div>');
    const tot = num(f.totalGrant);
    if (tot !== null) items.push('<div class="track-line"><span>סכום המענק הכולל המודפס (א13) - כולל פטור וחייב יחד; אין להעתיקו לשדה הפטורים</span><b>₪' + fmt(tot) + '</b></div>');
    if (!items.length) return '';
    return '<div class="note small"><b>סיוע מטופס 161 שהועלה (שלב "טופס 161"):</b> הערכים הבאים זוהו בטופס ומוצגים לעיון בלבד. שדה "מענקים פטורים ב-32 השנים" דורש את הסכום הפטור <b>שנמשך או שיימשך בפועל</b>; בחילוץ הקיים לא זוהה בטופס שהועלה שדה נפרד של סכום זה, ולכן יש לאמת ולהזין אותו מול הטופס החתום ואישורי המעסיק/הקופה. אין לחשב אותו בחיסור שדות מודפסים (בסיסים שונים). הערכים נומינליים: שדה המידוד נשאר הצהרה נפרדת.</div>'
        + items.join('')
        + '<div class="muted small">הטופס מתייחס למעסיק ולתקופה שבו בלבד. אם היו מענקי פרישה פטורים ממעסיקים קודמים ב-32 השנים שלפני גיל הזכאות, הם אינם בטופס זה ויש לכלול אותם בסכום (טפסי 161 קודמים).' + (state.kibua.empHistory === 'only' ? ' לפי ההצהרה שסומנה (מקום עבודה יחיד), הטופס מכסה את כל התקופה הרלוונטית - ועדיין יש לאמת את הסכום הפטור בפועל מול הטופס החתום: התקרה המודפסת אינה בהכרח הסכום.' : '') + '</div>';
}
function renderKibua() {
    const k = state.kibua;
    const grants = (state.f161Confirmed && state.f161.grants && state.f161.grants.length) ? state.f161.grants : null;
    const grantHint = grants ? `<div class="note small">בטופס 161 שהועלה בחלק הקודם זוהו ${grants.length} מענקים/רכיבים - בדקו את הסכומים המודפסים שם והעתיקו לשדה המענקים רק סכומים פטורים בגין 32 השנים שלפני גיל הזכאות.</div>` : '';
    return `<div class="card intake">
        <div class="track-line"><span><b>קיבוע זכויות (טופס 161ד)</b></span><span class="small muted">דף עבודה לתכנון - לא להגשה</span></div>
        <div class="muted small">קיבוע זכויות הוא בקשה לפקיד השומה למיצוי הטבות המס בסעיף 9א לפקודה: הפטור על הקצבה המזכה, מענק פרישה פטור והיוון קצבה. לפי המדריך הרשמי הוא נדרש למי שהגיע לגיל הזכאות אחרי 1.1.2012; גיל הזכאות הוא גיל הפרישה או מועד הקצבה המזכה הראשונה, המאוחר - גיל הפרישה משתנה לפי מין ותאריך לידה ונקבע לכל לקוח בנפרד. סל הפטור ל-2026: 976,005 ₪ (9,430 × 57.5% × 180). מקור: <a href="https://www.gov.il/BlobFolder/guide/2026-filling-out-form-161d/he/Guides_IncomeTax_filling-out-form-161d-2026.pdf" target="_blank" rel="noopener">מדריך קיבוע הזכויות הרשמי 161ד 2026, רשות המסים (gov.il)</a>. הטופס עצמו מוגש לרשות המסים באזור האישי - האתר אינו מגיש ואינו מייצר טופס להגשה.</div>
        <div class="subhead">מסמכים נדרשים לקיבוע (לפי המדריך הרשמי)</div>
        <ul class="notes">
            <li><b>תלוש קצבה מכל משלם קצבה</b> - חלק ב' בטופס: "יש לצרף תלוש קצבה ממשלם הקצבה, ובמידה וישנם מספר משלמים - תלוש מכל אחד מהם". שימו לב: סל הפטור אחד לכל המשלמים יחד. (באתר: אין חילוץ אוטומטי של תלושים - מצרפים לטופס הרשמי.)</li>
            <li><b>טופס 161 - הודעת מעסיק על פרישה</b> - ${k.empHistory === 'only' ? 'מהמעסיק הנוכחי (לפי ההצהרה שסומנה למטה: מקום עבודה יחיד, לא היו מענקים קודמים)' : 'ביחס לכל תקופת עבודה'}; מענקים ששולמו למעלה מ-15 שנה לפני קבלת הקצבה המזכה הראשונה (ושהתקבלו לפני 14.5.2012) לא יובאו בנוסחת הקיזוז ואין חובה לצרף עבורם. (באתר: מועלה בחלק הקודם "טופס 161 (PDF)" עם בדיקת סתירות.)</li>
            <li><b>מסמך מהמשלם על היוון קצבה פטור</b> - אם בוצע היוון בעבר: חובה לציין ולצרף מסמך הכולל סכום ההיוון, תקופת ההיוון ותאריך ההיוון. (באתר: אין חילוץ - מצרפים לטופס הרשמי.)</li>
        </ul>
        <div class="subhead">פרמטרים לתכנון הקיבוע (להשלמה מול מסמכי הלקוח)</div>
        ${grantHint}
        ${kibAssist161Html()}
        <div class="netgrid">
            <label>היסטוריית מעסיקים ב-32 השנים שלפני גיל הזכאות (הצהרת הלקוח - קובעת אילו מסמכים נדרשים)<select data-kib="empHistory"><option value=""${k.empHistory === '' ? ' selected' : ''}>לא נבחר - לא ידוע אם היו מעסיקים קודמים</option><option value="only"${k.empHistory === 'only' ? ' selected' : ''}>מקום עבודה יחיד - לא היו מענקי פרישה ממעסיקים קודמים</option><option value="additional"${k.empHistory === 'additional' ? ' selected' : ''}>היו מעסיקים/מענקים נוספים - יש לכלול גם אותם בסכום המענקים</option></select></label>
            <label>חודש הגעה לגיל זכאות (גיל פרישה או קצבה ראשונה, המאוחר)<input type="month" data-kib="eligDate" value="${esc(k.eligDate)}"></label>
            <label>מספר משלמי קצבה צפויים (סל פטור אחד משותף לכולם)<select data-kib="payers">${['', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10'].map(v => `<option value="${v}"${String(k.payers || '') === v ? ' selected' : ''}>${v || 'בחרו...'}</option>`).join('')}</select></label>
            <label>מענקי פרישה פטורים ממס שהתקבלו (₪, סכום מצטבר - כמודפס באישורים; ההקטנה ל-32 שנים מחושבת למטה)<input type="number" min="0" step="1000" data-kib="grantExempt" value="${esc(k.grantExempt)}"></label>
            <label>שנות העבודה שבגינן שולמו המענקים (ריק = לפי טופס 161${parseWorkYears(state.f161 && state.f161.workYears) ? ': ' + parseWorkYears(state.f161.workYears) : ''}; מעל 32 - הפגיעה מוקטנת ביחס 32/שנים)<input type="number" min="0" max="60" step="0.01" data-kib="grantYears" value="${esc(k.grantYears)}"></label>
            <label>האם סכום המענקים ממודד לתחילת שנת הזכאות? (המערכת אינה ממדדת - בלי הצהרה לא יחושב)<select data-kib="grantIndexed"><option value=""${k.grantIndexed === '' ? ' selected' : ''}>לא נבחר</option><option value="yes"${k.grantIndexed === 'yes' ? ' selected' : ''}>כן - הסכום ממודד (מתוך אישורי המעסיק/הקופה)</option><option value="no"${k.grantIndexed === 'no' ? ' selected' : ''}>לא - סכום נומינלי; המידוד ייעשה מול מקור רשמי</option></select></label>
            <label>שנת קבלת המענקים (לתיעוד בלבד מול פקיד השומה)${numSel('data-kib="grantYear"', 1980, 2026, 1, k.grantYear, 'בחרו...')}</label>
            <label>היוון קצבה פטור שבוצע בעבר (₪, לפי מסמך המשלם)<input type="number" min="0" step="1000" data-kib="hivunPast" value="${esc(k.hivunPast)}"></label>
            <label>היוון קצבה מתוכנן להדמיה (₪ - בחירה עתידית בטופס הרשמי, לא מומלץ כאן)<input type="number" min="0" step="1000" data-kib="hivunPlan" value="${esc(k.hivunPlan)}"></label>
            <label>בסיס חישוב כשגיל הזכאות אינו ב-2026<select data-kib="sim2026"><option value=""${k.sim2026 === '' ? ' selected' : ''}>ללא - חשבו רק בקבועי שנת הזכאות (חסמו אחרת)</option><option value="yes"${k.sim2026 === 'yes' ? ' selected' : ''}>הדמיית 2026 מפורשת - קבועי 2026 בלבד, לא תקף לשנת אחרת</option></select></label>
        </div>
        <div id="kib-result">${kibuaResultHtml()}</div>
        <div class="muted small"><b>דף עבודה של הסוכן לתכנון בלבד.</b> אין כאן בחירת אלטרנטיבות מס ואין הגשה - הבחירות מתבצעות בטופס 161ד הרשמי מול רשות המסים. החישוב משקף את נוסחת הקיזוז הרשמית (מדריך 161ד 2026, עמ' 4-8) בקירוב: מענקים פטורים מוכפלים ב-1.35 ומופחתים מסל הפטור, ויתרת הסל מחולקת ב-180 לתקרה החודשית. המידוד בפועל, חריגות התקופות והשיעור הסופי נקבעים אצל פקיד השומה בלבד.</div>
    </div>`;
}
// ===== חלוקת הכספים ותכנון המס (תכנון פרישה בלבד) =====
// סעיף עבודה לבחירת חלוקת הכספים בפרישה. אין בו חלוקה "אופטימלית" אוטומטית ואין ביצוע פעולות.
// מספרים מוצגים רק מתוך נוסחאות שאומתו (קיבוע זכויות 161ד 2026, מודל הנטו 2026) ורק על נתוני הלקוח שנטענו בפועל;
// חלופות שהמיסוי שלהן טרם אומת מסומנות ואינן מקבלות מספרים. הוקם 9.11.2026; יעודכן עם השלמת אימות בסיס המס.
function badgeAlloc() {
    return 'מטרה: חיסכון מס כולל מרבי';
}
// עקביות מספרית בטופס 161 - בדיקות על בסיס זהה בלבד (לא פרשנות מס): סכום שורות המענקים מול הסכום הכולל המודפס,
// וחייב-במס שאינו עולה על הכולל. בכוונה אין השוואה בין תקרות (פטור מרבי / מרבי רצפים, על בסיס ממודד) לבין סכומים בפועל -
// אין לנו טקסט רשמי מאומת לסמנטיקת השדות המודפסים, ולכן אין שער אריתמטי בין בסיסים שונים.
function moneyConsistency161(f) {
    const flags = [];
    const num = (s) => { const n = parseFloat(String(s || '').replace(/[^\d.]/g, '')); return isFinite(n) ? n : null; };
    const total = num(f.totalGrant), taxable = num(f.taxableGrant);
    if (f.grants && f.grants.length && total !== null) {
        const sum = f.grants.reduce((s, g) => s + (num(g.amount) || 0), 0);
        if (sum > 0 && Math.abs(sum - total) > Math.max(2, total * 0.001))
            flags.push('סכום שורות המענקים (' + Math.round(sum).toLocaleString('he-IL') + ' ₪) אינו תואם את הסכום הכולל המודפס (' + Math.round(total).toLocaleString('he-IL') + ' ₪) - כנראה שגיאת חילוץ או הקלדה; יש לאמת מול הטופס החתום');
    }
    if (taxable !== null && total !== null && taxable - total > 1)
        flags.push('המענק החייב במס המודפס (' + Math.round(taxable).toLocaleString('he-IL') + ' ₪) גבוה מסכום המענק הכולל - יש לאמת מול הטופס החתום');
    return flags;
}
function allocBuckets() {
    const rows = [];
    const f = state.f161;
    const hasF161 = !!(state.f161Confirmed && (f.retireDate || f.totalGrant || (f.grants && f.grants.length)));
    if (hasF161) {
        const ins = insights161(f);
        let detail = 'הערכים המודפסים הם בעלי בסיסים שונים: הפטור המרבי ומרבי הרצפים הם תקרות (לא סכומים בפועל), ואילו החייב במס ושורות המענקים הם סכומים בפועל - אין לחבר אותם זה לזה, אין לראות בהם רכיבים של הסכום הכולל, ואין להשוות תקרה מול סכום בפועל. פטור מרבי מודפס (9א(7), תקרה): ' + (esc(f.maxExempt) || '—') + ' ₪ · חייב במס כמודפס (סכום בפועל): ' + (esc(f.taxableGrant) || '—') + ' ₪ · זכאי רצף קצבה (קוד 5/6): ' + Math.round(ins.ktsevaEligible).toLocaleString('he-IL') + ' ₪' + (ins.directEmployer > 0 ? ' · מענק מעסיק ישיר (קוד 1): ' + Math.round(ins.directEmployer).toLocaleString('he-IL') + ' ₪ - אינו זכאי לרצף קצבה אך נכלל בסה"כ המענק' : '');
        const mflags = moneyConsistency161(f);
        if (mflags.length) detail += ' · אי-התאמה מספרית בטופס: ' + mflags.join('; ') + ' - לפני אימות אין להשתמש בנתונים לתכנון.';
        rows.push({ label: 'מענקי פרישה מהמעסיק', src: 'טופס 161 (שלב 2)',
            val: f.totalGrant ? esc(f.totalGrant) + ' ₪ (כמודפס)' : 'לא זוהה סכום כולל',
            detail });
    } else if (state.f161Tried && (f.retireDate || f.totalGrant || (f.grants && f.grants.length))) {
        rows.push({ label: 'מענקי פרישה מהמעסיק', src: 'טופס 161 (שלב 2)', val: 'מושהה - ממתין לאישור', detail: 'השדות שחולצו מטופס 161 טרם אומתו מול הטופס החתום. אשרו אותם בשלב "טופס 161" ורק אז נתוני המענקים יכנסו לחלוקה.' });
    } else {
        rows.push({ label: 'מענקי פרישה מהמעסיק', src: 'טופס 161 (שלב 2)', val: 'חסר', detail: 'העלו את הטופס בשלב "טופס 161" - בלעדיו אין נתוני מענקים ואין מה לחלק ברכיב זה.' });
    }
    if (state.portfolio) {
        const sums = {};
        for (const a of state.portfolio.accounts) {
            if (a.kind === 'risk') continue;
            const b = a.totalBalance || a.tracks.reduce((s, t) => s + t.balance, 0);
            if (b >= 1) sums[a.kind] = (sums[a.kind] || 0) + b;
        }
        const kinds = ['pensia', 'menahalim', 'tagmulim', 'hishtalmut', 'hashkaa', 'other'];
        for (const kind of kinds) {
            if (sums[kind] > 0) rows.push({ label: 'יתרה ב' + (KIND_LABEL[kind] || kind), src: 'קובץ המסלקה (שלב 1)', val: '₪' + Math.round(sums[kind]).toLocaleString('he-IL'), detail: 'צבירה כפי שדווחה בקובץ; פיצול קצבה/פיצויים פנימי לפי המסלולים שדווחו.' });
        }
    } else {
        rows.push({ label: 'יתרות הקופות', src: 'קובץ המסלקה (שלב 1)', val: 'חסר', detail: 'העלו קובץ מסלקה בשלב 1 - בלעדיו אין תמונת צבירה.' });
    }
    return rows;
}
// תרחישי חלוקה מדורגים לפי מס קצבה מצטבר (הרכיב המאומת בלבד) על תקופת השוואה שהמשתמש בחר - מטרת העבודה שהוגדרה על ידי הלקוח (שרון, 9.11.2026): חבות מס נמוכה ככל האפשר; המדד המדורג אינו "כל המס".
// דירוג מספרי רק על הרכיב שמודל המס המאומת של 2026 מכסה: הפטור ההוני מול הפטור על הקצבה (נוסחת הקיבוע 161ד 2026
// + מדרגות/מס יסף/נקודת זיכוי 2026). תקופת השוואה אחת ומפורשת: 180 חודשי הקצבה הראשונים (מחלק הסל בנוסחה הרשמית) -
// אינה כל שנות הפרישה. המס על המענק החייב (פריסה/רצף פיצויים/משיכה), היוון וביטוח לאומי טרם אומתו ואינם חלק מהדירוג;
// מס השנה הראשונה מוצג בנפרד מהמצטבר. שוויון בדירוג מוצג כשוויון - אין דירוג מלאכותי של תרחישים זהים במס.
function allocScenariosHtml() {
    const k = state.kibua, ni = state.netin, f = state.f161;
    const num = (v) => { const n = parseFloat(v); return isFinite(n) ? n : 0; };
    const pension = state.mekLast && state.mekLast.pension ? state.mekLast.pension : null;
    const hasCase = !!(state.f161Confirmed && (f.retireDate || f.totalGrant || (f.grants && f.grants.length))) || !!state.portfolio;
    const caseLabel = hasCase ? 'החישוב על נתוני התיק שהוזנו.' : 'דוגמה חישובית כללית על ערכים שהוזנו ידנית - לא מבוססת על תיק לקוח טעון.';
    if (state.f161Confirmed && (f.totalGrant || (f.grants && f.grants.length))) {
        const mflags = moneyConsistency161(f);
        if (mflags.length) return '<div class="note small">דירוג התרחישים על נתוני התיק נעצר: נמצאה אי-התאמה מספרית בטופס 161 - ' + mflags.join('; ') + '. לא יוצג דירוג על נתוני תיק עד לאימות מול הטופס החתום; ניתן לתקן את השדות בשלב "טופס 161" או להעלות את הטופס מחדש.</div>';
    }
    const c = kibuaCalc(k);
    const missing = [];
    if (!pension) missing.push('אומדן קצבה מהמקדם (שלב "הקצבה הצפויה")');
    if (c.missing) missing.push(...c.missing.map(m => m + ' (שלב "נתוני הקיבוע")'));
    if (!ni.eligMain) missing.push('סימון זכאות לקצבה מזכה בפאנל הנטו (בכרטיס המקדם) - בלי סיווג זכאות אין פטור על הקצבה וכל התרחישים שווים במס');
    if (!k.empHistory) missing.push('הצהרת היסטוריית מעסיקים (שלב "נתוני הקיבוע") - כדי לדעת אם סכום המענקים שהוזן מלא');
    const HORIZON = Math.min(600, Math.max(0, parseInt(state.alloc.horizon, 10) || 0));
    if (!HORIZON) missing.push('תקופת ההשוואה לדירוג בחודשים (בחירה בשלב זה) - אין ברירת מחדל: זו בחירת תכנון שלכם ואינה קשורה למחלק הסל החוקי (180) בנוסחת הקיבוע');
    if (missing.length) return '<div class="muted small">' + caseLabel + ' דירוג התרחישים יוצג לאחר השלמת: ' + missing.join(' · ') + '. אין דירוג מספרי על נתונים חסרים.</div>';
    if (c.blocked === 'year') return '<div class="note small">הדירוג נעצר: שנת הזכאות שהוזנה בשלב "נתוני הקיבוע" היא ' + c.eligYear + ' וקבועי 2026 אינם תקפים לה. ניתן לבחור "הדמיית 2026" בשלב "נתוני הקיבוע", או לחשב בקבועי שנת הזכאות מול מקור רשמי עדכני.</div>';
    if (c.blocked === 'indexed') return '<div class="note small">הדירוג נעצר: הוזנו מענקים בשלב "נתוני הקיבוע" ללא הצהרת מידוד. הנוסחה הרשמית דורשת סכום ממודד לתחילת שנת הזכאות, והמערכת אינה ממדדת.</div>';
    if (c.grant <= 0) return '<div class="muted small">' + caseLabel + ' הוזן סכום מענקים פטורים 0 - אין משיכה הונית פטורה לשקול, ולכן אין פשרת מס לדרג ברכיב זה. תקרת הפטור החודשית המשוערת: ₪' + Math.round(c.monthly).toLocaleString('he-IL') + ' (כולל ההיוון שהוזן, אם הוזן). המענק החייב ואפשרויות הפריסה/רצף - בטבלת האפשרויות למטה (טרם אומתו, אין דירוג מספרי).</div>';
    const noGrant = kibuaCalc({ ...k, grantExempt: '0' });
    // שני קבועים שונים: מחלק הסל החוקי (180) משרת את נוסחת הקיבוע בלבד; תקופת ההשוואה לדירוג נבחרת על ידי המשתמש.
    const BASKET_DIVISOR = 180, FACTOR = 1.35, MAZKE = 9430; // MAZKE ומחלק הסל זהים לקבועים ב-kibuaCalc וב-analysis.js (לוח הניכויים ומדריך 161ד 2026)
    const capFull = noGrant.monthly, capNow = c.monthly;
    const pts = ni.pointsMain === '' ? 2.25 : num(ni.pointsMain);
    const oth = num(ni.otherMain);
    const taxAt = (cap) => pensionNetMonthly2026({ gross: pension, eligible: true, certExemptRatePct: cap / MAZKE * 100, creditPoints: pts, otherIncome: oth }).pensionTax;
    const scenarios = [{
        key: 'A', name: 'ללא משיכה הונית - הכסף נשאר לקצבה', cash: 0, cap: capFull,
        explain: 'לא מושכים את המענק הפטור. סל הפטור נשמר במלואו והפטור החודשי על הקצבה נשאר הגבוה ביותר. הכסף נשאר בקופה ומגדיל את הקצבה העתידית (הגידול עצמו אינו ממודל כאן). נזילות: הנמוכה ביותר - אין כסף פנוי עכשיו.'
    }];
    const slackGrant = Math.min(c.grant, Math.max(0, capFull - Math.min(pension, capFull)) * BASKET_DIVISOR / FACTOR);
    if (slackGrant > 100 && c.grant - slackGrant > 100) {
        scenarios.push({
            key: 'C', name: 'משיכה הונית פטורה חלקית - רק מה שהקצבה אינה מנצלת', cash: slackGrant, cap: capFull - slackGrant * FACTOR / BASKET_DIVISOR,
            explain: 'הקצבה הצפויה נמוכה מהפטור החודשי המלא, ולכן חלק מסל הפטור לא היה מתממש בכלל. מושכים רק את החלק העודף הזה, כך שהפטור שנותר עדיין מכסה את כל הקצבה והמס עליה אינו עולה במודל. נזילות: בינונית - כסף פנוי עכשיו בלי עלות מס.'
        });
    }
    scenarios.push({
        key: 'B', name: 'משיכת המענק הפטור במלואו עכשיו', cash: c.grant, cap: capNow,
        explain: 'מושכים את כל המענקים הפטורים שהוזנו: הכסף מתקבל עכשיו בלי מס, אבל כל שקל פטור שנמשך מקטין את סל הפטור (×1.35, ממודד) ומוריד את הפטור החודשי על הקצבה לכל השנים. נזילות: הגבוהה ביותר.'
    });
    for (const s of scenarios) { s.taxMonthly = taxAt(s.cap); s.taxTotal = s.taxMonthly * HORIZON; }
    const sorted = [...scenarios].sort((a, b) => a.taxTotal - b.taxTotal);
    let rank = 0, prevTot = null;
    for (const s of sorted) { if (prevTot === null || Math.abs(s.taxTotal - prevTot) > 1) rank++; s.rank = rank; prevTot = s.taxTotal; }
    const top = sorted[0], last = sorted[sorted.length - 1];
    const gap = last.taxTotal - top.taxTotal;
    const tiedTop = sorted.filter(s => s.rank === 1);
    const rows = sorted.map(s => '<tr><td><b>' + s.rank + (tiedTop.length > 1 && s.rank === 1 ? ' (שווה)' : '') + '</b></td><td class="small"><b>' + s.name + '</b></td><td>₪' + fmt(s.cash) + '</td><td>₪' + fmt(s.cap) + '</td><td>₪' + fmt(s.taxMonthly) + '</td><td><b>₪' + fmt(s.taxTotal) + '</b></td></tr>').join('');
    const legend = sorted.map(s => '<li><b>דירוג ' + s.rank + ' - ' + s.name + ':</b> ' + s.explain + '</li>').join('');
    const gapLine = gap <= 1
        ? 'כל התרחישים שווים בחבות המס על תקופת ההשוואה: הקצבה הצפויה נמוכה מהפטור גם לאחר משיכה מלאה, ולכן המשיכה אינה מייקרת את הקצבה במודל. ההבדל בין התרחישים הוא נזילות וגובה הקצבה העתידית בלבד.'
        : 'הפער המצטבר בין דירוג 1 לדירוג ' + last.rank + ': ₪' + fmt(gap) + ' על פני התקופה (כ-₪' + fmt(gap / HORIZON) + ' לחודש).';
    const tieLine = tiedTop.length > 1 ? ' תרחישים בדירוג 1 שווים במס; ההבדל ביניהם הוא נזילות עכשיו מול גובה הקצבה - לא מס.' : '';
    return '<div class="muted small">' + caseLabel + ' ההנחות מוצגות ולא מושתקות: קבועי מס 2026 בלבד (מדרגות, מס יסף, נקודת זיכוי), אומדן קצבה ₪' + fmt(pension) + ' מהמקדם (אומדן - לא ציטוט), ' + pts + ' נקודות זיכוי' + (oth > 0 ? ', הכנסה נוספת חודשית ₪' + fmt(oth) : '') + ' מהפאנל, סיווג זכאות מסומן. תקופת ההשוואה: ' + HORIZON + ' חודשי קצבה, כפי שבחרתם למעלה (בחירת תכנון - אינה מחלק הסל החוקי ואינה כל שנות הפרישה); <b>זו אינה כל תקופת הפרישה</b> - אין כאן תשואה, מדד, אריכות חיים או שינויי דין, והעלאות הפטור העתידיות (2027/2028) אינן מולחות כהנחה. המס החודשי קבוע במודל, ולכן שינוי התקופה משנה את המצטבר אך לא את סדר הדירוג.</div>' +
        '<div class="alts-scroll"><table class="altstbl"><thead><tr><th>דירוג</th><th>תרחיש</th><th>נזילות מיידית (פטורה)</th><th>פטור חודשי על הקצבה</th><th>מס קצבה חודשי</th><th>מס קצבה מצטבר על ' + HORIZON + ' חודשים</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
        '<ul class="notes">' + legend + '</ul>' +
        '<div class="note small"><b>קריאת הדירוג:</b> המס בשנה הראשונה על הרכיב הפטור הוא 0 ₪ בכל התרחישים (המשיכות פטורות ממס) - ההבדל נוצר במס הקצבה לאורך זמן, ולכן הדירוג הוא לפי המצטבר על תקופת ההשוואה ולא לפי השנה הקרובה. ' + gapLine + tieLine + '</div>' +
        '<div class="note small"><b>גבולות הדירוג:</b> הדירוג מכסה רק את הפשרה בין הפטור ההוני לפטור הקצבה. המצטבר המדורג כולל: מס הכנסה על הקצבה בלבד (שולי, קבועי 2026). אינו כולל: מס על משיכות הוניות (ברכיב הפטור - 0 ₪), מס על המענק החייב (פריסה על פני שנים / רצף פיצויים / משיכה), היוון, קרן השתלמות, ביטוח לאומי ומס בריאות, שינויי דין, תשואה, מדד ואריכות חיים, ואין בו חשבון לתשואה אפשרית על הכסף הנמשך או להפסד הון פנסיוני. רכיבים אלה טרם אומתו ואינם חלק מהדירוג - ראו טבלת האפשרויות. שנות פריסה אינן כל שנות הפרישה. לכן דירוג 1 אינו קביעה שזו חבות המס הנמוכה ביותר האפשרית בכל המסלולים, אלא השוואה מספרית ברכיב המאומת בלבד. ההשוואה מחזיקה את אומדן הקצבה קבוע: כסף שלא נמשך נשאר בקופה ועשוי להגדיל את הקצבה (ואת המס עליה) - הגידול אינו ממודל.' + (k.empHistory === 'additional' ? ' לפי ההצהרה היו מעסיקים נוספים: יש לוודא ששדה המענקים כולל את כל המענקים הפטורים מכל המעסיקים ב-32 השנים - אחרת הדירוג חלקי.' : '') + ' המידוד בפועל, חריגות התקופות והשיעור הסופי נקבעים אצל פקיד השומה בלבד. אין כאן המלצה או ביצוע - הבחירה מתבצעת בטפסים הרשמיים מול רשות המסים והגופים המנהלים.</div>';
}
// רשימת הקלטים החסרים לתשובה מלאה - נגזרת מהתיק שנטען בפועל, בלי לבקש שוב מה שכבר קיים ובלי השלמה בהשערה.
function allocMissingHtml() {
    const k = state.kibua, ni = state.netin;
    const f = state.f161;
    const hasF161 = !!(state.f161Confirmed && (f.retireDate || f.totalGrant || (f.grants && f.grants.length)));
    const f161Pending = !hasF161 && state.f161Tried && !!(f.retireDate || f.totalGrant || (f.grants && f.grants.length));
    const missing = [];
    if (f161Pending) missing.push('אישור השדות שחולצו מטופס 161 מול הטופס החתום (חלק 2) - בלעדיו נתוני המענקים מושהים');
    else if (!hasF161) missing.push('טופס 161 מהמעסיק (העלאה בשלב "טופס 161") - מקור סכומי המענקים והרצפים');
    if (!state.portfolio) missing.push('קובץ מסלקה (שלב 1) - תמונת הצבירה והיתרות');
    if (!k.eligDate) missing.push('חודש הגעה לגיל זכאות (שלב "נתוני הקיבוע")');
    if (k.grantExempt === '' || k.hivunPast === '' || k.hivunPlan === '') missing.push('מענקים פטורים והיוון עבר/מתוכנן עם הצהרת מידוד (שלב "נתוני הקיבוע")');
    if (!k.empHistory) missing.push('הצהרת היסטוריית מעסיקים ב-32 השנים שלפני גיל הזכאות (שלב "נתוני הקיבוע")');
    if (k.empHistory === 'additional') missing.push('סכומי מענקים פטורים ממעסיקים קודמים (טפסי 161 קודמים) - לכלול בשדה המענקים בשלב "נתוני הקיבוע"');
    if (!state.mekLast || !state.mekLast.pension) missing.push('אומדן קצבה מהמקדם (שלב "הקצבה הצפויה") - לבדיקת הפטור מול הקצבה הצפויה');
    if (ni.otherMain === '' ) missing.push('הכנסות נוספות צפויות בפרישה (פאנל הנטו)');
    missing.push('ציטוט קצבה רשמי מהגוף המנהל (אינו תנאי, אך נדרש לפני החלטה סופית)');
    missing.push('בדיקת מקרי קצה: נכות, פעולות ביטחוניות, מענקים אחרי גיל זכאות ומקרים מלפני 2012 - אינם מכוסים בנוסחה ודורשים בדיקה נפרדת');
    return '<ul class="notes">' + missing.map(m => '<li>' + m + '</li>').join('') + '</ul>';
}
function renderAlloc() {
    const rows = allocBuckets();
    const bucketRows = rows.map(r => '<tr><td>' + r.label + '<div class="muted small">' + r.src + '</div></td><td><b>' + r.val + '</b></td><td class="small">' + r.detail + '</td></tr>').join('');
    const routes = [
        { name: 'משיכת מענק פטור (עד התקרה)', now: '0 מס כרגע - התקרה 2026: 13,750 ₪ לשנת עבודה (קפואה 2025-2027); הסכום בפועל כמודפס בטופס 161', later: 'כל שקל פטור שנמשך מקטין את סל הקיבוע ב-1.35 ₪ (ממודד) - כלומר מוריד את הפטור החודשי על הקצבה; ההדמיה המספרית למטה', st: 'מאומת (161ד 2026 + לוח ניכויים)' },
        { name: 'רצף פיצויים', now: 'אפשרות המודפסת בטופס 161; דוחה את אירוע המס ואינו פוגע בסל הקיבוע', later: 'המס ישולם במשיכה העתידית לפי הדין שיחול אז - לא ניתן לחיזוי וטרם אומת; אין מספרים כאן', st: 'חלקי - פירוט המיסוי טרם אומת' },
        { name: 'רצף קצבה', now: 'אפשרות המודפסת בטופס 161 (עד התקרה המודפסת בטופס); מכניקת הביצוע של הרצף והשלכותיה המלאות טרם אומתו מול מקור רשמי', later: 'מודל מס הקצבה 2026 עצמו מאומת וניתן להדגים בפאנל הנטו; הטיפול המדויק ברצף עצמו טרם אומת - אין להסיק מספרים מעבר למודל הקצבה הכללי', st: 'חלקי - מאומת מודל מס קצבה 2026 בלבד' },
        { name: 'פריסת המענק החייב', now: 'פיזור החייב על שנות פריסה (הערכת השנים מוצגת בניתוח 161 בסעיף "פרישה")', later: 'מקור כלל הפריסה בעתק מראה בלבד וטרם אומת מול טקסט רשמי - אין חישוב כאן', st: 'טרם אומת - מסומן' },
        { name: 'היוון קצבה', now: 'משיכה חד-פעמית מתוך הצבירה; תנאי ותקרות ההיוון טרם אומתו', later: 'היוון פטור פוגע בסל הקיבוע ומקטין את הקצבה - ההשפעה על הסל מודגמת בשלב "נתוני הקיבוע"', st: 'חלקי - תקרות טרם אומתו' },
        { name: 'קרן השתלמות נזילה', now: 'רכיב נזיל שאינו חלק מסל הקיבוע', later: 'כללי המס על המשיכה (לרבות פטור רווחי הון אחרי ותק) טרם אומתו מול מקור רשמי - יושלם בעדכון', st: 'טרם אומת - מסומן' },
    ];
    const routeRows = routes.map(r => '<tr><td><b>' + r.name + '</b></td><td class="small">' + r.now + '</td><td class="small">' + r.later + '</td><td class="small">' + r.st + '</td></tr>').join('');
    return '<div class="card intake">' +
        '<div class="track-line"><span><b>חלוקת הכספים ותכנון המס בפרישה</b></span><span class="small muted">דף עבודה לתכנון - לא המלצה ולא ביצוע</span></div>' +
        '<div class="muted small">הסעיף מרכז את הכספים שעומדים לחלוקה בפרישה ואת אפשרויות הפעולה בכל רכיב, עם ההשלכה במס לכל אפשרות - כדי שהחלוקה תיבחר ביודעין. <b>אין כאן חלוקה "אופטימלית" אוטומטית:</b> התשובה תלויה במטרת הלקוח, בנתונים שעוד לא הוזנו ובכללי מס שחלקם טרם אומתו (מסומנים בבירור, בלי מספרים). אין כאן ביצוע פעולות - כל בחירה מתבצעת בטפסים הרשמיים מול רשות המסים והגופים המנהלים. מטרת העבודה שהוגדרה: חבות מס נמוכה ככל האפשר במסגרת הכללים, תוך הצגת המחיר בנזילות ובקצבה של כל חלופה. הסעיף הוקם ב-9.11.2026 ויעודכן ככל שיושלם אימות בסיס המס (פיצויים וקיבוע, גיל פרישה והמרה לקצבה, ביטוח לאומי, מיסוי משיכות מוקדמות).</div>' +
        '<div class="subhead">דירוג התרחישים - השוואת מס קצבה בלבד על תקופת ההשוואה שנבחרה למטה (לא "כל המס" ולא כל שנות הפרישה)</div>' +
        '<div class="muted small">מטרת העבודה שהוגדרה על ידי הלקוח (9.11.2026): חבות מס כוללת נמוכה ככל האפשר. לכן אין כאן בחירה בין "מינימום מס בשנה הקרובה" לבין "תוצאה לאורך הפרישה": אלה אינן מטרות חלופיות אלא חלונות ספירה שונים, ומס נמוך בשנה הקרובה עלול לעלות ביותר מס בסך הכל (דחיית מס אינה חיסכון; משיכה פטורה עכשיו עלולה לייקר את הקצבה לשנים). במקום בחירת מטרה, הסעיף מציג עד שלושה תרחישי חלוקה מדורגים לפי מס הקצבה המצטבר על תקופת השוואה הנבחרת למטה - תרחיש 1 הוא החוסך ביותר ברכיב שאומת מספרית, עם ההסבר והמחיר בנזילות ובקצבה של כל תרחיש. המדד המדורג אינו "כל המס" - מה שכלול ומה שלא כלול מפורט בתחתית הטבלה.</div>' +
        '<div class="netgrid"><label>תקופת ההשוואה לדירוג (חודשי קצבה) - בחירת תכנון שלכם, בלי ברירת מחדל; אינה קשורה למחלק הסל החוקי (180) בנוסחת הקיבוע ואינה כל שנות הפרישה<input type="number" min="12" max="600" step="12" data-alloc-horizon value="' + esc(state.alloc.horizon) + '" placeholder="למשל 240"></label></div>' +
        '<div id="alloc-scenarios">' + allocScenariosHtml() + '</div>' +
        '<div class="subhead">סיכום מקורות ונתונים (מתוך הנתונים שנטענו בפועל - לא סכום זמין להקצאה)</div>' +
        '<div class="alts-scroll"><table class="altstbl"><thead><tr><th>רכיב</th><th>סכום</th><th>פירוט</th></tr></thead><tbody>' + bucketRows + '</tbody></table></div>' +
        '<div class="note small">הטבלה מציגה מקורות מידע, לא סכום "זמין להקצאה". אין לחבר מענקי 161 עם יתרות הקופות: אם המענקים הועברו לקופה הם כבר כלולים ביתרות, וחיבור השניים הוא ספירה כפולה. הכספים הזמינים לחלוקה בפועל נקבעים רק מול הטופס החתום והמסלקה העדכנית; באי-התאמה בין השדות (אם סומנה) אין להשתמש בנתונים לתכנון עד לאימות.</div>' +
        '<div class="subhead">האפשרויות לכל רכיב והשלכות המס</div>' +
        '<div class="alts-scroll"><table class="altstbl"><thead><tr><th>אפשרות</th><th>מס בזמן הקרוב</th><th>השלכה לאורך הפרישה</th><th>מצב אימות</th></tr></thead><tbody>' + routeRows + '</tbody></table></div>' +
        '<div class="subhead">מה חסר לתשובה מלאה (לפי התיק שנטען)</div>' +
        '<div id="alloc-missing">' + allocMissingHtml() + '</div>' +
        '<div class="muted small">מקורות מאומתים: <a href="https://www.gov.il/BlobFolder/guide/2026-filling-out-form-161d/he/Guides_IncomeTax_filling-out-form-161d-2026.pdf" target="_blank" rel="noopener">מדריך קיבוע זכויות 161ד 2026, רשות המסים (gov.il)</a> · <a href="https://www.gov.il/BlobFolder/generalpage/income-tax-monthly-deductions-booklet/he/generalInformation_income-tax-monthly-deductions-booklet_monthly-deductions-booklet-2026.pdf" target="_blank" rel="noopener">לוח עזר לחישוב ניכוי מהשכר 2026, רשות המסים (gov.il)</a> · <a href="https://www.btl.gov.il/Laws1/00_0040_000000.pdf" target="_blank" rel="noopener">חוק פיצויי פיטורים תשכ"ג-1963, נוסח משולב (אתר ביטוח לאומי)</a>. העלאות הפטור הצפויות במדריך (2027: 62.5%, 2028 ואילך: 67%) מוצגות בו כצפויות ולא אומתו בכתבי קליטה - אין לבסס עליהן תכנון קשיח. נוסחת הקיזוז אינה חלה על כל המקרים: ניכיון בגין נכות, פעולות ביטחוניות, מענקים אחרי גיל זכאות ומקרי קצה מלפני 2012 דורשים בדיקה נפרדת ואינם מיושמים כאן.</div>' +
    '</div>';
}
function setRg(key, val) {
    const m = key.match(/^g([0-2])(desc|amount|date|importance|flex|alloc)$/);
    if (m) state.riskgoals.goals[+m[1]][m[2]] = val; else state.riskgoals[key] = val;
}
function badgeRg() {
    const r = state.riskgoals;
    const filled = [r.balance, r.equity, r.willing].filter(v => v && String(v).trim()).length;
    const g = r.goals.filter(g => g.amount || g.date).length;
    return (filled + g) ? 'חלק מהקלט הוזן' : 'טרם הוזן קלט';
}
function rgFlags() {
    const r = state.riskgoals;
    const num = (v) => { const n = parseFloat(v); return isFinite(n) ? n : null; };
    const B = num(r.balance), E = num(r.equity);
    const flags = [];
    const now = new Date();
    const miss = (t) => flags.push({ lv: 'miss', t });
    if (E !== null && !(r.equitySrc && r.equitySrc.trim())) flags.push({ lv: 'warn', t: 'חשיפת המניות הוזנה ללא מקור ותאריך דיווח - מתייחסים אליה כנתון לא מאומת; המערכת אינה מתקנת אותה אוטומטית.' });
    if (!r.willing) miss('נכונות לסיכון לא הוזנה - מסומן כחסר, לא כאפס.');
    if (!r.behavior) miss('התנהגות בירידות בעבר לא הוזנה - מסומן כחסר.');
    let anyGoal = false;
    const L0 = num(r.liq);
    const avail = B === null ? null : Math.max(0, B - (L0 || 0));
    let totalGoals = 0, assignedSum = 0;
    r.goals.forEach((g, i) => {
        const label = g.desc && g.desc.trim() ? g.desc.trim() : ('מטרה ' + (i + 1));
        const A = num(g.amount);
        if (A === null && !g.date) return;
        anyGoal = true;
        if (A === null) miss(label + ': סכום יעד חסר - מסומן כחסר, לא כאפס.');
        if (!g.date) { miss(label + ': מועד שימוש חסר - לא ניתן לבחון התאמת אופק למטרה זו.'); return; }
        const d = new Date(g.date + '-01');
        if (isNaN(d)) return;
        const months = (d.getFullYear() - now.getFullYear()) * 12 + (d.getMonth() - now.getMonth());
        if (months <= 36) flags.push({ lv: 'warn', t: label + ': מועד שימוש קרוב יחסית (סף עבודה פנימי של 3 שנים, לא כלל מס) - כדאי לבחון סיכון מימון וסיכון רצף תשואות עבור החלק המיועד למטרה זו בלבד, לא עבור כל התיק.' });
        else if (months > 120) flags.push({ lv: 'info', t: label + ': אופק ארוך - מעלה שאלה לבחינה האם רמת הסיכון בפועל תואמת את הנכונות ואת המטרה. אופק ארוך כשלעצמו אינו קובע שהחשיפה נמוכה מדי או גבוהה מדי.' });
        if (A !== null) totalGoals += A;
        const Al = num(g.alloc);
        if (Al !== null) assignedSum += Al;
        if (A !== null && Al !== null) {
            if (Al >= A) flags.push({ lv: 'info', t: label + ': מול ההקצאה המפורשת שהוזנה (₪' + Math.round(Al).toLocaleString('he-IL') + ') היעד מכוסה - כדאי לבחון אם נדרשת רמת סיכון נמוכה יותר למטרה זו.' });
            else flags.push({ lv: 'info', t: label + ': מול ההקצאה המפורשת שהוזנה (₪' + Math.round(Al).toLocaleString('he-IL') + ') פער מימון משוער של כ-₪' + Math.round(A - Al).toLocaleString('he-IL') + ' - חלופות לבחינה: הגדלת ההקצאה או חיסכון נוסף, דחיית מועד, הורדת יעד. פער מימון כשלעצמו אינו הצדקה אוטומטית להגדלת סיכון.' });
            if (g.importance === 'critical' && g.flex === 'rigid' && Al < A) flags.push({ lv: 'warn', t: label + ': מטרה קריטית וקשיחה עם פער מימון מול ההקצאה - כדאי לבחון בקפדנות את מקור המימון ואת רמת הסיכון של החלק הזה.' });
        } else if (A !== null) {
            miss(label + ': לא הוקצה הון למטרה זו - בדיקת המימון תוצג רק לאחר הזנת הקצאה מפורשת (לא מניחים סדר הזנה או עדיפות).');
        }
    });
    if (!anyGoal) miss('לא הוזנה אף מטרה עם סכום או מועד - מסומן כחסר.');
    if (B !== null && totalGoals > 0) {
        const combined = avail - totalGoals;
        flags.push({ lv: 'info', t: 'הערכה מאוחדת בלבד (אינה מקצה כסף למטרה מסוימת): סך המטרות שהוזנו ₪' + Math.round(totalGoals).toLocaleString('he-IL') + ' מול יתרה זמינה משוערת של כ-₪' + Math.round(avail).toLocaleString('he-IL') + ' לאחר ניכוי משיכות מתוכננות - ' + (combined >= 0 ? 'עודף מאוחד' : 'פער מאוחד') + ' של כ-₪' + Math.round(Math.abs(combined)).toLocaleString('he-IL') + '. הבסיס: יתרה מדווחת לפני תשואה ומס.' });
    }
    if (assignedSum > 0 && avail !== null) {
        if (assignedSum > avail + 0.5) flags.push({ lv: 'warn', t: 'סך ההקצאות שהוזנו (₪' + Math.round(assignedSum).toLocaleString('he-IL') + ') עולה על היתרה הזמינה לאחר משיכות מתוכננות (₪' + Math.round(avail).toLocaleString('he-IL') + ') בכ-₪' + Math.round(assignedSum - avail).toLocaleString('he-IL') + ' - כדאי לבחון את ההקצאות.' });
        else if (avail - assignedSum > 0.5) flags.push({ lv: 'info', t: 'לאחר ההקצאות שהוזנו נותרו כ-₪' + Math.round(avail - assignedSum).toLocaleString('he-IL') + ' שלא הוקצו לאף מטרה - כדאי לבחון את ייעודם.' });
    }
    const L = num(r.liq);
    if (L !== null && L > 0) flags.push({ lv: 'warn', t: 'משיכות/צורכי נזילות מתוכננים בסך כ-₪' + Math.round(L).toLocaleString('he-IL') + (r.liqDate ? ' (מועד: ' + r.liqDate + ')' : ' - מועד חסר') + ' - כדאי לבחון מקור מימון נזיל עבור חלק זה בלבד.' });
    if (r.willing === 'low' && E !== null && E > 50) flags.push({ lv: 'info', t: 'נכונות לסיכון נמוכה לצד חשיפת מניות מדווחת גבוהה יחסית - כדאי לבחון את הפער בין הנכונות לבין החשיפה בפועל.' });
    if (r.willing === 'high' && E !== null && E < 30) flags.push({ lv: 'info', t: 'נכונות לסיכון גבוהה לצד חשיפת מניות מדווחת נמוכה יחסית - כדאי לבחון את הפער בין הנכונות לבין החשיפה בפועל.' });
    if (r.behavior === 'sold' && E !== null && E > 50) flags.push({ lv: 'warn', t: 'בעבר בוצע מכירה בירידות, וכיום החשיפה המדווחת גבוהה יחסית - כדאי לבחון האם החשיפה בפועל ברת-קיימא בירידות.' });
    return flags;
}
function rgFlagsHtml() {
    const f = rgFlags();
    if (!f.length) return '<div class="muted small">הזינו קלט כדי להפיק שאלות לבחינה.</div>';
    const pre = { warn: 'לבחינה: ', info: 'שאלה: ', miss: 'חסר: ' };
    return '<ul class="notes rgflags">' + f.map(x => '<li class="rg-' + x.lv + '"><b>' + pre[x.lv] + '</b>' + x.t + '</li>').join('') + '</ul>';
}
function updateRgFlags() { const el = document.getElementById('rg-flags'); if (el) el.innerHTML = rgFlagsHtml(); }
function rgSel(name, val, opts) {
    return '<select data-rg="' + name + '">' + opts.map(o => '<option value="' + o[0] + '"' + (val === o[0] ? ' selected' : '') + '>' + o[1] + '</option>').join('') + '</select>';
}
function renderRiskGoals() {
    const r = state.riskgoals;
    const goalBlock = (i) => {
        const g = r.goals[i];
        return '<div class="kibres"><div class="track-line"><span><b>מטרה ' + (i + 1) + '</b></span></div><div class="netgrid">'
            + '<label>תיאור המטרה<input type="text" data-rg="g' + i + 'desc" value="' + esc(g.desc) + '" placeholder="למשל: הוני לילדים"></label>'
            + '<label>סכום יעד (₪)<input type="number" min="0" step="10000" data-rg="g' + i + 'amount" value="' + esc(g.amount) + '"></label>'
            + '<label>מועד שימוש משוער<input type="month" data-rg="g' + i + 'date" value="' + esc(g.date) + '"></label>'
            + '<label>חשיבות' + rgSel('g' + i + 'importance', g.importance, [['', 'לא הוזן'], ['flex', 'גמישה'], ['important', 'חשובה'], ['critical', 'קריטית']]) + '</label>'
            + '<label>גמישות בסכום/מועד' + rgSel('g' + i + 'flex', g.flex, [['', 'לא הוזן'], ['flexible', 'גמיש'], ['partial', 'גמיש חלקית'], ['rigid', 'קשיח']]) + '</label>'
            + '<label>הון מוקצה למטרה זו (₪, הקצאה מפורשת של הסוכן; בלי הקצאה לא תוצג בדיקת מימון למטרה)<input type="number" min="0" step="10000" data-rg="g' + i + 'alloc" value="' + esc(g.alloc) + '"></label>'
            + '</div></div>';
    };
    return '<div class="card intake">'
        + '<div class="track-line"><span><b>בחינת התאמת סיכון למטרות</b></span><span class="small muted">דף עבודה פנימי לסוכן - איכותני בלבד</span></div>'
        + '<div class="muted small">דף עבודה זה מפריד בין <b>נכונות לסיכון</b>, <b>יכולת לסיכון</b> ו<b>מידת מימון המטרות</b>, ומפיק שאלות איכותניות לבחינה ("כדאי לבחון") מתוך הקלט בלבד. אין כאן ציון, אין הקצאת יעד ואין המלצה אוטומטית; שדה ריק מסומן כחסר ולא כאפס. בסיס מושגי: <a href="https://www.kitces.com/blog/separating-risk-tolerance-from-risk-capacity-just-because-you-can-afford-to-take-risk-doesnt-mean-you-should/" target="_blank" rel="noopener">Kitces - הפרדת נכונות מיכולת</a> ו<a href="https://www.morningstar.com/financial-advisors/risk-capacity-is-more-than-just-time-frame" target="_blank" rel="noopener">Morningstar - יכולת סיכון היא יותר מאופק זמן</a>. היוריסטיקת יישום פנימית, לא מודל מספרי מאומת. בשלב זה אין התאמות בגין מקדמים מובטחים או בונוסים - האימות המחקרי עדיין פתוח.</div>'
        + '<div class="subhead">מטרות (עד 3)</div>'
        + goalBlock(0) + goalBlock(1) + goalBlock(2)
        + '<div class="subhead">נכסים, חשיפה בפועל ומקורות</div>'
        + '<div class="netgrid">'
        + '<label>יתרת התיק הכוללת (₪)<input type="number" min="0" step="10000" data-rg="balance" value="' + esc(r.balance) + '"></label>'
        + '<label>חשיפה מדווחת בפועל למניות (%)<input type="number" min="0" max="100" step="1" data-rg="equity" value="' + esc(r.equity) + '"></label>'
        + '<label>מקור ותאריך דיווח החשיפה<input type="text" data-rg="equitySrc" value="' + esc(r.equitySrc) + '" placeholder="למשל: דוח קופה 09/2026"></label>'
        + '<label>הכנסה קבועה צפויה (קצבה/אחר, ₪/חודש)<input type="number" min="0" step="500" data-rg="income" value="' + esc(r.income) + '"></label>'
        + '<label>משאבים נוספים יציבים<input type="text" data-rg="resources" value="' + esc(r.resources) + '" placeholder="למשל: נדלן מניב, קרן השתלמות"></label>'
        + '<label>משיכות/צורכי נזילות מתוכננים (₪)<input type="number" min="0" step="10000" data-rg="liq" value="' + esc(r.liq) + '"></label>'
        + '<label>מועד המשיכות המתוכננות<input type="month" data-rg="liqDate" value="' + esc(r.liqDate) + '"></label>'
        + '</div>'
        + '<div class="subhead">נכונות לסיכון (בנפרד מיכולת)</div>'
        + '<div class="netgrid">'
        + '<label>נכונות לסיכון מוצהרת' + rgSel('willing', r.willing, [['', 'לא הוזן'], ['low', 'נמוכה'], ['mid', 'בינונית'], ['high', 'גבוהה']]) + '</label>'
        + '<label>התנהגות בירידות בעבר' + rgSel('behavior', r.behavior, [['', 'לא הוזן'], ['sold', 'מכר בירידות'], ['held', 'לא שינה'], ['bought', 'קנה בירידות'], ['unknown', 'לא ידוע']]) + '</label>'
        + '</div>'
        + '<div class="subhead">שאלות איכותניות לבחינה (נגזרות מהקלט בלבד; בדיקת מימון למטרה מוצגת רק מול הקצאה מפורשת שהוזנה, וההערכה המאוחדת אינה מקצה כסף למטרה מסוימת)</div>'
        + '<div id="rg-flags">' + rgFlagsHtml() + '</div>'
        + '</div>';
}
// פריטי השלמה שתשובתם מתוך רשימה סגורה - חלון נגלל (12.11 13:58)
const INTAKE_CHOICES = {
    'work-after': ['מוצהר על ידי הלקוח: לא מתכנן להמשיך לעבוד אחרי הפרישה', 'ימשיך לעבוד במשרה מלאה', 'ימשיך לעבוד במשרה חלקית', 'יעבוד כעצמאי', 'עדיין לא החליט'],
};
function intakeSelect(it, st) {
    const list = INTAKE_CHOICES[it.id], v = st.value || '';
    const opts = ['', ...list, ...(v && !list.includes(v) ? [v] : [])];
    return `<select data-intake="${it.id}|value">${opts.map(o => `<option value="${esc(o)}"${o === v ? ' selected' : ''}>${o ? esc(o) : 'בחרו...'}</option>`).join('')}</select>`;
}
// כרטיס השלמה אחד (פריט INTAKE) - משמש את שלבי תכנון הפרישה 3, 4, 5 ו-7
function intakeCard(it) {
    const st = state.intake[it.id] || { value: '', source: '' };
    const done = st.value.trim().length > 0;
    return `<div class="card intake${done ? (st.source.trim() ? ' done' : ' unverified') : ''}">
        <div class="track-line"><span><b>${it.label}</b> · ${it.cat}</span><span class="small muted">${done ? (st.source.trim() ? 'התקבל עם מקור' : 'התקבל בלי מקור - לא מאומת') : 'חסר'}</span></div>
        <div class="muted small">למה צריך: ${it.why}</div>
        <div class="intakegrid">
            ${it.id === 'pension-start' ? renderPensionStart(st) : INTAKE_CHOICES[it.id] ? intakeSelect(it, st) : `<input placeholder="ערך / תשובה" data-intake="${it.id}|value" value="${esc(st.value)}">`}
            <input placeholder="מקור (מסמך, גוף, תאריך)" data-intake="${it.id}|source" value="${esc(st.source)}">
        </div>
        ${it.attestation && !done ? `<button type="button" class="ghostbtn" data-attest="${it.id}">${it.attBtn || 'סמנו: מוצהר שלא היו אירועים קודמים'}</button>` : ''}
        ${it.id === 'income-tax' ? INCOME_TAX_GUIDE : ''}
        ${DOC_UPLOADS[it.id] ? renderDocUpload(it.id) : ''}
        ${it.id === 'family' ? renderFamilyBlock() : ''}
    </div>`;
}
const intakeShown = (it) => !it.when || !state.portfolio || it.when(state.portfolio);
function renderIntakeIds(ids) {
    return ids.map(id => INTAKE.find(it => it.id === id)).filter(it => it && intakeShown(it)).map(intakeCard).join('');
}
// פריטים חסרים (ריקים) מתוך רשימה - לתגית "חסר: ..." בכותרת השלב
function missingIntake(ids) {
    return ids.map(id => INTAKE.find(it => it.id === id)).filter(it => it && intakeShown(it) && !(state.intake[it.id] && state.intake[it.id].value.trim()));
}
// קיפול משני בתוך שלב (נשמר בין רינדורים דרך state.open, כמו האקורדיון)
function fold(id, title, body, badge = '') {
    return acc(id, title, badge, body).replace('class="card acc"', 'class="card acc sub"');
}

// ---------- תכנון פרישה: 7 שלבים (הצעת הפישוט 11.11.2026, אושרה) ----------
// שמות השלבים - להפניות בטקסט במקום מספרי סעיפים קשיחים (M-018)
const RS = {
    maslaka: 'שלב "קובץ המסלקה"', f161: 'שלב "טופס 161"', kibua: 'שלב "נתוני הקיבוע"',
    questions: 'שלב "שאלות לפני החלטה"', pension: 'שלב "הקצבה הצפויה"', rec: 'שלב "ההמלצה"', summary: 'שלב "סיכום ופעולות"',
};
const RS_IDS = {
    kibua: ['pension-start', 'prior-161'],
    questions: ['work-after', 'future-income', 'target-net', 'family', 'risk-outside'],
    pension: ['legacy-terms'],
    summary: ['income-tax', 'legal-continuity'],
};
// שמות קצרים לתגיות "חסר: ..." בכותרות השלבים
const INTAKE_SHORT = {
    'pension-start': 'מועד קצבה', 'prior-161': 'אירועי פרישה קודמים', 'work-after': 'עבודה אחרי פרישה',
    'future-income': 'הכנסות צפויות', 'target-net': 'יעד נטו ונזילות', family: 'משפחה ומוטבים',
    'risk-outside': 'השקעות מחוץ לפנסיה', 'legacy-terms': 'תנאי פוליסה ותיקה', 'income-tax': 'תלוש ו-106',
    'legal-continuity': 'ייפוי כוח',
};
const shortOf = (it) => INTAKE_SHORT[it.id] || it.label.split(/[(,]/)[0].trim();
const missBadge = (ids, extra = []) => {
    const m = [...extra, ...missingIntake(ids).map(shortOf)];
    if (!m.length) return 'הושלם';
    return 'חסר: ' + m.slice(0, 2).join(', ') + (m.length > 2 ? ` ועוד ${m.length - 2}` : '');
};

function renderKibuaStep() {
    return `${renderKibua()}
        <div class="subhead">מועד הקצבה ואירועי פרישה קודמים</div>
        ${renderIntakeIds(RS_IDS.kibua)}`;
}
function badgeKibuaStep() {
    const k = state.kibua, extra = [];
    if (!k.eligDate) extra.push('חודש זכאות');
    if (!k.grantExempt && !(state.f161.grants && state.f161.grants.length)) extra.push('מענקים פטורים');
    return missBadge(RS_IDS.kibua, extra);
}

function renderQuestionsStep() {
    return `<div class="muted small">התשובות כאן קובעות את ההמלצה בשלב 6: האם יש מעסיק חדש בתוך שנה (רצף פיצויים), אילו הכנסות צפויות בשנות הפריסה, כמה נזילות נדרשת ומה מטרות הלקוח.</div>
        ${renderIntakeIds(RS_IDS.questions)}
        <div class="subhead">מטרות הלקוח</div>
        ${renderStep3()}
        ${fold('riskgoals', 'דף עבודה פנימי: התאמת סיכון למטרות', renderRiskGoals(), badgeRg())}`;
}

// M-045 שלב מקדים: מקדם הקצבה של כל פוליסה מהמסלקה (בלי ציטוט קצבה; החלטת הבעלים 11.11 18:57, 19:00)
const yesNo = (v) => (v === true ? 'כן' : v === false ? 'לא' : '—');
function renderGuaranteedFactors() {
    const accs = ((state.portfolio && state.portfolio.accounts) || []).filter(a => a.annuityFactor);
    if (!accs.length) return '';
    const fundK = state.mekLast && state.mekLast.k ? state.mekLast.k : null;
    const rows = accs.map(a => {
        const f = a.annuityFactor;
        const fundPension = fundK && f.projectedSavings && !f.capitalOnly ? f.projectedSavings / fundK : null;
        return `<tr><td>${esc(a.plan || '')}<div class="muted small">${esc(a.yatzran || '')} · ${esc(KIND_LABEL[a.kind] || a.kind || '')}</div></td>
            <td>${f.retireAge ?? '—'}</td>
            <td>${f.guaranteedFactor !== null ? `<b>${f.guaranteedFactor}</b>` : '<span class="muted">אין מקדם מובטח</span>'}</td>
            <td>${f.capitalOnly ? `<span class="muted">חלק הוני בלבד: ₪${fmt(f.capitalSavings || 0)} (לא לקצבה)</span>` : `${f.projectedSavings !== null ? '₪' + fmt(f.projectedSavings) : '—'}${f.capitalSavings ? `<div class="muted small">ועוד ₪${fmt(f.capitalSavings)} בחלק ההוני (לא לקצבה)</div>` : ''}`}</td>
            <td>${f.pensionFromGuaranteed !== null ? '₪' + fmt(f.pensionFromGuaranteed) : '—'}</td>
            <td>${fundPension !== null ? '₪' + fmt(fundPension) : '<span class="muted">חשבו מקדם בטבלה למעלה</span>'}</td>
            <td>${yesNo(f.lifeGuarantee)}</td><td>${yesNo(f.yieldGuarantee)}</td></tr>`;
    }).join('');
    return fold('guaranteed', `המקדם בפוליסות לפי המסלקה (${accs.length})`, `<div class="muted small">המקדם, הצבירה הצפויה והדגלים נלקחו מקובץ המסלקה (בלוק "יתרה לפי גיל פרישה"). הקצבה = הצבירה הצפויה חלקי המקדם, ברוטו לפני מס.
        עמודת "בקרן פנסיה" מחלקת את אותה צבירה במקדם שחושב בטבלת התקנון למעלה - השוואה לשאלה אם כדאי לנייד (תקנה 2(א)(1) לתקנות העברת כספים בין קופות גמל).</div>
        <div class="alts-scroll"><table class="altstbl" data-guaranteed><thead><tr><th>פוליסה</th><th>גיל פרישה</th><th>מקדם מובטח</th><th>צבירה צפויה</th><th>קצבה לפי המקדם</th><th>בקרן פנסיה (אותה צבירה)</th><th>הבטחת תוחלת חיים</th><th>הבטחת תשואה</th></tr></thead><tbody>${rows}</tbody></table></div>
        <div class="note small">המקדם המובטח תקף לגיל הפרישה שבמסלקה. פרישה בגיל אחר עשויה לשנות אותו. מקדם מובטח הוא זכות שאובדת בניוד, ולכן לא מנייד פוליסה כזו בלי השוואה. ההשוואה אינה כוללת עדיין דמי ניהול בשלב הקצבה ותנאי שאירים (M-045, שלב 1).</div>`);
}

function renderPensionStep() {
    return `${renderMekadem()}
        ${renderGuaranteedFactors()}
        ${renderFamilyScenarios()}
        ${renderIntakeIds(RS_IDS.pension)}
        ${fold('quote', 'לא נדרש: ציטוט קצבה מהגוף המנהל', `<div class="muted small">התכנון נעשה לפני הפרישה (למשל בגיל 66), ולכן ציטוט קצבה אינו נדרש: בביטוח מנהלים המקדם נלקח מהמסלקה, ובקרן פנסיה מטבלאות התקנון. אם בכל זאת יש ציטוט, אפשר להעלות אותו להשוואה.</div>${renderDocUpload('quote')}`)}`;
}
function badgePensionStep() {
    return state.mekLast && state.mekLast.pension ? `אומדן ₪${fmt(state.mekLast.pension)} לחודש` : 'חסר: מקדם ואומדן קצבה';
}


// M-045 שלב 2: דירוג חלופות המס במענק ובקצבה (מנוע retire-engine.js). כל שדה ריק מתמלא אוטומטית מהמסמכים ומסומן.
function retEngAuto() {
    const f = state.f161 || {}, ni = state.netin || {}, k = state.kibua || {};
    const n = (v) => { const x = parseFloat(String(v ?? '').replace(/[^\d.]/g, '')); return isFinite(x) ? x : null; };
    const rd = String(f.retireDate || '').match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    const salary = n(f.salarySeverance) ?? n(f.salaryFull);
    const by = n(state.mekIn && state.mekIn.birthYear);
    const retireYear = rd ? +rd[3] : 2026;
    const guaranteed = ((state.portfolio && state.portfolio.accounts) || []).map(a => a.annuityFactor).filter(x => x && x.pensionFromGuaranteed);
    const pension = (state.mekLast && state.mekLast.pension ? state.mekLast.pension : 0) + guaranteed.reduce((t, x) => t + x.pensionFromGuaranteed, 0);
    return {
        grant: { v: n(f.totalGrant), src: 'טופס 161' },
        workYears: { v: parseWorkYears(f.workYears) || null, src: 'טופס 161' },
        lastSalary: { v: salary, src: 'טופס 161' },
        retireYear: { v: retireYear, src: rd ? 'טופס 161' : 'ברירת מחדל' },
        retireMonth: { v: rd ? +rd[2] : 12, src: rd ? 'טופס 161' : 'ברירת מחדל' },
        retireDay: { v: rd ? +rd[1] : 31, src: rd ? 'טופס 161' : 'ברירת מחדל' },
        sex: { v: state.mekIn && state.mekIn.gender === 'f' ? 'female' : 'male', src: 'שלב הקצבה' },
        age: { v: by ? retireYear - by : 66, src: by ? 'שנת לידה' : 'הנחת עבודה (66)' },
        pensionMonthly: { v: pension ? Math.round(pension) : null, src: 'אומדן הקצבה (שלב 5)' },
        annuityFactor: { v: state.mekLast && state.mekLast.k ? state.mekLast.k : null, src: 'מקדם מטבלת התקנון (שלב 5)' },
        pensionStartYear: { v: k.eligDate ? +String(k.eligDate).slice(0, 4) : retireYear + 1, src: k.eligDate ? 'חודש הזכאות (שלב 3)' : 'שנה אחרי הפרישה' },
        retireYearIncome: { v: salary && rd ? Math.round(salary * Math.min(12, +rd[2])) : null, src: 'משכורת × חודשי עבודה (הערכה)' },
        futureIncome: { v: n(ni.otherMain) ? n(ni.otherMain) * 12 : 0, src: 'הכנסה אחרת (שלב 5)' },
        creditPoints: { v: n(ni.pointsMain) ?? 2.25, src: 'נקודות זיכוי (שלב 5)' },
        priorExempt: { v: n(k.grantExempt) || 0, src: 'מענקים פטורים קודמים (שלב 3)' },
    };
}
function retEngInput() {
    const a = retEngAuto(), u = state.retEng || {}, used = {};
    const pick = (key) => { const raw = u[key]; if (raw !== undefined && raw !== '') { used[key] = 'הוזן'; return raw; } used[key] = a[key] ? a[key].src : ''; return a[key] ? a[key].v : null; };
    const num = (key) => { const v = pick(key); const x = parseFloat(v); return isFinite(x) ? x : null; };
    const inp = {
        retireYear: num('retireYear'), retireMonth: num('retireMonth'), retireDay: num('retireDay'), sex: pick('sex') || 'male', age: num('age'),
        grant: num('grant'), workYears: num('workYears'), lastSalary: num('lastSalary') || 0, pensionMonthly: num('pensionMonthly') || 0,
        annuityFactor: num('annuityFactor'), pensionStartYear: num('pensionStartYear'), retireYearIncome: num('retireYearIncome') || 0,
        futureIncome: num('futureIncome') || 0, creditPoints: num('creditPoints') ?? 2.25,
        priorExemptGrants: num('priorExempt') ? [{ amount: num('priorExempt'), workYears: num('workYears') || 0 }] : [],
        newEmployerWithinYear: u.newEmployer === '1', discountRate: (parseFloat(u.discount) || 3) / 100,
    };
    const past = {};
    for (let i = 1; i <= 5; i++) { const v = parseFloat(u['past' + i]); if (isFinite(v) && inp.retireYear) past[inp.retireYear - i] = v; }
    inp.incomeByYear = past;
    return { inp, used, auto: a };
}
function taxAltsResultHtml() {
    const { inp, used } = retEngInput();
    if (!(inp.grant > 0) || !(inp.workYears > 0)) return '<div class="note small">חסרים סכום המענק ושנות העבודה. הם נלקחים אוטומטית מטופס 161 (שלב 2), או אפשר להזין אותם כאן.</div>';
    let r;
    try { r = evaluateRetirement(inp); } catch (e) { return `<div class="note small">החישוב נכשל: ${esc(String(e && e.message || e))}</div>`; }
    const money = (x) => x === null || x === undefined ? '—' : '₪' + fmt(Math.round(x));
    const rows = r.ranked.map(a => `<tr${a.rank === 1 ? ' class="lead"' : ''}><td><b>${a.rank}</b></td><td>${esc(a.id)}. ${esc(a.name)}<div class="muted small">${esc(a.explain || '')}</div></td>
        <td>${money(a.cashNow)}</td><td>${money(a.pensionMonthly)}<div class="muted small">פטור ${money(a.exemption.monthlyExempt)}</div></td><td>${money(a.taxNow)}</td><td>${money(a.taxNominal)}</td><td><b>${money(a.taxPV)}</b></td><td>${money(a.netPV)}${r.bestNet && r.bestNet.id === a.id ? '<div class="muted small">הנטו הגבוה ביותר</div>' : ''}</td></tr>`).join('');
    const off = r.alternatives.filter(a => !a.available || a.conditional).map(a => `<li><b>${esc(a.id)}. ${esc(a.name)}</b>: ${esc(a.reason || a.explain || '')}</li>`).join('');
    const best = r.recommended;
    const head = best ? `<div class="note"><b>החלופה עם חבות המס הנמוכה ביותר: ${esc(best.id)}. ${esc(best.name)}</b>. מס בערך נוכחי ${money(best.taxPV)}${r.savingVsNext === null ? '' : r.savingVsNext >= 1 ? `, חיסכון של ${money(r.savingVsNext)} לעומת החלופה הבאה` : ', זהה במס לחלופה הבאה - הדירוג ביניהן לפי הנטו'}.${r.bestNet && r.bestNet.id !== best.id ? ` <br>שימו לב: הנטו הגבוה ביותר (מה שהלקוח מקבל אחרי מס) הוא בחלופה ${esc(r.bestNet.id)} - פחות מס אינו תמיד יותר כסף.` : ''}</div>` : '';
    const autoList = Object.entries(used).filter(([, v]) => v && v !== 'הוזן').map(([k2, v]) => `${RENG_LABEL[k2] || k2}: ${v}`).join(' · ');
    return `${head}
        <div class="alts-scroll"><table class="altstbl" data-taxalts><thead><tr><th>דירוג</th><th>חלופה</th><th>מזומן עכשיו</th><th>קצבה חודשית</th><th>מס בשנת הפרישה</th><th>מס כולל (נומינלי)</th><th>מס בערך נוכחי</th><th>נטו בערך נוכחי</th></tr></thead><tbody>${rows}</tbody></table></div>
        ${off ? `<div class="subhead">לא נכללו בדירוג</div><ul class="small">${off}</ul>` : ''}
        <div class="muted small">מענק ${money(r.grant.exempt + r.grant.taxable)}: פטור ${money(r.grant.exempt)} (${money(r.grant.perYear)} לשנה × ${inp.workYears}), חייב ${money(r.grant.taxable)}. תקופת ההשוואה עד ${r.endYear} (תוחלת חיים ${r.lifeExpectancy} שנים, למ"ס). ריבית היוון ${(inp.discountRate * 100).toFixed(1)}%.</div>
        ${r.warnings.length ? `<div class="note small">${r.warnings.map(esc).join('<br>')}</div>` : ''}
        ${autoList ? `<div class="muted small"><b>מולא אוטומטית:</b> ${esc(autoList)}. אפשר לתקן בשדות למעלה.</div>` : ''}
        <div class="muted small">המקורות: ${esc(Object.values(r.refs).join(' · '))}. החישוב בערכי 2026; המס לכל שנה מחושב מעל ההכנסה האחרת של אותה שנה. אינו כולל ביטוח לאומי ומס בריאות. הבחירה עצמה נעשית בטופסי 161א, 116ג ו-161ד.</div>`;
}
const HEB_MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];
const RENG_LABEL = { grant: 'מענק', workYears: 'שנות עבודה', lastSalary: 'משכורת אחרונה', retireYear: 'שנת פרישה', retireMonth: 'חודש פרישה', retireDay: 'יום', sex: 'מין', age: 'גיל בפרישה', pensionMonthly: 'קצבה חודשית', annuityFactor: 'מקדם', pensionStartYear: 'שנת תחילת קצבה', retireYearIncome: 'הכנסה בשנת הפרישה', futureIncome: 'הכנסה שנתית אחרת', creditPoints: 'נקודות זיכוי', priorExempt: 'מענקים פטורים קודמים' };
function renderTaxAlternatives() {
    const auto = retEngAuto();
    const u = state.retEng || {};
    const fs = (key, label, from, to) => `<label>${label}${numSel(`data-reng="${key}"`, from, to, 1, u[key], auto[key] && auto[key].v !== null && auto[key].v !== undefined ? 'אוטומטי: ' + auto[key].v + ' (' + auto[key].src + ')' : 'בחרו...')}</label>`;
    const f = (key, label, extra = '') => `<label>${label}<input type="number" data-reng="${key}" value="${esc(u[key] ?? '')}" placeholder="${auto[key] && auto[key].v !== null && auto[key].v !== undefined ? esc(String(auto[key].v)) + ' (' + esc(auto[key].src) + ')' : 'חסר'}" ${extra}></label>`;
    return fold('taxalts', 'דירוג חלופות המס: מענק הפרישה והקצבה', `<div class="muted small">המערכת משווה את כל הדרכים לטפל במענק הפרישה (רצף קצבה, משיכה פטורה, פריסה קדימה ואחורה, משיכה פטורה חלקית, רצף פיצויים ושילובים) ומדרגת לפי חבות המס הכוללת בערך נוכחי - המס עכשיו, בשנות הפריסה ועל הקצבה עד תוחלת החיים. שדה ריק מתמלא מהמסמכים; הערך שבשימוש מופיע בתוך השדה.</div>
        <div class="netgrid">
            ${f('grant', 'מענק פרישה כולל (₪)', 'min="0" step="1000"')}
            ${f('workYears', 'שנות עבודה', 'min="0" max="60" step="0.01"')}
            ${f('lastSalary', 'משכורת חודשית אחרונה (₪)', 'min="0"')}
            ${fs('retireYear', 'שנת הפרישה', 2020, 2045)}
            <label>חודש הפרישה<select data-reng="retireMonth"><option value="">${auto.retireMonth && auto.retireMonth.v ? 'אוטומטי: ' + HEB_MONTHS[auto.retireMonth.v - 1] + ' (' + esc(auto.retireMonth.src) + ')' : 'בחרו...'}</option>${HEB_MONTHS.map((m, j) => `<option value="${j + 1}"${String(u.retireMonth || '') === String(j + 1) ? ' selected' : ''}>${m}</option>`).join('')}</select></label>
            ${fs('age', 'גיל בפרישה', 50, 90)}
            ${f('pensionMonthly', 'קצבה חודשית צפויה מהחיסכון הקיים (₪)', 'min="0"')}
            ${f('annuityFactor', 'מקדם המרה לקצבה (לכסף שנשאר בקופה)', 'min="50" max="400" step="0.01"')}
            ${fs('pensionStartYear', 'שנת תחילת הקצבה', 2020, 2055)}
            ${f('retireYearIncome', 'הכנסה חייבת בשנת הפרישה בלי המענק (₪)', 'min="0"')}
            ${f('futureIncome', 'הכנסה חייבת שנתית אחרת בשנים הבאות (₪)', 'min="0"')}
            ${f('priorExempt', 'מענקים פטורים קודמים ב-32 השנים (₪)', 'min="0"')}
            ${[1, 2, 3, 4, 5].map(i => `<label>הכנסה חייבת לפני ${i} ${i === 1 ? 'שנה' : 'שנים'} (טופס 106, לפריסה אחורה)<input type="number" min="0" data-reng="past${i}" value="${esc(u['past' + i] ?? '')}" placeholder="ריק = הערכה לפי שנת הפרישה"></label>`).join('')}
            <label>ריבית היוון (%)<input type="number" min="0" max="10" step="0.1" data-reng="discount" value="${esc(u.discount ?? '')}" placeholder="3"></label>
            <label class="chk"><input type="checkbox" data-reng="newEmployer"${u.newEmployer === '1' ? ' checked' : ''}> יתחיל לעבוד אצל מעסיק חדש תוך שנה (רצף פיצויים)</label>
        </div>
        <div id="reng-result">${taxAltsResultHtml()}</div>`);
}

// מחשבון "תמונת נכסים וסיכון כולל" (docs/proposals/2026-11-12-total-assets-risk, אושר 12.11.2026)
function pensionSummary() {
    if (!view || !view.holdings || !view.holdings.length) return null;
    let value = 0, lo = 0, hi = 0;
    for (const h of view.holdings) {
        const b = h.track.balance || 0; value += b;
        if (h.equityPct !== null) { lo += b * h.equityPct; hi += b * h.equityPct; }
        else if (h.estimate) { lo += b * h.estimate.lo; hi += b * h.estimate.hi; }
        else { hi += b * 100; }
    }
    return value > 0 ? { value, eqLo: lo / value, eqHi: hi / value } : null;
}
async function onAssetFiles(files) {
    if (!files || !files.length) return;
    const lib = globalThis.pdfjsLib;
    const list = Array.from(files);
    const bufs = [];
    for (const f of list) bufs.push({ name: f.name, buf: await f.arrayBuffer() });
    state.assets.status = `קורא ${bufs.length} קבצים...`; render();
    const msgs = [];
    for (const { name, buf } of bufs) {
        if (!lib) { msgs.push(`${name}: ספריית ה-PDF לא נטענה`); continue; }
        try {
            const doc = await lib.getDocument({ data: new Uint8Array(buf.slice(0)), isEvalSupported: false }).promise;
            const items = [];
            for (let p = 1; p <= doc.numPages; p++) { const tc = await (await doc.getPage(p)).getTextContent(); for (const it of tc.items) if (it.str && it.str.trim()) items.push({ page: p, x: it.transform[4], y: it.transform[5], str: it.str.trim() }); }
            if (!items.length) { msgs.push(`${name}: אין טקסט בקובץ (סריקה) - הזינו ידנית בשאלה 1`); continue; }
            const r = parseBalanceItems(items);
            if (!r.rows.length && r.zeros) { msgs.push(`${name}: כל ${r.zeros} השורות שזוהו${r.bank ? ' (' + r.bank + ')' : ''} הן 0 ₪`); continue; }
            if (!r.rows.length) { msgs.push(`${name}: לא זוהו שורות יתרה מוכרות. מבנה האישור של הבנק הזה עוד לא נלמד - שלחו דוגמה, ובינתיים הזינו בשאלה 1`); continue; }
            state.assets.banks.push({ file: name, bank: r.bank, date: r.date, reportedNet: r.reportedNet, rows: r.rows.map(x => ({ ...x, include: true, eqRange: x.eq === null ? 'u' : '' })) });
            msgs.push(`${name}: זוהו ${r.rows.length} שורות עם יתרה${r.zeros ? ` (ועוד ${r.zeros} שורות 0 ₪ שלא מוצגות)` : ''}${r.bank ? ' - ' + r.bank : ''}${r.date ? ', נכון ל-' + r.date : ''}`);
        } catch (e) { msgs.push(`${name}: הקריאה נכשלה (${(e && e.message) || 'שגיאה'})`); }
    }
    state.assets.status = msgs.join(' · '); render();
}
function renderAssetsCard(on = true) {
    const a = state.assets, q = a.q;
    const money = (x) => '₪' + fmt(Math.round(x));
    const rng = (lo, hi, unit = '%') => lo === null ? '—' : (Math.abs(hi - lo) < 0.5 ? `${Math.round(lo)}${unit}` : `${Math.round(lo)}-${Math.round(hi)}${unit}`);
    const sel = (id, opts, cur) => `<select data-asq="${id}">${opts.map(([v, l]) => `<option value="${esc(v)}"${(cur || '') === v ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
    const amountOpts = [['', 'לא נבחר'], ...AMOUNT_RANGES.map(r => [r.id, r.label])];
    const eqOpts = [['', 'חשיפה למניות...'], ...EQUITY_RANGES.map(r => [r.id, r.label])];
    const banks = a.banks.map((b, bi) => `<div class="card intake"><div class="subhead small">${esc(b.bank || 'בנק לא מזוהה')} ${b.date ? '· נכון ל-' + esc(b.date) : ''} <span class="muted small">(${esc(b.file)})</span> <button type="button" class="ghostbtn" data-action="asrm|${bi}">הסרה</button></div>
        <div class="alts-scroll"><table class="altstbl" data-asbank="${bi}"><thead><tr><th>לכלול</th><th>סוג</th><th>יתרה (₪)</th><th>חשיפה למניות</th></tr></thead><tbody>
        ${b.rows.map((r, ri) => `<tr><td><input type="checkbox" data-asrow="${bi}|${ri}|include"${r.include !== false ? ' checked' : ''}></td><td>${esc(r.label)}<div class="muted small">${esc(r.source)}${r.page !== '-' ? ` (עמ' ${r.page})` : ''}</div></td>
            <td><input type="text" inputmode="decimal" data-asrow="${bi}|${ri}|amount" value="${esc(String(r.amount))}" style="width:9em"></td>
            <td>${r.cat === 'liability' ? 'התחייבות' : r.eq !== null && r.eq !== undefined ? r.eq + '%' : `<select data-asrow="${bi}|${ri}|eqRange">${EQUITY_RANGES.map(e => `<option value="${e.id}"${r.eqRange === e.id ? ' selected' : ''}>${esc(e.label)}</option>`).join('')}</select>`}</td></tr>`).join('')}
        </tbody></table></div>${b.reportedNet !== null && b.reportedNet !== undefined ? `<div class="muted small">סה"כ נטו לפי הבנק (בלי משכנתא): ${money(b.reportedNet)}</div>` : ''}</div>`).join('');
    const listFor = (type) => type === 'eq' ? [['', 'חשיפה למניות...'], ...EQUITY_RANGES.map(r => [r.id, r.label])]
        : type === 'fee' ? [['', 'דמי ניהול...'], ...FEE_RANGES.map(r => [r.id, r.label])]
        : type === 'rent' ? [['', 'שכירות נטו...'], ...RENT_RANGES.map(r => [r.id, r.label])]
        : null;
    const qs = SECTIONS.map(sec => `<tr class="alts-sect alts-sect-peers"><td colspan="2">${esc(sec.title)}</td></tr>` + sec.rows.map(row => {
        const [mainKey, mainType] = row.fields[0];
        const open = mainType !== 'amount' || (q[mainKey] && q[mainKey] !== '0');
        const ctl = row.fields.map(([key, type, label, opts], i) => {
            if (i > 0 && !open) return '';
            if (type === 'choice') return sel(key, label ? [['', label + '...'], ...opts.slice(1)] : opts, q[key]);
            if (type === 'amount' || type === 'debt') return sel(key, i === 0 ? amountOpts : [['', (label || 'סכום') + '...'], ...AMOUNT_RANGES.map(r => [r.id, (label ? label + ': ' : '') + r.label])], q[key]);
            return sel(key, listFor(type), q[key]);
        }).join('');
        return `<tr><td>${esc(row.label)}</td><td class="asq-ctl">${ctl}</td></tr>`;
    }).join('')).join('');
    const pen = pensionSummary();
    const r = computeTotal({ banks: a.banks, q, pension: pen });
    const answered = Object.values(q).filter(Boolean).length + a.banks.length + (pen ? 1 : 0);
    const verdict = r.verdict === 'above' ? 'מעל מה שהלקוח אמר שהוא יכול לשאת' : r.verdict === 'below' ? 'מתחת למה שהלקוח מוכן לשאת - יש מקום להגדיל' : r.verdict === 'within' ? 'בתוך הטווח שהלקוח מוכן לשאת' : '';
    const result = !answered ? '<div class="muted small">העלו אישור יתרות או ענו על השאלון כדי לראות את התמונה.</div>' : `
        <div class="note" data-assets-result><b>אחוז המניות האמיתי על כל הנכסים הפיננסיים: ${rng(r.equity.lo, r.equity.hi)}</b>${r.pensionEquity ? ` (בפנסיה לבד: ${rng(r.pensionEquity.lo, r.pensionEquity.hi)})` : ''}.
            <br>כולל נדל"ן להשקעה, עסק וקריפטו כנכסי סיכון: ${rng(r.risky.lo, r.risky.hi)} מהנכסים.${verdict ? `<br>לפי השאלה על ירידה של 20%: ${verdict}${r.tolerance ? ` (${r.tolerance[0]}-${r.tolerance[1]}% מניות)` : ''}.` : ''}${r.capacityNote ? `<br>${esc(r.capacityNote)}.` : ''}</div>
        <div class="alts-scroll"><table class="altstbl" data-assets-table><thead><tr><th>נכס</th><th>שווי</th><th>חשיפה למניות</th><th>נזיל</th></tr></thead><tbody>
            ${r.items.map(i => `<tr><td>${esc(i.name)}</td><td>${i.lo === i.hi ? money(i.lo) : money(i.lo) + ' - ' + money(i.hi)}</td><td>${i.kind === 'risk' ? 'נכס סיכון (לא מניות)' : rng(i.eqLo, i.eqHi)}</td><td>${i.liquid ? 'כן' : 'לא'}</td></tr>`).join('')}
            ${r.totals.home ? `<tr><td>דירת מגורים (במאזן בלבד)</td><td>${money(r.totals.home.lo)} - ${money(r.totals.home.hi)}</td><td>לא נספר</td><td>לא</td></tr>` : ''}
        </tbody></table></div>
        <div class="muted small">סך נכסים: ${money(r.totals.assetsLo)}${r.totals.assetsHi !== r.totals.assetsLo ? ' - ' + money(r.totals.assetsHi) : ''} · התחייבויות: ${money(r.totals.debtsLo)}${r.totals.debtsHi !== r.totals.debtsLo ? ' - ' + money(r.totals.debtsHi) : ''} · נזיל (אמצע הטווחים): ${money(r.liquid)}${r.need ? ` מול צורך של ${money(r.need.lo)}-${money(r.need.hi)} ב-3 שנים${r.liquid < r.need.lo ? ' - <b>הנזילות לא מכסה את הצורך</b>' : ''}` : ''} · חשיפה למט"ח: ${r.fxPct === null ? '—' : r.fxPct + '%'}${r.concentration.length ? ` · <b>ריכוזיות:</b> ${esc(r.concentration.join(', '))} מעל 25% מהנכסים` : ''}${r.feeCost ? ` · דמי ניהול בתיקים: ${money(r.feeCost.lo)}-${money(r.feeCost.hi)} בשנה` : ''}${r.rentYear ? ` · שכירות נטו: ${money(r.rentYear.lo)}-${money(r.rentYear.hi)} בשנה` : ''}${r.leveragePct !== null ? ` · מינוף: ${r.leveragePct}% מהנכסים הפיננסיים` : ''}</div>
        ${r.notes.length ? `<ul class="small">${r.notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}
        <div class="muted small">החשיפה למניות מחושבת על ערכי האמצע של טווחי הסכום, ולכן היא טווח. הפנסיה מגיעה מהמסלקה (כרטסת תיק פנסיוני), עם החשיפה של כל מסלול; מסלול שלא זוהה נספר כ-0-100%. דירת המגורים במאזן בלבד (החלטת הבעלים 12.11).</div>`;
    return `<div class="card" id="assets-card" data-calcsub-card="assets"${on ? '' : ' hidden'}>
        <div class="group-label">תמונת נכסים וסיכון כולל</div>
        <div class="muted small">אחוז הסיכון האמיתי של הלקוח הוא החשיפה למניות על פני <b>כל</b> הנכסים - פנסיה, בנקים, תיקים מנוהלים, חו"ל - ולא בכל מוצר בנפרד. ${pen ? `הפנסיה נלקחה מקובץ המסלקה (${money(pen.value)}).` : 'כדי לכלול את הפנסיה, העלו קובץ מסלקה בכרטסת תיק פנסיוני.'}</div>
        <div class="drop"><input type="file" id="assets-input" accept=".pdf" multiple><div class="drop-hint"><b>אישורי יתרות מהבנקים (PDF).</b> אפשר כמה קבצים, מכמה בנקים. כרגע מזוהה "ריכוז יתרות" של בנק הפועלים; בנקים נוספים יזוהו אחרי שנקבל דוגמאות.</div></div>
        ${a.status ? `<div class="status-line">${esc(a.status)}</div>` : ''}
        ${banks}
        <button type="button" class="ghostbtn" data-action="asmanual">הזנה ידנית של יתרות מדויקות (בלי אישור מהבנק)</button>
        <div class="subhead">שאלון - דף אחד, טווחים בלבד</div>
        <div class="muted small">כל סכום כולל את ההון הפרטי ואת ההון שבחברה יחד, אם יש.</div>
        <table class="altstbl assets-q" data-assets-q><tbody>${qs}</tbody></table>
        ${result}
    </div>`;
}

function renderRecommendationStep() {
    return `${renderTaxAlternatives()}
        ${renderAlloc()}
        ${view ? fold('retirement', 'פירוט: ניתוח טופס 161 (קודי משלם, פגיעה בסל, שנות פריסה)', renderRetirement()) : ''}`;
}

function renderSummaryStep() {
    return `<div class="subhead">מסמכים מהמעסיק והסדרים</div>
        ${renderIntakeIds(RS_IDS.summary)}
        ${fold('review', 'מה נבדק, מה פתוח, מקורות ומשוב', renderReview())}`;
}

// ההחזקות הנכללות בממוצע הסיכון (זיהוי רשמי/אוברייד מתועד אוטומטית, או התאמת שם שאושרה ידנית; הוצאה ידנית גוברת)
// זהות ההתאמה הנוכחית: קוד רשמי, או שם השורה שאושרה. אישור ידני תקף רק לזהות שנשמרה בעת האישור - שינוי בהתאמה מבטל אותו.
function matchIdentity(m) { return matchIdentityOf(m); }
function confirmedOk(key, m) { const id = matchIdentity(m); return id !== null && state.confirmed[key] === id; }

function includedHoldings() {
    if (!view) return [];
    return includedHoldingsOf(view.holdings, state.confirmed, state.excluded);
}

function confirmedRisk() {
    const inc = includedHoldings();
    let sum = 0, eq = 0;
    const byClass = { official: 0, confirmed: 0, web: 0, estimate: 0 };
    for (const x of inc) {
        const h = x.h;
        sum += x.bal; eq += x.bal * x.eq;
        const cls = x.cls || 'official';
        byClass[cls] = (byClass[cls] || 0) + x.bal;
    }
    return sum > 0 ? { equity: eq / sum, value: sum, byClass } : null;
}

// תכנית היעד הכולל: מחושבת רק כשהמשתמש הזיז את מחוון היעד ובחר לפחות החזקה אחת (צ'ק-בוקס; ברירת מחדל: ללא שינוי)
let planCache = { sig: null, plan: null };
function wholePlanContext() {
    const unident = view.holdings.filter(h => h.equityPct === null);
    // חלוקה מלאה של כל שקל בדיוק פעם אחת: החזקות עם חשיפה ידועה שאינן נכללות (הוצאו ידנית או טרם אושרו) קפואות בחשיפתן הידועה - לא נופלות לאפס שקט ולא לללא-בסיס.
    const incKeys = new Set(includedHoldings().map(x => x.key));
    const frozenKnown = view.holdings.filter(h => h.equityPct !== null && !incKeys.has(trackKeyOf(h.account.account, h.track))).map(h => ({ bal: h.track.balance, eq: h.equityPct }));
    return {
        totalValue: view.totalValue,
        estFrozen: unident.filter(h => h.estimate).map(h => ({ bal: h.track.balance, eq: h.estimate.eq, lo: h.estimate.lo, hi: h.estimate.hi })),
        noBasisVal: unident.filter(h => !h.estimate).reduce((sum, h) => sum + h.track.balance, 0),
        frozenKnown,
        unknownAssumption: state.unknownAssumption ?? null,
    };
}

function currentTargetPlan() {
    if (state.targetEq === null || state.targetEq === undefined) return null;
    const inc = includedHoldings();
    const selKeys = eligibleKeysOf(inc, state.eligible);
    if (!selKeys.length) return null;
    const whole = wholePlanContext();
    const sig = JSON.stringify(state.marketPick || {}) + '|' + state.targetEq + '|' + selKeys.slice().sort().join(',') + '|' + inc.map(x => x.key + ':' + x.bal + ':' + x.eq).join(',') + '|' + whole.estFrozen.map(e => e.bal + ':' + e.eq).join(',') + '|' + whole.noBasisVal + '|' + (whole.frozenKnown || []).map(e => e.bal + ':' + e.eq).join(',') + '|' + (whole.unknownAssumption ?? '') + '|' + (state.geoPref || 'any');
    if (planCache.sig === sig) return planCache.plan;
    const plan = solveTargetPlan(inc, new Set(selKeys), state.targetEq, clientAge(), whole, state.geoPref || 'any', { market: true, picks: state.marketPick || {} });
    planCache = { sig, plan };
    return plan;
}

// חלופות עם שארפ רשמי גבוה ממש מהמסלול הנוכחי, באותו סוג מוצר ואותה קטגוריית חשיפה בפועל. נתוני 09/2026 הרשמיים בלבד.
// השארפ כאן הוא SHARPE_RATIO כפי שדווח רשמית במאגרי האוצר - הגדרה שונה מהשארפ המחושב בכלי (36 חודשים, ריבית 4%), אין להשוות בין השניים.
function clientAge() {
    const bd = state.portfolio && state.portfolio.client && state.portfolio.client.birthDate;
    if (!bd) return null;
    const d = new Date(bd), now = new Date();
    if (isNaN(d)) return null;
    let age = now.getFullYear() - d.getFullYear();
    if (now.getMonth() < d.getMonth() || (now.getMonth() === d.getMonth() && now.getDate() < d.getDate())) age--;
    return age;
}

// ההמלצה ליעד החשיפה הכולל עבור החזקה אחת (מוצגת בתיק הנכסים; מתעדכנת בזמן הזזת הבקר - refreshTargetLive)
function renderHoldingTarget(a, h) {
    if (!h || state.targetEq === null || state.targetEq === undefined) return '';
    const key = trackKeyOf(a.account, h.track);
    const T = pct(state.targetEq);
    const inc = includedHoldings().find(x => x.key === key);
    const head = (t) => `<div class="group-label">${t}</div>`;
    if (!inc) {
        return `<div class="card target-card muted-card">${head(`ההמלצה ליעד ${T}`)}<div class="muted small">${state.excluded[key] && h.equityPct !== null
            ? `ההחזקה הוצאה מממוצע הסיכון בבחירתך. חשיפתה (${pct(h.equityPct)}) נשארת קפואה בחישוב התיק הכולל ואינה מקבלת המלצה.`
            : `ההחזקה עוד לא מזוהה (חסר נתון חשיפה מאומת), ולכן אינה משתתפת ביעד. ${h.estimate ? 'בחישוב הכולל משמש אומדן מסומן בכוכבית. ' : ''}כדי לכלול אותה - זהו את המסלול בבחירה שלמעלה.`}</div></div>`;
    }
    if (state.eligible[key] === false) return `<div class="card target-card muted-card">${head(`ההמלצה ליעד ${T}`)}<div class="muted small">סומנה "ללא שינוי" בחלק רמת הסיכון - החשיפה (${pct(inc.eq)}) נשארת, והיעד מתחלק בין שאר ההחזקות.</div></div>`;
    const plan = currentTargetPlan();
    const per = plan && plan.per ? plan.per.find(p => p.key === key) : null;
    if (per && per.proposal && plan.status === 'infeasible') return `<div class="card target-card">${head(`ההמלצה ליעד ${T} - לא בר-השגה; מכוון לקרוב ביותר ${pct(plan.closestT)}`)}${renderTargetProposal(per)}${renderMarketTable(a, h, key, per)}${renderTransferRules(a.kind, esc)}</div>`;
    if (!per) return `<div class="card target-card muted-card">${head(`ההמלצה ליעד ${T}`)}<div class="muted small">${plan && plan.status === 'infeasible' ? 'היעד אינו בר-השגה בכלים הזמינים - פירוט בחלק רמת הסיכון.' : plan && plan.status === 'underdetermined' ? 'לא ניתן לקבוע תכנית יחידה (חלק מהתיק ללא בסיס חשיפה) - פירוט בחלק רמת הסיכון.' : 'אין הצעה להחזקה זו.'}</div></div>`;
    return `<div class="card target-card">${head(`ההמלצה ליעד ${T} (לפי בקר רמת הסיכון)`)}${renderTargetProposal(per)}${renderMarketTable(a, h, key, per)}${renderTransferRules(a.kind, esc)}</div>`;
}

// טבלת "מסלולים מתאימים מכל השוק" (M-037): מסלולים שפתיחותם להצטרפות אומתה, בחשיפה קרובה ליעד ההחזקה,
// מדורגים בציון המאושר; בחירה ברדיו מקבעת את ההחזקה במסלול ושאר ההחזקות מתאזנות סביבה.
function renderMarketTable(a, h, key, per) {
    if (a.kind === 'menahalim') return `<div class="muted small market-note">ביטוח מנהלים: לא מוצע ניוד מכל השוק כברירת מחדל - בפוליסה עשוי להיות מקדם קצבה מובטח שאובד בניוד. בדיקה פרטנית מול הפוליסה.</div>`;

    const pick = state.marketPick[key];
    // היעד להחזקה: בבחירה ידנית - יעד המערכת לפני הבחירה אינו ידוע, לכן מוצגים מועמדים סביב החשיפה שנבחרה
    const tgt = per.targetEq;
    const mc = marketCandidates(a.kind, h.match && h.match.group, tgt, clientAge());
    if (mc.disabled) return `<div class="muted small market-note">אין מסלולים מאומתים להצטרפות בסוג קרן זה.</div>`;
    const curId = pensionFundIdOfMatch(h.match, a.kind);
    const rows = mc.items.map((r, i) => {
        const cp = parentIdOfMatch(h.match, a.kind);
        const same = cp != null && r.parentId === cp;
        const checked = pick === r.fundId || (pick == null && per.proposal && per.proposal.type === 'market' && per.proposal.track.fundId === r.fundId);
        return `<tr${checked ? ' class="top"' : ''}><td><label class="mkt-pick"><input type="radio" name="mkt-${esc(key)}" data-mkt-pick="${esc(key)}" value="${r.fundId}"${pick === r.fundId ? ' checked' : ''}> ${i + 1}</label></td>
            <td>${esc(r.name)}${r.fundId === curId ? ' <span class="muted small">(הנוכחי)</span>' : ''}</td><td>${pct(r.eq)}</td><td>${Math.round(r.score)}</td>
            <td>${r.jSharpe ?? '-'}</td><td>${r.jY3 != null ? r.jY3 + '%' : '-'}</td><td>${r.feeA ?? '-'}% / ${r.feeD ?? '-'}%</td>
            <td>${same ? 'באותו גוף' : '<b>ניוד</b>'}${r.joinStatus === 'age' ? ' <span class="muted small">(תלוי גיל)</span>' : ''}${r.joinUnverified ? ' <span class="tag-miss">פתיחות לא אומתה</span>' : ''}</td></tr>`;
    }).join('');
    return `<details class="alts market"${pick != null || (per.proposal && per.proposal.type === 'market') ? ' open' : ''}><summary>מסלולים מתאימים מכל השוק - חשיפה בין ${pct(Math.max(0, tgt - mc.band))} ל-${pct(Math.min(100, tgt + mc.band))} (${mc.total} מסלולים מאומתים)</summary>
        ${mc.items.length ? `<div class="alts-scroll"><table class="altstbl"><thead><tr><th>בחירה</th><th>מסלול</th><th>חשיפה</th><th>ציון</th><th>שארפ</th><th>תשואה 3 שנים</th><th>ד"נ צבירה/הפקדה</th><th>מעבר</th></tr></thead><tbody>${rows}</tbody></table></div>
        <div class="small">${pick != null ? `<button type="button" class="linkbtn" data-mkt-clear="${esc(key)}">ביטול הבחירה - חזרה להמלצת המערכת</button>` : 'בחירה בשורה מקבעת את ההחזקה במסלול הזה; שאר ההחזקות מתאזנות כדי לשמור על היעד הכולל.'}</div>`
        : `<div class="muted small">אין מסלולים מאומתים ברצועה זו.</div>`}
        <div class="muted small">${mc.gemel
            ? `ציון: שארפ רשמי 4/9, תשואת 3 שנים 3/9, מדד שירות 2/9 (המשקלים המאושרים בלי הרכיב האקטוארי, שאינו קיים בגמל; אחוזון בתוך המסלולים שברצועה; דמי ניהול לידיעה). <b>פתיחות המסלולים להצטרפות לא אומתה פרטנית</b> - מוצגים מסלולים שגמל-נט מסווג "כלל האוכלוסיה"; לאמת מול הגוף לפני הצעה ללקוח. בסיס חוקי: תקנות העברת כספים בין קופות גמל, ${a.kind === 'hishtalmut' ? 'תקנה 3(א)(4) - השתלמות להשתלמות, ותקנה 9(ג) - מעבירים את החשבון כולו' : a.kind === 'hashkaa' ? 'תקנה 3(א)(11א) - להשקעה להשקעה' : 'תקנה 3(א)(1) - תגמולים לתגמולים'}`
            : 'ציון: 40% שארפ, 30% תשואת 3 שנים, 10% איזון אקטוארי, 20% מדד שירות (אחוזון בתוך המסלולים שברצועה; דמי ניהול אינם בציון - ממוצע רשמי לידיעה). מוצגים רק מסלולים שפתיחותם להצטרפות אומתה מול תקנון/אתר הגוף (8.11.2026). בסיס חוקי: תקנות העברת כספים, תקנה 2(א)(1) - קופה לקצבה לקופה לקצבה'}${mc.missing ? `; ${mc.missing} מסלולים ברצועה הוחרגו בגלל נתון חסר בציון` : ''}.</div>
    </details>`;
}

// מה חוסם יעד מחוץ לטווח - בשפה פשוטה, עם שמות ההחזקות
function blockersText(plan) {
    const B = plan && plan.blockers; if (!B || !view) return '';
    const nameOf = (key) => { const h = key && view.holdings.find(x => trackKeyOf(x.account.account, x.track) === key); return h ? `${h.track.name} (${h.account.plan || ''})` : 'החזקה שאינה משתתפת'; };
    const parts = [];
    for (const f of B.frozen) parts.push(`${nameOf(f.key)} - ${fmt(f.bal)} ₪ בחשיפה ${pct(f.eq)}, לא משתתפת (לא מזוהה, הוחרגה או סומנה "ללא שינוי")`);
    for (const l of B.atLimit) parts.push(`${nameOf(l.key)} - הגיעה לקצה האפשרי (${pct(l.limit)})`);
    if (B.estVal) parts.push(`${fmt(B.estVal)} ₪ בהחזקות עם חשיפה באומדן בלבד (קפואות)`);
    if (B.noBasisVal) parts.push(`${fmt(B.noBasisVal)} ₪ בהחזקות ללא נתון חשיפה`);
    return parts.length ? 'מה חוסם: ' + parts.join('; ') + '.' : '';
}

// סרגל היעד בראש תיק הנכסים: אותו בקר כמו בחלק רמת הסיכון + סיכום ההמלצות
function targetSummaryText() {
    const plan = currentTargetPlan();
    if (plan && plan.status === 'infeasible' && plan.per && plan.per.some(p => p.proposal)) {
        const base = targetSummaryCore(plan);
        return `היעד ${pct(state.targetEq)} מחוץ לטווח האפשרי (${pct(plan.loAll)} - ${pct(plan.hiAll)}). ההמלצות מכוונות לנקודה הקרובה ביותר, ${pct(plan.closestT)}: ${base} ${blockersText(plan)}`;
    }
    if (!plan || plan.status !== 'ok') return plan && plan.status === 'infeasible' ? `היעד מחוץ לטווח שאפשר להשיג (${pct(plan.loAll)} - ${pct(plan.hiAll)}). ${blockersText(plan)}` : plan && plan.status === 'underdetermined' ? 'לא ניתן לקבוע תכנית יחידה - חלק מהתיק ללא בסיס חשיפה.' : 'אין החזקות שמשתתפות ביעד.';
    return targetSummaryCore(plan);
}
function targetSummaryCore(plan) {
    let changes = 0, moved = 0;
    for (const p of plan.per) {
        const pr = p.proposal;
        if (!pr || !['single', 'mix', 'market'].includes(pr.type)) continue;
        changes++;
        const bal = p.h.track.balance || 0;
        moved += pr.type === 'single' || pr.type === 'market' ? bal : pr.high && pr.high.isCurrent ? bal * pr.wLow : pr.low && pr.low.isCurrent ? bal * pr.wHigh : bal;
    }
    return `חשיפה מושגת ${pct(plan.achievedWholeEst)}* · ${changes ? `${changes} ${changes === 1 ? 'שינוי מוצע' : 'שינויים מוצעים'} · כ-${fmt(Math.round(moved / 1000) * 1000)} ₪ משנים מסלול` : 'אין צורך בשינוי'}`;
}
function renderTargetBar() {
    if (!view) return '';
    const cr = confirmedRisk();
    if (!cr) return `<div class="callout note-c target-bar"><b>יעד חשיפה מנייתית:</b> כדי לקבל המלצות לפי יעד, זהו לפחות מסלול אחד (בחירה מתוך הרשימה בהחזקה). ההחזקות המזוהות משתתפות אוטומטית.</div>`;
    const T = state.targetEq ?? Math.round(cr.equity);
    return `<div class="card target-bar">
        <div class="track-line"><span><b>יעד חשיפה מנייתית לכל התיק</b> <span class="muted small">(מסונכרן עם חלק רמת הסיכון)</span></span><b class="eq-target-out">${pct(T)}</b></div>
        <input type="range" min="0" max="100" value="${T}" data-eq-slider aria-label="יעד חשיפה מנייתית">
        <div class="small" data-target-summary>${state.targetEq === null || state.targetEq === undefined ? 'הזיזו את הבקר - ההמלצה לכל החזקה תופיע מתחתיה.' : targetSummaryText()}</div>
        <button type="button" class="linkbtn small" data-goto-acc="risk">לפירוט, להחרגת החזקות ולכיוון הגיאוגרפי - חלק רמת הסיכון ◂</button>
    </div>`;
}
// עדכון חי בזמן גרירה: מחליפים רק את כרטיסי ההמלצה ואת שורות הסיכום, בלי רינדור מלא (שהיה שובר את הגרירה)
function refreshTargetLive() {
    document.querySelectorAll('.eq-target-out, #eq-target-label').forEach(el => { el.textContent = pct(state.targetEq); });
    document.querySelectorAll('[data-eq-slider], #eq-slider').forEach(el => { if (document.activeElement !== el) el.value = state.targetEq; });
    document.querySelectorAll('[data-target-summary]').forEach(el => { el.textContent = targetSummaryText(); });
    if (!view) return;
    const byKey = new Map(view.holdings.map(h => [trackKeyOf(h.account.account, h.track), h]));
    document.querySelectorAll('[data-tblock]').forEach(el => {
        const h = byKey.get(el.dataset.tblock);
        if (h) el.innerHTML = renderHoldingTarget(h.account, h);
    });
}

function renderAlternatives(a, h) {
    const key = h ? trackKeyOf(a.account, h.track) : a.account + '|';
    const targetBlock = h ? `<div data-tblock="${esc(key)}">${renderHoldingTarget(a, h)}</div>` : '';
    // כשיש הצעה למעבר מלא למסלול אחר - מוצגות קודם החלופות המקבילות למסלול המוצע (רצועת החשיפה של היעד),
    // וההשוואה מול המסלול הנוכחי מקופלת מתחתיה
    let targetAlts = '';
    if (h && state.targetEq !== null && state.targetEq !== undefined && state.eligible[key] !== false) {
        const plan = currentTargetPlan();
        const per = plan && plan.per ? plan.per.find(p => p.key === key) : null;
        const pr = per && per.proposal;
        if (pr && pr.type === 'single' && pr.track && pr.track.fundId != null) {
            const m = { officialId: pr.track.fundId, row: pr.track, group: h.match && h.match.group };
            targetAlts = renderAltTable(a, m, `חלופות למסלול המוצע "${esc(pr.track.name)}" (חשיפה ${pct(pr.track.eq)})`, true, true);
        }
    }
    const curAlts = renderAltTable(a, h ? h.match : null, targetAlts ? 'השוואה מול המסלול הנוכחי (לפני היעד)' : null, !targetAlts);
    return targetBlock + targetAlts + curAlts;
}

function renderAltTable(a, match, title, open, isTarget = false) {
    const REF = isTarget ? 'מהמוצע' : 'מהנוכחי';
    const r = alternativesFor(a, match, clientAge());
    const h = { match };
    const targetBlock = '';
    const openAttr = open ? ' open' : '';
    const kind = a.kind === 'menahalim' ? 'מסלולי ביטוח - השוואת מדדי מסלול' : KIND_LABEL[a.kind] || 'המוצר';
    if (!r.bucket) return `${targetBlock}<div class="alts small">חלופות להשוואה (${kind}): חסר זיהוי רשמי או נתון חשיפה. לא ניתן לאמת קבוצת השוואה; אין להסיק שאין חלופות.</div>`;
    const peers = r.comparisons || [];
    if (!peers.length) return `${targetBlock}<details class="alts"${openAttr}><summary>${title || `חלופות להשוואה (${kind})`}</summary><div class="small">${r.reason === 'unsupported_product' ? 'לסוג המוצר הזה טרם הוגדר מאגר השוואה מאומת.' : 'לא נמצאו במאגר מסלולים אחרים מאותו סוג מוצר, מנדט מעקב ורצועת חשיפה. אין להסיק שאין חלופות בשוק.'} נתון חסר אינו אפס.</div></details>`;
    const pensia = a.kind === 'pensia';
    const labels = { higher:'גבוה '+REF, equal:'זהה '+(isTarget?'למוצע':'לנוכחי'), lower:'נמוך '+REF, unranked:'לא ניתן לדרג מול '+(isTarget?'המוצע':'הנוכחי') };
    const componentLabels = {sharpe:'שארפ',return:'תשואה',service:'שירות'};
    const value = (v, suffix='') => v == null ? 'חסר' : esc(String(v)) + suffix;
    const topRanked = peers.find(x=>x.rankComplete) || null;
    const official = pensia ? OFFICIAL_PENSION[h.match.officialId] : a.kind === 'menahalim' ? OFFICIAL_INSURANCE[h.match.officialId] : OFFICIAL_GEMEL[h.match.officialId];
    const current = {...official,...r.currentScored,name:h.match.row.name,fundId:h.match.officialId};
    const row = (x, isCurrent=false) => {
        const jd = pensia ? (window.JUNE26 || {})[x.fundId] : null;
        const act = jd ? (window.ACT36M || {})[jd.p]?.v : null;
        const srv = pensia ? jd ? (window.SERVICE25 || {})[jd.p]?.v : null : x.srv;
        const score = isCurrent ? r.curScore : x.score;
        const partial = !pensia && x.partialScore;
        const missing = (x.missingComponents || []).map(k=>componentLabels[k]).join(', ');
        const status = isCurrent ? (isTarget ? 'המסלול המוצע' : 'המסלול הקיים') : labels[x.relation];
        const join = isCurrent ? '' : x.joinVerified ? 'הצטרפות אומתה במקור הקיים' : 'להשוואה בלבד: הצטרפות לא אומתה';
        return `<tr${isCurrent ? ' class="top"' : x===topRanked ? ' class="lead"' : ''}><td><b>${esc(x.name)}</b><div class="muted small">מזהה ${x.fundId}${isCurrent?(isTarget?' · מוצע':' · נוכחי'):''}</div><div class="small">${status}</div>
            <details class="alts-row-details"><summary>רכיבים והצטרפות</summary><div class="small">${pensia?'נתוני המסלול העדכניים 09/2026: שארפ '+value(x.sharpe)+', תשואה 3 שנים '+value(x.y3,'%')+'<br>':''}שירות 2025: ${value(srv)}${r.serviceProxy?' · מדד גמל של החברה כקירוב להשתלמות':''}${pensia ? '<br>איזון אקטוארי: '+value(act==null?null:Number(act.toFixed(2)), '%') : ''}<br>נכסי חו"ל (כל הנכסים, לא רק מניות): ${value(x.fo,'%')} · חשיפה למט"ח (שונה מנכסי חו"ל בשל גידור): ${value(x.fx,'%')}${join?'<br>':''}${join}${score==null?'<br>אין בסיס מלא לציון':''}${partial?'<br>ציון חלקי. חסר: '+missing+'. אין להשוות לציון המבוסס על רכיבים אחרים.':''}</div></details></td>
            <td>${score==null?'לא דורג':score.toFixed(1)}${partial && score!=null?'<div class="small partial-score">חלקי · חסר '+missing+'</div>':''}</td>
            <td>${value(pensia?jd?.s:x.sharpe)}</td><td>${value(pensia?jd?.y:x.y3,'%')}</td><td>${value(x.eq,'%')}</td>
            <td><div>צבירה ${value(x.feeA,'%')}</div><div>הפקדה ${value(x.feeD,'%')}</div></td></tr>`;
    };
    const neutral = r.neutralComponents?.length ? ' כשברכיב יש רק גוף/קרן אחד, אחוזון 50 הוא קבוע ניטרלי בלבד ואינו מעיד על איכות או על שוויון.' : '';
    const method = pensia
        ? `40% שארפ, 30% תשואה 3 שנים, 20% שירות ו-10% איזון אקטוארי. שארפ, תשואה ואקטוארי: ${r.window || window.SCORING_WINDOW}; שירות: 2025. הציון יחסי לקבוצת המסלולים הזכאים בעלי הנתונים המלאים. חסר באחד מרכיבי הדירוג מונע ציון.`
        : `יחס משקלים 40 שארפ, 30 תשואה 3 שנים, 20 שירות, מנורמל ל-100% ללא אקטוארי (44.44%, 33.33%, 22.22%). שארפ ותשואה: ${r.window}; שירות: מדד 2025 ברמת החברה${r.serviceProxy?' - מדד גמל של אותה חברה משמש קירוב להשתלמות':''}. הציון הוא אחוזון משוקלל יחסי באותו סוג מוצר, סיווג רשמי, מנדט ורצועת חשיפה; אינו בר השוואה בין טבלאות.${a.kind==='menahalim'?' בביטוח-נט הרשות משווה בין פוליסות מקבילות או דומות ומסווגת לפי תקופת הנפקת הפוליסה. באתר קבוצת ההשוואה מסוננת בנוסף לפי מנדט (כללי / עוקב מדד וכדומה) ורצועת חשיפה מנייתית בסובלנות 20 נקודות אחוז. זהו מסנן נוסף של האתר, לא הגדרה של הרשות, והרשות אינה מאשרת את הציון או את הסף. הצטרפות למוצרי ביטוח טרם אומתה מול מקור רשמי ולכן לא מוצגת הצעת חלופה להעברה, ההשוואה היא במדדי המסלול בלבד.':''} השירות מדורג בין חברות נפרדות, לא בין מסלולים. נתון חסר אינו אפס: משקליו אינם נכללים, הציון מסומן כחלקי. ציונים המבוססים על רכיבים שונים אינם בני השוואה, ולא מוצג יתרון מול הנוכחי כשבסיס הרכיבים שונה. ציונים מלאים מוצגים לפני חלקיים; הדמיית מעבר דורשת ציון מלא וגבוה יותר ואימות הצטרפות נפרד.`;
    return `${targetBlock}<details class="alts"${openAttr}><summary>${title ? `${title} · ${peers.length} מתוך ${r.comparisonCount}` : `חלופות להשוואה · ${peers.length} מתוך ${r.comparisonCount} מסלולים מקבילים (${kind})`}</summary>
        <div class="small">השוואה, לא המלצה להעברה. ציון יחסי 0–100 · נתון חסר אינו אפס${r.serviceProxy?' · שירות: מדד גמל כקירוב להשתלמות':''}.</div>
        <div class="alts-scroll"><table class="altstbl"><thead><tr><th>מסלול ומצב</th><th>ציון</th><th>שארפ<br>${pensia?'06/2026':'09/2026'}</th><th>תשואה 3 שנים<br>עד ${pensia?'06/2026':'09/2026'}</th><th>חשיפה<br>09/2026</th><th>דמי ניהול*<br>09/2026</th></tr></thead><tbody><tr class="alts-sect alts-sect-cur"><td colspan="6">${isTarget ? 'המסלול המוצע' : 'המסלול הנוכחי'}</td></tr>${row(current,true)}<tr class="alts-sect alts-sect-peers"><td colspan="6">מסלולים נוספים להשוואה</td></tr>${peers.map(x=>row(x)).join('')}</tbody></table></div>
        <div class="alts-scroll-hint">◂ גוללים את הטבלה הצידה ▸</div>
        <details class="alts-how"><summary>שיטת הציון, מקורות ומגבלות</summary><div class="muted small">${method}${neutral}<br>נתוני חשיפה ודמי ניהול: מאגרי האוצר 09/2026. דמי הניהול בטבלה הם ממוצעים רשמיים שנתיים, אינם הצעה אישית ואינם בציון. במסלקה: מצבירה ${value(a.feeAcc,'%')}, מהפקדה ${value(a.feeDeposit,'%')} (דיווח חודש המסלקה, אינו שיעור שנתי).<br>הצטרפות נבדקת בנפרד מהציון. אימותי המקור נבדקו 08/11/2026 ואינם אימות בזמן אמת; בביטוחי מנהלים אין להסיק פתיחות מנתוני גמל/פנסיה. אין שינוי אוטומטי של מסלול, כיסויים או זכויות. אין להשוות שארפ רשמי לשארפ המחושב בכלי.</div></details></details>`;
}

// שדה בחירה נגלל למסלול ללא קוד: רק זהויות רשמיות של אותה חברה וסוג מוצר (selectorOptionsFor).
// אין בחירה אוטומטית ואין שיוך לפי שם; הבחירה נשמרת עם טביעת אצבע מלאה של ההחזקה.
function renderManualSelector(a, t, key) {
    if (t.code) return ''; // יש קוד אך לא נמצאה התאמה במאגר - לא פותרים בבחירת שם; נשאר בלתי מזוהה
    const sel = selectorOptionsFor(a, t.baseName || t.name);
    if (sel.status !== 'ok') return `<div class="small"><span class="tag-miss">חסר קוד מסלול, ולא ניתן למפות את שם היצרן/סוג המוצר לחברה אחת במאגר הרשמי - ההחזקה נשארת בלתי מזוהה; בדקו מול דוח החברה.</span></div>`;
    const cur = state.selections && state.selections[key];
    return `<div class="small"><label class="confirmlab">חסר קוד מסלול - בחרו זהות ידנית מתוך המסלולים הרשמיים של אותה חברה וסוג מוצר (אין שיוך אוטומטי לפי שם):<br>
        <select data-select-id="${esc(key)}" size="${Math.min(sel.options.length + 1, 7)}"><option value="">— לא נבחר; ההחזקה אינה מזוהה ואינה בממוצע —</option>${sel.options.map(o => `<option value="${o.id}" ${cur && cur.officialId === o.id ? 'selected' : ''}>${esc(o.name)}${o.eq !== null ? ` · חשיפה ${o.eq}%` : ''}${o.nameMatch ? ' · התאמת שם מדויקה (לא נבחר אוטומטית)' : ''}</option>`).join('')}</select></label></div>`;
}

function renderPortfolio() {
    if (!view) return '';
    const p = state.portfolio;
    return `
        <div class="group-label">תיק הנכסים</div>
        ${renderTargetBar()}
        <h2>${esc(p.clientName || 'הלקוח')} - ${fmt(view.totalValue)} ₪${view.rejectedImports && view.rejectedImports.length ? ` <span class="tag-miss">⚠ יבוא חלקי - יש חשבונות שנדחו; הסכום המוצג אינו מלוא התיק</span>` : ''}</h2>
        ${visibleAccounts(p).map((a, i) => `<div class="card acct">
            <div class="card-head">
                <div><b>${esc(a.plan || 'מוצר ללא שם')}</b> · ${esc(a.yatzran)}</div>
                <div class="muted small">${KIND_LABEL[a.kind]} · חשבון ${esc(a.account)} · סטטוס ${esc(a.status)}${a.nechonut ? ` · נכון ל-${a.nechonut.replace(/(\d{4})(\d{2})(\d{2})/, '$3/$2/$1')}` : ''}</div>
            </div>
            ${a.tracks.filter(t => (t.balance || 0) >= 1).map((t) => {
                const h = view.holdings.find(x => x.track === t);
                const key = trackKeyOf(a.account, t);
                return `<div class="track">
                    <div class="track-line"><span>${esc(t.name)}${t.code ? `<span class="muted small"> (קוד מסלול רשמי: ${esc(t.code)})</span>` : ''}</span><b>${fmt(t.balance)} ₪</b></div>
                    ${h && h.equityPct !== null ? `
                        <div class="eqbar"><div class="eqbar-eq" style="width:${Math.min(100, Math.max(0, h.equityPct))}%"></div></div>
                        <div class="muted small">חשיפה מנייתית ${pct(h.equityPct)} · ${h.override ? overrideLabel(h.override) : matchLabel(h.match)}</div>
                        ${(() => { const foV = h.match.officialId != null ? (OFFICIAL_PENSION[h.match.officialId]?.fo ?? OFFICIAL_GEMEL[h.match.officialId]?.fo ?? OFFICIAL_INSURANCE[h.match.officialId]?.fo ?? null) : (confirmedOk(key, h.match) && h.match.row ? (h.match.row.fo ?? null) : null);
                            const offRow = h.match.officialId != null ? (OFFICIAL_PENSION[h.match.officialId] ?? OFFICIAL_GEMEL[h.match.officialId] ?? OFFICIAL_INSURANCE[h.match.officialId] ?? null) : (confirmedOk(key, h.match) && h.match.row ? h.match.row : null);
                            const offName = (offRow && offRow.name) || t.name;
                            const geo = equityGeoOf(offName);
                            const geoTxt = geo.cls === 'unclassified' ? 'אפיק המניות: לא מסווג גיאוגרפית (אין שדה רשמי לחלוקת מניות ארץ/חו"ל; המנדט בשם המסלול אינו מציין כיוון)' : `אפיק המניות לפי מנדט בשם המסלול בלבד: ${GEO_LABEL[geo.cls]}* (${geo.basis})`;
                            return `${foV !== null && foV !== undefined ? `<div class="muted small">נכסי חו"ל (כל הנכסים, לא רק מניות): ${pct(foV)} · לפי ${REF_DATE}, אינו ערובה להרכב עתידי. חלוקת המניות ארץ/חו"ל אינה שדה במאגר הרשמי - לא מוצג נתון מקומי מחושב כמשלים, ולא גבולות מחושבים משדות החשיפה (חשיפת דלתא/look-through אינה מתחלקת כך).</div>` : ''}<div class="muted small">${geoTxt}</div>`; })()}
                        ${(h.match.officialId || h.override) && !state.excluded[key]
                            ? `<div class="small"><span class="tag-ok">נכלל בממוצע הסיכון (${h.override ? overrideSourceTag(h.override) : 'זוהה לפי קוד רשמי'})</span> <button type="button" class="mini" data-exclude="${esc(key)}">הסרה מהממוצע</button></div>`
                            : (h.match.officialId || h.override) && state.excluded[key]
                                ? `<div class="small"><span class="tag-miss">הוצא ידנית מממוצע הסיכון</span> <button type="button" class="mini" data-include="${esc(key)}">החזרה לממוצע</button></div>`
                                : h.match.userSelected
                                    ? `<div class="small"><span class="tag-ok">זהות נבחרה ידנית - נכללת בממוצע הסיכון</span> <button type="button" class="mini" data-select-clear="${esc(key)}">ביטול הבחירה הידנית</button></div>`
                                    : ``}`
                    : h && h.estimate
                        ? `<div class="muted small">${matchLabel(h.match)} חשיפה מנייתית <b>${pct(h.estimate.eq)}</b>* <span class="tag-miss">אומדן מבוסס נתוני מחלקה רשמיים - לא נתון שנצפה בהחזקה זו</span> · ${esc(h.estimate.basis)} · טווח המחלקה ${pct(h.estimate.lo)}-${pct(h.estimate.hi)} (טווח בפועל, אינו גבול מובטח למסלול זה) · נכסי חו"ל (כל הנכסים, לא רק מניות) ${h.estimate.fo !== null ? pct(h.estimate.fo) + '*' : '—'} · ${(() => { const g = equityGeoOf((h.match && h.match.row && h.match.row.name) || t.name); return g.cls === 'unclassified' ? 'אפיק המניות: לא מסווג גיאוגרפית (אין שדה רשמי)' : `אפיק המניות לפי מנדט בשם בלבד: ${GEO_LABEL[g.cls]}* (${g.basis})`; })()} · <span class="tag-miss">לא נכלל בממוצע המדויק</span></div>${renderManualSelector(a, t, key)}`
                        : `<div class="muted small">${h ? matchLabel(h.match) : ''} <span class="tag-miss">לא נכלל בממוצע הסיכון - אין נתון חשיפה ולא בסיס להערכה, והחשיפה אינה ידועה</span></div>${renderManualSelector(a, t, key)}`}
                    ${renderAlternatives(a, h)}
                </div>`;
            }).join('')}
            ${a.tracks.length === 0 ? `<div class="muted small">בדיווח האחרון אין בחשבון יתרה פעילה במסלולים (0 ₪), ולכן החשבון אינו משוקלל בממוצע החשיפה.${a.prevYearEnd ? ` יתרת סוף השנה הקודמת בחשבון זה (ערך היסטורי בלבד, ייתכן שהכסף הועבר למוצר אחר): ${fmt(a.prevYearEnd)} ₪.` : ''} נתוני החשיפה של המסלולים עצמם קיימים במאגרים הרשמיים, אך אין משקל נוכחי לייחס להם.</div>` : ''}
            <div class="muted small">
                ${a.feeDeposit !== null ? `דמי ניהול מהפקדה בחודש הדיווח: ${a.feeDeposit}% · ` : ''}
                ${a.feeAcc !== null ? `מהצבירה: ${a.feeAcc}% (שיעור באחוזים כפי שדווח עבור חודש הדיווח; אינו שיעור שנתי) · ` : ''}
                ${a.tsuaNeto !== null ? `תשואה נטו מדווחת: ${a.tsuaNeto}%` : ''}
                ${a.severanceBalance !== null ? ` · יתרת פיצויים ללא התחשבנות: ${fmt(a.severanceBalance)} ₪` : ''}
            </div>
            ${a.forecast ? `<div class="note small">
                תחזית הגוף המנהל לגיל ${a.forecast.age} (כוללת את כספי הפיצויים שבקרן; אינה חישוב של המערכת):
                ${a.forecast.pensionWithout !== null ? `<div>בלי הפקדות נוספות: קצבה ${fmt(a.forecast.pensionWithout)} ₪ מתוך צבירה ${a.forecast.savingsWithout !== null ? fmt(a.forecast.savingsWithout) : '—'} ₪.</div>` : ''}
                ${a.forecast.pensionWith !== null ? `<div>עם המשך הפקדות: קצבה ${fmt(a.forecast.pensionWith)} ₪ מתוך צבירה ${a.forecast.savingsWith !== null ? fmt(a.forecast.savingsWith) : '—'} ₪.</div>` : ''}
                ${a.forecast.assumedYield !== null ? `<div>תשואה משוערת בתחזית: ${a.forecast.assumedYield}%.</div>` : ''}
            </div>` : ''}
            ${a.covers.map(c => {
                const toD = c.to ? `${c.to.slice(6, 8)}/${c.to.slice(4, 6)}/${c.to.slice(0, 4)}` : '';
                const ended = c.to && a.nechonut ? c.to <= a.nechonut : false;
                return `<div class="muted small">כיסוי ביטוחי: ${esc(c.desc)}${c.sum ? ` · סכום ביטוח ${fmt(c.sum)} ₪` : ''}${c.cost ? ` · עלות ${c.cost} ₪/חודש` : ''}${c.to ? ` · תקופה מדווחת עד ${toD}${ended ? ' (התקופה המדווחת הסתיימה; המצב הנוכחי לא ידוע מהקובץ)' : ''}` : ''}</div>`;
            }).join('')}
        </div>`).join('')}
        ${(view.unmatchedTracks.length || (view.rejectedImports && view.rejectedImports.length)) ? (() => {
            const estT = view.holdings.filter(h => h.equityPct === null && h.estimate);
            const noneT = view.holdings.filter(h => h.equityPct === null && !h.estimate);
            const estVal = estT.reduce((s, h) => s + h.track.balance, 0);
            return `<div class="callout note-c"><b>כיסוי החשיפה.</b> ${pct(view.coverage * 100)} משווי התיק עם נתון חשיפה מתועד${view.rejectedImports && view.rejectedImports.length ? ` · ${view.rejectedImports.length} ${view.rejectedImports.length === 1 ? 'חשבון נדחה' : 'חשבונות נדחו'} מהייבוא עקב רשומות מתנגשות - אינם בצבירה ובכיסוי (פירוט הגרסאות בחלק 1); אין להתייחס לסכום המוצג כמלוא התיק` : ''} (רשמי / מקור לא-רשמי מסומן)${estVal ? `; ${pct(estVal / view.totalValue * 100)} הערכת מחלקה עם בסיס מצוין (מסומנת * במסלול) - אומדן, לא נתון שנצפה בהחזקה` : ''}${noneT.length ? `. ללא נתון וללא בסיס להערכה: ${noneT.map(h => `${esc(h.track.name)} (${esc(h.account.plan)}, ${fmt(h.track.balance)} ₪)`).join('; ')} - חשיפתם אינה ידועה ואינה נספרת כאפס בממוצע` : ''}.</div>`;
        })() : ''}
    `;
}

// תיוג כיוון גיאוגרפי של מסלול מוצע (רק כשיש בסיס-מנדט בשם; 'לא מסווג' אינו מתויג).
function geoTagOf(track) {
    return track && track.geo && track.geo.cls !== 'unclassified' ? ` <span class="muted small">[אפיק מניות: ${GEO_LABEL[track.geo.cls]}* - לפי המנדט בשם בלבד]</span>` : '';
}

// חלוקת משקלי ההצעה לפי סיווג-מנדט בלבד (שם/קטגוריה - לא נתון נצפה): המשקלים מדויקים, אך אין מספר לחשיפה גיאוגרפית בפועל.
function geoMixHtml(gm) {
    if (!gm) return '';
    const f = gm.foreign * 100, l = gm.local * 100, u = gm.unclassified * 100;
    const parts = [];
    if (f > 0.05) parts.push(`${pct(f)} מסווגים 'מניות חו"ל'*`);
    if (l > 0.05) parts.push(`${pct(l)} מסווגים "שוק מקומי"*`);
    if (u > 0.05) parts.push(`${pct(u)} לא מסווגים גיאוגרפית`);
    if (!parts.length) return '';
    return `<div class="muted small">חלוקת משקלי ההצעה לפי סיווג-מנדט (שם/קטגוריה בלבד - לא נתון נצפה): ${parts.join(' · ')}. אין שדה רשמי לחלוקת מניות ארץ/חו"ל, ולחלק הלא-מסווג אין בסיס לייחס כיוון גיאוגרפי.</div>`;
}
function geoUnmetHtml(pr) {
    return pr && pr.geoUnmet ? ` <span class="tag-miss">הכיוון "${GEO_LABEL[state.geoPref] || ''}" אינו מקויים בבסיס נתון: אין בהצעה רכיב מסווג-מנדט בכיוון המועדף, ולכן היא אינה מבטיחה שינוי מדיד בחלוקה הגיאוגרפית</span>` : '';
}

// הצגת הצעת יעד להחזקה בודדת (מסלול בודד או שילוב סינתטי בתוך אותה קרן).
// לשילוב אין ציון/שארפ משוקלל: מוצגים נתוני הרכיבים הרשמיים בלבד, עם הסבר מפורש.
export function renderTargetProposal(p) { // export: QA בלבד - הזרקת מצב קצה סינתטי לצילום (qa-cap)
    const name = esc(p.h.track.name);
    const acct = esc(p.h.account.plan || '');
    if (p.note) return `<div class="track-line"><span>${name} <span class="muted small">(${acct})</span></span><b>${pct(p.curEq)}</b></div><div class="muted small">${p.note}</div>`;
    const pr = p.proposal;
    if (!pr || pr.type === 'stay') {
        const capNote = pr && pr.cappedAt ? ` <span class="tag-miss">חלק היעד שהוקצה להחזקה זו (${pct(p.targetEq)}) ${pr.cappedAt === 'max' ? 'מעל' : 'מתחת'} לטווח המסלולים המאומתים בקרן/קופה (${pct(pr.rangeLo)}-${pct(pr.rangeHi)}). ההחזקה נשארת במסלול הנוכחי בחשיפתה בפועל (${pct(p.curEq)}), והיעד המוקצה אינו מושג - הפער משתקף בסיכום התכנית.</span>` : '';
        const stayTxt = pr && pr.topIsCurrent ? (pr.picked ? 'נבחר המסלול הנוכחי - נשאר.' : 'נשאר במסלול הנוכחי - הוא המדורג ראשון בשוק ברצועת היעד של ההחזקה.') : capNote ? 'נשאר במסלול הנוכחי - לא בגלל שהיעד הושג, אלא כי אין מסלול מאומת מתאים מעבר לטווח.' : 'נשאר במסלול הנוכחי - החשיפה הקיימת כבר עומדת בחלק היעד שהוקצה להחזקה זו.';
        return `<div class="track-line"><span>${name} <span class="muted small">(${acct})</span></span><b>${pct(p.curEq)}</b></div><div class="muted small">${stayTxt}${capNote}</div>`;
    }
    if (pr.type === 'unverified_fund' || pr.type === 'unavailable') return `<div class="track-line"><span>${name} <span class="muted small">(${acct})</span></span><b>${pct(p.curEq)}</b></div><div class="muted small">${esc(pr.reason)} ההחזקה נשארת כפי שהיא.</div>`;
    if (pr.type === 'market') {
        const t = pr.track;
        return `<div class="track-line"><span>${name} <span class="muted small">(${acct})</span></span><b>${pct(p.curEq)} ← ${pct(pr.achieved)}</b></div>
            <div class="small">${pr.picked ? 'נבחר ידנית' : 'המסלול המדורג ראשון בשוק ליעד ההחזקה'}: "<b>${esc(t.name)}</b>"${t.parentCoName ? ` (${esc(t.parentCoName)})` : ''}, חשיפה ${pct(t.eq)} - ${pr.sameCompany ? 'באותו גוף, בלי ניוד בין גופים' : '<b>ניוד לגוף אחר</b>'}.${t.joinUnverified ? ' <span class="tag-miss">פתיחות להצטרפות לא אומתה - לאמת מול הגוף</span>' : ''}${p.kind === 'hishtalmut' && !pr.sameCompany ? ' <span class="muted small">(השתלמות: מעבירים את החשבון כולו - תקנה 9(ג))</span>' : ''}</div>
            ${pr.sameCompany ? '' : `<div class="muted small">לפני ניוד בין גופים: לבדוק רציפות כיסוי ביטוחי (נכות ושאירים), תקופת אכשרה והחרגות מצב רפואי קודם בגוף הקולט, דמי הניהול שיוצעו בפועל, ועיתוי הניוד מול הפקדות שוטפות.</div>`}`;
    }
    if (pr.type === 'single' && pr.singleOnly) {
        return `<div class="track-line"><span>${name} <span class="muted small">(${acct})</span></span><b>${pct(p.curEq)} ← ${pct(pr.achieved)}</b></div>
            <div class="small">מעבר מלא למסלול "<b>${esc(pr.track.name)}</b>" באותה קופה (חשיפה ${pct(pr.track.eq)}, שארפ רשמי ${pr.track.sharpe ?? '-'}, תשואה 3 שנים ${pr.track.y3 ?? '-'}%) - המסלול הקרוב ביותר ליעד ההחזקה (${pct(p.targetEq)}).${pr.cappedAt ? ` <span class="tag-miss">זה הקצה האפשרי בקופה (${pct(pr.rangeLo)}-${pct(pr.rangeHi)})</span>` : ''}</div>
            <div class="muted small">מוצע מעבר מלא בלבד: שילוב של שני מסלולים בקופה הזו טרם אומת מול התקנון.${p.kind === 'hishtalmut' ? ' בקרן השתלמות אסור להעביר חלק מהכספים לחשבון או לקרן אחרת (תקנות העברת כספים, תקנה 9(ג)).' : ''}</div>`;
    }
    if (pr.type === 'single') {
        const cap = pr.cappedAt === 'max' ? ` <span class="tag-miss">היעד מעל טווח הקרן (${pct(pr.rangeLo)}-${pct(pr.rangeHi)}) - מוצג המקסימום הזמין</span>` : pr.cappedAt === 'min' ? ` <span class="tag-miss">היעד מתחת לטווח הקרן (${pct(pr.rangeLo)}-${pct(pr.rangeHi)}) - מוצג המינימום הזמין</span>` : '';
        return `<div class="track-line"><span>${name} <span class="muted small">(${acct})</span></span><b>${pct(p.curEq)} ← ${pct(pr.achieved)}</b></div>
            <div class="small">מעבר מלא למסלול "<b>${esc(pr.track.name)}</b>"${geoTagOf(pr.track)} (חשיפה ${pct(pr.track.eq)}, שארפ רשמי ${pr.track.sharpe ?? '-'}, תשואה 3 שנים ${pr.track.y3 ?? '-'}%, ד"נ ממוצע ${pr.track.feeA ?? '-'}%/${pr.track.feeD ?? '-'}%).${cap}${geoUnmetHtml(pr)}</div>${geoMixHtml(pr.geoMix)}${pr.geoNote ? `<div class="muted small">${esc(pr.geoNote)}</div>` : ''}`;
    }
    // mix
    const wh = Math.round(pr.wHigh * 1000) / 10, wl = Math.round(pr.wLow * 1000) / 10;
    return `<div class="track-line"><span>${name} <span class="muted small">(${acct})</span></span><b>${pct(p.curEq)} ← ${pct(pr.achieved)}</b></div>
        <div class="small">שילוב בתוך ${esc(pr.low.parentCoName || (pr.takanon && pr.takanon.fund) || 'אותה קרן/קופה')} (אותה קרן/קופה, בלי ניוד): <b>${wh}%</b> ל"${esc(pr.high.name)}"${pr.high.isCurrent ? ' (המסלול הנוכחי - נשאר)' : ''}${geoTagOf(pr.high)} (${pct(pr.high.eq)}) + <b>${wl}%</b> ל"${esc(pr.low.name)}"${pr.low.isCurrent ? ' (המסלול הנוכחי - נשאר)' : ''}${geoTagOf(pr.low)} (${pct(pr.low.eq)}) ← חשיפה מושגת <b>${pct(pr.achieved)}</b> (חשבון מדויק על נתוני ${REF_DATE} הרשמיים).${geoUnmetHtml(pr)}</div>
        ${geoMixHtml(pr.geoMix)}${pr.geoNote ? `<div class="muted small">${esc(pr.geoNote)}</div>` : ''}
        <div class="muted small">נתוני רכיבים רשמיים: "${esc(pr.high.name)}" - שארפ ${pr.high.sharpe ?? '-'}, תשואה 3 שנים ${pr.high.y3 ?? '-'}% · "${esc(pr.low.name)}" - שארפ ${pr.low.sharpe ?? '-'}, תשואה 3 שנים ${pr.low.y3 ?? '-'}%. אין לחשב "שארפ של השילוב" כממוצע משוקלל של שארפ הרכיבים - שילוב מסלולים משנה את פרופיל הסיכון הכולל, והמדד המשולב אינו ממוצע המדדים. בסיס רגולטורי להחזקה בשני מסלולים במקביל: ${esc(pr.takanon.clause)} (<a href="${esc(pr.takanon.src)}" target="_blank" rel="noopener">מקור</a>).${pr.ageClause ? ` בחירת מסלול טווח-גיל שאינו תואם את גיל העמית: ${esc(pr.ageClause)}.` : ''}</div>`;
}

// בקר היעד הכולל בסעיף רמת הסיכון: בחירת המוצרים לשינוי (ברירת מחדל: ללא שינוי), טווח בר-השגה, והצעות מימוש.
function renderTargetController() {
    if (!view) return '';
    const inc = includedHoldings();
    if (!inc.length) return '';
    const unident = view.holdings.filter(h => h.equityPct === null);
    const estH = unident.filter(h => h.estimate);
    const estVal = estH.reduce((s, h) => s + h.track.balance, 0);
    const estEq = estH.reduce((s, h) => s + h.track.balance * h.estimate.eq, 0);
    const noBasisVal = unident.filter(h => !h.estimate).reduce((s, h) => s + h.track.balance, 0);
    const incVal = inc.reduce((s, x) => s + x.bal, 0);
    const T = state.targetEq;
    const plan = currentTargetPlan();
    let estLine = '';
    if (estH.length) {
        const combinedVal = incVal + estVal;
        const combinedEq = (inc.reduce((s, x) => s + x.bal * x.eq, 0) + estEq) / combinedVal;
        const clsVal = c => inc.filter(x => x.cls === c).reduce((sum, x) => sum + x.bal, 0);
        const srcParts = [['official', 'נתון רשמי לזהות מאומתת'], ['confirmed', 'שורה רשמית לזהות שאושרה ידנית'], ['web', 'מקור לא-רשמי מסומן']].filter(([c]) => clsVal(c) > 0).map(([c, label]) => `${pct(clsVal(c) / view.totalValue * 100)} ${label}`);
        estLine = `<div class="muted small">כיסוי עם אומדנים מסומנים (*): ${pct(combinedEq)} מניות על ${fmt(combinedVal)} ₪ (${pct(combinedVal / view.totalValue * 100)} מהתיק) = ${srcParts.length ? srcParts.join(' + ') + ' + ' : ''}${pct(estVal / view.totalValue * 100)} אומדן מחלקה מבוסס-מקור מסומן בכוכבית. ${noBasisVal > 0 ? `${pct(noBasisVal / view.totalValue * 100)} (${fmt(noBasisVal)} ₪) ללא כל בסיס - אינו נספר כאפס. ` : ''}${noBasisVal > 0 ? 'בתרחיש היפותטי חסום שבו הללא-ידוע הוא 0%-100% מניות (להמחשה בלבד - אינו גבול מתמטי; חשיפה ממונפת עלולה לחרוג מ-100%)' : 'בתרחיש שבו האומדנים בקצוות טווח המחלקה שלהם (תרחיש היפותטי להמחשה בלבד)'}, החשיפה בכל התיק נעה בין ${pct((inc.reduce((s2, x) => s2 + x.bal * x.eq, 0) + estH.reduce((s2, h) => s2 + h.track.balance * h.estimate.lo, 0)) / view.totalValue)} ל-${pct((inc.reduce((s2, x) => s2 + x.bal * x.eq, 0) + estH.reduce((s2, h) => s2 + h.track.balance * h.estimate.hi, 0) + 100 * noBasisVal) / view.totalValue)}.</div>`;
    }
    const cbList = inc.filter(x => !x.excludedFromAvg).map(x => {
        const h = x.h;
        return `<label class="confirmlab"><input type="checkbox" data-eligible="${esc(x.key)}" ${state.eligible[x.key] !== false ? 'checked' : ''}> ${esc(h.track.name)} <span class="muted small">(${esc(h.account.plan || '')}, ${esc(h.account.yatzran || '')})</span> - ${pct(x.eq)} מניות · ${fmt(x.bal)} ₪</label>`;
    }).join('');
    const unidentNote = unident.length ? `<div class="muted small">${unident.length} מסלולים ללא נתון חשיפה מדויק (${fmt(unident.reduce((s, h) => s + h.track.balance, 0))} ₪) אינם ניתנים לבחירה: ${estH.length ? 'לחלקם מוצג אומדן מחלקה מסומן בכוכבית בתיק הנכסים, אך אומדן אינו בסיס לתכנון מעבר מדויק. ' : ''}אין לראות בחשיפתם אפס.</div>` : '';
    let planHtml = '';
    if (plan && plan.status === 'underdetermined') {
        planHtml = `<div class="callout note-c"><b>לא ניתן לקבוע תכנית יחידה ליעד ${pct(T)}.</b> בתיק ${fmt(plan.noBasisVal)} ₪ ללא כל בסיס לחשיפה, והמערכת אינה מניחה עבורם מספר. התכנית תלויה בחלק זה (תרחיש היפותטי חסום 0%-100%, אינו גבול מתמטי - חשיפה ממונפת עלולה לחרוג): אם הוא 0% מניות - על ההחזקות הנבחרות להגיע ל-${pct(plan.b0.reqSel)} (טווח זמין בכל התיק ${pct(plan.b0.loAll)}-${pct(plan.b0.hiAll)}); אם הוא 100% - ל-${pct(plan.b100.reqSel)} (טווח ${pct(plan.b100.loAll)}-${pct(plan.b100.hiAll)}). הזינו הנחה מפורשת לחלק הלא-ידוע בשדה שלמטה לקבלת תכנית מותנית, או השלימו זיהוי של אותן החזקות.</div>`;
    } else if (plan && plan.status === 'infeasible' && plan.per && plan.per.some(p => p.proposal)) {
        planHtml = `<div class="callout note-c"><b>היעד ${pct(T)} לכל התיק אינו בר-השגה.</b> הטווח האפשרי: ${pct(plan.loAll)} - ${pct(plan.hiAll)}. ההצעות מתחת מכוונות לנקודה הקרובה ביותר, ${pct(plan.closestT)} (חשיפה מושגת ${pct(plan.achievedWholeEst)}*). ${esc(blockersText(plan))}</div>
            <div class="card">${plan.per.map(p => renderTargetProposal(p)).join('')}<div class="muted small">${SEVERANCE_CAVEAT}</div></div>`;
    } else if (plan && plan.status === 'infeasible') {
        planHtml = `<div class="callout note-c"><b>היעד ${pct(T)} לכל התיק אינו בר-השגה בכלים שנבחרו.</b> הטווח הזמין בכל התיק (אומדנים בערכם המסומן): ${pct(plan.loAll)} - ${pct(plan.hiAll)}. כדי להרחיב את הטווח: סמנו החזקות נוספות, או בדקו חלופות מחוץ לקרנות המוחזקות (מעבר בין גופים - השוואות קיימות בתיק הנכסים, עם השלכות ניוד וזכויות).</div>`;
    } else if (plan && plan.status === 'ok') {
        const anyChange = plan.per.some(p => p.proposal && p.proposal.type !== 'stay');
        const conditionalNote = plan.noBasisVal > 0
            ? `בתיק ${fmt(plan.noBasisVal)} ₪ ללא כל בסיס לחשיפה: לא ניתן להציג תוצאה כוללת מוסמכת יחידה. התכנית מותנית בהנחה שהזנתם כי חלק זה הוא ${pct(plan.unknownAssumption)} מניות; ההנחה שלכם אינה נתון ואינה אומדן של המערכת. `
            : '';
        planHtml = `<div class="card">
            <div class="track-line"><span>מימוש היעד בכל התיק</span><b>${pct(plan.achievedWholeEst)}* <span class="muted small">(אומדן כולל${Math.abs(plan.gap) >= 0.05 ? `, פער ${plan.gap > 0 ? '-' : '+'}${pct(Math.abs(plan.gap))}` : ''})</span></b></div>
            <div class="muted small">שיטה: היעד ${pct(T)} חל על כל התיק (${fmt(plan.V)} ₪). ההחזקות שלא נבחרו קפואות; הנבחרות מתכווננות לחשיפת יעד משותפת ${plan.xStar !== null ? pct(plan.xStar) : '-'} בכפוף לטווח הזמין בכל קרן (יישור-פערים מכני ושקוף - לא אופטימיזציה מתמטית של שארפ התיק). החזקות עם אומדן מחלקה נספרות בערך האומדן המסומן (*). ${conditionalNote}אי-ודאות התוצאה הכוללת: ${pct(plan.wholeLo)}-${pct(plan.wholeHi)} (אומדנים בקצוות טווח המחלקה שלהם${plan.noBasisVal > 0 ? ', חלק ללא-בסיס 0%-100%' : ''} - תרחיש היפותטי חסום להמחשה בלבד, אינו גבול מתמטי; חשיפה ממונפת עלולה לחרוג מ-100%). מדד נתונים מאומתים בלבד (ללא אומדנים): החלק הזוהה ${plan.officialOnly ? pct(plan.officialOnly.value / view.totalValue * 100) + ' מהתיק, חשיפה נוכחית ' + pct(plan.officialOnly.eq) : 'אין'}. התמונה לפי ${REF_DATE}; החשיפה בפועל משתנה עם השוק וההפקדות - זו המחשה מותנית, לא התחייבות לחשיפה עתידית ולא הוראת פעולה.</div>
            ${plan.per.map(p => renderTargetProposal(p)).join('')}
            ${anyChange ? `<div class="muted small">${SEVERANCE_CAVEAT}</div>` : ''}
        </div>`;
    }
    return `
        <div class="sliderwrap">
            <div class="small"><b>דרך אילו מוצרים ליישם את היעד?</b> כל ההחזקות המזוהות משתתפות. הסירו סימון כדי להשאיר החזקה ללא שינוי; היעד מתחלק בין המסומנות בלבד. ההמלצה לכל החזקה מוצגת גם בחלק "תיק הנכסים".</div>
            <div class="small" style="margin-top:6px"><b>כיוון גיאוגרפי מועדף לאפיק המניות:</b> <select data-geo-pref>
                <option value="any" ${(state.geoPref || 'any') === 'any' ? 'selected' : ''}>ללא העדפה</option>
                <option value="local" ${state.geoPref === 'local' ? 'selected' : ''}>שוק מקומי (ישראל)</option>
                <option value="foreign" ${state.geoPref === 'foreign' ? 'selected' : ''}>מניות חו"ל</option>
            </select></div>
            <div class="muted small">הסיווג נשען על המנדט בשם המסלול בלבד - אין שדה רשמי לחלוקת מניות ארץ/חו"ל. ברוב המסלולים אין בסיס כזה בשם ('לא מסווג'), ואז ההצעה נשענת על מסלולים לא-מסווגים ומציינת זאת במפורש - היא אינה מבטיחה את הכיוון. מסלולים המסווגים בכיוון ההפוך מודרים מההצעה.</div>
            ${cbList}
            ${unidentNote}
            ${noBasisVal > 0 ? `<label class="confirmlab">הנחת חשיפה מנייתית לחלק ללא-בסיס (%): <input type="number" min="0" max="100" step="1" data-unknown-assump value="${state.unknownAssumption ?? ''}" placeholder="ללא הנחה"> <span class="muted small">הנחה שלכם לצורך תכנית מותנית בלבד; אינה נתון ואינה אומדן של המערכת.</span></label>` : ''}
        </div>
        ${estLine}
        ${planHtml}`;
}

function renderRisk() {
    if (!view) return '';
    const cr = confirmedRisk();
    const curEq = cr ? cr.equity : null;
    // המצב הנוכחי לכל התיק: זוהה בדיוק + אומדני מחלקה מסומנים (*); חלק ללא-בסיס אינו נספר.
    const unidentR = view.holdings.filter(h => h.equityPct === null);
    const estR = unidentR.filter(h => h.estimate);
    const noBasisR = unidentR.filter(h => !h.estimate).reduce((sum, h) => sum + h.track.balance, 0);
    const knownEqSum = (cr ? cr.equity * cr.value : 0) + estR.reduce((sum, h) => sum + h.track.balance * h.estimate.eq, 0);
    const wholeCur = noBasisR === 0 ? knownEqSum / view.totalValue : null;
    const effTarget = state.targetEq ?? (wholeCur !== null ? Math.round(wholeCur) : (curEq !== null ? Math.round(curEq) : 50));
    const shift = wholeCur !== null ? (effTarget - wholeCur) / 100 * view.totalValue : 0;
    let shiftText;
    if (wholeCur === null) shiftText = `חלק מהתיק (${fmt(noBasisR)} ₪) ללא כל בסיס לחשיפה, ולכן פער היעד לכל התיק אינו ניתן לכימות יחיד. הפער בחלק המכוסה (נתונים מאומתים + אומדנים מסומנים): ${pct(knownEqSum / (view.totalValue - noBasisR))} מניות.`;
    else if (Math.abs(shift) < 1000) shiftText = 'היעד קרוב למצב הקיים בכל התיק (כולל אומדנים מסומנים *) - אין מה להזיז.';
    else if (shift > 0) shiftText = `להגדלת החשיפה בכל התיק ל-${pct(effTarget)}: סכום להמחשה - העברת כ-${fmt(shift)} ₪, ממסלולים עם חשיפה נמוכה אל מסלולים מנייתיים יעילים יותר (רשימה למטה). ההמחשה מניחה מעבר ממסלול של 0% מניות למסלול של 100% מניות.`;
    else shiftText = `להקטנת החשיפה בכל התיק ל-${pct(effTarget)}: סכום להמחשה - העברת כ-${fmt(-shift)} ₪, ממסלולים מנייתיים אל מסלולים עם חשיפה נמוכה יותר. ההמחשה מניחה מעבר ממסלול של 100% מניות למסלול של 0% מניות. כלי זה אינו מציע מסלולי הגנה; הוא רק מכמת את הפער.`;
    const shiftSuffix = wholeCur === null ? '' : ` הכימות חל על כל התיק (מצב נוכחי ${pct(wholeCur)}*, כולל אומדנים מסומנים); המימוש בפועל מוגבל לכלים המאומתים ומוצג בבקר שלהלן. ההעברה בפועל תלויה בפער החשיפות בין מסלול המקור ליעד, ועשויה להיות גדולה או קטנה מהסכום המודגם (מסלול ממונף יכול לחרוג מ-100% מניות). זו כימות פער לבחינה, לא הוראת פעולה ולא גבול.`;
    return `
        <div class="group-label">רמת סיכון</div>
        <h2>חשיפה מנייתית משוקללת</h2>
        <div class="muted small">המדד: חשיפה מנייתית משוקללת-יתרות של המסלולים הזוהים בלבד. זה אינו מדד סיכון כולל של התיק (אינו כולל אג"ח, מט"ח, מניות חוץ ומינוף).</div>
        ${curEq !== null && cr ? `
            <div class="bignum">${pct(curEq)}<span class="bignum-sub"> בחלק המותאם</span></div>
            <div class="eqbar big"><div class="eqbar-eq" style="width:${Math.min(100, Math.max(0, curEq))}%"></div></div>
            <div class="muted small">
                החשיפה ${pct(curEq)} היא בתוך החלק הזוהה והנכלל בלבד: ${pct(cr.value / view.totalValue * 100)} משווי התיק (${fmt(cr.value)} ₪ מתוך ${fmt(view.totalValue)} ₪). זו אינה חשיפת התיק כולו.
                ${view.totalValue > cr.value ? ` ${(() => { const unident = view.holdings.filter(h => h.equityPct === null); const estH2 = unident.filter(h => h.estimate); const estVal2 = estH2.reduce((sum, h) => sum + h.track.balance, 0); const noBasis2 = unident.filter(h => !h.estimate).reduce((sum, h) => sum + h.track.balance, 0); const loAll2 = (curEq * cr.value + estH2.reduce((sum, h) => sum + h.track.balance * h.estimate.lo, 0)) / view.totalValue; const hiAll2 = (curEq * cr.value + estH2.reduce((sum, h) => sum + h.track.balance * h.estimate.hi, 0) + 100 * noBasis2) / view.totalValue; return `מיתר התיק: ${estVal2 > 0 ? `${pct(estVal2 / view.totalValue * 100)} (${fmt(estVal2)} ₪) מגובה באומדן מחלקה מסומן בכוכבית (משולב בבקר היעד שלהלן)` : ''}${estVal2 > 0 && noBasis2 > 0 ? ' ו-' : ''}${noBasis2 > 0 ? `${pct(noBasis2 / view.totalValue * 100)} (${fmt(noBasis2)} ₪) ללא כל בסיס לחשיפה` : ''}${estVal2 === 0 && noBasis2 === 0 ? 'אין חלק בלתי מזוהה' : ''}. בתרחיש שבו האומדנים בקצוות טווח המחלקה שלהם${noBasis2 > 0 ? ' והללא-ידוע 0%-100% מניות' : ''} (תרחיש היפותטי חסום להמחשה בלבד - אינו גבול מתמטי; חשיפה ממונפת עלולה לחרוג מ-100%), החשיפה בכל התיק נעה בין ${pct(loAll2)} ל-${pct(hiAll2)}.`; })()}` : ''} החשיפה לפי תמונת ${REF_DATE}.
                <br>מקורות החלק הנכלל: ${[cr.byClass.official ? `${pct(cr.byClass.official / cr.value * 100)} נתון רשמי לזהות מאומתת-קוד (מאגר האוצר ${REF_DATE} או מסמך רשמי של הגוף)` : '', cr.byClass.confirmed ? `${pct(cr.byClass.confirmed / cr.value * 100)} שורה רשמית לזהות שהמשתמש אישר ידנית (התאמה לפי שם בלבד)` : '', cr.byClass.web ? `${pct(cr.byClass.web / cr.value * 100)} נמצא במקור שאינו רשמי, מסומן ככזה במסלול` : '', cr.byClass.estimate ? `${pct(cr.byClass.estimate / cr.value * 100)} הערכת המערכת, לא נתון רשמי - הבסיס מצוין במסלול` : ''].filter(Boolean).join(' · ')}. נתוני החשיפה הם תמונת מצב למועד הפרסום הרשמי (${REF_DATE}) והיתרות נכונות ליום הדיווח במסלקה; אינם ערובה לחשיפה הנוכחית או העתידית בפועל, וההרכב במועד היתרה עשוי להיות שונה.
            </div>
            <div class="sliderwrap">
                <label>יעד חשיפה מנייתית: <b id="eq-target-label">${pct(effTarget)}</b></label>
                <input type="range" min="0" max="100" value="${effTarget}" id="eq-slider">
                <div class="small" id="shift-text">${shiftText}${Math.abs(shift) >= 1000 ? shiftSuffix : ''}</div>
            </div>
            ${renderTargetController()}`
        : `<div class="callout note-c"><b>אין מספיק נתונים.</b> אין עדיין מסלולים הנכללים בממוצע. מסלול שזוהה לפי קוד מסלול רשמי נכלל אוטומטית מגמל-נט, פנסיה-נט או ביטוח-נט (מאגרי הרשות, ${REF_DATE}); התאמה לפי דמיון שם בלבד נכללת רק אחרי אישור ידני; מסלול ללא נתון וללא בסיס להערכה מסומן "לא ידוע" ואינו נספר כאפס.</div>`}
    `;
}

function renderEfficiency() {
    if (!view) return '';
    const effTarget = state.targetEq ?? (confirmedRisk() ? Math.round(confirmedRisk().equity) : 50);
    const groupKeys = [...new Set(view.holdings.filter(h => h.match.group).map(h => h.match.group))];
    if (!groupKeys.length) return '<div class="muted small">אין זיהוי קבוצת מוצר מאומתת לרשימת העיון. חלופות לכל החזקה ומגבלות הזיהוי מוצגות בתיק הנכסים.</div>';
    return `
        <div class="group-label">התייעלות</div>
        <h2>רשימת עיון לפי שארפ מחושב</h2><div class="small">זו רשימה כללית בתוך סוג המוצר, לא קביעה שהמסלולים טובים יותר מההחזקה ולא חלופות שקולות. דירוג הפנסיה המשוקלל והמקבילים באותו מנדט וחשיפה מוצגים בתיק הנכסים.</div>
        <div class="muted small">מיון לפי שארפ מחושב (36 חודשים, ריבית חסרת סיכון 4%) מתוך תמונת ${REF_DATE}, באותה קבוצת מוצר כמו החזקות הלקוח. סימון ✓ = חשיפה מנייתית ≥ 70% (סף החשיפה שהוגדר). זו רשימת בחינה, לא המלצה; דמי הניהול בפועל נקבעים מול הגוף. ברשימה רק מסלולים עם לפחות 36 חודשי נתוני תשואה בפועל בדיווח הרשמי (תשואה נצברת תלת-שנתית קיימת); מסלול צעיר יותר אינו מדורג כלל, גם אם הקרן עצמה ותיקה.</div>
        ${groupKeys.map(gk => {
            const cands = topCandidates(gk, effTarget >= 70 ? 70 : null);
            const cur = view.holdings.filter(h => h.match.group === gk && h.match.row).map(h => h.match.row);
            const g = GROUPS.find(x => x.key === gk);
            return `<div class="subhead">${GROUP_LABEL[gk]}</div>
            ${cands.length === 0 ? '<div class="muted small">אין בקבוצה מסלולים עם 36 חודשי היסטוריה העומדים בסף החשיפה.</div>' : ''}
            ${g && g.data.short.length ? `<div class="muted small">הוחרגו מהדירוג בקבוצה זו ${g.data.short.length} מסלולים עם פחות מ-36 חודשי נתוני תשואה בפועל (למשל מסלולי 'סחיר' שהושקו לאחרונה) - ייכנסו לדירוג כשיצטברו 36 חודשים.</div>` : ''}
            ${(() => { const n = g ? g.data.main.filter(r => /עובדי/.test(r.flag || '')).length : 0; return n ? `<div class="muted small">הוחרגו מהדירוג ${n} מסלולים המוגבלים לעובדי סקטור או מפעל מסוים (לפי שדה אוכלוסיית היעד במאגר הרשמי) - הם אינם חלופה פתוחה לכל לקוח. אם הלקוח זכאי לקרן מוגבלת כזו, ניתן לבקש הצגה שלה בנפרד.</div>` : ''; })()}
            ${cands.map((r, i) => {
                const held = cur.some(c => c.name === r.name);
                return `<div class="cand">
                    <div class="track-line"><span>${i + 1}. ${esc(r.name)}${r.eq !== null && r.eq >= 70 ? ' ✓' : ''}${held ? ' (מוחזק היום)' : ''}</span><b>שארפ ${r.sharpe}</b></div>
                    <div class="muted small">
                        תשואה 3 שנים ${r.y3 !== null ? pct(r.y3) : '—'} · שארפ רשמי ${r.sharpeOff !== null ? r.sharpeOff : '—'} · מניות ${r.eq !== null ? pct(r.eq) : '—'} · חו"ל ${r.fo !== null ? pct(r.fo) : '—'} · מט"ח ${r.fx !== null ? pct(r.fx) : '—'} · ד"נ מצבירה ממוצע ${r.feeA !== null ? r.feeA + '%' : '—'} · מהפקדה ${r.feeD !== null ? r.feeD + '%' : '—'}${r.act !== null ? ` · התאמה אקטוארית ${r.act}%` : ''}${r.flag ? ` · ${esc(r.flag)}` : ''}
                    </div>
                </div>`;
            }).join('')}`;
        }).join('')}
    `;
}

function renderRetirement() {
    const f = state.f161;
    const hasF161 = !!(f.retireDate || f.totalGrant || f.grants.length);
    if (!hasF161) return `
        <div class="group-label">פרישה</div>
        <h2>ניתוח פרישה</h2>
        <div class="card">
            <div class="muted">עוד לא הועלה טופס 161, ולכן אין עדיין ניתוח מענקים ונקודות החלטה.</div>
            <div class="muted small">העלו את הטופס בשלב "טופס 161" (PDF), או מלאו את השדות ידנית. אומדן הקצבה - בשלב "הקצבה הצפויה".</div>
        </div>`;
    if (!state.f161Confirmed) return `
        <div class="group-label">פרישה</div>
        <h2>ניתוח פרישה</h2>
        <div class="card">
            <div class="muted">טופס 161 נטען, אך השדות שחולצו ממנו <b>טרם אומתו מול הטופס החתום</b>. הניתוח המחושב (תקרת הפטור, הרצפים ונקודות ההחלטה) מושהה ואינו מוצג עד לאישור מפורש של השדות בשלב "טופס 161".</div>
        </div>`;
    const ins = insights161(f);
    return `
        <div class="group-label">פרישה</div>
        <h2>ניתוח טופס 161 ונקודות החלטה</h2>
        <div class="card">
            <div class="track-line"><span>סה"כ מענק</span><b>${esc(f.totalGrant) || '—'} ₪</b></div>
            <div class="muted small">רצף קצבה מרבי ${esc(f.maxKtseva) || '—'} · רצף פיצויים מרבי ${esc(f.maxPitzuim) || '—'} · פטור מרבי ${esc(f.maxExempt) || '—'} · חייב ${esc(f.taxableGrant) || '—'}</div>
            ${ins.computedExemptCap !== null ? `<div class="note small">
                בדיקת שכפול: תקרת הפטור המחושבת (מינימום שכר×150% או 13,750 ₪, כפול ${esc(f.workYears)} שנים) = ${ins.computedExemptCap.toLocaleString('he-IL', { maximumFractionDigits: 2 })} ₪.
                הסכום המודפס בטופס (${esc(f.maxExempt)} ₪) הוא שלמים לפי חישוב המעסיק/הקופה
                ${ins.exemptMatchesForm === true ? ', וההפרש עקבי עם עיגול או קיטוע לשקלים שלמים - לא הוכחת שוויון מלא. תקרת 13,750 ₪ לשנת עבודה מאומתת מול לוח הניכויים ינואר 2026 של רשות המסים (gov.il); כללי העיגול דורשים אימות' : ''}
                ${ins.exemptMatchesForm === false ? ', ויש פער מהתקרה המחושבת - בדקו את ההזנה או את חלק א13 בטופס' : ''}.
            </div>` : ''}
            <ul class="notes">${ins.notes.map(n => `<li>${n}</li>`).join('')}</ul>
            <div class="muted small">מקור הכללים: ${RULES_SRC}. אין כאן החלטה בין פטור / רצף קצבה / רצף פיצויים / פריסה - רק השלכות מכמתות לבחינה מול הלקוח ופקיד השומה.</div>
        </div>
    `;
}

// הפקת PDF של הדוח בצד הלקוח בלבד: צילום כל עמוד A4 לקנבס והרכבה לקובץ PDF שמורד ישירות. שום נתון לא נשלח החוצה.
async function downloadClientReport() {
    if (!view) return;
    if (!window.jspdf || !window.html2canvas) { alert('ספריית ה-PDF לא נטענה. בדקו את החיבור ורעננו את הדף.'); return; }
    const el = document.getElementById('report-root');
    el.innerHTML = '<div class="rep-close-bar"><span class="muted small">מכין קובץ PDF - זה עשוי לקחת כמה שניות...</span></div>' + renderReport(state, view, agentBrand());
    el.classList.add('show');
    document.body.classList.add('report-open');
    try {
        await new Promise(r => setTimeout(r, 400));
        if (document.fonts && document.fonts.ready) { try { await document.fonts.ready; } catch { /* ignore */ } }
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF('p', 'mm', 'a4');
        const pages = Array.from(el.querySelectorAll('.rpage'));
        for (let i = 0; i < pages.length; i++) {
            const canvas = await html2canvas(pages[i], { scale: 2, backgroundColor: '#ffffff', useCORS: true });
            const img = canvas.toDataURL('image/jpeg', 0.95);
            const h = Math.min(297, canvas.height * 210 / canvas.width);
            if (i > 0) pdf.addPage();
            pdf.addImage(img, 'JPEG', 0, 0, 210, h);
        }
        pdf.save('דוח-מצב-טרום-טיפול.pdf');
    } catch (e) {
        console.error('report pdf failed', e);
        alert('הפקת ה-PDF נכשלה. אפשר להשתמש בכפתור ההדפסה בחלק "דוח מקוצר ללקוח".');
    }
    el.classList.remove('show');
    document.body.classList.remove('report-open');
}

// דוח מקוצר ללקוח - פרטי הסוכן נשמרים מקומית בלבד (localStorage), הדוח מופק בדפדפן ולא נשלח לשום מקום.
function agentBrand() {
    try { return JSON.parse(localStorage.getItem('agent-brand') || '{}'); } catch { return {}; }
}
function renderReportSection() {
    const a = agentBrand();
    return `
        <div class="muted small">דוח "מצב טרום טיפול" מקוצר (3 עמודי A4) המבוסס על קובץ המסלקה שהועלה: תמונת מצב והנתונים החשובים בתחילת הדוח, מוצרים ומסלולים, וכיסויים ביטוחיים, ללא שער ומכתב נפרדים. נתון שאין במקור מוצג בדוח כ"לא התקבל מידע" ואינו מומצא. הדוח מופק בדפדפן בלבד ואינו נשלח או נשמר מחוץ למחשב שלך.</div>
        <div class="rep-agent-form">
            <label>שם הסוכן לדוח <input type="text" data-agent="name" value="${esc(a.name || 'שרון סימון')}" placeholder="שם הסוכן"></label>
            <label>טלפון <input type="text" data-agent="phone" value="${esc(a.phone || '')}" placeholder="לדוגמה 050-0000000"></label>
            <label>דוא"ל <input type="text" data-agent="email" value="${esc(a.email || '')}" placeholder="לדוגמה name@example.com"></label>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button type="button" class="ghostbtn" data-report-preview>תצוגה מקדימה של הדוח</button>
            <button type="button" class="ghostbtn" data-diff-open>השוואת מסלקה חדשה מול קודמת</button>
            <button type="button" class="ghostbtn" data-report-print>הפקת הדוח להדפסה / PDF</button>
        </div>
        <div class="muted small">בתצוגת ההדפסה ניתן לבחור "שמירה כ-PDF". מומלץ נייר A4, שוליים רגילים.</div>`;
}

function renderBeforeAfterSection() {
    return `
        <div class="muted small">דוח "לפני ואחרי" מסכם (עמוד A4 אחד, הדמיה): מצב התיק כיום מול מעבר של כל מסלול לחלופה המדורגת הראשונה שזכאות ההצטרפות אליה אומתה, באותה קטגוריית חשיפה - חשיפה משוקללת, עלות דמי ניהול מצבירה שנתית וחיסכון משוער לכל מסלול. דמי הניהול של החלופה הם הממוצע הרשמי שפורסם, לא הצעה אישית. נתון חסר מוצג כ"לא התקבל מידע". הדוח מופק בדפדפן בלבד ואינו נשלח או נשמר מחוץ למחשב שלך.</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button type="button" class="ghostbtn" data-ba-preview>תצוגה מקדימה של דוח לפני/אחרי</button>
            <button type="button" class="ghostbtn" data-ba-print>הפקת הדוח להדפסה / PDF</button>
        </div>
        <div class="muted small">בתצוגת ההדפסה ניתן לבחור "שמירה כ-PDF". מומלץ נייר A4, שוליים רגילים.</div>`;
}

function renderOpenQuestions() {
    if (!view) return '';
    return `
        <div class="group-label">שאלות פתוחות</div>
        <h2>מסגרת החלטה - בדיקות שלא בוצעו עדיין</h2>
        <div class="muted small">לפי המטרות שנרשמו בשלב 3. לכל נכס - הבדיקות הנדרשות לפני ריכוז או ניוד. אין להניח שניתן לנייד או להפוך לקצבה כל נכס.</div>
        ${visibleAccounts(state.portfolio).filter(a => a.kind !== 'risk').map(a => `<div class="card">
            <div class="card-head"><b>${esc(a.plan)}</b> <span class="muted">(${KIND_LABEL[a.kind]}, ${fmt(a.totalBalance)} ₪)</span></div>
            <ul class="checks-open">
                <li>ניוד למסלול מרכז: טרם נבדק - תלוי בסוג המוצר ובתנאי החשבון.</li>
                <li>אירוע מס בעת ניוד או משיכה: טרם נבדק.</li>
                <li>אובדן זכויות קיימות (דמי ניהול מוסכמים, הבטחת תשואה, כיסויים ביטוחיים): טרם נבדק${a.covers.length ? ' - קיימים כיסויים פעילים' : ''}.</li>
                <li>משמעות ליורשים (מוטבים, שאירים, היוון): טרם נבדקה.</li>
                <li>מסלול קצבה מול שמירת הון ליורשים (לפי מטרת הלקוח): טרם נבדק; אין ערובה לשימור 100% מההון בכל מסלול.</li>
            </ul>
        </div>`).join('')}
        <div class="callout note-c"><b>מה חסר כדי לקבוע.</b> תאריך קצבה ראשונה מבוקש, סך כל הנכסים מחוץ למסלקה, היסטוריית משיכות פטורות (לקיבוע זכויות), ומצב משפחתי/מוטבים עדכני. כללי המס אינם מאומתים במלואם בגרסה זו; לפני כל החלטה יש לאמת מול רשות המסים והגוף המנהל.</div>
    `;
}

function renderPeers() {
    if (!view) return '';
    const s = state.peers;
    let body = `
        <div class="muted small">${PEERS_SOURCE_NOTE} ההשוואה היא לתקופת הדיווח האחרונה שפורסמה במאגר, ואינה תחליף לייעוץ. ${BASELINE_NOTE} ${EXISTING_VS_FUTURE_NOTE}</div>
        <button type="button" class="ghostbtn" data-peers-run ${state.peerBusy ? 'disabled' : ''}>${state.peerBusy ? 'טוען נתוני עמיתים...' : (s ? 'רענן השוואה מול המאגר הרשמי' : 'הפעל השוואת עמיתים')}</button>`;
    if (!s) return body;
    const srcLine = s.src === 'live'
        ? `הנתונים נמשכו כעת ישירות מהמאגר הרשמי · תקופת הדיווח האחרונה במאגר: <b>${periodLabel(s.period)}</b>`
        : `אין חיבור זמין למאגר כעת - מוצגת תמונת נתונים מתאריך <b>${s.snapDate}</b> · תקופת הדיווח: <b>${periodLabel(s.period)}</b>`;
    body += `<div class="note small">${srcLine}. מדד שארפ כפי שמפורסם על ידי הרשות; תשואות ברוטו לפני דמי ניהול.</div>`;
    if (s.error) return body + `<div class="callout warn">${esc(s.error)}</div>`;
    for (const r of s.results) {
        const own = r.own;
        const c = r.cmp;
        body += `<div class="card acct">
            <div class="track-line"><span><b>${esc(r.track.name)}</b> · ${esc(r.account.yatzran)}</span><b>${fmt(r.track.balance)} ₪</b></div>
            <div class="muted small">הותאם לרשומה הרשמית: <b>${esc(own.FUND_NAME)}</b> (זיהוי לפי קוד רשמי, ח.פ וסוג מוצר) · קבוצת ההשוואה: ${esc(own.FUND_CLASSIFICATION || '')} / ${esc(own.SPECIALIZATION || 'לפי שם המסלול')} · ${c.peersCount} קופות בקבוצה, כולן בתקופת דיווח זהה ועם נתוני 3 שנים ושארפ מלאים.</div>
            <div class="muted small">שימו לב: הקיבוץ שומר על אותו סוג מוצר, מנדט מעקב ורצועת חשיפה מנייתית. ההשוואה היא <b>מועמדת לבדיקה בלבד, לא מאומתת מול סיווג קנוני</b>, ואינה בסיס להמלצת העברה.</div>
            <table class="peertbl"><tr><th></th><th>המסלול שלכם</th><th>ממוצע הקבוצה (שווה-משקל)</th><th>חציון (לעיון)</th></tr>
                <tr><td>תשואה 3 שנים (ברוטו)</td><td>${own.YIELD_TRAILING_3_YRS ?? '—'}%</td><td>${c.avgY3 !== null ? c.avgY3.toFixed(1) + '%' : '—'}</td><td>${c.medY3 !== null ? c.medY3.toFixed(1) + '%' : '—'}</td></tr>
                <tr><td>מדד שארפ</td><td>${own.SHARPE_RATIO ?? '—'}</td><td>${c.avgSharpe !== null ? c.avgSharpe.toFixed(2) : '—'}</td><td>${c.medSharpe !== null ? c.medSharpe.toFixed(2) : '—'}</td></tr>
                <tr><td>דמי ניהול מצבירה (ממוצע בקופה)</td><td>${own.AVG_ANNUAL_MANAGEMENT_FEE ?? '—'}%</td><td>—</td><td>—</td></tr></table>
            ${own.SHARPE_RATIO == null || own.YIELD_TRAILING_3_YRS == null || c.avgY3 == null || c.avgSharpe == null
                ? '<div class="callout note-c">חסרים נתונים לקביעה אם המסלול מתחת לממוצע בשני המדדים. נתון חסר אינו אפס; המקבילים מוצגים להשוואה בלבד.</div>'
                : c.belowAvgBoth
                ? `<div class="callout warn"><b>מתחת לממוצע הקבוצה בשני המדדים.</b> זה סימן לבדיקה מעמיקה בלבד - לא הוכחה שהמסלול גרוע ולא המלצה להעברה. בדקו סיווג נכון, תקופה זהה ודמי ניהול מול גוף מקצועי. קו בסיס לשיקול: <b>ללא שינוי</b>. ${EXISTING_VS_FUTURE_NOTE}</div>`
                : `<div class="callout note-c">המסלול אינו מתחת לממוצע הקבוצה בשני המדדים יחד. קו הבסיס לכל שיקול נשאר <b>ללא שינוי</b>.</div>`}
            <div class="subhead">מועמדים לבדיקה (לא המלצה) - שתי רשימות דירוג נפרדות</div>
            <div class="muted small">נתוני עיון: שלוש הקופות המובילות לפי תשואת 3 שנים ושלוש לפי שארפ, גם אם המדד זהה או נמוך מהנוכחי. זה אינו הדירוג המשוקלל; דירוג הפנסיה המשוקלל מופיע בתיק הנכסים. פתיחות להצטרפות לא אומתה במסך הזה.</div>
            <div class="muted small">${c.comparisons.length ? `מקבילים להשוואה, גם כשחסר שארפ: ${c.comparisons.map(k => `${esc(k.FUND_NAME)} [${k.FUND_ID}] - שארפ ${k.SHARPE_RATIO ?? 'חסר'}, תשואה 3 שנים ${k.YIELD_TRAILING_3_YRS ?? 'חסר'}; הצטרפות לא אומתה`).join(' · ')}` : 'לא נמצאו במאגר מקבילים באותו סיווג, מנדט וחשיפה. ייתכן שחסרים נתוני חשיפה; אין להסיק שאין חלופות בשוק.'}</div>
            <table class="peertbl"><tr><th>מובילים לפי תשואת 3 שנים</th><th>3 שנים</th><th>שארפ</th><th>דמי ניהול ממוצעים</th></tr>
                ${!c.topByY3.length ? '<tr><td colspan="4">אין מקבילים בעלי נתוני שארפ ו-3 שנים מלאים; ראו המקבילים להשוואה לעיל.</td></tr>' : ''}${c.topByY3.map(k => `<tr><td>${esc(k.FUND_NAME)}<div class="muted small">${esc(k.MANAGING_CORPORATION || '')}</div></td><td>${k.YIELD_TRAILING_3_YRS}%</td><td>${k.SHARPE_RATIO}</td><td>${k.AVG_ANNUAL_MANAGEMENT_FEE ?? '—'}%</td></tr>`).join('')}
            </table>
            <table class="peertbl"><tr><th>מובילים לפי מדד שארפ</th><th>שארפ</th><th>3 שנים</th><th>דמי ניהול ממוצעים</th></tr>
                ${!c.topBySharpe.length ? '<tr><td colspan="4">אין מקבילים בעלי נתונים מלאים לדירוג שארפ; נתון חסר אינו אפס.</td></tr>' : ''}${c.topBySharpe.map(k => `<tr><td>${esc(k.FUND_NAME)}<div class="muted small">${esc(k.MANAGING_CORPORATION || '')}</div></td><td>${k.SHARPE_RATIO}</td><td>${k.YIELD_TRAILING_3_YRS}%</td><td>${k.AVG_ANNUAL_MANAGEMENT_FEE ?? '—'}%</td></tr>`).join('')}
            </table>
        </div>`;
    }
    if (s.skipped.length) body += `<div class="muted small">לא הושוו (אין התאמה ודאית במאגר או סוג מוצר ללא נתוני עמיתים במאגר): ${s.skipped.map(esc).join('; ')}.</div>`;
    body += `<div class="subhead">${TRANSFER_GATES.title}</div>
        <ul class="notes">${TRANSFER_GATES.items.map(i => `<li>${esc(i)}</li>`).join('')}</ul>
        <div class="muted small">${esc(TRANSFER_GATES.src)}</div>`;
    return body;
}

function renderReview() {
    const done = [], openItems = [];
    done.push(['מקור טבלת המקדמים', 'נספחי הזקנה של תקנוני כל 18 הקרנות (9 מקיפות + 9 כלליות/משלימות, מלאי פנסיה-נט 09/2026) - חולצו ואומתו מספרית ב-8.11.2026; הערות שקופות מוצגות לטבלאות משוערכות (הראל) או חלקיות (מיטב)']);
    done.push(['מקור נתוני העמיתים', 'גמל-נט ופנסיה-נט של רשות שוק ההון (data.gov.il), תקופת דיווח 09/2026']);
    done.push(['כללי ניוד ואכשרה', 'חוזר העברת כספים בין קופות גמל (2017), סעיפים 3-4, נקרא מול הנוסח הרשמי']);
    openItems.push('אישור הלקוח לכל ערך שחולץ אוטומטית מול המסמך המקורי');
    openItems.push('ציטוט קצבה מחייב מהגוף המנהל - אופציונלי כעת, נדרש לפני החלטה על מסלול קצבה');
    openItems.push('בדיקת הרכב תנאים מול דברי הסכמי עבודה קודמים');
    return `
        <div class="muted small">רשימת הבדיקות שבוצעו והפתוחות לפני כל החלטה. המערכת אינה ממליצה ואינה מבצעת פעולות - היא מסכמת מה נבדק, ממה, ומה עוד פתוח.</div>
        <div class="subhead">בוצע ואומת</div>
        <ul class="notes">${done.map(([a, b]) => `<li><b>${esc(a)}:</b> ${esc(b)}</li>`).join('')}</ul>
        <div class="subhead">פתוח לפני ביצוע</div>
        <ul class="notes">${openItems.map(x => `<li>${esc(x)}</li>`).join('')}</ul>
        <div class="subhead">משוב</div>
        <div class="muted small">יש הערה, תיקון או בקשה? כתבו אותה כאן והעתיקו - ההעתקה נשארת במכשיר שלכם בלבד, ואתם מדביקים אותה בווצאפ או בדוא"ל למי שתבחרו. שום דבר לא נשלח מהעמוד, ושום נתון לקוח אינו מצורף אוטומטית.</div>
        <textarea id="feedback-text" class="feedbackta" rows="3" placeholder="כתבו כאן את המשוב..."></textarea>
        <button type="button" class="ghostbtn" data-feedback-copy>העתקת המשוב ללוח</button>
        <span class="muted small" id="feedback-done"></span>`;
}

function renderIntroWhat() {
    if (view) return '';
    return `
        <div class="group-label">מה רואים כאן</div>
        <h2>אחרי טעינת הקבצים</h2>
        <ul class="notes">
            <li>פירוט התיק: חשבונות, מסלולים, יתרות, דמי ניהול בפועל, כיסויים ותחזיות הגוף המנהל - כפי שדווחו במסלקה.</li>
            <li>רמת סיכון: אחוז מניות משוקלל בכסף, ומחוון יעד שמכמת כמה כסף להזיז ולאיזה כיוון.</li>
            <li>התייעלות: מסלולים באותה קבוצה עם שארפ 3 שנים גבוה יותר, עם חשיפות ודמי ניהול - לבחינה, לא להוראה.</li>
            <li>פרישה: בדיקת שכפול של תקרת הפטור מול הטופס, זכאות רצף קצבה לפי קוד משלם, עלות קיבוע, ושנות פריסה אפשריות.</li>
        </ul>
    `;
}

async function runPeers() {
    if (!state.portfolio || state.peerBusy) return;
    state.peerBusy = true; render();
    try {
        const data = await loadPeerData();
        const results = [], skipped = [];
        for (const a of state.portfolio.accounts) {
            for (const tr of a.tracks) {
                if (a.kind === 'risk' || a.kind === 'menahalim') { skipped.push(`${tr.name} (${a.plan})`); continue; }
                const m = findOwnRow(tr.name, a.kind, data.rows, tr.code, a);
                if (!m) { skipped.push(`${tr.name} (${a.plan})`); continue; }
                results.push({ account: a, track: tr, own: m.row, score: m.score, cmp: compareTrack(m.row, data.rows) });
            }
        }
        state.peers = { src: data.src, period: data.period, snapDate: data.snapDate, results, skipped };
    } catch (e) {
        state.peers = { error: 'טעינת נתוני העמיתים נכשלה: ' + (e && e.message ? e.message : 'שגיאה'), results: [], skipped: [] };
    }
    state.peerBusy = false; render();
}

// בקשת המשתמש 08/11/2026: פריטים ונכסים ששווים מתחת ל-1 ₪ לא מוצגים כלל בתיק הנכסים.
// הסינון בתצוגה בלבד - הייבוא והנתונים הבסיסיים נשמרים כמות שהם.
function visibleAccounts(p) { return p.accounts.filter(a => (a.totalBalance || 0) >= 1); }

function badgeStep1() {
    if (state.busy) return 'מעבד...';
    if (state.portfolio) return `${visibleAccounts(state.portfolio).length} חשבונות נטענו`;
    return 'טרם הועלה קובץ';
}
function badgeStep2() {
    if (!state.f161Tried) return 'טרם הועלה טופס';
    const n = Object.values(state.f161Found).filter(Boolean).length;
    return `חולצו ${n} שדות`;
}

function render() {
    recompute();
    const hasP = !!view;
    // מספור אוטומטי רציף של חלקי המדריך, לפי החלקים המוצגים בפועל בכל מצב
    let _stepNo = 0;
    const nextStepNum = () => `<span class="step-num">${++_stepNo}</span>`;
    // כל שורות האקורדיון המוצגות מקבלות מספור רציף אוטומטי לפי סדר ההצגה, בכל מצב (תיק/פרישה, ריק/נטען)
    const isNif = state.mode === 'nifraim';
    const isIns = state.mode === 'life' || state.mode === 'health' || state.mode === 'calc';
    const isPlain = isNif || isIns;
    const isRet = state.mode === 'retirement';
    const isPort = !isPlain && !isRet;
    const numStep1 = isNif ? '' : nextStepNum();
    // תכנון פרישה: 7 שלבים קבועים, מהקלט להמלצה
    const numStep2 = isRet ? nextStepNum() : '';
    const numKibua = isRet ? nextStepNum() : '';
    const numQuestions = isRet ? nextStepNum() : '';
    const numPension = isRet ? nextStepNum() : '';
    const numAlloc = isRet ? nextStepNum() : '';
    const numSummary = isRet ? nextStepNum() : '';
    const numNif = isNif ? nextStepNum() : '';
    // תיק פנסיוני: חלקי בדיקת התיק
    const numPortfolio = isPort && hasP ? nextStepNum() : '';
    const numReport = isPort && hasP ? nextStepNum() : '';
    const numMasdiff = isPort && hasP && state.diff.open ? nextStepNum() : '';
    const numBeforeAfter = isPort && hasP ? nextStepNum() : '';
    const numPeers = isPort && hasP ? nextStepNum() : '';
    const numRisk = isPort && hasP ? nextStepNum() : '';
    const numEfficiency = isPort && hasP ? nextStepNum() : '';
    const numStep3 = isPort ? nextStepNum() : '';
    const numRiskGoals = isPort ? nextStepNum() : '';
    const numOpenq = isPort && hasP ? nextStepNum() : '';
    const numReview = isPort ? nextStepNum() : '';
    const numWhat = !isPlain && !hasP ? nextStepNum() : '';
    document.getElementById('root').innerHTML = `
    <header class="hero">
        <div class="hero-inner">
            <h1>מערכת תומכת החלטה פנסיונית</h1>
            <div class="hero-fact">תצוגה מקדימה זמנית 10/11/2026 · גרסה לשיתוף (אב-טיפוס) · נתוני ייחוס ${REF_DATE}</div>
            <p>${state.mode === 'portfolio'
                ? 'בדיקת תיק שוטפת: מעלים קובץ ZIP של המסלקה הפנסיונית והמערכת מציגה את תיק הנכסים, רמת הסיכון (אחוז מניות משוקלל), חלופות מדורגות והשוואת עמיתים רשמית. לתכנון פרישה (כולל טופס 161 ומסמכים רשמיים) עוברים לכרטסת תכנון פרישה. כל העיבוד מתבצע בדפדפן שלך בלבד: קבצי הלקוח לא נשמרים, לא נשלחים ולא מוזנים לאף מערכת, ורענון העמוד מנקה את נתוני הלקוח. יוצא דופן יחיד: פרטי הסוכן לדוח (שם/טלפון/מותג) נשמרים מקומית בדפדפן שלך בלבד ואינם נשלחים.'
                : state.mode === 'life'
                ? 'ביטוח חיים: דף עבודה להשוואת פוליסות הלקוח, פרמיות והנחות לאורך זמן, על בסיס דוח הר הביטוח או קלט ידני. אין חיבור אוטומטי לחברות הביטוח או להר הביטוח, וכל הנתונים נמחקים ברענון.'
                : state.mode === 'health'
                ? 'ביטוח בריאות: דף עבודה לבחינה ידנית של כיסויי הבריאות של הלקוח (שב"ן ופרטי), על בסיס דוח הר הביטוח או הפוליסות. אין ייעוץ רפואי או המלצת זכאות, וכל הנתונים נמחקים ברענון.'
                : state.mode === 'calc'
                ? 'מחשבונים ממוקדים: דמי ניהול לאורך זמן, תקרת פטור פיצויים, קצבה מוכרת, גיל פרישה ותמונת נכסים וסיכון כולל - כל מחשבון בלשונית משלו, עם תווית מקור. כל החישוב בדפדפן שלך בלבד.'
                : state.mode === 'nifraim'
                ? 'נפרעים צפויים לפי חברת ביטוח: מעלים דוחות כספת של חברות הביטוח והמערכת תציג כמה נפרעים צפוי להגיע מכל חברה וסה"כ (בבנייה - כרגע קריאת הדוח בלבד). כל העיבוד מתבצע בדפדפן שלך בלבד: קבצים לא נשמרים, לא נשלחים ולא מוזנים לאף מערכת, ורענון העמוד מנקה את הנתונים.'
                : 'תכנון פרישה: טופס 161, תרחישי פרישה ומסמכים רשמיים משלימים. הנתונים שהוזנו בבדיקת התיק נשמרים גם כאן. כל העיבוד מתבצע בדפדפן שלך בלבד: קבצי הלקוח לא נשמרים, לא נשלחים ולא מוזנים לאף מערכת, ורענון העמוד מנקה את נתוני הלקוח. יוצא דופן יחיד: פרטי הסוכן לדוח (שם/טלפון/מותג) נשמרים מקומית בדפדפן שלך בלבד ואינם נשלחים.'}</p>
            <div class="herobtns">
                <div class="modeswitch" role="group" aria-label="בחירת כרטסת">
                    <button type="button" class="modebtn${state.mode === 'portfolio' ? ' active' : ''}" data-mode-set="portfolio" aria-pressed="${state.mode === 'portfolio'}">תיק פנסיוני</button>
                    <button type="button" class="modebtn${state.mode === 'life' ? ' active' : ''}" data-mode-set="life" aria-pressed="${state.mode === 'life'}">ביטוח חיים</button>
                    <button type="button" class="modebtn${state.mode === 'health' ? ' active' : ''}" data-mode-set="health" aria-pressed="${state.mode === 'health'}">ביטוח בריאות</button>
                    <button type="button" class="modebtn${state.mode === 'retirement' ? ' active' : ''}" data-mode-set="retirement" aria-pressed="${state.mode === 'retirement'}">תכנון פרישה</button>
                    <button type="button" class="modebtn${state.mode === 'calc' ? ' active' : ''}" data-mode-set="calc" aria-pressed="${state.mode === 'calc'}">מחשבונים</button>
                    <button type="button" class="modebtn${state.mode === 'nifraim' ? ' active' : ''}" data-mode-set="nifraim" aria-pressed="${state.mode === 'nifraim'}">התאמת נפרעים <span class="badge-soon">בקרוב</span></button>
                </div>
                <a class="ghostbtn liblink" href="https://mataf-library.pages.dev/" target="_blank" rel="noopener">ספריית המקורות</a>
            </div>
            ${state.mode === 'calc' ? renderCalcSubtabs(state) : ''}
        </div>
    </header>
    <main class="wrap">
        ${!isPlain ? renderCallouts() : ''}
        ${!isPlain ? acc('step1', `${numStep1} קובץ המסלקה (ZIP או XML)`, badgeStep1(), renderStep1() + (isRet ? fold('secure', 'שמירה או טעינה של תיק מוצפן (אופציונלי)', renderEncPanel()) : ''), !hasP,
            isPort ? `<button type="button" class="encbtn${state.encOpen ? ' on' : ''}" data-action="enctoggle" aria-expanded="${!!state.encOpen}">🔒 שמירה / טעינה בקובץ מוצפן</button>` : '') : ''}
        ${isPort && state.encOpen ? `<section class="card" id="enc-panel"><div class="group-label">שמירת העבודה לקובץ מוצפן (אופציונלי)</div>${renderEncPanel()}</section>` : ''}
        ${isNif ? acc('nifraim', `${numNif} נפרעים צפויים לפי חברת ביטוח`, state.nif.parsed ? 'קובץ נטען' : '', renderNifraimBody({ nif: state.nif, portfolio: null }), true) : ''}
        ${state.mode === 'life' ? renderLifeTab(state) : ''}
        ${state.mode === 'health' ? renderHealthTab(state) : ''}
        ${state.mode === 'calc' ? renderCalcTab(state, { assets: (on) => renderAssetsCard(on) }) : ''}
        ${isRet ? acc('step2', `${numStep2} טופס 161 (PDF)`, badgeStep2(), renderStep2()) : ''}
        ${isRet ? acc('kibua', `${numKibua} נתוני הקיבוע (טופס 161ד)`, badgeKibuaStep(), renderKibuaStep()) : ''}
        ${isRet ? acc('questions', `${numQuestions} שאלות לפני החלטה`, missBadge(RS_IDS.questions), renderQuestionsStep()) : ''}
        ${isRet ? acc('pension', `${numPension} הקצבה הצפויה`, badgePensionStep(), renderPensionStep()) : ''}
        ${isRet ? acc('alloc', `${numAlloc} ההמלצה: אופן המשיכה ותכנון המס`, badgeAlloc(), renderRecommendationStep()) : ''}
        ${isRet ? acc('summary', `${numSummary} סיכום ופעולות`, missBadge(RS_IDS.summary), renderSummaryStep()) : ''}
        ${isPort && hasP ? acc('portfolio', `${numPortfolio} תיק הנכסים`, `${fmt(view.totalValue)} ₪ · ${visibleAccounts(state.portfolio).length} חשבונות${view.rejectedImports && view.rejectedImports.length ? ' · ⚠ יבוא חלקי' : ''}`, renderPortfolio(), true) : ''}
        ${isPort && hasP ? acc('report', `${numReport} דוח מקוצר ללקוח (A4)`, 'מבוסס על קובץ המסלקה שהועלה', renderReportSection()) : ''}
        ${isPort && hasP && state.diff.open ? acc('masdiff', `${numMasdiff} השוואת מסלקה חדשה מול קודמת`, state.diff.result ? 'הושוואה' : '', renderDiffBody(state), true) : ''}
        ${isPort && hasP ? acc('beforeafter', `${numBeforeAfter} דוח לפני/אחרי מסכם (הדמיה)`, 'מול החלופות הזכאיות המדורגות', renderBeforeAfterSection()) : ''}
        ${isPort && hasP ? acc('peers', `${numPeers} השוואת עמיתים רשמית (גמל-נט / פנסיה-נט)`, state.peers ? `תקופת דיווח ${periodLabel(state.peers.period)}` : 'טרם הופעלה', renderPeers()) : ''}
        ${isPort && hasP ? acc('risk', `${numRisk} רמת סיכון`, '', renderRisk()) : ''}
        ${isPort && hasP ? acc('efficiency', `${numEfficiency} התייעלות מול נתוני ייחוס`, '', renderEfficiency()) : ''}
        ${isPort ? acc('step3', `${numStep3} מטרות הלקוח`, '', renderStep3()) : ''}
        ${isPort ? acc('riskgoals', `${numRiskGoals} התאמת סיכון למטרות - דף עבודה פנימי`, badgeRg(), renderRiskGoals()) : ''}
        ${isPort && hasP ? acc('openq', `${numOpenq} שאלות פתוחות`, '', renderOpenQuestions()) : ''}
        ${isPort ? acc('review', `${numReview} סיכום לבחינה מקצועית ומשוב`, '', renderReview()) : ''}
        ${!isPlain && !hasP ? acc('what', `${numWhat} מה רואים כאן`, '', renderIntroWhat(), true) : ''}
        <footer class="closing">אב-טיפוס · נתוני ייחוס ${REF_DATE} בלבד · כללים: ${RULES_SRC} · נתוני לקוח לא נשלחים, לא נשמרים ולא מוזנים לאף מערכת מהעמוד הזה; פרטי הסוכן לדוח בלבד נשמרים מקומית בדפדפן שלך.
        ${!isPlain ? renderSrcBox() : ''}
    </footer>
    </main>`;
    if (state.mekLast && state.mekLast.pension) updateNetResult();
}

// ---------- events ----------


async function onDiffFiles(files) {
    if (!files || !files.length) return;
    // דוח קודם אחד בלבד להשוואה (כמו המסלקה הנוכחית) - כמה דוחות קודמים אינם מוזגים
    if (files.length > 1) {
        state.diff.reports = [{ fileName: '', ok: false, detail: `נבחרו ${files.length} קבצים - מעלים דוח מסלקה קודם אחד בלבד (ZIP או XML); כמה דוחות קודמים אינם מוזגים להשוואה אחת.` }];
        state.diff.open = true; state.open['masdiff'] = true; render(); return;
    }
    const snap = [];
    for (const f of Array.from(files)) {
        const buf = await f.arrayBuffer();
        snap.push({ name: f.name, arrayBuffer: async () => buf.slice(0), text: async () => new TextDecoder('utf-8').decode(buf) });
    }
    state.diff.busy = true; state.diff.reports = []; state.diff.result = null; render();
    const p = { clientName: '', fileCount: 0, accounts: [] };
    const rep = [];
    await readMaslakaFiles(snap, p, rep);
    // הדוח הקודם עובר אותה בדיקת חפיפה כמו התיק הנוכחי: עותקים זהים מצטמצמים, גרסאות סותרות של אותו
    // חשבון נדחות מההשוואה (לא נספרות כפול) ומדווחות עם יתרת כל גרסה.
    const ddPrev = dedupeAccounts(p.accounts);
    p.accounts = ddPrev.accounts; p.rejectedPrev = ddPrev.rejected;
    for (const n of ddPrev.notes) rep.push({ fileName: '', ok: false, detail: 'דוח קודם: ' + n });
    state.diff.prev = p; state.diff.reports = rep; state.diff.busy = false;
    state.diff.result = p.accounts.length ? diffPortfolios(p, state.portfolio) : null;
    if (!p.accounts.length) rep.push({ fileName: '', ok: false, detail: 'לא זוהו חשבונות בקובץ המסלקה הקודמת' });
    render();
}

async function onNifFiles(files) {
    if (!files || !files.length) return;
    const f = files[0];
    const buf = await f.arrayBuffer();
    let text = new TextDecoder('utf-8').decode(buf);
    if (text.includes('\uFFFD')) text = new TextDecoder('windows-1255').decode(buf);
    state.nif.fileName = f.name; state.nif.status = ''; state.nif.parsed = null; state.nif.match = null;
    const parsed = parseNifraimText(text);
    if (parsed.error) {
        state.nif.status = `קובץ ${f.name}: ${parsed.error}`;
    } else {
        state.nif.parsed = parsed;
        state.nif.match = state.portfolio ? matchNifraim(parsed, state.portfolio) : null;
        state.nif.status = `נקראו ${parsed.rows.length} שורות מתוך ${f.name}.${state.portfolio ? '' : ' אין תיק טעון - מוצגות הערכים בלבד.'}`;
    }
    render();
}

// קשירת זהות לקוח בין מקורות: שני מזהים קיימים ושווים -> אותו לקוח; שניהם קיימים ושונים -> סתירה;
// אחד חסר -> לא פתור (חוסר מזהה אינו ראיה לאותו לקוח). בסתירה או בחוסר פתרון, קלטים/מסמכים של
// לקוח קודם מופרדים למצב "ממתין" (נשמרים וניתנים לשחזור, אינם נכנסים לחישוב ואינם נשמרים כנתוני התיק החדש).
function clientBindStatus(aId, bId) {
    const a = normalizeIdNumber(aId), b = normalizeIdNumber(bId);
    if (a && b) return a === b ? 'same' : 'mismatch';
    return 'unresolved';
}
function segregateClientInputs(reason, prevClient) {
    const hasF161Data = !!(state.f161.retireDate || state.f161.totalGrant || (state.f161.grants && state.f161.grants.length) || state.f161.idNumber);
    // דפי העבודה (ביטוח חיים/בריאות/מחשבונים) הם קלט ידני קשור-לקוח ממש כמו נטו/קיבוע/161 - מופרדים באותו שער.
    const hasWorksheets = !!(state.life.policies.length || state.health.policies.length || Object.keys(state.calc).length);
    const hasManual = hasWorksheets || Object.entries(state.netin).some(([k, v]) => v && String(v) !== ({ kibuaMain: '0', kibuaSpouse: '0', otherMain: '0', grossSpouse: '0', otherSpouse: '0', pointsMain: '2.25', pointsSpouse: '2.75' })[k]) || Object.values(state.kibua).some(v => v && v !== '1')
        || Object.values(state.alloc).some(Boolean) || Object.entries(state.goals || {}).some(([k, v]) => v && String(v) !== ({ liquidity: 'בינוני' })[k] && v !== false) || (state.mekManual || '').trim();
    if (!hasF161Data && !hasManual) { state.pendingClient = null; return; }
    state.pendingClient = {
        reason, savedAt: new Date().toISOString(),
        // זהות הלקוח במסלקה הקודמת נשמרת כדי שבאנר ההשוואה יוכל להציג שם+זהות של שני הצדדים גם כשאין טופס 161 מופרד
        prevClient: prevClient && (prevClient.name || prevClient.id) ? { name: prevClient.name || '', id: prevClient.id || '' } : null,
        netin: { ...state.netin }, kibua: { ...state.kibua }, alloc: { ...state.alloc }, goals: { ...(state.goals || {}) },
        mekIn: { ...state.mekIn }, mekManual: state.mekManual,
        life: { policies: state.life.policies.map(p => ({ ...p })), seq: state.life.seq },
        health: { policies: state.health.policies.map(p => ({ ...p })), seq: state.health.seq },
        calc: { ...state.calc },
        f161: hasF161Data ? { ...state.f161, grants: (state.f161.grants || []).map(g => ({ ...g })) } : null,
        f161File: hasF161Data && rawVault.f161 ? { name: rawVault.f161.name, bytes: rawVault.f161.bytes } : null,
    };
    state.netin = { kibuaMain: '0', kibuaSpouse: '0', certRateMain: '', certRateSpouse: '', simMain: '', simSpouse: '', pointsMain: '2.25', otherMain: '0', grossSpouse: '0', pointsSpouse: '2.75', otherSpouse: '0', eligMain: false, eligSpouse: false, survClass: '', survAssumeOk: false };
    state.kibua = { eligDate: '', payers: '1', grantExempt: '', grantYears: '', grantYear: '', grantIndexed: '', sim2026: '', hivunPast: '', hivunPlan: '', empHistory: '' };
    state.alloc = { objective: '', horizon: '' }; state.goals = { horizon: '', liquidity: 'בינוני', inheritance: false, consolidate: false, keepExemption: false, capitalFirst: false };
    state.mekIn = {}; state.mekResult = ''; state.mekLast = null; state.mekAlts = []; state.mekManual = '';
    state.life = emptyInsState(); state.health = emptyInsState(); state.calc = {};
    if (hasF161Data) { state.f161 = { grants: [] }; state.f161Found = {}; state.f161Tried = false; state.f161Status = ''; state.f161Pages = []; rawVault.f161 = null; state.f161Confirmed = false; }
}

async function onMaslaka(files) {
    if (!files || !files.length) return;
    // אכיפת קובץ-יחיד שאינה תלויה בממשק (09/11/2026): אירוע עם יותר מקובץ אחד נדחה בשלמותו -
    // גם אם נוצר בתכנית. התיק הקודם נשמר כפי שהוא ואף מצב לא מתאפס.
    if (files.length > 1) {
        state.uploadError = `נבחרו ${files.length} קבצים (${Array.from(files).map(f => f.name).join(', ')}) - ניתן לטעון קובץ מסלקה אחד בלבד בכל בדיקה. הקבצים לא נטענו; ${state.portfolio ? 'התיק הקודם נשאר כפי שהוא' : 'טרם נטען תיק'}.`;
        state.open['step1'] = true; // חלק ההעלאה מכווץ אחרי טעינה מוצלחת - פתיחה כדי שהאזהרה תהיה גלויה בפועל
        render();
        setTimeout(() => { const el = document.getElementById('acc-step1'); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 50);
        return;
    }
    // קריאת הבאיטים לפני render: החלפת ה-input ב-DOM עלולה לבטל את גישת הדפדפן לקובץ שנבחר
    rawVault.maslaka = [];
    const snap = [];
    for (const f of Array.from(files)) {
        const buf = await f.arrayBuffer();
        rawVault.maslaka.push({ name: f.name, bytes: new Uint8Array(buf.slice(0)) });
        snap.push({ name: f.name, arrayBuffer: async () => buf.slice(0), text: async () => new TextDecoder('utf-8').decode(buf) });
    }
    const prevClient = state.portfolio && state.portfolio.client ? { name: state.portfolio.client.name || '', id: state.portfolio.client.id || '' } : null;
    const prevClientId = prevClient && prevClient.id ? prevClient.id : '';
    state.busy = true; render();
    const p = { clientName: '', fileCount: 0, accounts: [] };
    const rep = [];
    await readMaslakaFiles(snap, p, rep);
    const newClientId = p.client && p.client.id ? p.client.id : '';
    // שני הקבצים ללא מספר זהות: עם תיק קודם קיים אין להניח שזה אותו לקוח (ולא לפי שם) - נזהה כלא-פתור ונפריד קלטים.
    const bind = prevClientId || newClientId ? clientBindStatus(prevClientId, newClientId) : (prevClient ? 'unresolved' : 'same');
    state.portfolio = p; state.reports = rep; state.demo = false; state.busy = false;
    // איפוס מלא של מצב תלוי-תיק בעת החלפת קובץ (09/11/2026): אישורי זהות, בחירות ידניות, החרגות מהממוצע,
    // זכאויות שילוב, יעד/העדפת גיאוגרפיה ובחירת תחילת קצבה - כולם קשורים לחשבונות ולמסלולים של הקובץ הקודם.
    state.confirmed = {}; state.selections = {}; state.excluded = {}; state.targetEq = null; state.geoPref = 'any'; state.eligible = {}; state.unknownAssumption = null; state.marketPick = {};
    state.pensionStartSel = null; state.manualDropNote = ''; state.uploadError = '';
    // כרטיס המקדם (תכנון פרישה) קשור ללקוח/לקובץ: גוף מנהל (מזוהה או שנבחר ידנית), תרחיש, הבטחה, יתרה,
    // אומדן אחרון וחלופות מתאפסים בהחלפת קובץ - כדי שלקוח/קובץ חדש לא יירש מנהל או תוצאה של הקודם.
    // באותו לקוח (מזהה זהה בשני הקבצים) נשמרים רק שדות אדם מובהקים (מין, שנות לידה, גיל) והמקדם הידני.
    if (bind === 'same') {
        // זהות מאומתת כזהה: דפי העבודה (ביטוח חיים/בריאות/מחשבונים) נשמרים במתכוון - הם של אותו לקוח.
        const keep = { gender: state.mekIn.gender, birthYear: state.mekIn.birthYear, spouseBirthYear: state.mekIn.spouseBirthYear, age: state.mekIn.age };
        state.mekIn = {}; for (const [k, v] of Object.entries(keep)) if (v !== undefined && v !== '') state.mekIn[k] = v;
        state.mekResult = ''; state.mekLast = null; state.mekAlts = [];
    } else {
        // זהות שונה או לא פתורה: קלטי הלקוח הקודם מופרדים למצב ממתין - לא בחישוב, לא נמחקים.
        segregateClientInputs(bind, prevClient);
        if (state.pendingClient) state.open['step2'] = true; // באנר ההפרדה נמצא בחלק 161 - פתיחה כדי שהאזהרה תהיה גלויה בפועל
        rep.push({ fileName: '', ok: false, detail: bind === 'mismatch'
            ? `מספר הזהות בקובץ החדש שונה מהקודם - קלטים ידניים וטופס 161 של הלקוח הקודם הופרדו למצב ממתין (נשמרים, אינם בחישוב). אם זו טעות, העלו את הקובץ הנכון.`
            : 'לא ניתן לאמת שזה אותו לקוח (חסר מספר זהות באחד הקבצים) - קלטים ידניים וטופס 161 של הלקוח הקודם הופרדו למצב ממתין (נשמרים, אינם בחישוב).' });
    }
    render();
}

async function renderPdfPages(buf, maxPages = 12) {
    const lib = globalThis.pdfjsLib;
    if (!lib) return [];
    const doc = await lib.getDocument({ data: new Uint8Array(buf), isEvalSupported: false }).promise;
    const out = [];
    const n = Math.min(doc.numPages, maxPages);
    for (let i = 1; i <= n; i++) {
        const page = await doc.getPage(i);
        const vp = page.getViewport({ scale: 2.0 });
        const cv = document.createElement('canvas');
        cv.width = vp.width; cv.height = vp.height;
        await page.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise;
        out.push({ page: i, img: cv.toDataURL('image/jpeg', 0.85) });
    }
    if (doc.numPages > n) out.push({ shown: n, total: doc.numPages });
    return out;
}

async function on161(files) {
    if (!files || !files.length) return;
    // קריאת הבאיטים לפני render: החלפת ה-input ב-DOM עלולה לבטל את גישת הדפדפן לקובץ שנבחר
    const buf = await files[0].arrayBuffer();
    rawVault.f161 = { name: files[0].name || 'form161.pdf', bytes: new Uint8Array(buf.slice(0)) };
    state.busy = true; state.f161Status = 'מחלץ טקסט מהטופס...'; state.f161Confirmed = false; render();
    try { state.f161Pages = await renderPdfPages(buf.slice(0)); } catch (e) { state.f161Pages = []; }
    const r = await extract161(buf.slice(0));
    state.busy = false; state.f161Tried = true; state.demo = false;
    state.f161Marks = r.marks || [];
    if (r.error) {
        state.f161Status = r.error;
        state.f161Found = {};
    } else {
        const pId = state.portfolio && state.portfolio.client && state.portfolio.client.id ? state.portfolio.client.id : '';
        if (state.portfolio) {
            const bind = clientBindStatus(pId, r.fields.idNumber);
            if (bind !== 'same') {
                state.pendingClient = { reason: bind, savedAt: new Date().toISOString(), f161: { ...r.fields, grants: (r.fields.grants || []).map(g => ({ ...g })) }, f161File: rawVault.f161 ? { name: rawVault.f161.name, bytes: rawVault.f161.bytes } : null };
                state.f161 = { grants: [] }; state.f161Found = {}; state.f161Tried = false; state.f161Pages = []; rawVault.f161 = null; state.f161Confirmed = false;
                state.open['step2'] = true; // האזהרה חייבת להיות גלויה בפועל
                state.f161Status = bind === 'mismatch'
                    ? `מספר הזהות בטופס 161 (${r.fields.idNumber}) שונה מזה שבמסלקה (${pId}) - הטופס לא נכנס לחישוב והופרד למצב ממתין. אם הוזן טופס של לקוח אחר, העלו את הטופס הנכון; אם זו שגיאת חילוץ, תקנו את מספר הזהות.`
                    : 'לא חולץ מספר זהות תקין מהטופס או מהמסלקה - לא ניתן לאמת שהטופס שייך ללקוח המסלקה, ולכן הטופס לא נכנס לחישוב והופרד למצב ממתין. תקנו/השלימו את מספר הזהות בטופס (לחצו "תיקון") ואז ניתן לאשר.';
                render(); return;
            }
        }
        state.f161 = { ...r.fields, grants: r.fields.grants.length ? r.fields.grants : [] };
        state.f161Found = r.found;
        const missing = Object.entries(r.found).filter(([, v]) => !v).map(([k]) => k === 'grants' ? 'מענקים (א9)' : FIELD_LABELS[k]);
        state.f161Status = missing.length === 0
            ? `חולצו אוטומטית כל ${r.totalFields} השדות, כולל ${r.fields.grants.length} מענקים בחלק א9. השוו מול הטופס החתום ואשרו - ניתן לתקן כל שדה בלחיצה על "תיקון".`
            : `חולצו ${r.foundCount} מתוך ${r.totalFields} שדות. לא חולצו: ${missing.join(', ')} - הזינו אותם ידנית מהטופס (מסומנים בכתום). שאר השדות מוצגים לאישור, לא להזנה חוזרת.`;
    }
    render();
}

document.addEventListener('DOMContentLoaded', () => {
    // קישור עמוק לכרטסת: ?tab=life / health / calc / retirement / nifraim / portfolio
    const urlTab = new URLSearchParams(location.search).get('tab');
    if (['portfolio', 'life', 'health', 'retirement', 'calc', 'nifraim'].includes(urlTab)) state.mode = urlTab;
    const urlCalc = new URLSearchParams(location.search).get('calc'); // קישור ישיר ללשונית משנה במחשבונים
    if (urlCalc && /^[a-z]+$/.test(urlCalc)) state.calcSub = urlCalc;
    render();
    const root = document.getElementById('root');
    // שכבת התצוגה המקדימה של הדוח (report-root) היא אחות של root ולכן מטופלת במאזין נפרד
    const reportRoot = document.getElementById('report-root');
    reportRoot.addEventListener('click', (e) => {
        const t = e.target.closest('button');
        if (!t) return;
        if (t.dataset.reportClose !== undefined) {
            reportRoot.classList.remove('show');
            document.body.classList.remove('report-open');
        }
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && reportRoot.classList.contains('show')) {
            reportRoot.classList.remove('show');
            document.body.classList.remove('report-open');
        }
    });

    root.addEventListener('change', (e) => {
        const t = e.target;
        if (t.id === 'maslaka-input') { void onMaslaka(t.files); return; }
        if (t.id === 'f161-input') { void on161(t.files); return; }
        if (t.id === 'diff-input') { void onDiffFiles(t.files); return; }
        if (t.id === 'nif-input') { void onNifFiles(t.files); return; }
        if (t.id.startsWith('doc-input-')) { void onDoc(t.id.slice('doc-input-'.length), t.files); return; }
        if (t.id === 'assets-input') { void onAssetFiles(t.files); return; }
        if (t.dataset.asq) { state.assets.q[t.dataset.asq] = t.value; render(); return; }
        if (t.dataset.asrow) { const [b, r, f] = t.dataset.asrow.split('|'); const row = state.assets.banks[+b] && state.assets.banks[+b].rows[+r]; if (row) { if (f === 'include') row.include = t.checked; else if (f === 'amount') { const n = parseFloat(String(t.value).replace(/[,\s₪]/g, '')); row.amount = isFinite(n) ? n : 0; } else row[f] = t.value; } render(); return; }
        if (t.id === 'enc-input') { encState.file = t.files && t.files[0] ? t.files[0] : null; return; }
        if (t.dataset.benSrc !== undefined) { state.beneficiaries[+t.dataset.benSrc].source = t.value; composeFamilyValue(); render(); return; }
        if (t.id === 'eq-slider' || t.dataset.eqSlider !== undefined) { state.targetEq = parseInt(t.value); render(); return; }
        if (t.dataset.mktPick !== undefined) { state.marketPick = { ...state.marketPick, [t.dataset.mktPick]: parseInt(t.value) }; render(); return; }
        if (t.id === 'mek-company') {
            state.mekIn.company = t.value; state.mekIn.companyBy = t.value ? 'user' : undefined;
            state.mekResult = '';
            render();
            return;
        }
        if (t.id === 'mek-survrate') {
            state.mekIn.survRate = t.value;
            const d = state.mekData[state.mekIn.company];
            const m = d ? scenarioForRate(d, t.value) : null;
            if (m) {
                state.mekIn.scenario = m.scenario;
                const gs = guaranteesOf(d, m.scenario);
                if (!gs.includes(state.mekIn.guarantee)) state.mekIn.guarantee = gs[0];
            }
            state.mekResult = ''; state.mekLast = null; state.mekAlts = []; state.mekRates = [];
            render();
            return;
        }
        if (t.id === 'mek-guar') { state.mekIn.guarantee = t.value; return; }
        if (t.id === 'mek-manual') { state.mekManual = t.value; return; }
        if (t.id === 'mek-manual-balance') { state.mekIn.balance = t.value; return; }
        if (t.id && t.id.startsWith('mek-')) {
            const map = { 'mek-balance': 'balance', 'mek-gender': 'gender', 'mek-by': 'birthYear', 'mek-age': 'age', 'mek-sby': 'spouseBirthYear' };
            if (map[t.id]) state.mekIn[map[t.id]] = t.value;
            return;
        }
        if (t.dataset.pensionPart) {
            const cur = state.intake['pension-start'] || { value: '', source: '' };
            const pm = (cur.value || '').match(/^(\d{2})\/(\d{4})$/);
            let mm = pm ? pm[1] : (state.pensionStartSel ? state.pensionStartSel.mm : ''),
                yy = pm ? pm[2] : (state.pensionStartSel ? state.pensionStartSel.yy : '');
            if (t.dataset.pensionPart === 'month') mm = t.value; else yy = t.value;
            state.pensionStartSel = { mm, yy };
            if (mm && yy) { state.intake['pension-start'] = { ...cur, value: `${mm}/${yy}` }; state.pensionStartSel = null; }
            render(); return;
        }
        if (t.dataset.survclass !== undefined) { state.netin.survClass = t.value; const _sy = window.scrollY; render(); window.scrollTo(0, _sy); return; }
        if (t.dataset.survassume !== undefined) { state.netin.survAssumeOk = t.checked; const _sy = window.scrollY; render(); window.scrollTo(0, _sy); return; }
        if (t.dataset.f161 || t.dataset.grant || t.dataset.intake || t.dataset.goalText || t.dataset.net || t.dataset.netcheck !== undefined) {
            // Commit (blur/change) of edit fields: refresh derived panels (161 analysis, retirement, notices).
            // Typing stays re-render-free to preserve focus; accordions stay open via state.open; restore scroll.
            const _sy = window.scrollY;
            render();
            window.scrollTo(0, _sy);
            return;
        }
        if (t.dataset.goal) { state.goals[t.dataset.goal] = t.checked; return; }
        if (t.dataset.ben) {
            const [i, k] = t.dataset.ben.split('|');
            state.beneficiaries[+i][k] = t.value;
            composeFamilyValue();
            syncIntakeInputs('family');
            if (k === 'relation' && t.tagName === 'SELECT') { const _sy = window.scrollY; render(); window.scrollTo(0, _sy); }
            return;
        }
        if (t.dataset.unknownAssump !== undefined) { const v = t.value.trim(); state.unknownAssumption = v === '' ? null : Math.min(100, Math.max(0, Number(v) || 0)); render(); return; }
        if (t.dataset.geoPref !== undefined) { state.geoPref = t.value; render(); return; }
        if (t.dataset.selectId !== undefined) {
            const k = t.dataset.selectId;
            const hh = view ? view.holdings.find(x => trackKeyOf(x.account.account, x.track) === k) : null;
            const val = parseInt(t.value, 10);
            if (!hh || !Number.isInteger(val)) {
                delete state.selections[k];
                delete state.confirmed[k];
            } else {
                const opts = selectorOptionsFor(hh.account, hh.track.baseName || hh.track.name);
                const opt = opts.options.find(o => o.id === val);
                if (!opt) { render(); return; } // ערך שלא מתוך הרשימה המסוננת - לא נשמע
                state.selections[k] = { officialId: opt.id, name: opt.name, balance: hh.track.balance, account: hh.account.account, kind: hh.account.kind, trackName: hh.track.baseName || hh.track.name };
                state.confirmed[k] = 'name:' + opt.name; // הבחירה הידנית היא אישור הזהות המדויק - matchIdentityOf של הזהות שתיושם
            }
            render(); return;
        }
        if (t.dataset.eligible !== undefined) { state.eligible[t.dataset.eligible] = t.checked; render(); return; }
        if (t.dataset.ins) { const [ns, i, k] = t.dataset.ins.split('|'); insApply(state, ns, +i, k, t.type === 'checkbox' ? t.checked : t.value); render(); return; }
        if (t.dataset.calc) { calcApply(state, t.dataset.calc, t.value); render(); return; }
    });

    root.addEventListener('input', (e) => {
        const t = e.target;
        if (t.dataset.f161) { state.f161[t.dataset.f161] = t.value; state.f161Confirmed = false; return; }
        if (t.dataset.grant) {
            const [i, k] = t.dataset.grant.split('|');
            state.f161.grants[+i][k] = t.value; state.f161Confirmed = false; return;
        }
        if (t.dataset.goalText) { state.goals[t.dataset.goalText] = t.value; return; }
        if (t.dataset.ins) { const [ns, i, k] = t.dataset.ins.split('|'); insApply(state, ns, +i, k, t.value); return; }
        if (t.dataset.calc) { calcApply(state, t.dataset.calc, t.value); return; }
        if (t.dataset.agent) {
            const a = agentBrand();
            a[t.dataset.agent] = t.value;
            try { localStorage.setItem('agent-brand', JSON.stringify(a)); } catch {}
            return;
        }
        if (t.dataset.survclass !== undefined) { state.netin.survClass = t.value; const _sy = window.scrollY; render(); window.scrollTo(0, _sy); return; }
        if (t.dataset.survassume !== undefined) { state.netin.survAssumeOk = t.checked; const _sy = window.scrollY; render(); window.scrollTo(0, _sy); return; }
        if (t.dataset.netcheck) { state.netin[t.dataset.netcheck] = t.checked; updateNetResult(); return; }
        if (t.dataset.net) { state.netin[t.dataset.net] = t.value; if (t.dataset.net === 'pointsSpouse' || t.dataset.net === 'otherSpouse') state.netin.survAssumeOk = false; updateNetResult(); return; }
        if (t.dataset.kib) { state.kibua[t.dataset.kib] = t.value; updateKibua(); return; }
        if (t.dataset.reng) { state.retEng[t.dataset.reng] = t.type === 'checkbox' ? (t.checked ? '1' : '') : t.value; const el = document.getElementById('reng-result'); if (el) el.innerHTML = taxAltsResultHtml(); return; }
        if (t.dataset.allocHorizon !== undefined) { state.alloc.horizon = t.value; const sc = document.getElementById('alloc-scenarios'); if (sc) sc.innerHTML = allocScenariosHtml(); return; }
        if (t.dataset.alloc) { state.alloc[t.dataset.alloc] = t.value; const _sy = window.scrollY; render(); window.scrollTo(0, _sy); return; }
        if (t.dataset.rg) { setRg(t.dataset.rg, t.value); updateRgFlags(); return; }
        if (t.dataset.intake) {
            const [id, k] = t.dataset.intake.split('|');
            const cur = state.intake[id] || { value: '', source: '' };
            state.intake[id] = { ...cur, [k]: t.value }; return;
        }
        if (t.id === 'eq-slider' || t.dataset.eqSlider !== undefined) {
            state.targetEq = parseInt(t.value);
            refreshTargetLive();
            return;
        }
    });

    root.addEventListener('click', (e) => {
        const t = e.target.closest('button');
        if (!t) return;
        if (t.dataset.mktClear !== undefined) { const m = { ...state.marketPick }; delete m[t.dataset.mktClear]; state.marketPick = m; render(); return; }
        if (t.dataset.gotoAcc) { const id = t.dataset.gotoAcc; state.open[id] = true; render(); const el = document.getElementById('acc-' + id); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
        if (t.dataset.selectClear !== undefined) { const k = t.dataset.selectClear; delete state.selections[k]; delete state.confirmed[k]; delete state.eligible[k]; render(); return; }
        if (t.dataset.acc) {
            const id = t.dataset.acc;
            const nowOpen = !(t.getAttribute('aria-expanded') === 'true');
            state.open[id] = nowOpen;
            const body = document.getElementById('acc-body-' + id);
            const caret = t.querySelector('.acc-caret');
            if (body) body.hidden = !nowOpen;
            t.setAttribute('aria-expanded', nowOpen ? 'true' : 'false');
            if (caret) caret.textContent = nowOpen ? '▾' : '◂';
            return;
        }
        if (t.dataset.modeToggle !== undefined) { state.mode = state.mode === 'portfolio' ? 'retirement' : 'portfolio'; render(); window.scrollTo(0, 0); return; }
        if (t.dataset.modeSet) { if (state.mode !== t.dataset.modeSet) { state.mode = t.dataset.modeSet; render(); window.scrollTo(0, 0); } return; }
        if (t.dataset.insAdd) { const st = state[t.dataset.insAdd]; st.policies.push(insInit(t.dataset.insAdd)); render(); return; }
        if (t.dataset.insDel) { const [ns, i] = t.dataset.insDel.split('|'); state[ns].policies.splice(+i, 1); render(); return; }
        if (t.dataset.exclude !== undefined) { state.excluded[t.dataset.exclude] = true; state.confirmed[t.dataset.exclude] = false; state.eligible[t.dataset.exclude] = false; render(); return; } // הוצאה מנקה גם בחירת-שינוי: החזרה לממוצע דורשת בחירה מפורשת מחדש (אותו עקרון כמו סטיית זהות)
        if (t.dataset.include !== undefined) { state.excluded[t.dataset.include] = false; render(); return; }
        if (t.dataset.pendingRestore !== undefined) {
            const pc = state.pendingClient; if (!pc || pc.reason === 'mismatch') return; // סתירת זהות ידועה לא נפתרת בהצהרת שוויון
            if (pc.netin) Object.assign(state.netin, pc.netin);
            if (pc.kibua) Object.assign(state.kibua, pc.kibua);
            if (pc.alloc) Object.assign(state.alloc, pc.alloc);
            if (pc.goals) Object.assign(state.goals, pc.goals);
            if (pc.mekIn) state.mekIn = { ...pc.mekIn };
            if (pc.mekManual !== undefined) state.mekManual = pc.mekManual;
            // מיזוג ולא דריסה: פוליסות/שדות שהוזנו אחרי הטעינה החדשה נשמרים; המופרדים מתווספים אחריהם.
            if (pc.life) state.life = { policies: [...state.life.policies, ...(pc.life.policies || []).map(p => ({ ...p }))], seq: Math.max(state.life.seq, pc.life.seq || 1) };
            if (pc.health) state.health = { policies: [...state.health.policies, ...(pc.health.policies || []).map(p => ({ ...p }))], seq: Math.max(state.health.seq, pc.health.seq || 1) };
            if (pc.calc) state.calc = { ...pc.calc, ...state.calc }; // ערכים חדשים שהוזנו אחרי הטעינה גוברים; המופרדים ממלאים רק מפתחות חסרים
            if (pc.f161) { state.f161 = { ...pc.f161, grants: (pc.f161.grants || []).map(g => ({ ...g })) }; state.f161Tried = true; state.f161Confirmed = false; if (pc.f161File) rawVault.f161 = pc.f161File; }
            state.pendingClient = null; state.mekResult = ''; render(); return;
        }
        if (t.dataset.pendingSave !== undefined) {
            const pc = state.pendingClient; if (!pc) return;
            const out = { kind: 'segregated-client-inputs', savedAt: pc.savedAt, reason: pc.reason, netin: pc.netin, kibua: pc.kibua, alloc: pc.alloc, goals: pc.goals, mekIn: pc.mekIn, mekManual: pc.mekManual, life: pc.life, health: pc.health, calc: pc.calc, f161: pc.f161, note: 'קלטים שהופרדו מלקוח קודם; אינם חלק מקובץ המתכנן של הלקוח הנוכחי. קובץ ה-PDF של טופס 161 אינו נכלל כאן - יש להעלותו מחדש.' };
            const blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' });
            const a2 = document.createElement('a'); a2.href = URL.createObjectURL(blob); a2.download = 'segregated-inputs.json'; a2.click(); setTimeout(() => URL.revokeObjectURL(a2.href), 5000);
            return;
        }
        if (t.dataset.pendingDiscard !== undefined) { state.pendingClient = null; render(); return; }
        if (t.dataset.diffOpen !== undefined) { state.diff.open = true; state.open['masdiff'] = true; render(); setTimeout(() => { const el = document.getElementById('acc-masdiff'); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 50); return; }
        if (t.dataset.peersRun !== undefined) { void runPeers(); return; }
        if (t.dataset.reportPreview !== undefined) {
            if (!view) return;
            const el = document.getElementById('report-root');
            el.innerHTML = '<div class="rep-close-bar"><button type="button" class="ghostbtn" data-report-close>סגירת התצוגה</button></div>' + renderReport(state, view, agentBrand());
            el.classList.add('show');
            document.body.classList.add('report-open');
            return;
        }
        if (t.dataset.baPreview !== undefined) {
            if (!view) return;
            const el = document.getElementById('report-root');
            el.innerHTML = '<div class="rep-close-bar"><button type="button" class="ghostbtn" data-report-close>סגירת התצוגה</button></div>' + renderBeforeAfter(state, view, agentBrand());
            el.classList.add('show');
            document.body.classList.add('report-open');
            return;
        }
        if (t.dataset.baPrint !== undefined) {
            if (!view) return;
            const el = document.getElementById('report-root');
            el.innerHTML = renderBeforeAfter(state, view, agentBrand());
            el.classList.add('show');
            document.body.classList.add('print-report');
            window.print();
            document.body.classList.remove('print-report');
            return;
        }
        if (t.dataset.reportDownload !== undefined) { void downloadClientReport(); return; }
        if (t.dataset.reportPrint !== undefined) {
            if (!view) return;
            const el = document.getElementById('report-root');
            el.innerHTML = renderReport(state, view, agentBrand());
            el.classList.add('show');
            document.body.classList.add('print-report');
            window.print();
            document.body.classList.remove('print-report');
            return;
        }
        if (t.dataset.reportClose !== undefined) {
            document.getElementById('report-root').classList.remove('show');
            document.body.classList.remove('report-open');
            return;
        }
        if (t.dataset.feedbackCopy !== undefined) {
            const ta = document.getElementById('feedback-text');
            const txt = (ta && ta.value.trim()) || '';
            if (!txt) { const d = document.getElementById('feedback-done'); if (d) d.textContent = 'כתבו משוב קודם.'; return; }
            const payload = 'משוב על אב-הטיפוס הפנסיוני (גרסה 8.11.2026):\n' + txt;
            const done = document.getElementById('feedback-done');
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(payload).then(() => { if (done) done.textContent = 'הועתק. הדביקו אצל מי שתבחרו.'; }).catch(() => { if (done) done.textContent = 'ההעתקה נכשלה - סמנו את הטקסט והעתיקו ידנית.'; });
            } else if (done) done.textContent = 'העתקה אוטומטית לא זמינה - סמנו והעתיקו ידנית.';
            return;
        }
        if (t.dataset.action === 'demo') {
            // הדגמה מחליפה את כל הקשר הלקוח: קלטים קיימים (כולל דפי עבודה) מופרדים קודם למצב ממתין, לא נמחקים.
            const prevDemoClient = state.portfolio && state.portfolio.client ? { name: state.portfolio.client.name || '', id: state.portfolio.client.id || '' } : null;
            segregateClientInputs('unresolved', prevDemoClient);
            if (state.pendingClient) state.open['step2'] = true;
            resetVault();
            state.portfolio = demoPortfolio();
            state.f161 = { ...DEMO_161, grants: DEMO_161.grants.map(x => ({ ...x })) };
            state.f161Found = { ...DEMO_FOUND };
            state.f161Tried = true;
            state.f161Confirmed = false;
            state.reports = []; state.demo = true;
            state.f161Status = 'נטענו נתוני הדגמה סינתטיים להמחשה בלבד.';
            render(); return;
        }
        if (t.dataset.action === 'save-enc') { void saveEncryptedPortfolio(); return; }
        if (t.dataset.action === 'load-enc') { void loadEncryptedPortfolio(); return; }
        if (t.dataset.action === 'confirm161') {
            // אישור מפורש בלבד, אחרי צפייה בשדות: חילוץ אינו אימות. אין דרך אחרת להדליק את הדגל.
            if (state.f161Tried && Object.keys(state.f161Found).length) state.f161Confirmed = true;
            render(); return;
        }
        if (t.dataset.action === 'addgrant') {
            state.f161Confirmed = false;
            state.f161.grants.push({ payer: '', code: '', amount: '' });
            render(); return;
        }
        if (t.dataset.rmgrant !== undefined) {
            state.f161Confirmed = false;
            state.f161.grants.splice(+t.dataset.rmgrant, 1);
            render(); return;
        }
        if (t.dataset.mekCalc !== undefined) {
            const val = (id) => { const el = document.getElementById(id); return el ? el.value : ''; };
            state.mekIn = { ...state.mekIn, balance: val('mek-balance'), gender: val('mek-gender'), birthYear: val('mek-by'), age: val('mek-age'), spouseBirthYear: val('mek-sby'), guarantee: state.mekIn.guarantee };
            // גיל פרישה ריק: גבר 67; אישה ילידת 1970 ואילך 65 (חוק גיל פרישה, תיקון 7 - ס"ח 2933 עמ' 174).
            // אישה ילידת לפני 1970 - הגיל תלוי בחודש הלידה, ולכן נדרשת הזנה (לא מנחשים). הערך שנקבע נכתב לשדה וגלוי.
            if (!String(state.mekIn.age || '').trim()) {
                const by = +state.mekIn.birthYear;
                const def = state.mekIn.gender === 'f' ? (by >= 1970 ? 65 : null) : 67;
                if (def === null) { state.mekResult = `<div class="mekres err">הזינו גיל פרישה. לאישה ילידת לפני 1970 גיל הפרישה תלוי בחודש הלידה (62-65), ולכן אין ברירת מחדל.</div>`; state.mekLast = null; state.mekAlts = []; render(); return; }
                state.mekIn.age = String(def);
            }
            {
                const d0 = state.mekData[state.mekIn.company];
                if (d0 && !scenarioForRate(d0, state.mekIn.survRate || '60')) {
                    state.mekResult = `<div class="mekres err">לשיעור ${esc(state.mekIn.survRate)}% לבן/בת הזוג אין טבלה בתקנון של גוף זה - נדרש ציטוט מהקרן. אפשר לבחור שיעור שיש לו טבלה.</div>`;
                    state.mekLast = null; state.mekAlts = []; state.mekRates = []; render(); return;
                }
            }
            void (async () => {
                try {
                    const r = await mekademEstimate({
                        company: state.mekIn.company, scenario: state.mekIn.scenario, guarantee: state.mekIn.guarantee,
                        gender: state.mekIn.gender, birthYear: +state.mekIn.birthYear, age: +state.mekIn.age,
                        spouseBirthYear: state.mekIn.spouseBirthYear ? +state.mekIn.spouseBirthYear : null,
                    });
                    if (r.error) {
                        state.mekResult = `<div class="mekres err">${esc(r.error)}</div>`;
                        state.mekLast = null;
                        state.mekAlts = [];
                    } else if (r.baseOnly) {
                        // אין התאמה מאומתת לגילאים שהוזנו: לא מוצגים מקדם/קצבה מספריים כדי שלא ייקראו כקצבה בפועל.
                        // אין שמירה ל-mekLast - הדוח, פאנל הנטו והתרחישים המשפחתיים נשארים במצב "אין אומדן".
                        const notes = [...r.notes, ...r.caveats];
                        state.mekResult = `<div class="mekres"><b>לא מוצג אומדן:</b> בטבלאות שאומתו מול התקנון אין התאמה להפרש הגילאים שהוזן, ולכן לא מוצגים מקדם וקצבה חודשית. הצגת מקדם הבסיס (המניח הפרש גילאים בסיסי) כמספר הייתה עלולה להיקרא כקצבה בפועל, ולכן היא נמנעת.${notes.length ? `<ul class="small">${notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}</div>`;
                        state.mekLast = null;
                        state.mekAlts = [];
                    } else {
                        const bal = parseFloat(state.mekIn.balance);
                        const pension = bal > 0 ? Math.round(bal / r.k) : null;
                        const notes = [...(r.adjNote ? [r.adjNote] : []), ...r.notes, ...r.caveats];
                        state.mekResult = `<div class="mekres"><b>מקדם משוער: ${r.k}</b>${pension ? ` · קצבה חודשית משוערת: <b>₪${pension.toLocaleString('he-IL')}</b>` : ''}${notes.length ? `<ul class="small">${notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}</div>`;
                        state.mekLast = { k: r.k, pension, balance: bal, company: state.mekIn.company, scenario: state.mekIn.scenario, guarantee: state.mekIn.guarantee, age: +state.mekIn.age };
                        // השוואת שיעורי הקצבה לבן/בת הזוג באותו גוף ובאותה תקופת הבטחה - רק שיעורים שהתקנון מפרסם להם טבלה
                        try {
                            const d = await loadCompany(state.mekIn.company);
                            const rows = [];
                            for (const rate of SURV_RATES) {
                                const m = scenarioForRate(d, rate);
                                if (!m) { rows.push({ rate, missing: 'אין טבלה בתקנון - נקבע ע"י אקטואר הקרן' }); continue; }
                                if (!guaranteesOf(d, m.scenario).includes(state.mekIn.guarantee)) { rows.push({ rate, missing: 'אין טבלה לתקופת ההבטחה שנבחרה' }); continue; }
                                const rr = rate === state.mekIn.survRate ? r : await mekademEstimate({ company: state.mekIn.company, scenario: m.scenario, guarantee: state.mekIn.guarantee, gender: state.mekIn.gender, birthYear: +state.mekIn.birthYear, age: +state.mekIn.age, spouseBirthYear: state.mekIn.spouseBirthYear ? +state.mekIn.spouseBirthYear : null });
                                if (rr.error) rows.push({ rate, missing: rr.error });
                                else if (rr.baseOnly) rows.push({ rate, missing: 'אין התאמה מאומתת להפרש הגילאים' });
                                else rows.push({ rate, k: rr.k, pension: bal ? Math.round(bal / rr.k) : null });
                            }
                            state.mekRates = rows;
                            const base = rows.find(x => x.rate === state.mekIn.survRate);
                            state.mekResult += `<div class="alts-scroll"><table class="altstbl"><thead><tr><th>שיעור לבן/בת הזוג</th><th>מקדם</th><th>קצבה חודשית לפנסיונר</th><th>קצבה לבן/בת הזוג אחרי פטירה</th></tr></thead><tbody>${rows.map(x => x.missing
                                ? `<tr><td>${x.rate}%</td><td colspan="3" class="muted small">${esc(x.missing)}</td></tr>`
                                : `<tr${x.rate === state.mekIn.survRate ? ' class="top"' : ''}><td><b>${x.rate}%</b>${x.rate === state.mekIn.survRate ? ' (נבחר)' : ''}</td><td>${x.k}</td><td>${x.pension ? '₪' + x.pension.toLocaleString('he-IL') + (base && base.pension && x.rate !== state.mekIn.survRate ? ` <span class="muted small">(${x.pension >= base.pension ? '+' : '-'}₪${Math.abs(x.pension - base.pension).toLocaleString('he-IL')})</span>` : '') : '-'}</td><td>${x.pension ? '₪' + Math.round(x.pension * (+x.rate) / 100).toLocaleString('he-IL') : '-'}</td></tr>`).join('')}</tbody></table></div><div class="muted small">מקור: טבלאות התקנון של הגוף (${esc(d.meta.annex || '')}). אותה יתרה, גיל ותקופת הבטחה; משתנה רק שיעור הקצבה לבן/בת הזוג.</div>`;
                        } catch (e4) { state.mekRates = []; }
                        // השוואת תרחישים מול חלופות זכאיות: אותם קלטים מול עד 4 גופים מחלופות מדורגות (אותו מנדט, זכאות מאומתת).
                        state.mekAlts = [];
                        if (view && pension > 0) {
                            try {
                                const seen = new Set([state.mekIn.company]);
                                const wanted = [];
                                for (const a of state.portfolio.accounts) {
                                    if (a.kind !== 'pensia') continue;
                                    for (const h of view.holdings.filter(x => x.account === a)) {
                                        if (!h.match || !h.match.officialId) continue;
                                        for (const it of alternativesFor(a, h.match, clientAge()).items) {
                                            // החברה נגזרת מהיצרן הרשמי של שורת החלופה (parentCoName),
                                            // לא משם התצוגה בלבד - שמות גנריים בלי חברה לא מדולגים.
                                            const key = inferCompany(it.parentCoName || '', it.name);
                                            if (!key || seen.has(key) || wanted.some(w => w.key === key)) continue;
                                            seen.add(key);
                                            wanted.push({ key, track: it.name });
                                            if (wanted.length >= 4) break;
                                        }
                                        if (wanted.length >= 4) break;
                                    }
                                    if (wanted.length >= 4) break;
                                }
                                for (const w of wanted) {
                                    let scW = state.mekIn.scenario;
                                    try { const dW = await loadCompany(w.key); const mW = scenarioForRate(dW, state.mekIn.survRate || '60'); if (mW) scW = mW.scenario; else { const comp0 = COMPANIES.find(c => c.key === w.key); state.mekAlts.push({ key: w.key, label: comp0 ? comp0.label : w.key, track: w.track, error: `לשיעור ${state.mekIn.survRate}% לבן/בת הזוג אין טבלה בתקנון של גוף זה`, avail: '' }); continue; } } catch (e5) { /* ממשיכים עם המפתח הקיים */ }
                                    const rr = await mekademEstimate({
                                        company: w.key, scenario: scW, guarantee: state.mekIn.guarantee,
                                        gender: state.mekIn.gender, birthYear: +state.mekIn.birthYear, age: +state.mekIn.age,
                                        spouseBirthYear: state.mekIn.spouseBirthYear ? +state.mekIn.spouseBirthYear : null,
                                    });
                                    const comp = COMPANIES.find(c => c.key === w.key);
                                    if (rr.error) {
                                        let avail = '';
                                        try { const d = await loadCompany(w.key); avail = scenariosOf(d).map(x => SCENARIO_LABELS[x] || x).join(', '); } catch (e3) {}
                                        state.mekAlts.push({ key: w.key, label: comp ? comp.label : w.key, track: w.track, error: rr.error, avail });
                                    }
                                    else if (rr.baseOnly) state.mekAlts.push({ key: w.key, label: comp ? comp.label : w.key, track: w.track, baseOnly: true });
                                    else state.mekAlts.push({ key: w.key, label: comp ? comp.label : w.key, track: w.track, k: rr.k, pension: Math.round(bal / rr.k) });
                                }
                            } catch (e2) { /* השוואה נכשלה - הכרטיס הראשי עדיין תקין */ }
                        }
                    }
                } catch (err) {
                    state.mekResult = `<div class="mekres err">שגיאה בחישוב: ${esc(String(err && err.message || err))}</div>`;
                    state.mekLast = null;
                    state.mekAlts = [];
                }
                render();
                updateNetResult();
            })();
            return;
        }
        if (t.dataset.attest) {
            const it = INTAKE.find(x => x.id === t.dataset.attest);
            if (it) state.intake[it.id] = { value: it.attestation, source: 'הצהרת הלקוח (נרשמה בעת הסימון)' };
            render(); return;
        }
        if (t.dataset.edit) {
            const input = root.querySelector(`input[data-f161="${t.dataset.edit}"]`);
            if (input) { input.removeAttribute('readonly'); input.focus(); input.select(); }
            return;
        }
        if (t.dataset.doccand !== undefined) {
            const [key, i] = t.dataset.doccand.split('|');
            addDocCandidates(key, [+i]);
            render(); return;
        }
        if (t.dataset.action && t.dataset.action.startsWith('docaddall|')) {
            const key = t.dataset.action.split('|')[1];
            addDocCandidates(key, getDoc(key).candidates.map((_, i) => i));
            render(); return;
        }
        if (t.dataset.action === 'enctoggle') { state.encOpen = !state.encOpen; render(); if (state.encOpen) { const el = document.getElementById('enc-panel'); if (el) el.scrollIntoView({ block: 'nearest' }); } return; }
        if (t.dataset.action && t.dataset.action.startsWith('calcsub|')) { state.calcSub = t.dataset.action.split('|')[1]; render(); return; }
        if (t.dataset.action === 'asmanual') { state.assets.banks.push({ file: 'הזנה ידנית', bank: 'הזנה ידנית', date: '', manual: true, rows: [
            { key: 'cashIls', label: 'עו"ש ופיקדונות', source: 'הזנה ידנית', cat: 'cash', amount: 0, eq: 0, page: '-', include: true },
            { key: 'sec', label: 'תיק ני"ע', source: 'הזנה ידנית', cat: 'securities', amount: 0, eq: null, eqRange: 'u', page: '-', include: true },
            { key: 'managed', label: 'תיק מנוהל', source: 'הזנה ידנית', cat: 'securities', amount: 0, eq: null, eqRange: 'u', page: '-', include: true },
            { key: 'cashFx', label: 'מט"ח', source: 'הזנה ידנית', cat: 'cash', amount: 0, eq: 0, fx: true, page: '-', include: true },
            { key: 'credit', label: 'אשראי והלוואות בבנק', source: 'הזנה ידנית', cat: 'liability', amount: 0, eq: 0, page: '-', include: true }] }); render(); return; }
        if (t.dataset.action && t.dataset.action.startsWith('asrm|')) { state.assets.banks.splice(+t.dataset.action.split('|')[1], 1); render(); return; }
        if (t.dataset.action === 'benadd') {
            state.beneficiaries.push({ name: '', relation: '', source: 'הזנה ידנית - ללא מסמך' });
            render(); return;
        }
        if (t.dataset.benRm !== undefined) {
            state.beneficiaries.splice(+t.dataset.benRm, 1);
            composeFamilyValue();
            render(); return;
        }
    });
});
