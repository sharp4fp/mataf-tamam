// test-topmix.mjs - מנוע תמהיל מובילי השוק (M-060): קטגוריות, טופ 3, טווח ±3%, החלפה ידנית, מוצר לא מסומן
const B = process.env.BUILD || process.argv[2] || new URL('../../site/js/', import.meta.url).pathname;
global.window = {};
await import(B + '/joinable-extra.js'); await import(B + '/scoring-extra.js');
const m = await import(B + '/analysis.js');
let fails = 0;
const chk = (label, cond, extra = '') => { console.log((cond ? 'PASS' : 'FAIL') + ' ' + label + (extra ? ' :: ' + extra : '')); if (!cond) fails++; };
chk('cat equity', m.mixCategoryOf('הראל פנסיה - מניות', 70) === 'equity');
chk('cat S&P', m.mixCategoryOf('מגדל עוקב מדד S&P 500', 99) === 'equity');
chk('cat bond', m.mixCategoryOf('מיטב השתלמות אשראי ואג"ח עם מניות (עד 25% מניות)', 24) === 'bond');
chk('cat bond index (not equity)', m.mixCategoryOf('הפניקס פנסיה מקיפה -מסלול עוקב מדדי אג"ח', 0) === 'bond');
chk('cat general', m.mixCategoryOf('כלל השתלמות כללי', 52) === 'general');
chk('cat age bands', m.mixCategoryOf('כלל פנסיה לבני 60 ומעלה', 31) === 'age60' && m.mixCategoryOf('כלל פנסיה לבני 50-60', 50) === 'age5060' && m.mixCategoryOf('מנורה מבטחים פנסיה - מסלול לבני 50 ומטה', 59) === 'age50' && m.mixCategoryOf('כלל תמר עד 50', 57) === 'age50');
const tp = m.mixTopByCategory('pensia', null, 45);
chk('top3 per category max 3', Object.values(tp.cats).every(l => l.length <= 3));
chk('top3 sorted by score', Object.values(tp.cats).every(l => l.every((x, i) => i === 0 || x.score <= l[i - 1].score)));
chk('top3 excludes annuitant/halacha tracks', !tp.list.some(r => /מקבלי קצבה|הלכה/.test(r.name)));
chk('same product only (pension)', tp.list.every(r => r.cls === 'קרנות חדשות'));
chk('policies have no market', m.mixTopByCategory('menahalim', null, 45).disabled === 'menahalim');
const H = [
    { key: 'a', bal: 420000, eq: 73.6, kind: 'pensia', group: null, curFundId: 2015, selected: true },
    { key: 'b', bal: 180000, eq: 98.9, kind: 'hishtalmut', group: null, curFundId: null, selected: true },
    { key: 'c', bal: 95000, eq: 53.8, kind: 'menahalim', group: null, curFundId: null, selected: false },
];
for (const T of [30, 50, 70]) {
    const r = m.solveTopMix(H, T, { clientAge: 45 });
    chk('T=' + T + ' within ±3%', r.inTol && Math.abs(r.eqAfter - T) <= 3, r.eqAfter.toFixed(2));
    chk('T=' + T + ' every selected holding gets a top track', r.per.filter(p => p.selected).every(p => p.choice && p.top.list.some(o => o.fundId === p.choice.fundId)));
    chk('T=' + T + ' unselected stays', !r.per.find(p => p.key === 'c').choice);
}
// הציון: אין צירוף אחר בטווח עם ציון משוקלל גבוה יותר (בדיקת כוח-גס)
{
    const T = 50, r = m.solveTopMix(H, T, { clientAge: 45 });
    const A = r.per[0].options, Bo = r.per[1].options; let bestSc = -1;
    for (const x of A) for (const y of Bo) { const e = (420000 * x.eq + 180000 * y.eq + 95000 * 53.8) / 695000; if (Math.abs(e - T) <= 3) bestSc = Math.max(bestSc, (420000 * x.score + 180000 * y.score) / 600000); }
    chk('optimal score within tolerance (brute force)', Math.abs(bestSc - r.scoreAfter) < 0.6, bestSc.toFixed(2) + ' vs ' + r.scoreAfter.toFixed(2));
}
const r100 = m.solveTopMix(H, 100, { clientAge: 45 });
chk('out of range -> closest + range', !r100.inTol && r100.rangeHi < 100 && Math.abs(r100.eqAfter - r100.rangeHi) < 0.2, `${r100.eqAfter} ${r100.rangeHi}`);
const eqTop = tp.cats.equity[0];
const rp = m.solveTopMix(H, 50, { clientAge: 45, picks: { a: eqTop.fundId } });
chk('manual pick fixed', rp.per[0].choice.fundId === eqTop.fundId && rp.per[0].picked);
chk('others rebalance toward target', Math.abs(rp.eqAfter - 50) < Math.abs((420000 * eqTop.eq + 180000 * 98.9 + 95000 * 53.8) / 695000 - 50));
console.log(fails ? `\n${fails} FAILURES` : '\nALL PASS');
process.exit(fails ? 1 : 0);
