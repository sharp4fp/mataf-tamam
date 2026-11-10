// test-mekadem-adj-integrity.mjs - שלמות טבלאות מקדמי ההתאמה להפרש גילאים מול התקנונים שאומתו,
// וחסימות בטיחות במקדם: ערך חיובי סופי בלבד, בלי התאמה מחוץ לטווח הטבלה, בלי הפעלת טבלה שלא אומתה.
// ערכי הייחוס נקודתיים חולצו מהתקנונים הרשמיים (meta.sourceUrl בכל קובץ נתונים).
const BUILD = process.env.BUILD || new URL('../js/', import.meta.url).pathname;
const M = await import(BUILD + '/mekadem.js');
let pass = 0, fail = 0;
const t = (cond, label, extra = '') => { if (cond) { pass++; console.log('PASS ' + label); } else { fail++; console.log(`FAIL ${label} ${extra}`); } };
const close = (a, b) => typeof a === 'number' && Math.abs(a - b) < 0.051;

// 1. כל 18 הגופים: מקדמי grid חיוביים וסופיים; טבלאות adj תקינות מבנית ומצביעות על וריאנט grid קיים
for (const c of M.COMPANIES) {
    const d = await M.loadCompany(c.key);
    let gridBad = 0, gridCells = 0;
    for (const vk of Object.keys(d.grid)) for (const g of Object.keys(d.grid[vk])) for (const age of Object.keys(d.grid[vk][g])) {
        for (const by of Object.keys(d.grid[vk][g][age])) { gridCells++; const v = d.grid[vk][g][age][by]; if (!Number.isFinite(v) || v <= 0) gridBad++; }
    }
    t(gridBad === 0 && gridCells > 0, `${c.key} grid: ${gridCells} cells all finite positive`, `bad=${gridBad}`);
    let adjBad = 0;
    for (const vk of Object.keys(d.adj || {})) {
        if (!d.grid[vk]) adjBad++;
        for (const g of Object.keys(d.adj[vk])) {
            for (const kk of Object.keys(d.adj[vk][g])) {
                const v = d.adj[vk][g][kk];
                if (!Number.isInteger(Number(kk)) || !Number.isFinite(v) || v <= 0) adjBad++;
            }
        }
    }
    t(adjBad === 0, `${c.key} adj: variants exist in grid, integer signed gap keys, finite positive`, `bad=${adjBad}`);
}

// 2. טווחי מפתחות מעוגני תקנון: מנורה מקיפה/כללית ±10 (נספח ו' / נספחי זקנה), הראל מקיפה ±20 (נספחי ה')
const RANGES = { menora: 10, menora_klalit: 10, harel: 20, harel_klalit: 20 };
for (const [key, lim] of Object.entries(RANGES)) {
    const d = await M.loadCompany(key);
    let out = [];
    for (const vk of Object.keys(d.adj)) for (const g of Object.keys(d.adj[vk])) for (const kk of Object.keys(d.adj[vk][g])) {
        const n = Number(kk); if (n < -lim || n > lim) out.push(`${vk}/${g}/${kk}`);
    }
    t(out.length === 0, `${key} gap keys within annex range ±${lim}`, out.join(','));
}

// 3. תאים נקודתיים שאומתו מול התקנון (מנורה מקיפה: עדכון 26/7/2026 עמ' 95-104; מנורה כללית: ינואר 2026 עמ' 91-100)
{
    const men = (await M.loadCompany('menora')).adj;
    const mk = (vk, g, k, v) => t(close(men[vk][g][String(k)], v), `menora ${vk} ${g} gap${k} = ${v}`, `got ${men[vk][g][String(k)]}`);
    mk('with_spouse|none', 'M', 3, 95.6); mk('with_spouse|120m', 'M', 3, 95.6); mk('with_spouse|180m', 'M', 3, 95.8);
    mk('with_spouse|240m', 'M', 3, 96.3); mk('with_spouse|until87', 'M', 3, 96.1);
    const kl = (await M.loadCompany('menora_klalit')).adj;
    const kk = (vk, g, k, v) => t(close(kl[vk][g][String(k)], v), `menora_klalit ${vk} ${g} gap${k} = ${v}`, `got ${kl[vk][g][String(k)]}`);
    kk('with_spouse|none', 'M', 6, 93.3); kk('with_spouse|120m', 'M', 3, 95.4); kk('with_spouse|180m', 'M', 1, 96.9);
    kk('with_spouse|240m', 'M', 3, 96.1); kk('with_spouse|until87', 'M', 3, 95.9);
    // שורות שזוהו בעבר במפתחות שגויים (24/11/17/20) - שוחזרו למפתחות התקנון
    kk('with_spouse|120m', 'M', -8, 104.4); kk('with_spouse|120m', 'M', -6, 102.6);
    kk('with_spouse|120m', 'F', -8, 107.0); kk('with_spouse|120m', 'F', -6, 105.4);
    kk('with_spouse|240m', 'M', -8, 104.0); kk('with_spouse|240m', 'M', -5, 101.6); kk('with_spouse|240m', 'M', 9, 94.0);
    kk('with_spouse|240m', 'F', -8, 106.1); kk('with_spouse|240m', 'F', -5, 104.0); kk('with_spouse|240m', 'F', 9, 98.8);
    for (const [vk, g, k] of [['with_spouse|120m', 'M', '24'], ['with_spouse|120m', 'F', '24'],
        ['with_spouse|240m', 'M', '11'], ['with_spouse|240m', 'M', '17'], ['with_spouse|240m', 'M', '20'],
        ['with_spouse|240m', 'F', '11'], ['with_spouse|240m', 'F', '17'], ['with_spouse|240m', 'F', '20']]) {
        t(kl[vk][g][k] === undefined, `menora_klalit ${vk} ${g} unsupported key ${k} removed`);
    }
    // מלאי מפתחות מלא: 21 לכל וריאנט/מין בשני קבצי מנורה
    for (const [key, adj] of [['menora', men], ['menora_klalit', kl]]) for (const vk of Object.keys(adj)) for (const g of ['M', 'F'])
        t(Object.keys(adj[vk][g]).length === 21, `${key} ${vk} ${g} has all 21 annex keys`, `got ${Object.keys(adj[vk][g]).length}`);
}

// 4. הראל מקיפה: 31 תאי המקור של spouse60|none גבר (תקנון יוני 2025, נספח ה1) + דגימות שאר הווריאנטים
{
    const SRC_M = { 0: 97.8, 1: 97.1, 2: 96.4, 3: 95.7, 4: 95.1, 5: 94.6, 6: 94.0, 7: 93.5, 8: 93.1, 9: 92.6, 10: 92.2, 12: 91.5, 14: 91.0, 16: 90.5, 18: 90.2, 20: 89.9,
        '-20': 112.7, '-18': 111.4, '-16': 110.1, '-14': 108.6, '-12': 107.1, '-10': 105.6, '-9': 104.8, '-8': 104.0, '-7': 103.2, '-6': 102.4, '-5': 101.6, '-4': 100.8, '-3': 100.0, '-2': 99.2, '-1': 98.5 };
    const h = (await M.loadCompany('harel')).adj;
    let bad = 0;
    for (const [k, v] of Object.entries(SRC_M)) if (!close(h['spouse60|none'].M[k], v)) bad++;
    t(bad === 0, 'harel spouse60|none M: all 31 signed source cells', `bad=${bad}`);
    t(close(h['spouse60|none'].F['0'], 101.4) && close(h['spouse60|none'].F['-20'], 114.7) && close(h['spouse60|none'].F['20'], 96.6), 'harel spouse60|none F spot cells');
    t(close(h['spouse100|none'].M['-20'], 119.9) && close(h['spouse100|none'].M['1'], 95.4) && close(h['spouse100|none'].M['0'], 96.5), 'harel spouse100|none M spot cells');
    const hk = (await M.loadCompany('harel_klalit')).adj;
    t(close(hk['spouse60|none'].M['-3'], 100.0) && close(hk['spouse60|none'].M['0'], 97.6) && close(hk['spouse60|none'].M['1'], 96.8) && close(hk['spouse60|none'].M['-20'], 114.1) && close(hk['spouse60|none'].M['20'], 88.9), 'harel_klalit spouse60|none M spot cells');
    t(close(hk['spouse100|none'].M['-20'], 121.9) && close(hk['spouse100|none'].M['0'], 96.2) && close(hk['spouse60|240m'].M['20'], 93.3) && close(hk['spouse60|240m'].F['-20'], 114.4), 'harel_klalit spouse100/240m spot cells');
    for (const vk of Object.keys(hk)) for (const g of ['M', 'F'])
        t(Object.keys(hk[vk][g]).length === 31, `harel_klalit ${vk} ${g} has all 31 annex keys`, `got ${Object.keys(hk[vk][g]).length}`);
    for (const vk of Object.keys(h)) for (const g of ['M', 'F'])
        t(Object.keys(h[vk][g]).length === 31, `harel ${vk} ${g} has all 31 annex keys`, `got ${Object.keys(h[vk][g]).length}`);
}

// 5. התנהגות הערכה
{
    const base = { company: 'harel', scenario: 'spouse60', guarantee: 'none', gender: 'M', birthYear: 1965, age: 67 };
    const pct = r => { const m = /\((\d+(?:\.\d+)?)%\)/.exec(r.adjNote || ''); return m ? +m[1] : null; };
    t(close(pct(await M.mekademEstimate({ ...base, spouseBirthYear: 1968 })), 100.0), 'estimate harel spouse 3y younger = 100%');
    t(close(pct(await M.mekademEstimate({ ...base, spouseBirthYear: 1975 })), 105.6), 'estimate harel spouse 10y younger = 105.6%');
    t(close(pct(await M.mekademEstimate({ ...base, spouseBirthYear: 1960 })), 94.6), 'estimate harel spouse 5y older = 94.6%');
    t(close(pct(await M.mekademEstimate({ ...base, spouseBirthYear: 1964 })), 97.1), 'estimate harel spouse 1y older = 97.1%');
    const rMen = await M.mekademEstimate({ company: 'menora', scenario: 'with_spouse', guarantee: 'none', gender: 'M', birthYear: 1965, age: 67, spouseBirthYear: 1962 });
    t(close(pct(rMen), 95.6), 'estimate menora gap+3 = 95.6% (was corrupt 60%)', rMen.adjNote);
    // מחוץ לטווח: אין התאמה ובאה הערה מפורשת, לא הקרבה לקצה
    const rOut = await M.mekademEstimate({ company: 'menora', scenario: 'with_spouse', guarantee: 'none', gender: 'M', birthYear: 1965, age: 67, spouseBirthYear: 1940 });
    const gridBase = (await M.loadCompany('menora')).grid['with_spouse|none'].M['67']['1965'];
    t(!rOut.adjNote && rOut.k === gridBase && rOut.notes.some(n => n.includes('מחוץ לטווח')), 'estimate out-of-range gap: base k + explicit note, no snap');
    t(rOut.baseOnly === true, 'out-of-range gap flagged baseOnly (UI/report must not show it as actual pension)');
    // גוף לא מאומת: אין הפעלת התאמה, מקדם בסיס בלבד + הערה גלויה (מיטב — אין טבלת התאמה שחולצה ואומתה)
    const phxD = await M.loadCompany('meitav');
    const phxVk = Object.keys(phxD.grid).find(vk => /spouse|married/.test(vk.split('|')[0])) || Object.keys(phxD.grid)[0];
    const [phxSc, phxGu] = phxVk.split('|');
    const phxG = Object.keys(phxD.grid[phxVk])[0];
    const phxAge = Object.keys(phxD.grid[phxVk][phxG])[0];
    const phxBy = Object.keys(phxD.grid[phxVk][phxG][phxAge])[0];
    const rUnv = await M.mekademEstimate({ company: 'meitav', scenario: phxSc, guarantee: phxGu, gender: phxG.toLowerCase(), birthYear: +phxBy, age: +phxAge, spouseBirthYear: +phxBy - 5 });
    const phxBase = phxD.grid[phxVk][phxG][phxAge][phxBy];
    t(!rUnv.adjNote && rUnv.k === phxBase && rUnv.notes.some(n => n.includes('טרם אומתה')), 'estimate unverified company: base k only + visible unverified note');
    t(rUnv.baseOnly === true, 'unverified company flagged baseOnly');
    // מסלול שאירים בלי שנת לידת בן/בת זוג: אין מספר בכלל (ממצא בודק m35) — לא בבסיס ולא בהנחה שקטה
    const rBlank = await M.mekademEstimate({ company: 'clal', scenario: 'spouse60', guarantee: 'none', gender: 'M', birthYear: 1965, age: 67, spouseBirthYear: null });
    t(rBlank.baseOnly === true && !rBlank.adjNote && rBlank.notes.some(n => n.includes('לא הוזנה שנת לידת')), 'blank spouse year: baseOnly + explicit note, no silent base-3yr number');
    const rBlankU = await M.mekademEstimate({ company: 'meitav', scenario: phxSc, guarantee: phxGu, gender: phxG.toLowerCase(), birthYear: +phxBy, age: +phxAge, spouseBirthYear: null });
    t(rBlankU.baseOnly === true && rBlankU.notes.some(n => n.includes('לא הוזנה שנת לידת')), 'blank spouse year also on unverified company: baseOnly + note');
    // מפתח בטווח שהנספח אינו מדפיס (כלל +11): אין הקרבה/אינטרפולציה — אין אומדן, מוצגים תחומים מודפסים בלבד
    const rUnp = await M.mekademEstimate({ company: 'clal', scenario: 'spouse60', guarantee: 'none', gender: 'M', birthYear: 1965, age: 67, spouseBirthYear: 1954 });
    t(rUnp.baseOnly === true && !rUnp.adjNote && rUnp.notes.some(n => n.includes('אינו מפתח מודפס')), 'unprinted in-range gap (+11): no snap, baseOnly + bounding printed keys note');
    // ברירת מחדל-דחייה: גופים עם טבלה שלא אומתה (false מפורש או חסר) חסומים גם אם הערכים קיימים
    for (const ck of ['meitav', 'meitav_klalit']) {
        const d = await M.loadCompany(ck);
        t(d.meta.adjVerified !== true, `${ck} not flagged verified (default-deny until source-verified)`);
        const vk0 = Object.keys(d.grid).find(vk => /spouse|married/.test(vk.split('|')[0])) || Object.keys(d.grid)[0];
        const [sc0, gu0] = vk0.split('|');
        const g0 = Object.keys(d.grid[vk0])[0];
        const age0 = Object.keys(d.grid[vk0][g0])[0];
        const by0 = Object.keys(d.grid[vk0][g0][age0])[0];
        const rr = await M.mekademEstimate({ company: ck, scenario: sc0, guarantee: gu0, gender: g0.toLowerCase(), birthYear: +by0, age: +age0, spouseBirthYear: +by0 - 5 });
        t(!rr.adjNote && rr.baseOnly === true && rr.notes.some(n => n.includes('טרם אומתה')), `${ck} blocked: no adjustment applied, baseOnly + note`);
    }
    // מגדל (שני הקבצים): נבנו מחדש מהתקנון הרשמי 06/2025 עם קישור כיתוב מפורש, אומת פיקסלים עמוד 93-98 / 84-89
    const mg = (await M.loadCompany('migdal')).adj;
    t(close(mg['spouse60|none'].M['-3'], 100.0) && close(mg['spouse60|none'].F['-20'], 115.1) && close(mg['spouse60|none'].M['20'], 89.7) && close(mg['spouse100|none'].F['-20'], 124.6) && close(mg['spouse100|none'].M['20'], 84.0), 'migdal makifa spot cells (pixel-verified p93-98)');
    t(Object.keys(mg['spouse60|none'].M).length === 41 && Object.keys(mg['spouse60|none'].F).length === 41, 'migdal makifa full 41 keys both genders');
    const mgk = (await M.loadCompany('migdal_klalit')).adj;
    t(!('spouse60|none' in mgk), 'migdal_klalit has no adj variant absent from grid (spouse60|none not in product grid)');
    // migdal_klalit caption binding (running header on each table's own page): 60m<-p85, 120m<-p86, 180m<-p87, 240m<-p88, spouse100|none<-p89.
    // (p84 spouse60|none takanon table has no base variant in the product grid - documented coverage gap, not carried.)
    t(close(mgk['spouse60|60m'].M['-20'], 114.3) && close(mgk['spouse60|60m'].F['-20'], 116.4) && close(mgk['spouse60|60m'].M['-3'], 100.0) && close(mgk['spouse60|60m'].F['3'], 100.0), 'migdal_klalit 60m caption-bound to p85 (pixel-verified header + table)');
    t(close(mgk['spouse60|120m'].M['-20'], 114.2) && close(mgk['spouse60|120m'].F['-20'], 116.3) && close(mgk['spouse60|120m'].M['20'], 89.8) && close(mgk['spouse60|120m'].M['-3'], 100.0) && close(mgk['spouse60|120m'].F['3'], 100.0), 'migdal_klalit 120m caption-bound to p86 (pixel-verified header + table)');
    t(close(mgk['spouse60|180m'].M['-20'], 113.9) && close(mgk['spouse60|240m'].M['20'], 93.3) && close(mgk['spouse100|none'].F['-20'], 126.6), 'migdal_klalit 180m/240m/100 spot cells (caption-verified p87-89)');
    for (const vk of Object.keys(mgk)) for (const g of ['M', 'F'])
        t(Object.keys(mgk[vk][g]).length === 41, `migdal_klalit ${vk} ${g} 41 keys`);
    // כלל (שני הקבצים): נבנו מחדש מהתקנונים הרשמיים (מקיפה y703 5/2026 עמ' 95-114, משלימה 06/2025 עמ' 101-120) עם קישור כיתוב מפורש לפני כותרת ההתאמה; אומתו פיקסלים כל 40 העמודים
    const cl = (await M.loadCompany('clal')).adj;
    t(close(cl['spouse30|none'].M['-20'], 107.0) && close(cl['spouse30|none'].M['-3'], 100.0) && close(cl['spouse30|none'].M['1'], 98.4) && close(cl['spouse30|none'].F['-20'], 107.8) && close(cl['spouse30|none'].F['1'], 100.5) && close(cl['spouse30|none'].F['20'], 98.2), 'clal makifa spouse30|none spot cells (pixel-verified p95, independent m30 cross-check)');
    t(close(cl['spouse100|none'].F['-20'], 124.8) && close(cl['spouse100|none'].F['1'], 101.5) && close(cl['spouse100|none'].F['20'], 94.3) && close(cl['spouse100|240m'].F['-20'], 123.0) && close(cl['spouse100|240m'].F['20'], 97.6), 'clal makifa spouse100 spot cells (p110, p114)');
    const clk = (await M.loadCompany('clal_klalit')).adj;
    t(close(clk['spouse30|none'].M['-20'], 107.7) && close(clk['spouse30|none'].F['20'], 98.2) && close(clk['spouse30|none'].M['20'], 94.2) && close(clk['spouse100|none'].F['-20'], 126.9) && close(clk['spouse100|none'].F['1'], 101.6) && close(clk['spouse60|240m'].M['-20'], 113.4) && close(clk['spouse60|240m'].M['20'], 93.3), 'clal_klalit spot cells (pixel-verified p101, p116, p110)');
    for (const [nm, dd] of [['clal', cl], ['clal_klalit', clk]]) {
        t(Object.keys(dd).length === 20, `${nm} 20 adj variants`);
        for (const vk of Object.keys(dd)) for (const g of ['M', 'F']) {
            t(Object.keys(dd[vk][g]).length === 31, `${nm} ${vk} ${g} 31 gap keys`);
            t(close(dd[vk][g][g === 'M' ? '-3' : '3'], 100.0), `${nm} ${vk} ${g} base gap = 100`);
        }
        for (const gu of ['none', '60m', '120m', '180m', '240m'])
            t(Object.values(dd[`no_survivors|${gu}`].M).every(v => v === 100) && Object.values(dd[`no_survivors|${gu}`].F).every(v => v === 100), `${nm} no_survivors|${gu} literally all 100.0 (pixel-confirmed genuine)`);
    }
    // כלל מאומת: הערכה בטווח מחילה התאמה ואינה baseOnly
    const rClal = await M.mekademEstimate({ company: 'clal', scenario: 'spouse60', guarantee: 'none', gender: 'M', birthYear: 1965, age: 67, spouseBirthYear: 1962 });
    t(rClal.adjNote && rClal.baseOnly === false, 'clal verified in-range estimate adjusts and is not baseOnly');
    // גוף מאומת עם הפרש בטווח עדיין מחיל התאמה ואינו baseOnly
    const rVer = await M.mekademEstimate({ company: 'menora', scenario: 'with_spouse', guarantee: 'none', gender: 'M', birthYear: 1965, age: 67, spouseBirthYear: 1962 });
    t(rVer.adjNote && rVer.baseOnly === false, 'verified in-range estimate adjusts and is not baseOnly');
    // פניקס (שני הקבצים): אומת פיקסלים מול התקנון הרשמי 1/7/2024 (מקיפה עמ' 131/134/137/140/143, משלימה עמ' 133/135/139/142/145)
    const ph = (await M.loadCompany('phoenix')).adj;
    t(Object.keys(ph).length === 5 && ph['married|20y'], 'phoenix 5 adj variants incl. married|20y (was missing)');
    t(close(ph['married|none'].M['-20'], 113.39) && close(ph['married|none'].M['-3'], 100.0) && close(ph['married|none'].M['0'], 97.63) && close(ph['married|none'].F['3'], 100.0) && close(ph['married|20y'].M['-20'], 112.31) && close(ph['married|20y'].M['20'], 93.51), 'phoenix makifa spot cells (pixel-verified)');
    const phk = (await M.loadCompany('phoenix_klalit')).adj;
    t(Object.keys(phk).length === 5 && phk['married|20y'], 'phoenix_klalit 5 adj variants incl. married|20y (was missing)');
    // klalit takanon annex order is none, 10y, 5y, 15y, 20y (running headers: p132 none, p134 10y, p138 5y, p141 15y, p144 20y);
    // binding is by section caption, not table order. True 5y table = p139 (M@-20=114.56); true 10y = p135 (M@-20=114.43).
    t(close(phk['married|5y'].M['-20'], 114.56) && close(phk['married|5y'].F['-20'], 116.32) && close(phk['married|10y'].M['-20'], 114.43) && close(phk['married|10y'].F['-20'], 116.18) && close(phk['married|none'].M['-20'], 114.6) && close(phk['married|15y'].M['20'], 90.72) && close(phk['married|20y'].M['-20'], 113.46), 'phoenix_klalit spot cells - 5y/10y bound by section caption (pixel-verified p134/p138 headers + p135/p139 tables)');
    t((await M.loadCompany('phoenix')).meta.adjVerified === true && (await M.loadCompany('phoenix_klalit')).meta.adjVerified === true, 'phoenix pair flagged adjVerified:true after pixel verification');
    // סוויפ: כל תוצאה שמוחזרת היא חיובית וסופית או שגיאה מפורשת
    let sweepBad = 0, sweepN = 0;
    for (const c of M.COMPANIES) {
        const d = await M.loadCompany(c.key);
        for (const vk of Object.keys(d.grid)) {
            const [sc, gu] = vk.split('|');
            for (const g of ['M', 'F']) {
                const ages = Object.keys(d.grid[vk][g] || {});
                if (!ages.length) continue;
                const age = ages[Math.floor(ages.length / 2)];
                const bys = Object.keys(d.grid[vk][g][age]);
                const by = bys[Math.floor(bys.length / 2)];
                const r = await M.mekademEstimate({ company: c.key, scenario: sc, guarantee: gu, gender: g === 'M' ? 'M' : 'f', birthYear: +by, age: +age, spouseBirthYear: +by - 4 });
                sweepN++;
                if (!r.error && (!Number.isFinite(r.k) || r.k <= 0)) sweepBad++;
            }
        }
    }
    t(sweepBad === 0 && sweepN > 100, `sweep ${sweepN} estimates: every returned k finite positive or explicit error`, `bad=${sweepBad}`);
}
console.log(fail ? `FAILS ${fail}` : `ALL OK (${pass})`);
process.exit(fail ? 1 : 0);
