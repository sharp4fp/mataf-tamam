// qa-insurance-selects.mjs - ביטוח חיים ובריאות: חלונות נגללים במקום שדות ריקים (בקשת הבעלים 12.11 13:53)
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const page = await browser.newPage();
await page.setViewport({ width: 1100, height: 1200 });
const errs = []; page.on('pageerror', e => errs.push(String(e)));
let pass = 0, fail = 0;
const ok = (c, n, d = '') => { if (c) { pass++; console.log('PASS ' + n); } else { fail++; console.log('FAIL ' + n + (d ? ' :: ' + d : '')); } };
const wait = (ms) => new Promise(r => setTimeout(r, ms));
const setSel = (sel, v) => page.evaluate((sel, v) => { const s = document.querySelector(sel); s.value = v; s.dispatchEvent(new Event('change', { bubbles: true })); }, sel, v);
for (const ns of ['life', 'health']) {
    await page.goto(`http://127.0.0.1:8099/?tab=${ns}`, { waitUntil: 'networkidle2', timeout: 30000 });
    await page.evaluate((ns) => document.querySelector(`[data-ins-add="${ns}"]`).click(), ns); await wait(300);
    const opts = await page.evaluate((ns) => [...document.querySelectorAll(`select[data-ins="${ns}|0|insurer"] option`)].map(o => o.value).filter(Boolean), ns);
    const names = opts.filter(o => o !== 'אחר');
    ok(names.length >= 9 && names.every((o, i) => i === 0 || names[i - 1].localeCompare(o, 'he') <= 0) && opts[opts.length - 1] === 'אחר', `${ns}-insurer-select-sorted-other-last`, opts.join(','));
    ok(await page.evaluate((ns) => !!document.querySelector(`select[data-ins="${ns}|0|product"]`), ns), `${ns}-product-select`);
    await setSel(`select[data-ins="${ns}|0|insurer"]`, 'הראל'); await wait(200);
    ok(/הראל/.test(await page.evaluate(() => document.querySelector('.ins-policy-head b').innerText)), `${ns}-chosen-insurer-in-card-title`);
    await setSel(`select[data-ins="${ns}|0|product"]`, 'אחר'); await wait(200);
    ok(await page.evaluate((ns) => !!document.querySelector(`input[data-ins="${ns}|0|productOther"]`), ns), `${ns}-other-opens-text-field`);
}
ok(await page.evaluate(() => ['discountPeriod', 'deductible', 'waiting', 'claimRoute'].every(k => document.querySelector(`select[data-ins="health|0|${k}"]`))), 'health-extra-fields-are-selects');
ok(errs.length === 0, 'no-page-errors', errs[0] || '');
console.log(`insurance-selects: PASS=${pass} FAIL=${fail}`);
await browser.close();
process.exit(fail ? 1 : 0);
