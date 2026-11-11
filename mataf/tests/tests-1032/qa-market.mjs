// qa-market.mjs - מסלולים מכל השוק לפי יעד החשיפה (M-037, אושר 11.11.2026 14:09)
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const page = await browser.newPage();
await page.setViewport({ width: 1200, height: 1200 });
const errs = [];
page.on('pageerror', e => errs.push(String(e)));
let pass = 0, fail = 0;
const ok = (c, n, d = '') => { if (c) { pass++; console.log('PASS ' + n); } else { fail++; console.log('FAIL ' + n + (d ? ' :: ' + d : '')); } };
const wait = (ms) => new Promise(r => setTimeout(r, ms));
await page.goto('http://127.0.0.1:8099/', { waitUntil: 'networkidle2', timeout: 30000 });
await page.click('[data-action="demo"]');
await wait(800);
for (let i = 0; i < 8; i++) {
    const done = await page.evaluate(() => { const s = [...document.querySelectorAll('select[data-select-id]')].find(x => !x.value && x.options.length > 1); if (!s) return true; s.value = s.options[1].value; s.dispatchEvent(new Event('change', { bubbles: true })); return false; });
    await wait(250);
    if (done) break;
}
const setTop = async (v) => { await page.evaluate((v) => { const s = document.querySelector('[data-eq-slider]'); s.value = v; s.dispatchEvent(new Event('change', { bubbles: true })); }, v); await wait(500); };
const pensionCard = () => page.evaluate(() => {
    const c = [...document.querySelectorAll('[data-tblock] .target-card')].find(x => x.querySelector('details.market'));
    if (!c) return null;
    const rows = [...c.querySelectorAll('details.market tbody tr')].map(r => [...r.children].map(td => td.textContent.trim()));
    return { text: c.innerText, rows };
});

// יעד נמוך: מסלולים מכמה גופים ברצועת היעד, מדורגים, עם סימון ניוד/אותו גוף
await setTop(30);
let c = await pensionCard();
ok(!!c, 'pension-holding-has-market-table');
ok(c && c.rows.length >= 3, 'at-30-several-candidates', c && String(c.rows.length));
const eqs = c ? c.rows.map(r => parseFloat(r[2])) : [];
ok(eqs.length && eqs.every(e => Math.abs(e - eqs[0]) <= 20) && eqs.every(e => e < 45), 'at-30-candidates-are-low-equity', eqs.join(','));
const scores = c ? c.rows.map(r => parseFloat(r[3])) : [];
ok(scores.every((s, i) => i === 0 || s <= scores[i - 1]), 'ranked-by-score-desc', scores.join(','));
ok(c && new Set(c.rows.map(r => r[1].split(' ')[0])).size >= 3, 'candidates-from-several-companies');
ok(c && c.rows.some(r => r[7].includes('באותו גוף')) && c.rows.some(r => r[7].includes('ניוד')), 'marks-same-company-vs-transfer');
ok(c && /המסלול המדורג ראשון בשוק|נבחר ידנית/.test(c.text), 'auto-proposal-from-market');
const sum30 = await page.evaluate(() => document.querySelector('[data-target-summary]').textContent);
ok(/חשיפה מושגת 3\d/.test(sum30), 'at-30-reachable-thanks-to-market', sum30);

// יעד גבוה: מסלולים מנייתיים
await setTop(72);
await page.evaluate(() => document.querySelectorAll('details.market').forEach(d => d.open = true));
c = await pensionCard();
const eqHi = c ? c.rows.map(r => parseFloat(r[2])) : [];
ok(eqHi.length >= 3 && eqHi.every(e => e > 60), 'at-72-candidates-are-high-equity', eqHi.join(','));

// בחירה ידנית: ההחזקה מקובעת והתיק מתאזן
const picked = await page.evaluate(() => { const r = [...document.querySelectorAll('[data-mkt-pick]')].find(x => !x.closest('tr').textContent.includes('(הנוכחי)')); r.checked = true; r.dispatchEvent(new Event('change', { bubbles: true })); return r.closest('tr').children[1].textContent.trim(); });
await wait(500);
c = await pensionCard();
ok(c && c.text.includes('נבחר ידנית') && c.text.includes(picked.split(' (')[0]), 'manual-pick-applied', picked);
const sumP = await page.evaluate(() => document.querySelector('[data-target-summary]').textContent);
ok(/חשיפה מושגת 7[12]/.test(sumP), 'others-rebalance-around-pick', sumP);
await page.evaluate(() => document.querySelector('[data-mkt-clear]').click());
await wait(400);
c = await pensionCard();
ok(c && !c.text.includes('נבחר ידנית'), 'clear-pick-restores-system-recommendation');
// גמל/השתלמות (החלטת הבעלים 14:48): מוצגים מסלולים מהשוק עם סימון "פתיחות לא אומתה" והבסיס החוקי (תקנה 3(א)(4) / 9(ג))
ok(await page.evaluate(() => [...document.querySelectorAll('details.market')].some(d => d.textContent.includes('פתיחות המסלולים להצטרפות לא אומתה') && /3\(א\)\(4\)|3\(א\)\(1\)|11א/.test(d.textContent))), 'gemel-market-marked-unverified-with-legal-basis');
// כל החזקה עם יעד מציגה לאן מותר להעביר לפי תקנות הניוד
ok(await page.evaluate(() => document.querySelectorAll('details.transfer-rules').length >= 2 && [...document.querySelectorAll('details.transfer-rules')].every(d => d.textContent.includes('תקנה 4'))), 'transfer-rules-shown-per-holding');
ok(errs.length === 0, 'no-page-errors', errs[0] || '');
console.log(`market: PASS=${pass} FAIL=${fail}`);
await browser.close();
process.exit(fail ? 1 : 0);
