// qa-target-link.mjs - יעד החשיפה (חלק רמת הסיכון) מניע את ההמלצות בתיק הנכסים (בקשת הבעלים 11.11.2026)
// ברירת מחדל: כל ההחזקות המזוהות משתתפות; בקר נוסף בראש תיק הנכסים; עדכון חי בזמן גרירה.
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const page = await browser.newPage();
await page.setViewport({ width: 1100, height: 1200 });
const errs = [];
page.on('pageerror', e => errs.push(String(e)));
let pass = 0, fail = 0;
const ok = (c, n, d = '') => { if (c) { pass++; console.log('PASS ' + n); } else { fail++; console.log('FAIL ' + n + (d ? ' :: ' + d : '')); } };
const wait = (ms) => new Promise(r => setTimeout(r, ms));

await page.goto('http://127.0.0.1:8099/', { waitUntil: 'networkidle2', timeout: 30000 });
await page.click('[data-action="demo"]');
await wait(800);
ok(await page.evaluate(() => !!document.querySelector('.target-bar') && !document.querySelector('[data-eq-slider]')), 'bar-asks-to-identify-before-any-identified');
// זיהוי מסלולים: בחירת האפשרות הראשונה בכל שדה בחירה
for (let i = 0; i < 8; i++) {
    const done = await page.evaluate(() => { const s = [...document.querySelectorAll('select[data-select-id]')].find(x => !x.value && x.options.length > 1); if (!s) return true; s.value = s.options[1].value; s.dispatchEvent(new Event('change', { bubbles: true })); return false; });
    await wait(250);
    if (done) break;
}
ok(await page.evaluate(() => !!document.querySelector('[data-eq-slider]')), 'top-slider-appears-after-identification');
ok(await page.evaluate(() => [...document.querySelectorAll('[data-eligible]')].every(c => c.checked)), 'all-identified-eligible-by-default');

const setTop = async (v) => { await page.evaluate((v) => { const s = document.querySelector('[data-eq-slider]'); s.value = v; s.dispatchEvent(new Event('change', { bubbles: true })); }, v); await wait(400); };
const cards = () => page.evaluate(() => [...document.querySelectorAll('#acc-portfolio [data-tblock] .target-card')].map(c => c.innerText.replace(/\s+/g, ' ').trim()));
await setTop(85);
const c85 = await cards();
ok(c85.length >= 3, 'every-holding-has-target-card', String(c85.length));
ok(c85.some(t => t.includes('ההמלצה ליעד 85')), 'card-names-target-85');
const sum85 = await page.evaluate(() => document.querySelector('[data-target-summary]').textContent);
ok(/מחוץ לטווח.*\d.*-.*\d/.test(sum85), 'summary-out-of-range-shows-range', sum85);
await setTop(70);
const sum70 = await page.evaluate(() => document.querySelector('[data-target-summary]').textContent);
ok(/חשיפה מושגת 70/.test(sum70) && /שינוי/.test(sum70), 'summary-at-70-shows-achieved-and-changes', sum70);
await setTop(60);
const c15 = await cards();
ok(c15.some(t => t.includes('ההמלצה ליעד 60')), 'card-names-target-60');
const c70x = await (async () => { await setTop(75); return cards(); })();
ok(JSON.stringify(c15) !== JSON.stringify(c70x), 'recommendations-change-with-target');
await setTop(60);
// סנכרון עם בקר חלק רמת הסיכון
ok(await page.evaluate(() => { const s = document.getElementById('eq-slider'); return !s || s.value === '60'; }), 'risk-slider-synced');
// עדכון חי בזמן גרירה (input) - בלי להחליף את אלמנט הבקר
const before = await page.evaluate(() => { window.__sl = document.querySelector('[data-eq-slider]'); const s = window.__sl; s.value = 72; s.dispatchEvent(new Event('input', { bubbles: true })); return true; });
await wait(200);
const live = await page.evaluate(() => ({ same: document.querySelector('[data-eq-slider]') === window.__sl, label: document.querySelector('.eq-target-out').textContent, card: [...document.querySelectorAll('[data-tblock] .target-card')].some(c => c.innerText.includes('ההמלצה ליעד 72')) }));
ok(before && live.same && /72/.test(live.label) && live.card, 'live-update-while-dragging', JSON.stringify(live));
// הוצאת החזקה מהשינוי בחלק רמת הסיכון ← הכרטיס שלה בתיק אומר "ללא שינוי"
await page.evaluate(() => { const c = document.querySelector('[data-eligible]'); c.click(); });
await wait(400);
ok(await page.evaluate(() => [...document.querySelectorAll('[data-tblock] .target-card')].some(c => c.innerText.includes('ללא שינוי'))), 'unticked-holding-says-no-change');
// מעבר לחלק רמת הסיכון מהקישור
await page.evaluate(() => document.querySelector('[data-goto-acc="risk"]').click());
await wait(400);
ok(await page.evaluate(() => document.querySelector('[data-acc="risk"]').getAttribute('aria-expanded') === 'true'), 'link-opens-risk-section');
ok(errs.length === 0, 'no-page-errors', errs[0] || '');
console.log(`target-link: PASS=${pass} FAIL=${fail}`);
await browser.close();
process.exit(fail ? 1 : 0);
