// qa-topmix.mjs - חלק 2 (המערכת בוחרת לבד, בלי בחירה ידנית) "תמונת מצב התיק והמלצות": תמהיל מובילי השוק לפי בקר אחוז המניות (M-060, אושר 14.11.2026 12:08)
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const page = await browser.newPage();
await page.setViewport({ width: 1100, height: 1200 });
const errs = []; page.on('pageerror', e => errs.push(String(e)));
let pass = 0, fail = 0;
const ok = (c, n, d = '') => { if (c) { pass++; console.log('PASS ' + n); } else { fail++; console.log('FAIL ' + n + (d ? ' :: ' + d : '')); } };
const wait = (ms) => new Promise(r => setTimeout(r, ms));
await page.goto('http://127.0.0.1:8099/?tab=portfolio', { waitUntil: 'networkidle2', timeout: 30000 });
await page.click('[data-action="demo"]'); await wait(800);
for (let i = 0; i < 8; i++) {
    const done = await page.evaluate(() => { const s = [...document.querySelectorAll('select[data-select-id]')].find(x => !x.value && x.options.length > 1); if (!s) return true; s.value = s.options[1].value; s.dispatchEvent(new Event('change', { bubbles: true })); return false; });
    await wait(250); if (done) break;
}
ok(await page.evaluate(() => !!document.querySelector('#acc-portfolio [data-eq-slider]')), 'slider-in-part-2');
const setT = async (v) => { await page.evaluate((v) => { const s = document.querySelector('[data-eq-slider]'); s.value = v; s.dispatchEvent(new Event('change', { bubbles: true })); }, v); await wait(500); };
const sum = () => page.evaluate(() => document.querySelector('[data-target-summary]').textContent);
const cards = () => page.evaluate(() => [...document.querySelectorAll('#acc-portfolio [data-tblock][data-mix] .target-card')].map(c => c.innerText.replace(/\s+/g, ' ')));
// ברירת מחדל: הכול מסומן חוץ מפוליסות (ביטוח מנהלים)
const sel = await page.evaluate(() => [...document.querySelectorAll('[data-mixsel]')].map(c => ({ on: c.checked, t: c.closest('label').textContent })));
ok(sel.length >= 3, 'checkbox-per-holding', String(sel.length));
ok(sel.every(x => /ביטוח מנהלים/.test(x.t) ? !x.on : x.on), 'default-all-but-policies', JSON.stringify(sel.map(x => x.on)));
// יעד 50%: נכנס לטווח ±3% דרך שילוב בין המוצרים (לא רק מסלולי גיל)
await setT(50);
const s50 = await sum();
ok(/חשיפה מושגת (4[7-9]|5[0-3])/.test(s50) && /בטווח ±3%/.test(s50), 'target-50-within-3pct', s50);
const c50 = await cards();
ok(c50.some(t => /אג"ח/.test(t)), 'mix-uses-bond-track-somewhere', c50.join(' || ').slice(0, 300));
ok(c50.some(t => /מקום \d מתוך \d+ בקטגוריה/.test(t) && /ציון/.test(t)), 'card-shows-rank-and-score');
ok(c50.some(t => /לא נכלל בתמהיל/.test(t)), 'policy-not-selected-stays');
// יעד 30%: מגיע גם לחשיפה נמוכה (מסלולי 60 ומעלה / אג"ח)
await setT(30);
ok(/חשיפה מושגת (2[7-9]|3[0-3])/.test(await sum()), 'target-30-reachable', await sum());
// יעד מחוץ לטווח - הודעה ברורה עם הטווח
await setT(100);
ok(/מחוץ לטווח האפשרי/.test(await sum()), 'out-of-range-message', await sum());
// המערכת מחליטה לבד: אין חלון בחירה ידני; טבלת המלצה לכל התיק עם כיוון לכל מוצר (בקשת הבעלים 14.11 12:41)
await setT(50);
ok(await page.evaluate(() => !document.querySelector('select[data-mixpick]')), 'no-manual-dropdown');
const tbl = await page.evaluate(() => [...document.querySelectorAll('#acc-portfolio [data-mixtable] tbody tr')].map(r => r.innerText.replace(/\s+/g, ' ')));
ok(tbl.length >= 4 && /כל התיק/.test(tbl[tbl.length - 1]), 'recommendation-table-under-slider', tbl.join(' || ').slice(0, 300));
ok(tbl.some(r => /[↓↑●→]/.test(r)), 'direction-per-product');
ok((await cards()).some(t => /הורדת סיכון|העלאת סיכון|נשאר - המסלול הנוכחי מוביל|ברמת סיכון דומה/.test(t) && /להעביר ל|נשאר במסלול/.test(t)), 'card-says-where-to-move');
// ביטול סימון של מוצר - נשאר במקום
await page.evaluate(() => { const c = [...document.querySelectorAll('[data-mixsel]')].find(x => x.checked); c.click(); }); await wait(400);
ok((await cards()).filter(t => /לא נכלל בתמהיל/.test(t)).length >= 2, 'unticked-holding-stays');
// עדכון חי בזמן גרירה
await page.evaluate(() => { window.__sl = document.querySelector('[data-eq-slider]'); const s = window.__sl; s.value = 66; s.dispatchEvent(new Event('input', { bubbles: true })); }); await wait(250);
ok(await page.evaluate(() => document.querySelector('[data-eq-slider]') === window.__sl && /66/.test(document.querySelector('.eq-target-out').textContent) && [...document.querySelectorAll('[data-tblock][data-mix] .target-card')].some(c => c.innerText.includes('ליעד 66'))), 'live-update-while-dragging');
// חלק 3: הבקר לתצוגה בלבד, עם קישור לחלק 2
ok(await page.evaluate(() => { const r = document.querySelector('#acc-risk #eq-slider'); return !!r && r.disabled && !r.hasAttribute('data-eq-slider'); }), 'risk-slider-read-only');
await page.evaluate(() => { const h = document.querySelector('[data-acc="portfolio"]'); if (h.getAttribute('aria-expanded') === 'true') h.click(); }); await wait(300);
await page.evaluate(() => document.querySelector('#acc-risk [data-goto-acc="portfolio"]').click()); await wait(400);
ok(await page.evaluate(() => document.querySelector('[data-acc="portfolio"]').getAttribute('aria-expanded') === 'true'), 'link-opens-part-2');
// חלוקה בין מקומי לחו"ל - סיכום בתמהיל
await page.evaluate(() => { const s = document.querySelector('select[data-geo-pref]'); s.value = 'split'; s.dispatchEvent(new Event('change', { bubbles: true })); }); await wait(400);
ok(await page.evaluate(() => !!document.querySelector('select[data-geo-split]') && /חלוקת אפיק המניות בהצעה/.test(document.querySelector('#acc-portfolio').textContent)), 'split-summary-in-mix');
ok(errs.length === 0, 'no-page-errors', errs[0] || '');
console.log(`topmix: PASS=${pass} FAIL=${fail}`);
await browser.close();
process.exit(fail ? 1 : 0);
