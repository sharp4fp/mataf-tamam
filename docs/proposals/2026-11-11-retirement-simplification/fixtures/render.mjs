import { createRequire } from 'module'; const require = createRequire('/opt/npm-tools/node_modules/'); const { chromium } = require('playwright');
const D = process.env.D;
const b = await chromium.launch({ channel: 'chrome' }).catch(() => chromium.launch());
for (const [w, h, name] of [[1280, 900, 'after-desktop-1280.png'], [390, 844, 'after-phone-390.png']]) {
  const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
  await p.goto('file://' + D + '/mockup-after.html'); await p.waitForTimeout(600);
  const sw = await p.evaluate(() => document.documentElement.scrollWidth); console.log(name, 'scrollWidth', sw);
  await p.screenshot({ path: D + '/' + name, fullPage: true });
}
await b.close();
