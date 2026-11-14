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
// שלב 2 לפני העלאה: שדות ההזנה הידנית פתוחים
ok(await page.evaluate(() => document.querySelector('[data-acc="f161fields"]').getAttribute('aria-expanded') === 'true'), 'step2-manual-fields-open-before-upload');
await page.click('[data-action="demo"]');
await new Promise(r => setTimeout(r, 800));
const ret = await topIds();
console.log('retirement:', ret.join(','));
ok(JSON.stringify(ret) === JSON.stringify(['step1', 'step2', 'kibua', 'questions', 'pension', 'alloc', 'summary']), 'retirement-seven-steps-in-order');
const nums = await page.evaluate(() => [...document.querySelectorAll('main > section.acc:not(.sub) .step-num')].map(x => x.textContent));
ok(nums.join(',') === '1,2,3,4,5,6,7', 'retirement-numbering-1-to-7');
// שלב 2 אחרי העלאה: 6 ערכי מפתח גלויים, 15 השדות מקופלים
ok(await page.evaluate(() => document.querySelectorAll('.key161 tr').length) === 6, 'step2-six-key-values');
ok(await page.evaluate(() => document.querySelector('[data-acc="f161fields"]').getAttribute('aria-expanded') === 'false'), 'step2-all-fields-folded-after-upload');
const subs = await subIds();
for (const id of ['limits', 'f161fields', 'secure', 'riskgoals', 'quote', 'retirement', 'review']) ok(subs.includes(id), 'retirement-fold-' + id);
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
ok(await page.evaluate(() => !!document.querySelector('#acc-step1 .acc-aside [data-action="enctoggle"]')), 'portfolio-encrypted-save-is-green-button-beside-step1');
await page.evaluate(() => document.querySelector('[data-action="enctoggle"]').click()); await new Promise(r => setTimeout(r, 300));
ok(await page.evaluate(() => !!document.querySelector('#enc-panel')), 'enc-button-opens-panel');
// ניתוח תיק פנסיוני: 8 חלקים בסדר קבוע (14.11), והחלקים שאוחדו נמצאים בתוכם
ok(port.join(',') === 'step1,portfolio,risk,alts,step3,riskgoals,checks,reports', 'portfolio-eight-parts-in-order', port.join(','));
const psubs = await subIds();
for (const id of ['peers', 'efficiency']) ok(psubs.includes(id), 'portfolio-merged-fold-' + id);
ok(await page.evaluate(() => document.querySelectorAll('main > section.acc:not(.sub) .acc-lead').length === 8), 'every-part-has-explanation-line');
ok(await page.evaluate(() => { const b = document.querySelector('#acc-body-checks').innerText; return /מסגרת החלטה/.test(b) && /בוצע ואומת/.test(b); }), 'checks-has-open-questions-and-review');
ok(await page.evaluate(() => !!document.querySelector('#acc-step3 select[data-rg="g0desc"]') && !document.querySelector('#acc-riskgoals select[data-rg="g0desc"]')), 'money-goals-entered-once-in-goals-part');
ok(await page.evaluate(() => document.querySelectorAll('#acc-reports [data-reptab]').length === 3 && !!document.querySelector('#acc-reports [data-report-preview]')), 'reports-three-tabs');
await page.evaluate(() => document.querySelector('[data-reptab="ba"]').click()); await new Promise(r => setTimeout(r, 300));
ok(await page.evaluate(() => !!document.querySelector('#acc-reports [data-ba-preview]')), 'reports-tab-before-after');
await page.evaluate(() => document.querySelector('[data-reptab="diff"]').click()); await new Promise(r => setTimeout(r, 300));
await page.evaluate(() => document.querySelector('#acc-reports [data-diff-open]').click()); await new Promise(r => setTimeout(r, 300));
ok(await page.evaluate(() => !document.querySelector('#acc-masdiff') && document.querySelector('#acc-reports [data-reptab="diff"]').classList.contains('on')), 'reports-tab-diff-inside-reports');
await page.evaluate(() => document.querySelector('[data-reptab="short"]').click()); await new Promise(r => setTimeout(r, 300));
// הגרסה הקודמת (11 חלקים) נשמרת ונפתחת רק בקישור ישיר ?layout=11, בלי כפתור במסך (הנחיות הבעלים 14.11 10:53, 11:08)
ok(await page.evaluate(() => !document.querySelector('[data-action^="layout|"]')), 'no-version-switch-on-screen');
const p11 = await browser.newPage(); await p11.setViewport({ width: 1100, height: 1200 });
p11.on('pageerror', e => errs.push(String(e)));
await p11.goto('http://127.0.0.1:8099/?tab=portfolio&layout=11', { waitUntil: 'networkidle2', timeout: 30000 });
await p11.click('[data-action="demo"]'); await new Promise(r => setTimeout(r, 800));
const port11 = await p11.evaluate(() => [...document.querySelectorAll('main > section.acc:not(.sub) > .acc-head')].map(h => h.dataset.acc));
ok(port11.join(',') === 'step1,portfolio,report,beforeafter,peers,risk,efficiency,step3,riskgoals,openq,review', 'legacy-11-parts-by-direct-link-only', port11.join(','));
ok(await p11.evaluate(() => !!document.querySelector('#acc-riskgoals select[data-rg="g0desc"]') && !!document.querySelector('#acc-portfolio .target-bar')), 'legacy-goals-in-sheet-and-bar-in-portfolio');
await p11.close();
for (const id of ['step2', 'kibua', 'alloc', 'questions', 'pension', 'summary']) ok(!port.includes(id), 'portfolio-no-retirement-step-' + id);
ok(errs.length === 0, 'no-page-errors' + (errs.length ? ': ' + errs[0] : ''));
console.log(`retirement-steps: PASS=${pass} FAIL=${fail}`);
await browser.close();
process.exit(fail ? 1 : 0);
