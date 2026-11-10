// בדיקת דפדפן לאתר הספרייה: כל מסך נטען, בלי שגיאות JS ובלי "[object" בטקסט.
// שימוש: node mataf/library-site/browser-test.mjs <base-url>   (למשל http://localhost:4620)
import { chromium } from 'playwright';

const base = (process.argv[2] || 'http://localhost:4620').replace(/\/$/, '');
const browser = await chromium.launch(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {});
let fails = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' - ' + detail : ''}`); if (!ok) fails++; };

for (const [label, viewport] of [['מחשב', { width: 1280, height: 900 }], ['טלפון', { width: 390, height: 844 }]]) {
    const page = await browser.newPage({ viewport });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    const views = [
        ['חיפוש', '#/?q=' + encodeURIComponent('קיבוע זכויות'), '.hit', 1],
        ['מקורות', '#/sources', '.src', 23],
        ['צופה', '#/source/tax-161d-2026/4', '.pagetext', 1],
        ['מפת המקצוע', '#/index', 'details.dom', 29],
        ['סינון מפת המקצוע', '#/index?t=' + encodeURIComponent('פריסה'), 'details.dom', 1],
        ['מפת הספרייה', '#/map', '.mapdoc table', 3],
    ];
    for (const [name, hash, sel, min] of views) {
        await page.goto(base + '/' + hash, { waitUntil: 'networkidle' });
        await page.waitForTimeout(800);
        const n = await page.$$eval(sel, els => els.length);
        const text = await page.evaluate(() => document.getElementById('app').innerText);
        check(`${label}: ${name} - ${min}+ פריטים`, n >= min, String(n));
        check(`${label}: ${name} - בלי [object]`, !/\[object /.test(text));
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        check(`${label}: ${name} - בלי גלילה אופקית`, overflow <= 1, String(overflow));
    }
    check(`${label}: בלי שגיאות JS`, errors.length === 0, errors.slice(0, 3).join(' | '));
    await page.close();
}
await browser.close();
console.log(fails ? `${fails} FAIL` : 'ALL PASS');
process.exit(fails ? 1 : 0);
