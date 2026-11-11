// qa-retirement-steps.mjs - מבנה כרטסת "תכנון פרישה": 7 שלבים קבועים (הצעת הפישוט 11.11.2026),
// וחלקי בדיקת התיק עברו לכרטסת "תיק פנסיוני" בלי שאבד דבר.
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const page = await browser.newPage();
await page.setViewport({ width: 1000, height: 1200 });
const errs = [];
page.on('pageerror', e => errs.push(String(e)));
let pass = 0, fail = 0;
const ok = (c, n) => { if (c) { pass++; console.log('PASS ' + n); } else { fail++; console.log('FAIL ' + n); } };
const topIds = () => page.evaluate(() => [...document.querySelectorAll('main > section.acc:not(.sub) > .acc-head')].map(h => h.dataset.acc));
const subIds = () => page.evaluate(() => [...document.querySelectorAll('section.acc.sub > .acc-head')].map(h => h.dataset.acc));

await page.goto('http://127.0.0.1:8099/?tab=retirement', { waitUntil: 'networkidle2', timeout: 30000 });
await page.click('[data-action="demo"]');
await new Promise(r => setTimeout(r, 800));
const ret = await topIds();
console.log('retirement:', ret.join(','));
ok(JSON.stringify(ret) === JSON.stringify(['step1', 'step2', 'kibua', 'questions', 'pension', 'alloc', 'summary']), 'retirement-seven-steps-in-order');
const nums = await page.evaluate(() => [...document.querySelectorAll('main > section.acc:not(.sub) .step-num')].map(x => x.textContent));
ok(nums.join(',') === '1,2,3,4,5,6,7', 'retirement-numbering-1-to-7');
const subs = await subIds();
for (const id of ['limits', 'secure', 'riskgoals', 'quote', 'retirement', 'review']) ok(subs.includes(id), 'retirement-fold-' + id);
for (const id of ['portfolio', 'report', 'beforeafter', 'peers', 'risk', 'efficiency', 'openq']) ok(!ret.includes(id) && !subs.includes(id), 'retirement-no-portfolio-part-' + id);
// כל פריטי ההשלמה עדיין קיימים - פוזרו לשלבים, לא נמחקו
const intakeIds = await page.evaluate(() => [...new Set([...document.querySelectorAll('[data-intake]')].map(i => i.dataset.intake.split('|')[0]))]);
for (const id of ['pension-start', 'prior-161', 'work-after', 'future-income', 'target-net', 'family', 'risk-outside', 'income-tax', 'legal-continuity']) ok(intakeIds.includes(id), 'intake-present-' + id);
// קיפול משני נשמר אחרי רינדור מחדש
await page.evaluate(() => { const h = document.querySelector('[data-acc="questions"]'); if (h.getAttribute('aria-expanded') !== 'true') h.click(); document.querySelector('[data-acc="riskgoals"]').click(); });
await page.evaluate(() => { const i = document.querySelector('input[data-goal="keepExemption"]'); if (i) i.click(); });
await new Promise(r => setTimeout(r, 300));
ok(await page.evaluate(() => document.querySelector('[data-acc="riskgoals"]').getAttribute('aria-expanded') === 'true'), 'sub-fold-survives-rerender');
// כותרת שלב 4 מציגה מה חסר
ok(await page.evaluate(() => /חסר:|הושלם/.test(document.querySelector('[data-acc="questions"] .acc-badge').textContent)), 'questions-badge-says-what-missing');

// כרטסת התיק - חלקי בדיקת התיק נמצאים שם
await page.click('[data-mode-set="portfolio"]');
await new Promise(r => setTimeout(r, 500));
const port = await topIds();
console.log('portfolio:', port.join(','));
for (const id of ['step1', 'secure', 'portfolio', 'report', 'beforeafter', 'peers', 'risk', 'efficiency', 'step3', 'riskgoals', 'openq', 'review']) ok(port.includes(id), 'portfolio-has-' + id);
for (const id of ['step2', 'kibua', 'alloc', 'questions', 'pension', 'summary']) ok(!port.includes(id), 'portfolio-no-retirement-step-' + id);
ok(errs.length === 0, 'no-page-errors' + (errs.length ? ': ' + errs[0] : ''));
console.log(`retirement-steps: PASS=${pass} FAIL=${fail}`);
await browser.close();
process.exit(fail ? 1 : 0);
