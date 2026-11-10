import fs from 'fs';
// היסטוריה (09/11/2026 20:57): נתיב BUILD env; תיקון scope ל-eval (trackKeyOf חסר - קרס בשקט עם exit!=0 ולא נספר ככשל);
// טענות PASS/FAIL אמיתיות + קוד יציאה. provenance: הערת portability שהתקבלה 09/11/2026 20:51.
const B = process.env.BUILD || new URL('../js/', import.meta.url).pathname;
const window = {}; globalThis.window = window;
eval(fs.readFileSync(B + '/joinable-extra.js', 'utf8'));
const analysis = await import(B + '/analysis.js');
const OFFICIAL = await import(B + '/official.js');
let pass = 0, fail = 0;
const chk = (l, c, x = '') => { console.log((c ? 'PASS ' : 'FAIL ') + l + (x ? ' :: ' + x : '')); c ? pass++ : fail++; };
const { solveTargetPlan, SEVERANCE_CAVEAT, equityGeoOf, GEO_LABEL } = analysis;
const esc = s => String(s ?? '');
const fmt = n => Math.round(n).toLocaleString('en-US');
const pct = n => (Math.round(n * 10) / 10) + '%';
const REF_DATE = '09/2026';
const clientAge = () => 43;
const mk = (account, plan, yatzran, kind, trackName, balance, officialId, eq) => ({
    account: { account, plan, yatzran, kind }, track: { name: trackName, balance },
    match: officialId ? { officialId, row: OFFICIAL.OFFICIAL_PENSION[officialId] } : { row: null },
    equityPct: eq, override: null, estimate: null,
});
const holdings = [
    mk('1', 'מנורה מקיפה', 'מנורה מבטחים', 'pensia', 'מנורה מבטחים פנסיה - מסלול לבני 50-60', 100000, 2015, 50.15),
    mk('2', 'מיטב מקיפה', 'מיטב', 'pensia', 'מיטב פנסיה מקיפה מניות', 50000, 2105, 71.52),
];
const view = { holdings, totalValue: 150000 };
const state = { confirmed: {}, excluded: {}, targetEq: 60, eligible: { '1|מנורה מבטחים פנסיה - מסלול לבני 50-60': true } };
const src = fs.readFileSync(B + '/app.js', 'utf8');
const grab = (name) => {
    const i = src.indexOf(`function ${name}(`);
    let depth = 0, j = src.indexOf('{', i);
    for (let k = j; k < src.length; k++) { if (src[k] === '{') depth++; if (src[k] === '}') { depth--; if (!depth) return src.slice(i, k + 1); } }
    return null;
};
const includedHoldingsOf = analysis.includedHoldingsOf;
const matchIdentityOf = analysis.matchIdentityOf;
const trackKeyOf = analysis.trackKeyOf;
const plannerRestoreOf = analysis.plannerRestoreOf;
const plannerSnapshotOf = analysis.plannerSnapshotOf;
// scope איטרטיבי: מושך מהמקור כל פונקציית עזר שה-eval או הקריאה מפנים אליהן, עד התכנסות (עד 60 סבבים).
const names = new Set(['renderTargetController', 'renderTargetProposal', 'geoTagOf', 'includedHoldings', 'confirmedRisk', 'wholePlanContext', 'currentTargetPlan']);
let html = null;
for (let round = 0; round < 60; round++) {
    try {
        const fns = eval([...names].map(grab).join('\n') + '\nlet planCache={sig:null,plan:null};\n;({renderTargetController});');
        html = fns.renderTargetController();
        break;
    } catch (e) {
        const mm = String(e && e.message).match(/^(\w+) is not defined$/);
        if (!mm) throw e;
        const g = grab(mm[1]);
        if (!g) throw new Error('cannot resolve eval-scope dep: ' + mm[1]);
        names.add(mm[1]);
    }
}
if (html === null) throw new Error('eval scope did not converge');
console.log('eval-scope deps resolved:', [...names].join(','));
const planStart = html.indexOf('מימוש היעד');
console.log(html.slice(planStart, planStart + 400));
chk('geo select rendered', html.includes('data-geo-pref') && html.includes('כיוון גיאוגרפי מועדף'));
chk('plan section rendered', planStart >= 0);
chk('eligible checkbox rendered for official-identified holding', html.includes('data-elig'));
console.log(fail ? fail + ' FAILURES' : 'ALL PASS', '(' + pass + ' assertions)');
process.exit(fail ? 1 : 0);
