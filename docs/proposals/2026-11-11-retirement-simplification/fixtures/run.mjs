import { createRequire } from 'module'; const require = createRequire('/opt/npm-tools/node_modules/'); const { chromium } = require('playwright');
const S = process.env.S;
const browser = await chromium.launch({ channel: 'chrome' }).catch(() => chromium.launch());
const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
const errs = []; page.on('pageerror', e => errs.push(String(e)));
await page.goto('http://127.0.0.1:8099/?tab=retirement', { waitUntil: 'networkidle' });
await page.setInputFiles('#maslaka-input', S + '/synthetic-009.xml');
await page.waitForTimeout(1500);
// open 161 section and upload blank official form (no client data)
await page.evaluate(() => { const h = document.querySelector('[data-acc="step2"]'); if (h && h.getAttribute('aria-expanded') !== 'true') h.click(); });
await page.waitForTimeout(300);
await page.setInputFiles('#f161-input', S + '/synthetic-161.pdf');
await page.waitForTimeout(6000);
// fill synthetic 161 fields where inputs exist
const vals = { fullName: 'ישראל בדיקה', idNumber: '123456782', birthDate: '15/11/1960', startWork: '01/01/1990', retireDate: '31/12/2026', workYears: '37', salaryFull: '18,500', salaryInsured: '18,500', salarySeverance: '18,500', totalGrant: '800,000', maxKtseva: '405,900', maxPitzuim: '800,000', maxExempt: '508,750', taxableGrant: '291,250' };
console.log('STATUS161', await page.evaluate(() => (document.querySelector('#acc-step2')||{}).innerText.slice(0,900)));
for (const [k, v] of Object.entries({})) {
  await page.evaluate(([k, v]) => { const b = document.querySelector(`[data-edit="${k}"]`); if (b) b.click(); }, [k, v]);
  await page.evaluate(([k, v]) => { const i = document.querySelector(`input[data-f161="${k}"]`); if (i) { i.value = v; i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })); } }, [k, v]);
}
await page.waitForTimeout(500);
const c = await page.$('[data-action="confirm161"]'); if (c) { await c.click(); await page.waitForTimeout(800); }
// collapsed overview
await page.evaluate(() => document.querySelectorAll('.acc-head[aria-expanded="true"]').forEach(h => h.click()));
await page.waitForTimeout(400);
await page.screenshot({ path: S + '/shots/before-overview-1280.png', fullPage: true });
// expand all, measure each
await page.evaluate(() => document.querySelectorAll('.acc-head[aria-expanded="false"]').forEach(h => h.click()));
await page.waitForTimeout(1500);
const data = await page.evaluate(() => [...document.querySelectorAll('section.acc')].map(s => {
  const body = s.querySelector('.acc-body');
  const t = body ? body.innerText : '';
  const note = [...(body ? body.querySelectorAll('.muted, .small, .note, .notes, .callout, .mini') : [])].filter(e => !e.closest('.muted .muted, .small .small')).map(e => e.innerText).join('\n');
  const rx = /לא מאומת|לא אומת|אינו|אינה|אינם|הערכה|להמחשה|אב-טיפוס|מותנה|אין לראות|לא מהווה|באחריות|הסתייגות|לבדוק מול|אומדן|מגבלת|בלבד/g;
  return { id: s.id.replace('acc-',''), title: s.querySelector('.acc-title').innerText.trim(), chars: t.length, words: t.split(/\s+/).filter(Boolean).length, noteChars: note.length, hedges: (t.match(rx) || []).length, height: s.getBoundingClientRect().height, inputs: body ? body.querySelectorAll('input,select,textarea').length : 0, tables: body ? body.querySelectorAll('table').length : 0, buttons: body ? body.querySelectorAll('button').length : 0, imgs: body ? body.querySelectorAll('img,canvas').length : 0, red: body ? body.querySelectorAll('.a161-red,.callout.warn').length : 0 };
}));
console.log(JSON.stringify(data, null, 0));
// per-section screenshots + text dump
const fs = await import('fs');
for (const d of data) {
  const el = await page.$('#acc-' + d.id);
  await el.screenshot({ path: `${S}/shots/sec-${d.id}.png` }).catch(e => console.log('shotfail', d.id, String(e).slice(0,80)));
  const txt = await el.innerText(); fs.writeFileSync(`${S}/shots/sec-${d.id}.txt`, txt);
}
console.log('ERRS', errs);
await page.screenshot({ path: S + '/shots/before-expanded-1280.png', fullPage: true });
const ph = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
await ph.goto('http://127.0.0.1:8099/?tab=retirement', { waitUntil: 'networkidle' });
await ph.setInputFiles('#maslaka-input', S + '/synthetic-009.xml'); await ph.waitForTimeout(1500);
await ph.evaluate(() => document.querySelectorAll('.acc-head[aria-expanded="true"]').forEach(h => h.click())); await ph.waitForTimeout(400);
await ph.screenshot({ path: S + '/shots/before-overview-390.png', fullPage: true });
await browser.close();
