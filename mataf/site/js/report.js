// דוח מקוצר "מצב טרום טיפול" - מבנה בהשראת דוחות סוכנות סטנדרטיים, מיתוג אישי של הסוכן בלבד.
// כל הנתונים מקובץ המסלקה שהועלה (XML) וממאגרי האוצר הרשמיים שכבר שולבו בכלי.
// נתון שאין במקור מוצג כ"לא התקבל מידע" - לעולם לא מומצא ולא מחושב ממוצע.

import { KIND_LABEL } from './maslaka.js';
import { alternativesFor, mandateOf, MANDATE_LABEL, solveTargetPlan, includedHoldingsOf, trackKeyOf, SEVERANCE_CAVEAT, REF_DATE, GEO_LABEL } from './analysis.js';

const REPORT_EMPTY = 'לא התקבל מידע';
// שארפ רשמי (שדה SHARPE_RATIO כפי שדווח) שלא פורסם לתקופה 09/2026; הדירוג המשוקלל נשען על חלון 06/2026 נפרד.
const SHARPE_EMPTY = 'לא דווח 09/2026';

function rEsc(s) { return String(s ?? '').replace(/S(?:1[;.]?|&)\s*P\s*500/gi, 'S&P 500').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function rFmt(n) { return n === null || n === undefined || !isFinite(n) ? REPORT_EMPTY : Math.round(n).toLocaleString('he-IL'); }
function rFloor(n) { return n === null || n === undefined || !isFinite(n) ? REPORT_EMPTY : Math.floor(n).toLocaleString('he-IL'); }
function rPct(n, d = 1) { return n === null || n === undefined || !isFinite(n) ? REPORT_EMPTY : n.toFixed(d) + '%'; }
function rDate(yyyymmdd) {
    if (!yyyymmdd || yyyymmdd.length < 8) return REPORT_EMPTY;
    return `${yyyymmdd.slice(6, 8)}/${yyyymmdd.slice(4, 6)}/${yyyymmdd.slice(0, 4)}`;
}
function rPeriod(yyyymm) {
    // מוסכמת הדוח: יום 15 לחודש
    if (!yyyymm || yyyymm.length < 6) return REPORT_EMPTY;
    return `15/${yyyymm.slice(4, 6)}/${yyyymm.slice(0, 4)}`;
}
function rPeriodShort(yyyymm) {
    if (!yyyymm || yyyymm.length < 6) return REPORT_EMPTY;
    return `${yyyymm.slice(4, 6)}/${yyyymm.slice(0, 4)}`;
}

// חשבונות/מסלולים מתחת ל-1 ₪ אינם מוצגים (כלל התצוגה שביקש המשתמש, תקף גם לדוח)
function reportAccounts(p) {
    return p.accounts.filter(a => (a.totalBalance || 0) >= 1);
}

// האם הייתה הפקדה שוטפת (SUG-HAFKADA=1) ב-3 החודשים שקדמו למועד הערך
function depositInLast3Months(a, asOf) {
    if (!asOf || asOf.length < 6) return null;
    const y = +asOf.slice(0, 4), m = +asOf.slice(4, 6);
    const ref = y * 12 + m;
    const reg = (a.deposits || []).filter(d => d.sug === '1' && d.period && d.total !== null);
    const recent = reg.filter(d => {
        const dm = +d.period.slice(0, 4) * 12 + (+d.period.slice(4, 6));
        return ref - dm >= 0 && ref - dm < 3;
    });
    if (!recent.length) return null;
    return recent.reduce((n, d) => n + d.total, 0) / recent.length;
}

function donutSvg(parts, colors) {
    // parts: [{label, value}]; מציג דונאט פשוט + מקרא
    const total = parts.reduce((n, x) => n + x.value, 0);
    if (!total) return `<div class="rep-empty">${REPORT_EMPTY}</div>`;
    const R = 40, C = 2 * Math.PI * R;
    let off = 0;
    const segs = parts.map((x, i) => {
        const frac = x.value / total;
        const seg = `<circle r="${R}" cx="60" cy="60" fill="none" stroke="${colors[i % colors.length]}" stroke-width="18" stroke-dasharray="${(frac * C).toFixed(2)} ${C.toFixed(2)}" stroke-dashoffset="${(-off * C).toFixed(2)}" transform="rotate(-90 60 60)"/>`;
        off += frac;
        return seg;
    }).join('');
    const legend = parts.map((x, i) => `<div class="rep-leg-row"><span class="rep-leg-dot" style="background:${colors[i % colors.length]}"></span>${rEsc(x.label)}: ${rFmt(x.value)} ₪ (${Math.round(x.value / total * 100)}%)</div>`).join('');
    return `<div class="rep-donut"><svg viewBox="0 0 120 120" width="130" height="130">${segs}</svg><div class="rep-leg">${legend}</div></div>`;
}

const REP_COLORS = ['#6d5046', '#8a6a5e', '#795b51', '#9c8474', '#634640', '#b39d8f'];

export function buildReportModel(state, view) {
    const p = state.portfolio;
    const accs = reportAccounts(p);
    const rejected = (view && view.rejectedImports) || []; // רשומות שנדחו בייבוא - גלויות בדוח, לעולם לא בסכומים
    const asOf = accs.map(a => a.asOf).filter(Boolean).sort().pop() || '';
    const total = accs.reduce((n, a) => n + a.totalBalance, 0);

    // דונאט סוג מוצר ויצרן (מאזנים נוכחיים בלבד)
    const byKind = new Map(), byProducer = new Map();
    for (const a of accs) {
        const kl = KIND_LABEL[a.kind] || a.kind;
        byKind.set(kl, (byKind.get(kl) || 0) + a.totalBalance);
        byProducer.set(a.yatzran, (byProducer.get(a.yatzran) || 0) + a.totalBalance);
    }
    const kindParts = [...byKind.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
    const prodParts = [...byProducer.entries()].map(([label, value]) => ({ label, value })).filter(x => x.value > 0).sort((a, b) => b.value - a.value);

    // חשיפה משוקללת: מניות ממאגרי האוצר למסלולים שזוהו לפי קוד רשמי. חו"ל/מט"ח מחושבים רק ממסלולים שהמאגר מספק עבורם את הנתון;
    // היכן שאין נתון מוצג "לא התקבל מידע" (מאגרי הפנסיה/הגמל הרשמיים אינם כוללים שדות חו"ל/מט"ח ברמת המסלול).
    let eqS = 0, eqW = 0, foS = 0, foW = 0, fxS = 0, fxW = 0, nameW = 0;
    for (const h of view.holdings) {
        const r = h.match && h.match.row;
        if (!r) continue;
        const w = h.track.balance;
        if (r.eq !== null && r.eq !== undefined) { eqS += w * r.eq; eqW += w; if (h.match && h.match.userSelected) nameW += w; }
        if (r.fo !== null && r.fo !== undefined) { foS += w * r.fo; foW += w; }
        if (r.fx !== null && r.fx !== undefined) { fxS += w * r.fx; fxW += w; }
    }
    const exposure = eqW > 0 ? { eq: eqS / eqW, fo: foW > 0 ? foS / foW : null, fx: fxW > 0 ? fxS / fxW : null, covered: eqW, total, nameOnly: nameW } : null;

    // הפקדות חודשיות: מוצרים עם הפקדה שוטפת ב-3 החודשים האחרונים (מוסכמת דוח הייחוס)
    const depRows = [];
    for (const a of accs) {
        const d = depositInLast3Months(a, asOf);
        if (d !== null) depRows.push({ label: KIND_LABEL[a.kind] || a.kind, plan: a.plan, yatzran: a.yatzran, amount: d });
    }
    const monthlyDepTotal = depRows.length ? depRows.reduce((n, r) => n + r.amount, 0) : null;

    // קצבה צפויה: שדות תחזית של הגוף המנהל (לא חישוב של המערכת)
    const pensionRows = accs.filter(a => a.forecast && (a.kind === 'pensia' || a.kind === 'menahalim')).map(a => ({
        label: `${a.plan} (${a.yatzran})`, without: a.forecast.pensionWithout, with: a.forecast.pensionWith, age: a.forecast.age,
    }));

    // פרמיה חודשית (חיים ובריאות): סכום SACH-DMEI-BITUAH-SHENIGBOO; אם לא קיים בכלל - לא התקבל מידע
    const premVals = accs.map(a => a.premiumCollected).filter(v => v !== null && v !== undefined);
    const premiumTotal = premVals.length ? premVals.reduce((n, v) => n + v, 0) : null;

    // ביטוח
    const disability = accs.map(a => a.disability).filter(v => v !== null && v !== undefined);
    const disabilityTotal = disability.length ? disability.reduce((n, v) => n + v, 0) : null;
    const survRows = accs.map(a => a.survivors).filter(s => s && (s.almana !== null || s.yatom !== null || s.hore !== null));
    const survivorsTotal = survRows.length ? survRows.reduce((n, s) => n + (s.almana || 0) + (s.yatom || 0) + (s.hore || 0), 0) : null;
    const deathVals = accs.flatMap(a => (a.covers || []).map(c => c.sum)).filter(v => v !== null && v !== undefined);
    const deathTotal = deathVals.length ? deathVals.reduce((n, v) => n + v, 0) : null;

    return { p, accs, asOf, total, kindParts, rejected, prodParts, exposure, depRows, monthlyDepTotal, pensionRows, premiumTotal, disabilityTotal, survivorsTotal, deathTotal };
}

// ההחזקות שהמנוע רשאי להציע להן שינוי ליעד: כל ההחזקה המזוהה והנכללת בממוצע, אלא אם הוחרגה במפורש
// (eligible[key] === false). שינוי ברירת מחדל 11.11.2026 בבקשת הבעלים - קודם היה "ללא שינוי עד סימון".
export function eligibleKeysOf(inc, eligibleMap) {
    const m = eligibleMap || {};
    const keys = new Set(inc.filter(x => !x.excludedFromAvg && m[x.key] !== false).map(x => x.key));
    // סימון מפורש נשמר (גם להחזקה שהוצאה מהממוצע) - לגילוי הנאות בדוח ולתאימות לתיקים שמורים
    for (const k of Object.keys(m)) if (m[k] === true) keys.add(k);
    return [...keys];
}

// סעיף יעד החשיפה הכולל בדוח - זהה בסמנטיקה לבקר בסעיף רמת הסיכון בממשק (אותו מנוע, אותן הוראות הצגה).
function targetPlanSection(state, view, portfolio) {
    if (state.targetEq === null || state.targetEq === undefined) return '';
    const inc = includedHoldingsOf(view.holdings, state.confirmed || {}, state.excluded || {});
    const selKeys = eligibleKeysOf(inc, state.eligible);
    if (!selKeys.length) return '';
    if (!inc.length) return '';
    const unident = view.holdings.filter(h => h.equityPct === null);
    const incKeys = new Set(inc.map(x => x.key));
    const whole = {
        totalValue: view.totalValue,
        estFrozen: unident.filter(h => h.estimate).map(h => ({ bal: h.track.balance, eq: h.estimate.eq, lo: h.estimate.lo, hi: h.estimate.hi })),
        noBasisVal: unident.filter(h => !h.estimate).reduce((sum, h) => sum + h.track.balance, 0),
        frozenKnown: view.holdings.filter(h => h.equityPct !== null && !incKeys.has(trackKeyOf(h.account.account, h.track))).map(h => ({ bal: h.track.balance, eq: h.equityPct })),
        unknownAssumption: state.unknownAssumption ?? null,
    };
    const geoPref = state.geoPref || 'any';
    const plan = solveTargetPlan(inc, new Set(selKeys), state.targetEq, baClientAge(portfolio), whole, geoPref, { market: true, picks: state.marketPick || {} });
    const T = state.targetEq;
    const geoNoteRep = geoPref !== 'any' ? ` כיוון גיאוגרפי מועדף שנבחר בכלי: "${GEO_LABEL[geoPref]}" (סיווג לפי מנדט בשם המסלול בלבד - אין שדה רשמי לחלוקת מניות ארץ/חו"ל; מסלולים מסווגים בכיוון ההפוך הודרו, ומסלולים לא-מסווגים אינם מבטיחים את הכיוון).` : '';
    const methodNote = `היעד חל על כל התיק. החזקות שלא נבחרו קפואות; הנבחרות מתכווננות לחשיפת יעד משותפת בכפוף לטווח הזמין בכל קרן (יישור-פערים מכני ושקוף - לא אופטימיזציה מתמטית של שארפ התיק). החזקות עם אומדן מחלקה נספרות בערך האומדן המסומן (*). התמונה לפי ${REF_DATE}; החשיפה בפועל משתנה עם השוק וההפקדות - המחשה מותנית, לא התחייבות לחשיפה עתידית ולא הוראת פעולה.`;
    let body = '';
    if (plan.status === 'underdetermined') {
        body = `<div class="rep-note"><b>לא ניתן לקבוע תכנית יחידה ליעד ${rPct(T)}.</b> ${rFmt(plan.noBasisVal)} ₪ בתיק ללא כל בסיס לחשיפה, ולא הונח עבורם מספר. התכנית תלויה בחלק זה (תרחיש היפותטי חסום 0%-100%, אינו גבול מתמטי - חשיפה ממונפת עלולה לחרוג): אם הוא 0% מניות - על ההחזקות הנבחרות להגיע ל-${rPct(plan.b0.reqSel)} (טווח זמין בכל התיק ${rPct(plan.b0.loAll)}-${rPct(plan.b0.hiAll)}); אם הוא 100% - ל-${rPct(plan.b100.reqSel)} (טווח ${rPct(plan.b100.loAll)}-${rPct(plan.b100.hiAll)}). ניתן להזין הנחה מפורשת בכלי לקבלת תכנית מותנית, או להשלים זיהוי של אותן החזקות.</div>`;
    } else if (plan.status === 'infeasible' && !(plan.per && plan.per.some(p => p.proposal))) {
        body = `<div class="rep-note"><b>היעד ${rPct(T)} לכל התיק אינו בר-השגה בכלים שנבחרו.</b> הטווח הזמין בכל התיק (אומדנים בערכם המסומן): ${rPct(plan.loAll)} - ${rPct(plan.hiAll)}. להרחבת הטווח: סימון החזקות נוספות בכלי, או חלופות מחוץ לקרנות המוחזקות (מעבר בין גופים, עם השלכות ניוד וזכויות).</div>`;
    }
    // גילוי נאות: החזקה שסומנה לשינוי אך הוצאה מהממוצע בחירת המשתמש אינה שורה בתכנית - נאמר במפורש (אינו 'חסר נתון').
    const perKeys = new Set((plan.per || []).map(p => p.key));
    const exclChosen = selKeys.filter(k => !perKeys.has(k) && (state.excluded || {})[k])
        .map(k => { const h = view.holdings.find(x => trackKeyOf(x.account.account, x.track) === k); return h && h.equityPct !== null ? `${rEsc(h.track.name)} (${rEsc(h.account.plan || '')}, חשיפה ידועה ${rPct(h.equityPct)} - קפואה בחשבון הכולל)` : null; }).filter(Boolean);
    const exclNote = exclChosen.length ? `<div class="rep-note">החזקות שסומנו לשינוי אך הוצאו מממוצע הסיכון בחירת המשתמש ולכן אינן מכוונות מספרית: ${exclChosen.join('; ')}. ניתן להחזירן לממוצע ואז לכוון אותן.</div>` : '';
    const closest = plan.status === 'infeasible' && plan.per && plan.per.some(p => p.proposal);
    if (plan.status === 'ok' || closest) {
        const conditionalNote = plan.noBasisVal > 0
            ? `${rFmt(plan.noBasisVal)} ₪ בתיק ללא כל בסיס: התכנית מותנית בהנחת המשתמש כי חלק זה הוא ${rPct(plan.unknownAssumption)} מניות; ההנחה אינה נתון ואינה אומדן של המערכת. `
            : '';
        const propRows = plan.per.map(p => {
            const hName = `${rEsc(p.h.track.name)} (${rEsc(p.h.account.plan || '')})`;
            const pr = p.proposal;
            let action;
            if (!pr || pr.type === 'stay') action = p.note ? rEsc(p.note) : (pr && pr.cappedAt ? `נשאר כפי שהוא - חלק היעד שהוקצה מחוץ לטווח המסלולים המאומתים (${rPct(pr.rangeLo)}-${rPct(pr.rangeHi)}), ולכן לא הושג` : 'נשאר כפי שהוא');
            else if (pr.type === 'market') action = `${pr.sameCompany ? 'מעבר מלא' : 'ניוד לגוף אחר'} ל"${rEsc(pr.track.name)}" (${rEsc(pr.track.parentCoName || '')}, חשיפה ${rPct(pr.track.eq)})${pr.picked ? ' - נבחר ידנית מטבלת השוק' : ' - המדורג ראשון בשוק ליעד ההחזקה'}${pr.sameCompany ? '' : '. לפני ניוד: לבדוק רציפות כיסוי ביטוחי, תקופת אכשרה ודמי ניהול בגוף הקולט'}`;
            else if (pr.type === 'single') action = `מעבר מלא ל"${rEsc(pr.track.name)}" (חשיפה ${rPct(pr.track.eq)})${pr.singleOnly ? ' - מעבר מלא בלבד (שילוב מסלולים בקופה זו לא אומת בתקנון)' : ''}`;
            else if (pr.type === 'mix') {
                const wh = Math.round(pr.wHigh * 1000) / 10, wl = Math.round(pr.wLow * 1000) / 10;
                action = `שילוב באותה קרן/קופה: ${wh}% "${rEsc(pr.high.name)}" (${rPct(pr.high.eq)}) + ${wl}% "${rEsc(pr.low.name)}" (${rPct(pr.low.eq)}). בסיס רגולטורי: ${rEsc(pr.takanon.clause)} (${rEsc(pr.takanon.src)})${pr.ageClause ? '. בחירת מסלול טווח-גיל לא תואם: ' + rEsc(pr.ageClause) : ''}${pr.geoNote ? '. ' + rEsc(pr.geoNote) : ''}`;
            } else action = REPORT_EMPTY;
            if (pr && pr.type !== 'mix' && pr.geoNote) action += '. ' + rEsc(pr.geoNote);
            return `<tr><td>${hName}</td><td>${rPct(p.curEq)} ← ${pr && pr.type !== 'stay' ? rPct(pr.achieved ?? p.curEq) : rPct(p.curEq)}</td><td>${action}</td></tr>`;
        }).join('');
        const anyChange = plan.per.some(p => p.proposal && p.proposal.type !== 'stay');
        body = (closest ? `<div class="rep-note"><b>היעד ${rPct(T)} אינו בר-השגה</b> (טווח אפשרי ${rPct(plan.loAll)} - ${rPct(plan.hiAll)}); התכנית מכוונת לנקודה הקרובה ביותר, ${rPct(plan.closestT)}.</div>` : '') + `<div class="rep-note"><b>מימוש היעד בכל התיק: ${rPct(plan.achievedWholeEst)}* (אומדן כולל${Math.abs(plan.gap) >= 0.05 ? `, פער ${plan.gap > 0 ? '-' : '+'}${rPct(Math.abs(plan.gap))}` : ''}).</b> אי-ודאות התוצאה הכוללת: ${rPct(plan.wholeLo)}-${rPct(plan.wholeHi)} (אומדנים בקצוות טווח המחלקה שלהם${plan.noBasisVal > 0 ? ', חלק ללא-בסיס 0%-100%' : ''} - תרחיש היפותטי חסום להמחשה בלבד, אינו גבול מתמטי; חשיפה ממונפת עלולה לחרוג מ-100%). ${conditionalNote}${geoNoteRep} ${plan.officialOnly ? `מדד נתונים מאומתים בלבד (ללא אומדנים): החלק הזוהה ${rPct(plan.officialOnly.value / view.totalValue * 100)} מהתיק, חשיפה נוכחית ${rPct(plan.officialOnly.eq)}. ` : ''}${methodNote}</div>
        <table class="rep-tbl rep-tbl-small"><tr><th>החזקה נבחרת</th><th>חשיפה נוכחית ← מוצעת</th><th>פעולה מוצעת</th></tr>${propRows}</table>
        ${anyChange ? `<div class="rep-note">${rEsc(SEVERANCE_CAVEAT)}</div>` : ''}${exclNote}`;
    }
    if (!body && !exclNote) return '';
    if (plan.status !== 'ok' && !closest) body += exclNote;
    return `<h3 class="rep-h3">יעד חשיפה מנייתית כולל (הדמיה לפי בחירת המשתמש)</h3>${body}`;
}

export function renderReport(state, view, agent) {
    const m = buildReportModel(state, view);
    const client = m.p.client || { name: m.p.clientName || '', id: '' };
    const clientName = client.name || m.p.clientName || 'הלקוח';
    const today = new Date();
    const dateStr = `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`;
    const addr = [client.street && `${client.street} ${client.houseNo || ''}`.trim(), client.city, client.zip].filter(Boolean).join(', ');
    const agentName = agent.name || 'שרון סימון';
    const NPAGES = 3;

    const header = (n) => `<div class="rep-head"><span>דוח מצב טרום טיפול · ${dateStr}</span><span>עבור הלקוח ${rEsc(clientName)}${client.id ? ` (מזהה לקוח ${rEsc(client.id)})` : ''}</span><span>הוכן על ידי ${rEsc(agentName)}</span></div>`;
    const footer = (n) => `<div class="rep-foot"><span>הופק בתאריך ${dateStr}</span><span>עמוד ${n} מתוך ${NPAGES}</span></div>`;

    // --- עמוד 1: תמונת מצב - הנתונים החשובים קודם ---
    const capitalRows = m.kindParts.filter(x => ['קופת גמל', 'קרן השתלמות', 'גמל להשקעה', 'לא סווג'].includes(x.label))
        .map(x => `<tr><td>${rEsc(x.label)}</td><td>${rFloor(x.value)} ₪</td></tr>`).join('');
    const exposureCard = m.exposure
        ? `<table class="rep-tbl"><tr><th>מניות</th><th>חו"ל</th><th>מט"ח</th></tr><tr><td>${rPct(m.exposure.eq)}</td><td>${m.exposure.fo !== null ? rPct(m.exposure.fo) : REPORT_EMPTY}</td><td>${m.exposure.fx !== null ? rPct(m.exposure.fx) : REPORT_EMPTY}</td></tr></table>
           <div class="rep-note">חשיפה מנייתית לפי הרכב המסלולים שזוהו במאגרי האוצר (כיסוי ${rFmt(m.exposure.covered)} ₪ מתוך ${rFmt(m.exposure.total)} ₪); נכון לתקופת הדיווח האחרונה שפורסמה. מסלולים ללא נתון רשמי אינם משוקללים.${m.exposure.nameOnly ? ` מתוך הכיסוי, ${rFmt(m.exposure.nameOnly)} ₪ זוהו בבחירה ידנית של המשתמש מול המאגר הרשמי, ללא קוד מסלול בקובץ - מסומן בנפרד מזיהוי מאומת-קוד.` : ''} פילוג חו"ל/מט"ח אינו מוצג בדוח זה; זמינותו במאגר הרשמי משתנה בין תקופות, וכשאין מקור מאומת מוצג "לא התקבל מידע".</div>`
        : `<div class="rep-empty">${REPORT_EMPTY}</div>`;
    const page1 = `<div class="rpage">
        ${header(1)}
        <div class="rep-note">דוח מצב טרום טיפול המפרט את מוצרי החיסכון והביטוח שדווחו בקובץ המסלקה שהועלה, במצבם נכון למועד הפקת המידע${m.asOf ? ` (${rDate(m.asOf)})` : ''}. הדוח מבוסס על נתוני המסלקה הפנסיונית ועל נתוני משרד האוצר שפורסמו. נתון שאין במקור מוצג כ"לא התקבל מידע" ואינו מומצא.</div>
        ${m.rejected.length ? `<div class="rep-note"><b>יבוא חלקי - חשבונות שנדחו מהחישוב:</b> ${m.rejected.map(g => `${rEsc(g.label)}: ${g.versions.length} רשומות מתנגשות${g.asOf ? ' באותו תאריך ערך' : ''} (${g.versions.map((vv, vi) => `גרסה ${vi + 1}: ${rFmt(vv.balance)} ₪`).join('; ')})`).join(' · ')}. הרשומות נשמרו כפי שהן ואינן נכללות באף סכום בדוח; אין להתייחס לסכומי הדוח כמלוא התיק.</div>` : ''}
        <h3 class="rep-h3">תמונת מצב</h3>
        <div class="rep-kpis">
            <div class="rep-kpi"><div class="rep-kpi-val">${rFmt(m.total)} ₪</div><div class="rep-kpi-lab">סך החיסכון שצברת</div></div>
            <div class="rep-kpi"><div class="rep-kpi-val">${m.monthlyDepTotal !== null ? rFmt(m.monthlyDepTotal) + ' ₪' : REPORT_EMPTY}</div><div class="rep-kpi-lab">סך הפקדות חודשי</div></div>
            <div class="rep-kpi"><div class="rep-kpi-val">${m.premiumTotal !== null ? rFmt(m.premiumTotal) + ' ₪' : REPORT_EMPTY}</div><div class="rep-kpi-lab">סך פרמיה חודשית (חיים ובריאות)</div></div>
        </div>
        <div class="rep-grid2">
            <div class="rep-card"><div class="rep-card-t">פירוט לפי סוג מוצר</div>${donutSvg(m.kindParts, REP_COLORS)}</div>
            <div class="rep-card"><div class="rep-card-t">פירוט לפי יצרן</div>${donutSvg(m.prodParts, REP_COLORS)}</div>
        </div>
        <div class="rep-grid2">
            <div class="rep-card"><div class="rep-card-t">חשיפה (מניות / חו"ל / מט"ח)</div>${exposureCard}</div>
            <div class="rep-card"><div class="rep-card-t">סכומים הוניים בתוך החיסכון</div>${capitalRows ? `<table class="rep-tbl"><tr><th>סוג</th><th>צבירה</th></tr>${capitalRows}</table>` : `<div class="rep-empty">${REPORT_EMPTY}</div>`}</div>
        </div>
        <div class="rep-card"><div class="rep-card-t">הפקדות חודשיות לפי מוצר${m.monthlyDepTotal !== null ? ` - סך ${rFmt(m.monthlyDepTotal)} ₪` : ''}</div>${m.depRows.length ? `<table class="rep-tbl"><tr><th>סוג</th><th>מוצר</th><th>הפקדה חודשית</th></tr>${m.depRows.map(r => `<tr><td>${rEsc(r.label)}</td><td>${rEsc(r.plan)} (${rEsc(r.yatzran)})</td><td>${rFmt(r.amount)} ₪</td></tr>`).join('')}</table><div class="rep-note">במוצרים שהתקבלה בגינם הפקדה שוטפת ב-3 החודשים האחרונים, לפי דיווח המסלקה. תשואה אישית מתחילת השנה ופילוג נזילות (סחיר/לא-סחיר) אינם נתוני מסלקה ואינם מוצגים במספרים מומצאים.</div>` : `<div class="rep-empty">${REPORT_EMPTY}</div>`}</div>
        ${footer(1)}
    </div>`;

    // --- עמוד 2: מוצרים, מסלולים ותחזית קצבה ---
    const prodRows = m.accs.map((a, i) => {
        const statusOn = (a.status === '1' || a.status === 'פעיל');
        const lastDep = (a.deposits || []).filter(d => d.period).sort((x, y) => y.period.localeCompare(x.period))[0];
        // מבנה חוזי (SUG-HOTZAA) מועדף; כשחסר, מוצג מבנה הדמי ניהול הכללי (MIVNE) מהדיווח
        const feeDep = a.feeContractDep !== null && a.feeContractDep !== undefined ? a.feeContractDep : a.feeDeposit;
        const feeAcc = a.feeContractAcc !== null && a.feeContractAcc !== undefined ? String(a.feeContractAcc) + '%'
            : (a.feeAcc !== null && a.feeAcc !== undefined ? String(a.feeAcc) + '% בפועל בחודש הדיווח†' : REPORT_EMPTY);
        return `<tr>
            <td>${i + 1}. ${rEsc(a.plan)} · ${rEsc(a.yatzran)}<br><span class="rep-note">חשבון ${rEsc(a.account)}</span></td>
            <td>${rFloor(a.totalBalance)} ₪</td>
            <td>${feeDep !== null && feeDep !== undefined ? feeDep + '%' : REPORT_EMPTY}</td>
            <td>${feeAcc !== null && feeAcc !== undefined ? feeAcc + '%' : REPORT_EMPTY}</td>
            <td>${a.salaryLatest !== null && a.salaryLatest !== undefined ? rFmt(a.salaryLatest) + ' ₪' : REPORT_EMPTY}</td>
            <td>${rEsc(a.employer) || REPORT_EMPTY}</td>
            <td><span class="rep-chip ${statusOn ? 'on' : 'off'}">${statusOn ? 'פעיל' : 'לא פעיל'}</span></td>
            <td>${lastDep ? rPeriod(lastDep.period) : REPORT_EMPTY}</td>
        </tr>`;
    }).join('');
    const trackRows = [];
    for (const a of m.accs) {
        for (const t of a.tracks.filter(t => (t.balance || 0) >= 1)) {
            const h = view.holdings.find(x => x.account === a && x.track.name === t.name);
            const r = h && h.match && h.match.row;
            trackRows.push(`<tr>
                <td>${rEsc(a.plan)}</td>
                <td>${rEsc(t.name)}</td>
                <td>${rFloor(t.balance)} ₪<br><span class="rep-note">${a.totalBalance > 0 ? Math.round(t.balance / a.totalBalance * 100) + '% מהמוצר' : ''}</span></td>
                <td>${r && r.eq !== null && r.eq !== undefined ? rPct(r.eq, 0) : REPORT_EMPTY}</td>
                <td>${r && r.y3 !== null && r.y3 !== undefined ? rPct(r.y3) : REPORT_EMPTY}</td>
            </tr>`);
        }
    }
    const page2 = `<div class="rpage">
        ${header(2)}
        <h3 class="rep-h3">מוצרים - סך החיסכון שצברת ${rFmt(m.total)} ₪</h3>
        <table class="rep-tbl rep-tbl-small"><tr><th>מוצר</th><th>צבירה</th><th>דמי ניהול מהפקדה*</th><th>דמי ניהול מצבירה**</th><th>שכר למוצר</th><th>מעסיק</th><th>סטטוס</th><th>הפקדה אחרונה</th></tr>${prodRows}</table>
        <div class="rep-note">* אחוז חד-פעמי מכל הפקדה, לפי מבנה דמי הניהול החוזי בדיווח; כשאין נתון חוזי מוצג מבנה דמי הניהול הכללי של המוצר מהדיווח. ** אחוז שנתי מהצבירה, באותה שיטה. נתוני הלוואות כנגד מוצר פנסיוני עשויים להופיע במידע המסלקה המלא, ואינם מוצגים בניתוח הנוכחי (מגבלת תוכנה). לא ניתן להסיק מהיעדרם בדוח זה שאין הלוואה; יש לבדוק את קובץ המקור ואת הדוח או האישור העדכני מהגוף המנהל. † שיעור שנגבה בפועל בחודש הדיווח (בלוק הוצאות בפועל) - בסיסו (חודשי או שנתי) לא אומת במפרט המסלקה, ולכן אינו נכנס לחישוב החיסכון השנתי ואין להשוותו כשיעור שנתי ללא אימות מול הגוף המנהל.</div>
        <h3 class="rep-h3">נתוני השקעה לפי מסלול</h3>
        <table class="rep-tbl rep-tbl-small"><tr><th>מוצר</th><th>מסלול השקעה</th><th>צבירה</th><th>חשיפה מנייתית</th><th>תשואה מצטברת 3 שנים***</th></tr>${trackRows.join('')}</table>
        <div class="rep-note">*** נתון רשמי ממאגרי משרד האוצר לתקופת הדיווח האחרונה${m.asOf ? ` (${rDate(m.asOf)})` : ''}, למסלולים שזוהו לפי קוד מסלול רשמי. פילוג חו"ל/מט"ח למסלול ותשואות נוספות (חודש אחרון, מתחילת שנה, ממוצע 5 שנים) אינם מוצגים בדוח זה; זמינותם במאגר הרשמי משתנה בין תקופות ויש לבדוק במקור.</div>
        <h3 class="rep-h3">סך קצבה צפויה לגיל פרישה</h3>
        ${m.pensionRows.length ? `<table class="rep-tbl"><tr><th>מוצר</th><th>ללא הפקדות נוספות</th><th>כולל המשך הפקדות</th><th>לגיל</th></tr>${m.pensionRows.map(r => `<tr><td>${rEsc(r.label)}</td><td>${rFmt(r.without)} ₪</td><td>${rFmt(r.with)} ₪</td><td>${r.age || REPORT_EMPTY}</td></tr>`).join('')}</table><div class="rep-note">התחזיות הן של הגוף המנהל כפי שדווחו למסלקה (כוללות את כספי הפיצויים שבקרן); אינן חישוב של מערכת זו. לא כולל קרנות פנסיה ותיקות או פנסיה תקציבית.</div>` : `<div class="rep-empty">${REPORT_EMPTY}</div>`}
        ${targetPlanSection(state, view, m.p)}
        ${footer(2)}
    </div>`;

    // --- עמוד 3: כיסויים ביטוחיים, פרמיות וסיום ---
    const coverRows = m.accs.flatMap(a => (a.covers || []).map(c => ({ a, c })));
    const premRows = coverRows.filter(x => x.c.cost !== null && x.c.cost !== undefined).map(x => `<tr><td>${rEsc(x.c.desc)} (${rEsc(x.a.plan)})</td><td>${rFmt(x.c.cost)} ₪</td><td>${x.c.to ? rDate(x.c.to.replace(/-/g, '')) : REPORT_EMPTY}</td><td>פעיל</td></tr>`).join('');
    const page3 = `<div class="rpage">
        ${header(3)}
        <h3 class="rep-h3">כיסויים ביטוחיים</h3>
        <div class="rep-kpis">
            <div class="rep-kpi"><div class="rep-kpi-val">${m.disabilityTotal !== null ? rFmt(m.disabilityTotal) + ' ₪' : REPORT_EMPTY}</div><div class="rep-kpi-lab">כיסוי לאובדן כושר עבודה (קצבה חודשית)</div></div>
            <div class="rep-kpi"><div class="rep-kpi-val">${m.survivorsTotal !== null ? rFmt(m.survivorsTotal) + ' ₪' : REPORT_EMPTY}</div><div class="rep-kpi-lab">סך קצבה לשאירים</div></div>
            <div class="rep-kpi"><div class="rep-kpi-val">${m.deathTotal ? rFmt(m.deathTotal) + ' ₪' : REPORT_EMPTY}</div><div class="rep-kpi-lab">סך כיסוי למוות</div></div>
        </div>
        <div class="rep-note">הערכים כפי שדווחו במסלקה עבור הכיסויים הקיימים במוצרי החיסכון. כיסויים בפוליסות נפרדות שלא דווחו למסלקה אינם מופיעים.</div>
        <h3 class="rep-h3">פרמיות${m.premiumTotal !== null ? ` - סך פרמיה חודשית ${rFmt(m.premiumTotal)} ₪` : ''}</h3>
        ${premRows ? `<table class="rep-tbl"><tr><th>כיסוי</th><th>עלות חודשית</th><th>תאריך סיום</th><th>סטטוס</th></tr>${premRows}</table>` : `<div class="rep-card"><div class="rep-empty">${REPORT_EMPTY}</div>${m.premiumTotal !== null ? '<div class="rep-note">סך הפרמיה החודשית לעיל נגזר מסכום דמי הביטוח שנגבו לפי דיווח המסלקה; פירוט עלות חודשית לפי כיסוי לא התקבל בדיווח.</div>' : ''}</div>`}
        <div class="rep-endnote">
            <div>לכבוד <b>${rEsc(clientName)}</b>, תודה על ההזדמנות. אשמח לעמוד לרשותך לצורך ריכוז הטיפול בחיסכון הפנסיוני ובכיסויים הביטוחיים, בחינת התאמתם לצרכיך והתייעלות העמלות.</div>
            <div class="rep-letter-sig">בברכה,<br><b>${rEsc(agentName)}</b>${agent.phone ? `<br>טלפון: ${rEsc(agent.phone)}` : ''}${agent.email ? `<br>דוא"ל: ${rEsc(agent.email)}` : ''}</div>
            <div class="rep-disclaimer">הנתונים בדוח זה התקבלו מהמסלקה הפנסיונית, מהגופים המוסדיים ומנתוני משרד האוצר, וכוללים נתונים מחושבים, תחזיות והערכות של הגופים המנהלים כפי שדווחו. אין האחריות על נכונות הנתונים, על שגיאות או על הערכות. אין בדוח משום ייעוץ, המלצה או תחליף לייעוץ אישי.</div>
        </div>
        ${footer(3)}
    </div>`;

    return page1 + page2 + page3;
}

// --- דוח לפני/אחרי מסכם (הדמיה) ---
// "אחרי" = מעבר הדתי של כל מסלול לחלופה המדורגת הראשונה הזכאית להצטרפות (אותו מנגנון alternativesFor של האתר,
// כולל שערי הזכאות שאומתו מול תקנונים). כל הערכים נגזרים מנתוני האוצר הרשמיים 09/2026; דמי הניהול של החלופה הם
// הממוצע השנתי הרשמי שפורסם לעמיתי המסלול - לא הצעה אישית. נתון חסר מוצג כ"לא התקבל מידע".
function baClientAge(p) {
    const bd = p && p.client && p.client.birthDate;
    if (!bd) return null;
    const d = new Date(bd), now = new Date();
    if (isNaN(d)) return null;
    let age = now.getFullYear() - d.getFullYear();
    if (now.getMonth() < d.getMonth() || (now.getMonth() === d.getMonth() && now.getDate() < d.getDate())) age--;
    return age;
}

export function buildBeforeAfterModel(state, view) {
    const p = state.portfolio;
    const accs = reportAccounts(p);
    const age = baClientAge(p);
    const rows = [];
    for (const a of accs) {
        // החישוב השנתי מסתמך רק על שיעור חוזי (שנתי לפי הגדרת SUG-HOTZAA=1). שיעור "בפועל" מבלוק
        // HotzaotBafoalLehodeshDivoach נגבה בחודש הדיווח ובסיסו (חודשי/שנתי) לא אומת במפרט - לעולם לא
        // מוכפל או מושווה כשנתי; כשהוא המקור היחיד החשבון נשאר מחוץ להערכת החיסכון ("לא התקבל מידע").
        const feeAcc = a.feeContractAcc !== null && a.feeContractAcc !== undefined ? a.feeContractAcc : null;
        for (const t of a.tracks.filter(t => (t.balance || 0) >= 1)) {
            const h = view.holdings.find(x => x.account === a && x.track.name === t.name);
            if (!h || !h.match || !h.match.officialId || !h.match.row) continue;
            const alt = alternativesFor(a, h.match, age);
            // שמירת מנדט מעקב מדויק מתבצעת במנוע alternativesFor (mandateOf): חלופות ממנדט אחר מוחרגות שם.
            // אם הוחרגו חלופות בגלל מנדט שונה ולא נותרה אף חלופה זכאית - מוצג הסבר מפורש, לא תחליף שאינו שקול.
            const top = alt.items && alt.items.length ? alt.items[0] : null;
            const mandateBlocked = !top && !alt.comparisonCount && (alt.excludedMandate || 0) > 0;
            rows.push({ account: a, track: t, holding: h, feeAccCur: feeAcc, alt: top, altMeta: alt, mandateBlocked });
        }
    }
    let wSum = 0, eqBefore = 0, eqAfter = 0, feeBefore = 0, feeKnown = 0, covBal = 0, covBefore = 0, covAfter = 0;
    for (const r of rows) {
        const bal = r.track.balance;
        if (r.holding.equityPct !== null) { wSum += bal; eqBefore += bal * r.holding.equityPct; eqAfter += bal * (r.alt && r.alt.eq !== null ? r.alt.eq : r.holding.equityPct); }
        if (r.feeAccCur !== null && r.feeAccCur !== undefined) {
            feeKnown += bal;
            feeBefore += bal * r.feeAccCur;
            // צד "אחרי" מחושב רק על מסלולים עם חלופה מדורגת זכאית ושיעור שנתי ידוע שלה.
            // מסלול ללא חלופה (או שהשיעור של החלופה לא ידוע) אינו "ללא שינוי" - הוא לא ידוע,
            // ולכן מוחרג מסכום ה"אחרי" כדי לא לייצר חיסכון 0 מומצא. ההשוואה הכספית מוצגת
            // רק על תת-הקבוצה המכוסה, עם ציון מפורש של היקף הכיסוי.
            if (r.alt && r.alt.feeA !== null && r.alt.feeA !== undefined) {
                covBal += bal;
                covBefore += bal * r.feeAccCur;
                covAfter += bal * r.alt.feeA;
            }
        }
    }
    return {
        rows,
        total: accs.reduce((n, a) => n + a.totalBalance, 0),
        eqBefore: wSum > 0 ? eqBefore / wSum : null,
        eqAfter: wSum > 0 ? eqAfter / wSum : null,
        // ההשוואה המוצגת (לפני/אחרי/חיסכון) מתייחסת כולה לאותה תת-קבוצה מכוסה - מסלולים עם חלופה
        // זכאית ושיעור ידוע - כדי שלא יוצג "לפני" מלא מול "אחרי" חלקי. העלות הנוכחית המלאה על כל
        // המסלולים עם שיעור חוזי ידוע נשמרת בנפרד (feeBeforeFullYear) ומוצגת כהערת היקף בלבד.
        feeBeforeYear: covBal > 0 ? covBefore / 100 : null,
        feeAfterYear: covBal > 0 ? covAfter / 100 : null,
        feeSavingYear: covBal > 0 ? (covBefore - covAfter) / 100 : null,
        feeBeforeFullYear: feeKnown > 0 ? feeBefore / 100 : null,
        feeCovered: feeKnown,
        feeAfterCovered: covBal,
    };
}

export function renderBeforeAfter(state, view, agent) {
    const m = buildBeforeAfterModel(state, view);
    const client = state.portfolio.client || { name: state.portfolio.clientName || '', id: '' };
    const clientName = client.name || state.portfolio.clientName || 'הלקוח';
    const today = new Date();
    const dateStr = `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`;
    const agentName = agent.name || 'שרון סימון';
    const header = `<div class="rep-head"><span>דוח לפני/אחרי מסכם (הדמיה) · ${dateStr}</span><span>עבור הלקוח ${rEsc(clientName)}</span><span>הוכן על ידי ${rEsc(agentName)}</span></div>`;
    const footer = `<div class="rep-foot"><span>הופק בתאריך ${dateStr}</span><span>עמוד 1 מתוך 1</span></div>`;

    const withAlt = m.rows.filter(r => r.alt).length;
    const summaryRows = [
        ['שווי תיק כולל', rFmt(m.total) + ' ₪', rFmt(m.total) + ' ₪', 'ללא שינוי - הדמיית מעבר מסלול בלבד'],
        ['חשיפה מנייתית משוקללת', m.eqBefore !== null ? rPct(m.eqBefore) : REPORT_EMPTY, m.eqAfter !== null ? rPct(m.eqAfter) : REPORT_EMPTY, 'לפי נתוני החשיפה הרשמיים של המסלולים המוזהים'],
        ['עלות דמי ניהול מצבירה שנתית משוקללת',
            m.feeSavingYear !== null ? rFmt(m.feeBeforeYear) + ' ₪' : (m.feeBeforeFullYear !== null ? rFmt(m.feeBeforeFullYear) + ' ₪' : REPORT_EMPTY),
            m.feeAfterYear !== null ? rFmt(m.feeAfterYear) + ' ₪' : REPORT_EMPTY,
            m.feeSavingYear !== null
                ? `חיסכון שנתי משוער: ${rFmt(m.feeSavingYear)} ₪` + (m.feeAfterCovered < m.total ? ` (רק על מסלולים עם חלופה זכאית - כיסוי ${rFmt(m.feeAfterCovered)} ₪ מתוך ${rFmt(m.total)} ₪${m.feeBeforeFullYear !== null && Math.abs(m.feeBeforeFullYear - m.feeBeforeYear) > 0.005 ? `; העלות השנתית הנוכחית על כל המסלולים עם שיעור ידוע: ${rFmt(m.feeBeforeFullYear)} ₪` : ''})` : '')
                : (m.feeBeforeFullYear !== null ? 'לא התקבל מידע - אין חלופה זכאית עם שיעור שנתי ידוע להשוואה' : '')],
    ];
    const trackRows = m.rows.map(r => {
        const cur = r.holding.match.row;
        const scenarioCell = r.alt
            ? `<b>${rEsc(r.alt.name)}</b><br><span class="rep-note">ד"נ מצבירה ממוצע רשמי ${r.alt.feeA !== null ? r.alt.feeA + '%' : REPORT_EMPTY} · שארפ רשמי ${(r.alt.sharpeOff ?? r.alt.sharpe) != null ? (r.alt.sharpeOff ?? r.alt.sharpe) : SHARPE_EMPTY} · חשיפה ${r.alt.eq !== null ? rPct(r.alt.eq, 0) : REPORT_EMPTY}</span>`
            : r.mandateBlocked
                ? `<span class="rep-note">אין חלופה זכאית מאותו מנדט (${rEsc(MANDATE_LABEL[mandateOf(r.holding.match.row.name)] || mandateOf(r.holding.match.row.name))}) בקטגוריית החשיפה. מעבר למנדט אחר הוא שינוי מדיניות השקעה הדורש בחירה מודעת של הלקוח, ואינו מוצג כתחליף שקול.</span>`
                : r.altMeta && r.altMeta.baselineIncomplete
                    ? `<span class="rep-note">לא ניתן לדרג מול המסלול הנוכחי: חסר נתון בסיס (שארפ/תשואה 3 שנים/איזון אקטוארי/שירות) בתקופה המסונכרת. אין להסיק שאין חלופה טובה יותר - ההשוואה נשארת פתוחה לבדיקה ידנית.</span>`
                    : `<span class="rep-note">אין חלופה זכאית המדורגת גבוה יותר בקטגוריית החשיפה ובאותו מנדט</span>`;
        const peers = r.altMeta.comparisons || [];
        const comparisonCell = peers.length ? `<br><span class="rep-note">מקבילים להשוואה בלבד (לא נבחרו למעבר): ${peers.map(p => `${rEsc(p.name)} [${p.fundId}]${p.score == null ? " - ללא ציון" : " - ציון " + p.score.toFixed(1) + (p.partialScore ? " חלקי (אין להשוות לבסיס רכיבים שונה)" : "")} - ${p.relation === 'equal' ? 'ציון זהה' : p.relation === 'lower' ? 'ציון נמוך' : p.relation === 'higher' ? 'ציון גבוה' : 'לא ניתן לדרג מול הנוכחי'}; ${p.joinVerified ? 'הצטרפות אומתה במקור הקיים' : 'הצטרפות לא אומתה'}`).join('<br>')}</span>` : '<br><span class="rep-note">לא נמצאו במאגר מקבילים מתאימים להשוואה; אין להסיק שאין חלופות בשוק.</span>';
        const altCell = scenarioCell + comparisonCell;
        const saving = r.alt && r.feeAccCur !== null && r.feeAccCur !== undefined && r.alt.feeA !== null
            ? rFmt((r.feeAccCur - r.alt.feeA) * r.track.balance / 100) + ' ₪'
            : REPORT_EMPTY;
        return `<tr>
            <td>${rEsc(r.account.plan)} · ${rEsc(r.track.name)}<br><span class="rep-note">${rEsc(r.account.yatzran)} · צבירה ${rFloor(r.track.balance)} ₪</span></td>
            <td>ד"נ מצבירה שנתי חוזי ${r.feeAccCur !== null && r.feeAccCur !== undefined ? r.feeAccCur + '%' : REPORT_EMPTY}<br><span class="rep-note">שארפ רשמי ${cur.sharpeOff !== null && cur.sharpeOff !== undefined ? cur.sharpeOff : SHARPE_EMPTY} · חשיפה ${cur.eq !== null ? rPct(cur.eq, 0) : REPORT_EMPTY}</span></td>
            <td>${altCell}</td>
            <td>${saving}</td>
        </tr>`;
    }).join('');

    return `<div class="rpage">
        ${header}
        <div class="rep-note">הדמיה מסכמת של מצב התיק (<b>לפני</b>) מול מעבר של כל מסלול לחלופה המדורגת הראשונה שזכאות ההצטרפות אליה אומתה (<b>אחרי</b>), באותה קטגוריית חשיפה, באותו סוג מוצר ובאותו מנדט מעקב בדיוק (עוקב S&P 500 מול עוקב S&P 500 בלבד; עוקב מדדי מניות, עוקב מדדי אג"ח, עוקב גמיש ומסלול מנוהל הם מנדטים נפרדים - שינוי מנדט הוא בחירה מודעת של הלקוח ואינו תחליף שקול). כל הנתונים ממאגרי משרד האוצר הרשמיים לתקופת דיווח 09/2026 ומקובץ המסלקה שהועלה. דמי הניהול של החלופה הם הממוצע השנתי הרשמי שפורסם לעמיתי המסלול - <b>לא הצעה אישית</b>; העמלה בפועל נקבעת מול הגוף. השארפ הוא כפי שדווח רשמית (הגדרה שונה משארפ מחושב - אין להשוות). דירוג הפנסיה המשוקלל נשען על חלון 07/2023-06/2026; בגמל, השתלמות וביטוחי מנהלים: שארפ ותשואה 10/2023-09/2026, ביחס 40:30:20 לשארפ/תשואה/שירות, מנורמל ללא אקטוארי. שירות 2025 ברמת החברה; בהשתלמות מדד גמל הוא קירוב. ציון חלקי מנורמל על הרכיבים הקיימים בלבד ואינו בר השוואה לבסיס רכיבים שונה. ציונים יחסיים לקבוצת ההשוואה ואינם בני השוואה בין מוצרים; סימון 'לא דווח 09/2026' משמעו ששדה השארפ לא פורסם בתקופה העדכנית בלבד, ואינו סותר את נתוני הדירוג - תקופות ומקורות שונים. אין בדוח משום ייעוץ או המלצה להעברה; ניידות, אירועי מס ואובדן זכויות לא נבדקו במסגרת זו. מעבר בפועל עלול לפגוע במקדם קצבה מובטח, בכיסויים ביטוחיים וברצף זכויות - אין לפרש את הדוח כהמלצה על החלפה שקולה. מומלץ לבקש מכל גוף הצעת דמי ניהול אישית מחייבת - הממוצע הרשמי אינו מחייב את הגוף.</div>
        <h3 class="rep-h3">סיכום תיק - לפני מול אחרי</h3>
        <table class="rep-tbl"><tr><th>מדד</th><th>לפני</th><th>אחרי (הדמיה)</th><th>הערה</th></tr>${summaryRows.map(r => `<tr><td>${r[0]}</td><td>${r[1]}</td><td>${r[2]}</td><td class="rep-note">${r[3]}</td></tr>`).join('')}</table>
        <h3 class="rep-h3">פירוט לפי מסלול (${m.rows.length} מסלולים מוזהים, ${withAlt} עם חלופה זכאית מדורגת)</h3>
        ${m.rows.length ? `<table class="rep-tbl rep-tbl-small"><tr><th>מסלול נוכחי</th><th>לפני - נתונים בפועל/רשמיים</th><th>אחרי - חלופה מדורגת זכאית</th><th>חיסכון שנתי משוער בד"נ מצבירה</th></tr>${trackRows}</table>` : `<div class="rep-empty">לא זוהו מסלולים לפי קוד רשמי - אין בסיס להדמיה</div>`}
        <div class="rep-note">חיסכון משוער = הפרש בין דמי הניהול בפועל כיום (מהמסלקה) לבין הממוצע הרשמי של החלופה, כפול הצבירה במסלול. אין לראות בו התחייבות לתוצאה.</div>
        ${footer}
    </div>`;
}
