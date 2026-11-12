// qa-assets.mjs - כרטסת מחשבונים, "תמונת נכסים וסיכון כולל": העלאת שני אישורי יתרות סינתטיים (PDF שנוצר בבדיקה),
// שאלון בטווחים, והתוצאה. בלי נתוני לקוח.
import puppeteer from 'puppeteer-core';
import fs from 'fs';
import os from 'os';
import path from 'path';
const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
let pass = 0, fail = 0;
const ok = (c, n, d = '') => { if (c) { pass++; console.log('PASS ' + n); } else { fail++; console.log('FAIL ' + n + (d ? ' :: ' + d : '')); } };
const wait = (ms) => new Promise(r => setTimeout(r, ms));

// אישור יתרות סינתטי במבנה "ריכוז יתרות לסוף שנה" (טבלה מימין לשמאל: סוג | קרן | יתרה בש"ח)
async function makePdf(file, rows) {
    const pg = await browser.newPage();
    const tr = rows.map(([l, bal, keren]) => `<tr><td>${l}</td><td>${keren || ''}</td><td>${bal}</td></tr>`).join('');
    await pg.setContent(`<html dir="rtl" lang="he"><meta charset="utf-8"><body style="font-family:DejaVu Sans,sans-serif"><div>bankhapoalim.co.il</div>
        <h3>ריכוז יתרות לסוף שנת 2025</h3><div>נכון לתאריך 31/12/2025</div><table style="width:100%">${tr}</table></body></html>`);
    fs.writeFileSync(file, await pg.pdf({ format: 'A4' }));
    await pg.close();
}
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-assets-'));
const f1 = path.join(dir, 'bank1.pdf'), f2 = path.join(dir, 'bank2.pdf');
await makePdf(f1, [['עו"ש שקל', '40,000.00'], ['פקדון לזמן קצוב', '160,000.00', '158,000.00'], ['ניירות ערך סחירים', '300,000.00'], ['מעוף לונג', '0.00'], ['ישראכרט חובה', '-12,000.00']]);
await makePdf(f2, [['עו"ש שקל', '10,000.00'], ['קרנות נאמנות', '90,000.00']]);

const page = await browser.newPage();
await page.setViewport({ width: 1100, height: 1300 });
const errs = [];
page.on('pageerror', e => errs.push(String(e)));
await page.goto('http://127.0.0.1:8099/?tab=calc', { waitUntil: 'networkidle2', timeout: 30000 });
ok(await page.evaluate(() => !!document.getElementById('assets-card') && document.getElementById('assets-input').multiple), 'assets-card-with-multi-file-upload');
await (await page.$('#assets-input')).uploadFile(f1, f2);
await wait(2500);
const status = await page.evaluate(() => document.querySelector('#assets-card .status-line').innerText);
ok(/bank1\.pdf: זוהו 4 שורות/.test(status) && /bank2\.pdf: זוהו 2 שורות/.test(status) && /0 ₪ שלא מוצגות/.test(status), 'two-confirmations-parsed', status);
const rows = await page.evaluate(() => [...document.querySelectorAll('[data-asbank] tbody tr')].map(r => r.cells[1].innerText.split('\n')[0] + '=' + r.cells[2].querySelector('input').value));
ok(rows.includes('פיקדון לזמן קצוב=160000') && rows.includes('ישראכרט חובה=-12000') && rows.includes('קרנות נאמנות=90000'), 'balance-column-and-labels', rows.join(' | '));
// חשיפה לני"ע ולקרנות: בחירת טווח
const setSel = (sel, v) => page.evaluate((sel, v) => { const s = document.querySelector(sel); s.value = v; s.dispatchEvent(new Event('change', { bubbles: true })); }, sel, v);
await setSel('[data-asbank="0"] select[data-asrow="0|2|eqRange"]', 'm'); await wait(200);
await setSel('[data-asbank="1"] select[data-asrow="1|1|eqRange"]', 'g'); await wait(200);
// שאלון: תיק מנוהל 300-600 אלף כללי; דירה 2-5 מיליון; ירידה 20% - אחכה
await setSel('select[data-asq="q2"]', 'd'); await wait(200);
await setSel('select[data-asq="q2eq"]', 'g'); await wait(200);
await setSel('select[data-asq="q6"]', 'yes'); await wait(200);
ok(await page.evaluate(() => !!document.querySelector('select[data-asq="q6v"]')), 'home-value-appears-only-after-yes');
await setSel('select[data-asq="q6v"]', 'g'); await wait(200);
await setSel('select[data-asq="q12"]', 'wait'); await wait(300);
const res = await page.evaluate(() => document.querySelector('[data-assets-result]').innerText);
// מניות: lo = (300,000×80% + 90,000×35% + 450,000×35%) / (40,000+160,000+300,000+10,000+90,000+450,000) = 429,000/1,050,000 = 40.9%
//        hi = (300,000 + 90,000×60% + 450,000×60%) / 1,050,000 = 624,000/1,050,000 = 59.4%
ok(/41-59%/.test(res), 'true-equity-range-shown', res);
ok(/בתוך הטווח/.test(res), 'tolerance-verdict-shown');
const tbl = await page.evaluate(() => document.querySelector('[data-assets-table]').innerText);
ok(/דירת מגורים \(במאזן בלבד\)/.test(tbl) && /לא נספר/.test(tbl), 'home-in-balance-only');
ok(/התחייבויות: ₪12,000/.test(await page.evaluate(() => document.getElementById('assets-card').innerText)), 'credit-as-debt');
// הסרת אישור
await page.evaluate(() => document.querySelector('[data-action="asrm|1"]').click()); await wait(300);
ok(await page.evaluate(() => document.querySelectorAll('[data-asbank]').length) === 1, 'remove-confirmation');
// טלפון
await page.setViewport({ width: 380, height: 900 }); await wait(400);
const sw = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
ok(sw <= 1, 'phone-no-horizontal-page-scroll', String(sw));
ok(errs.length === 0, 'no-page-errors', errs[0] || '');
fs.rmSync(dir, { recursive: true, force: true });
console.log(`assets-qa: PASS=${pass} FAIL=${fail}`);
await browser.close();
process.exit(fail ? 1 : 0);
