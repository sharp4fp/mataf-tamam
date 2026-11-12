// qa-tax-alternatives.mjs - M-045 שלב 2: דירוג חלופות המס בשלב 6 ("ההמלצה"), מולא אוטומטית מטופס 161 של ההדגמה
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const page = await browser.newPage();
await page.setViewport({ width: 1100, height: 1300 });
const errs = [];
page.on('pageerror', e => errs.push(String(e)));
let pass = 0, fail = 0;
const ok = (c, n, d = '') => { if (c) { pass++; console.log('PASS ' + n); } else { fail++; console.log('FAIL ' + n + (d ? ' :: ' + d : '')); } };
const open = (id) => page.evaluate((id) => { const h = document.querySelector(`[data-acc="${id}"]`); if (h && h.getAttribute('aria-expanded') !== 'true') h.click(); }, id);
const wait = (ms) => new Promise(r => setTimeout(r, ms));
const setVal = (key, v) => page.evaluate((key, v) => { const i = document.querySelector(`[data-reng="${key}"]`); i.value = v; i.dispatchEvent(new Event('input', { bubbles: true })); }, key, v);

await page.goto('http://127.0.0.1:8099/?tab=retirement', { waitUntil: 'networkidle2', timeout: 30000 });
await page.click('[data-action="demo"]');
await wait(800);
await open('alloc'); await wait(300); await open('taxalts'); await wait(300);
ok(await page.evaluate(() => !!document.querySelector('[data-acc="taxalts"]')), 'step6-has-tax-alternatives-fold');
// מולא אוטומטית מטופס 161 של ההדגמה: מענק 550,000, 27 שנות עבודה
const ph = await page.evaluate(() => ({ g: document.querySelector('[data-reng="grant"]').placeholder, y: document.querySelector('[data-reng="workYears"]').placeholder }));
ok(/550000/.test(ph.g) && /161/.test(ph.g) && /^27/.test(ph.y), 'auto-filled-from-form-161', JSON.stringify(ph));
let rows = await page.evaluate(() => [...document.querySelectorAll('[data-taxalts] tbody tr')].map(r => r.innerText));
ok(rows.length >= 2, 'ranked-table-has-rows', String(rows.length));
// מקדם המרה: חלופות שמשאירות כסף בקופה נכנסות לדירוג
await setVal('annuityFactor', '200'); await setVal('pensionMonthly', '6000'); await setVal('retireYearIncome', '200000');
await wait(300);
rows = await page.evaluate(() => [...document.querySelectorAll('[data-taxalts] tbody tr')].map(r => r.cells[1].innerText.trim().slice(0, 2)));
ok(rows.some(x => x.startsWith('A')) && rows.some(x => x.startsWith('B')) && rows.some(x => x.startsWith('C')), 'with-factor-ranks-A-B-C', rows.join(','));
const firstRank = await page.evaluate(() => document.querySelector('[data-taxalts] tbody tr').cells[0].innerText.trim());
ok(firstRank === '1' && await page.evaluate(() => document.querySelector('[data-taxalts] tbody tr').classList.contains('lead')), 'rank-1-highlighted');
const head = await page.evaluate(() => document.getElementById('reng-result').innerText);
ok(/חבות המס הנמוכה ביותר/.test(head) && /161ד/.test(head) && /2\/2022/.test(head), 'recommendation-line-and-sources', head.slice(0, 200));
ok(/רצף פיצויים/.test(head) && /מעסיק חדש/.test(head), 'rezef-pitzuyim-listed-as-not-ranked-with-reason');
// מעסיק חדש: רצף פיצויים זמין כמותנה
await page.evaluate(() => { const c = document.querySelector('[data-reng="newEmployer"]'); c.click(); });
await wait(300);
ok(/הכסף נשאר בקופה בלי מס עכשיו/.test(await page.evaluate(() => document.getElementById('reng-result').innerText)), 'new-employer-makes-rezef-pitzuyim-conditional');
// הערכים נשמרים בקלט הידני של הלקוח
ok(await page.evaluate(() => document.querySelector('[data-reng="annuityFactor"]').value === '200'), 'input-kept');
// טלפון: בלי גלילה אופקית בעמוד
await page.setViewport({ width: 380, height: 900 });
await wait(400);
const sw = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
ok(sw <= 1, 'phone-no-horizontal-page-scroll', String(sw));
ok(errs.length === 0, 'no-page-errors', errs[0] || '');
console.log(`tax-alternatives: PASS=${pass} FAIL=${fail}`);
await browser.close();
process.exit(fail ? 1 : 0);
