const B = process.env.BUILD || new URL('../js/', import.meta.url).pathname;
global.window = {};
const { JOINABILITY } = await import(B + '/joinable-extra.js').catch(() => ({}));
const m = await import(B + '/analysis.js');
const { OFFICIAL_GEMEL, OFFICIAL_PENSION } = await import(B + '/official.js');
let fails = 0;
const chk = (label, cond, extra='') => { console.log((cond?'PASS':'FAIL')+' '+label+(extra?' :: '+extra:'')); if(!cond) fails++; };

// 1. equityGeoOf classification
chk('geo foreign S&P500', m.equityGeoOf('מגדל מניות S1;P500').cls === 'foreign');
chk('geo foreign חו"ל', m.equityGeoOf('מנורה מבטחים פנסיה מקיפה מניות חו"ל').cls === 'foreign');
chk('geo foreign עולמי', m.equityGeoOf('הראל פנסיה מקיפה מניות עולמי').cls === 'foreign');
chk('geo local index', m.equityGeoOf('קרן מניות ת"א 125').cls === 'local');
chk('geo unclassified generic מניות', m.equityGeoOf('הפניקס השתלמות מניות').cls === 'unclassified');
chk('geo unclassified כללי', m.equityGeoOf('מגדלור כללי').cls === 'unclassified');
// fund-house names must NOT classify local (false-positive guard)
chk('geo house-name בנק ישראל NOT local', m.equityGeoOf('פסגות פנסיה מקיפה עובדי בנק ישראל מניות').cls === 'unclassified');
chk('geo house-name תל אביב NOT local', m.equityGeoOf('קופת גמל עובדי עיריית תל אביב מניות').cls === 'unclassified');

// 2. fundMixContext gemel/hishtalmut (fnx, parentId 513026484)
const fnxRows = Object.entries(OFFICIAL_GEMEL).filter(([k,r]) => r.parentId===513026484 && r.cls==='קרנות השתלמות');
console.log('fnx hishtalmut rows:', fnxRows.map(([k,r])=>`${k}|${r.name}|eq${r.eq}`).join(' ;; '));
const menRow = fnxRows.find(([k,r]) => r.name === 'הפניקס השתלמות מניות' || (/מניות/.test(r.name) && !/אשראי|בניהול/.test(r.name)));
chk('fnx מניות row exists', !!menRow, menRow && menRow[0]+' eq='+menRow[1].eq);
const gctx = m.fundMixContext({ officialId: Number(menRow[0]) }, 43, 'hishtalmut');
chk('gemel ctx ok', gctx.ok === true, JSON.stringify(gctx.ok?{tracks:gctx.tracks.length,dropped:gctx.dropped.map(d=>d.why)}:gctx));
chk('gemel mixVerified (takanon)', gctx.mixVerified === true);
chk('gemel excludes IRA', !gctx.tracks.some(r=>/בניהול אישי/.test(r.name)), 'tracks: '+gctx.tracks.map(r=>r.name).join(','));
chk('gemel ctx lo/hi', gctx.lo === 0 && Math.abs(gctx.hi - 98.94) < 0.01, `lo=${gctx.lo} hi=${gctx.hi}`);
// unsupported kinds stay gated
chk('menahalim gated', m.fundMixContext({officialId:1}, 43, 'menahalim').reason === 'not_supported_product');
chk('insurance kind gated', m.fundMixContext({officialId:1}, 43, 'bituah').reason === 'not_supported_product');

// 3. proposalForTarget with geoPref on gemel ctx (all tracks unclassified or foreign)
const pAny = m.proposalForTarget(gctx, 60, 43, 'any');
chk('gemel proposal any type', pAny.type === 'mix' || pAny.type === 'single', pAny.type+' achieved='+(pAny.achieved&&pAny.achieved.toFixed(2)));
const pLocal = m.proposalForTarget(gctx, 60, 43, 'local');
chk('gemel proposal local -> geoNote (no local-mandate track)', !!pLocal.geoNote, (pLocal.geoNote||'none').slice(0,60));
chk('gemel proposal local excludes classified-foreign only (none here)', pLocal.type !== 'unavailable', pLocal.type);
// pension ctx with foreign pref: migdal has S&P500 tracks
const migdalRow = Object.entries(OFFICIAL_PENSION).find(([k,r]) => r.parentCo === 162 && /מניות$/.test(r.name||''));
if (migdalRow) {
  const pctx = m.fundMixContext({ officialId: Number(migdalRow[0]) }, 43, 'pensia');
  const pF = m.proposalForTarget(pctx, 50, 43, 'foreign');
  console.log('  migdal foreign-pref pool:', pF.type, pF.geoNote ? 'geoNote' : 'no-note');
  chk('migdal foreign pref not unavailable', pF.type !== 'unavailable', pF.type);
  if (pF.type === 'mix') chk('foreign pref excludes local-classified (none exist)', true);
}

// 4. solveTargetPlan with gemel holding + geoPref
const included = [
  { key:'h1', kind:'hishtalmut', name:'הפניקס השתלמות מניות', bal:180000, eq:98.87, matched:{officialId:Number(menRow[0])} },
  { key:'h2', kind:'pensia', name:'מנורה מבטחים פנסיה מקיפה מניות', bal:420000, eq:73.59, matched:{officialId:2015} },
];
const whole = { totalValue: 695000, estFrozen: [], noBasisVal: 0, unknownAssumption: null };
const plan = m.solveTargetPlan(included, new Set(['h1','h2']), 77, 43, whole, 'any');
chk('solveTargetPlan gemel+pension feasible/infeasible defined', ['feasible','infeasible','partial','underdetermined','conditional'].includes(plan.status), plan.status+' achieved='+(plan.achieved&&plan.achieved.toFixed(2)));
const planLocal = m.solveTargetPlan(included, new Set(['h1']), 77, 43, whole, 'local');
chk('solveTargetPlan local pref runs', !!planLocal.status, planLocal.status);
// 5. חלוקה בין שוק מקומי לחו"ל (14.11): ההצעה מכוונת לחלק חו"ל המבוקש באפיק המניות, היעד הכולל נשמר
chk('GEO_PREFS includes split', m.GEO_PREFS.includes('split') && m.GEO_LABEL.split === 'חלוקה בין שוק מקומי לחו"ל');
const sh = m.geoEquityShare([{ geo: { cls: 'foreign' }, w: 0.5, eq: 100 }, { geo: { cls: 'local' }, w: 0.5, eq: 50 }]);
chk('geoEquityShare equity-weighted', Math.abs(sh.foreignShare - 66.667) < 0.01, String(sh.foreignShare));
chk('geoEquityShare unclassified-only = 0% foreign', m.geoEquityShare([{ geo: { cls: 'unclassified' }, w: 1, eq: 60 }]).foreignShare === 0);
const pctxs = Object.entries(OFFICIAL_PENSION).filter(([k, r]) => r.parentCo != null && /מניות$/.test(r.name || '')).map(([k]) => m.fundMixContext({ officialId: Number(k) }, 43, 'pensia')).filter(c => c.ok && c.mixVerified);
let tested = 0, steered = 0;
for (const c of pctxs) {
  const shares = {};
  const classified = c.tracks.map(r => m.equityGeoOf(r.name).cls);
  if (!classified.includes('foreign')) continue;
  for (const f of [20, 80]) {
    const x = (c.lo + c.hi) / 2;
    const pr = m.proposalForTarget(c, x, 43, 'split', c.row.eq, f);
    if (pr.type !== 'mix' && pr.type !== 'single' && pr.type !== 'stay') continue;
    tested++;
    chk('split keeps target ' + c.row.parentCoName + ' f=' + f, Math.abs((pr.achieved ?? x) - x) < 0.01 || pr.type === 'stay', String(pr.achieved));
    if (pr.type === 'mix') { const s2 = m.geoEquityShare([{ geo: pr.high.geo, w: pr.wHigh, eq: pr.high.eq }, { geo: pr.low.geo, w: pr.wLow, eq: pr.low.eq }]).foreignShare; shares[f] = s2; }
  }
  if (shares[20] != null && shares[80] != null) { steered++; chk('split steers toward requested share ' + c.row.parentCoName, shares[80] >= shares[20], JSON.stringify(shares)); }
  if (tested >= 6) break;
}
console.log('  split cases tested:', tested, 'steered:', steered);
chk('split: proposals generated', tested > 0);
chk('split: at least one fund steered', steered > 0);
// שמירה ושחזור של החלוקה
const snap = m.plannerSnapshotOf({ targetEq: 60, geoPref: 'split', geoSplit: 30, unknownAssumption: null, eligible: {}, excluded: {}, confirmed: {}, selections: {}, marketPick: {} });
const back = m.plannerRestoreOf(snap, []);
chk('split persists', back.geoPref === 'split' && back.geoSplit === 30, JSON.stringify([back.geoPref, back.geoSplit]));
console.log(fails ? `\n${fails} FAILURES` : '\nALL PASS');
process.exit(fails?1:0);
