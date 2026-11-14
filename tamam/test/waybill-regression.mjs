// בדיקת רגרסיה מלאה לשטר המטען הדיגיטלי: כללי SPEC (שעות, חתימה, תצוגה) בגרסה 2,
// בנק התשובות והמילוי האוטומטי, ובדיקה שגרסה 1 עדיין נפתחת בקישור ?layout=v1 (כלל 0.6).
// הרצה: npm run build && npx vite preview --port 4517 & ואז npm test
// מצריך playwright (devDependency). צילומי מסך נשמרים ב-/tmp.
import { chromium } from 'playwright';

const url = 'http://localhost:4517/';
const results = [];
const check = (name, ok, detail='') => { results.push({name, ok, detail}); };


async function drawOn(locator) {
    await locator.scrollIntoViewIfNeeded();
    const b = await locator.boundingBox();
    await locator.page().mouse.move(b.x + b.width*0.25, b.y + b.height*0.4);
    await locator.page().mouse.down();
    await locator.page().mouse.move(b.x + b.width*0.55, b.y + b.height*0.7, { steps: 5 });
    await locator.page().mouse.move(b.x + b.width*0.8, b.y + b.height*0.3, { steps: 5 });
    await locator.page().mouse.up();
}

const browser = await chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

// 1. Fresh load: arrival + end EMPTY, summary COLLAPSED
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForSelector('main.wb2');
const inputs = page.locator('.file-control');
const arrival = page.getByLabel(/שעת הגעה לאתר/);
const end = page.getByLabel(/שעת סיום העבודה/);
check('fresh: arrival empty', (await arrival.inputValue()) === '', await arrival.inputValue());
check('fresh: end empty', (await end.inputValue()) === '', await end.inputValue());
check('fresh: summary collapsed', (await page.locator('text=כך השטר הדיגיטלי ייראה').count()) === 0);
check('fresh: toggle button present', (await page.locator('button.summary-toggle').count()) === 1);
await page.screenshot({ path: '/tmp/tamam-shot-collapsed.png', fullPage: true });

// 2. Stamp arrival, sign customer signature, verify end stamps
await page.getByRole('button', { name: 'הגעתי עכשיו' }).click();
const arrivalVal = await arrival.inputValue();
check('arrival stamps on button', /^\d{2}:\d{2}$/.test(arrivalVal), arrivalVal);

// draw on customer signature canvas (second sig-canvas)
const canvas = page.locator('canvas.sig-canvas').nth(1);
await drawOn(canvas);
await page.waitForTimeout(300);
await page.locator('main.wb2').scrollIntoViewIfNeeded();
const endVal = await end.inputValue();
check('customer signature stamps end', /^\d{2}:\d{2}$/.test(endVal), endVal);

// 3. Clear customer signature -> end empties
await page.locator('.sig-wrap').nth(1).getByRole('button', { name: 'נקה' }).click();
await page.waitForTimeout(300);
check('clear signature wipes end', (await end.inputValue()) === '', await end.inputValue());
check('clear signature hint returns', (await page.locator('.sig-wrap .sig-hint').nth(1).innerText()).includes('חתום כאן'));

// re-sign stamps fresh end
await drawOn(canvas);
await page.waitForTimeout(300);
const endVal2 = await end.inputValue();
check('re-sign stamps fresh end', /^\d{2}:\d{2}$/.test(endVal2), endVal2);

// 4. Fill a field, open summary, verify rows render
await page.getByLabel('כתובת אתר').fill('רחוב הברזל 5, חיפה');
await page.locator('button.summary-toggle').click();
await page.waitForTimeout(300);
check('summary opens on toggle', (await page.locator('text=כך השטר הדיגיטלי ייראה').count()) === 1);
check('summary toggle label flips', (await page.locator('button.summary-toggle').innerText()).includes('הסתר'));
check('summary row shows site', (await page.locator('.rows').innerText()).includes('רחוב הברזל 5'));
check('summary row shows end time', (await page.locator('.rows').innerText()).includes(endVal2));
await page.screenshot({ path: '/tmp/tamam-shot-expanded.png', fullPage: true });

// collapse again
await page.locator('button.summary-toggle').click();
check('summary collapses again', (await page.locator('text=כך השטר הדיגיטלי ייראה').count()) === 0);

// 5. Reload: both times empty again (never hydrated), summary still collapsed, site field persisted
await page.reload({ waitUntil: 'networkidle' });
await page.waitForSelector('main.wb2');
await page.waitForTimeout(500);
check('reload: arrival empty', (await page.getByLabel(/שעת הגעה לאתר/).inputValue()) === '');
check('reload: end empty', (await page.getByLabel(/שעת סיום העבודה/).inputValue()) === '');
check('reload: summary still collapsed', (await page.locator('text=כך השטר הדיגיטלי ייראה').count()) === 0);
check('reload: site field persisted', (await page.getByLabel('כתובת אתר').inputValue()) === 'רחוב הברזל 5, חיפה');

// 6. Client dropdown has 14 names; background images present
await page.locator('button.client-toggle').first().click();
check('client list has 14 names', (await page.locator('.client-option').count()) === 14, String(await page.locator('.client-option').count()));
check('bg images applied', await page.evaluate(() => {
    const bgs = [...document.querySelectorAll('.bg-crane')].map(e => getComputedStyle(e).backgroundImage);
    return bgs.length === 3 && bgs.every(b => b.includes('url('));
}));
await page.locator('button.client-option').first().click();

// 7. מילוי אוטומטי: תאריך של היום, רכב, סוג מנוף ונהג מוכנים בלי הקלדה
const today = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', day: 'numeric', month: 'numeric', year: 'numeric' }).format(new Date()).replace(/\//g, '.');
check('auto: date is today', (await page.getByLabel('תאריך').inputValue()) === today, await page.getByLabel('תאריך').inputValue());
check('auto: truck preselected', (await page.locator('.client-toggle').nth(1).innerText()).includes('307-64-001'));
check('auto: crane type', (await page.getByLabel(/סוג מנוף/).inputValue()) === '115 טון פאסי');
check('auto: driver', (await page.getByLabel('שם הנהג').inputValue()) === 'אופיר אברג׳יל');

// 8. בנק תשובות: 7 תשובות, כולל יום עבודת מנוף והובלה; הובלה פותחת את פרטי ההובלה; לחיצה שנייה מסירה
const chips = page.locator('.wb-chip');
check('note bank has 7 answers', (await chips.count()) === 7, String(await chips.count()));
const chipText = (await chips.allInnerTexts()).join('|');
check('note bank: crane day + haul', chipText.includes('יום עבודת מנוף') && chipText.includes('הובלה'));
const desc = page.getByLabel('תיאור העבודה והערות');
await page.locator('.wb-chip', { hasText: 'יום עבודת מנוף' }).click();
check('chip adds to description', (await desc.inputValue()).includes('יום עבודת מנוף'));
check('haul closed before chip', (await page.getByLabel('מקום טעינה').count()) === 0);
await page.locator('.wb-chip', { hasText: /^. הובלה$/ }).click();
check('haul chip opens haul section', (await page.getByLabel('מקום טעינה').count()) === 1);
await page.locator('.wb-chip', { hasText: 'יום עבודת מנוף' }).click();
check('second tap removes', !(await desc.inputValue()).includes('יום עבודת מנוף') && (await desc.inputValue()).includes('הובלה'));

// 9. שעות עבודת מנוף מחושבות; אין גלילה לרוחב בטלפון
await page.getByLabel(/שעת הגעה לאתר/).fill('07:00');
await page.getByLabel(/שעת סיום העבודה/).fill('09:30');
check('crane hours computed', (await page.locator('.wb-hours').innerText()).includes('2 שעות ו-30 דקות'), await page.locator('.wb-hours').innerText());
check('manual arrival flagged', (await page.locator('.wb-flag').count()) === 1);
check('no horizontal scroll at 390px', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
await page.screenshot({ path: '/tmp/tamam-shot-v2.png', fullPage: true });

// 10. גרסה 1 עדיין נפתחת בקישור ישיר
await page.goto(url + '?layout=v1', { waitUntil: 'networkidle' });
await page.waitForSelector('main.file-card');
check('v1 opens by link', (await page.locator('text=מילוי שטר מטען מהשטח').count()) === 1);
check('v1: arrival empty', (await page.getByLabel(/שעת הגעה לאתר/).inputValue()) === '');

await browser.close();
let fail = 0;
for (const r of results) { if (!r.ok) fail++; console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? '  [' + r.detail + ']' : ''}`); }
console.log(`\n${results.length - fail}/${results.length} passed`);
process.exit(fail ? 1 : 0);
