import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const page = await browser.newPage();
await page.setViewport({ width: 1000, height: 1200 });
page.on('pageerror', e => console.log('PAGEERR:', String(e)));
await page.goto('http://127.0.0.1:8099/?tab=retirement', { waitUntil: 'networkidle2', timeout: 30000 });
await page.click('[data-action="demo"]');
await new Promise(r => setTimeout(r, 800));
// מבנה 7 השלבים (11.11.2026): ניתוח 161 נמצא בשלב "ההמלצה" (alloc) בתוך קיפול "retirement" - פותחים את שלושתם
await page.evaluate(() => { for (const id of ['step2', 'alloc', 'retirement']) { const h = document.querySelector(`[data-acc="${id}"]`); if (h && h.getAttribute('aria-expanded') !== 'true') h.click(); } });
await new Promise(r => setTimeout(r, 400));
const probe = () => page.evaluate(() => ({
    confirmBtn: !!document.querySelector('[data-action="confirm161"]'),
    suppressed: document.body.innerText.includes('מושהה ואינו מוצג עד לאישור מפורש'),
    unverifiedTags: document.body.innerText.includes('טרם אומת מול הטופס'),
    verifiedTags: document.body.innerText.includes('אומת מול הטופס ✓'),
    analysisShown: document.body.innerText.includes('ניתוח טופס 161 ונקודות החלטה'),
    kibuahNote: document.body.innerText.includes('הערכה גסה להמחשה'),
    scenGated: document.body.innerText.includes('יוצגו כאן לאחר אישורם המפורש'),
    scenShown: document.body.innerText.includes('תרחישי סימון לבחינה בחלקים'),
}));
const before = await probe();
console.log('BEFORE-CONFIRM:', JSON.stringify(before));
// open step2 and screenshot the confirm block
await page.evaluate(() => { const b = document.querySelector('[data-action="confirm161"]'); if (b) b.scrollIntoView({ block: 'center' }); });
await new Promise(r => setTimeout(r, 300));
await page.screenshot({ path: '/downloads/qa-161-before-confirm.png' });
await page.click('[data-action="confirm161"]');
await new Promise(r => setTimeout(r, 500));
const after = await probe();
await page.evaluate(() => { const el = [...document.querySelectorAll('.a161-warn')].pop(); if (el) el.scrollIntoView({ block: 'center' }); });
await new Promise(r => setTimeout(r, 300));
await page.screenshot({ path: '/downloads/qa-161-after-confirm.png' });
console.log('AFTER-CONFIRM:', JSON.stringify(after));
// edit a field -> confirmation must reset and analysis suppress again
await page.evaluate(() => { const b = document.querySelector('[data-edit="workYears"]'); if (b) b.click(); });
await new Promise(r => setTimeout(r, 200));
await page.evaluate(() => { const i = document.querySelector('input[data-f161="workYears"]'); if (i) { i.value = '30'; i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })); } });
await new Promise(r => setTimeout(r, 500));
const afterEdit = await probe();
console.log('AFTER-EDIT:', JSON.stringify(afterEdit));
const pass = before.confirmBtn && before.suppressed && before.unverifiedTags && !before.verifiedTags && !before.analysisShown && before.scenGated && !before.scenShown
    && !after.confirmBtn && !after.suppressed && after.verifiedTags && after.analysisShown && after.kibuahNote && !after.scenGated && after.scenShown
    && afterEdit.confirmBtn && afterEdit.suppressed && !afterEdit.analysisShown;
console.log(pass ? 'QA-161-CONFIRM: ALL PASS' : 'QA-161-CONFIRM: FAIL');
await browser.close();
