// qa-maslaka-mekadem.mjs - M-045 שלב 1: קריאת מקדם הקצבה מהמסלקה (בלי ציטוט קצבה; החלטת הבעלים 11.11.2026 18:57)
// XML סינתטי בלבד - אין נתוני לקוח במאגר.
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const page = await browser.newPage();
await page.setViewport({ width: 1100, height: 1200 });
const errs = [];
page.on('pageerror', e => errs.push(String(e)));
let pass = 0, fail = 0;
const ok = (c, n, d = '') => { if (c) { pass++; console.log('PASS ' + n); } else { fail++; console.log('FAIL ' + n + (d ? ' :: ' + d : '')); } };
await page.goto('http://127.0.0.1:8099/?tab=retirement', { waitUntil: 'networkidle2', timeout: 30000 });

const res = await page.evaluate(async () => {
    const nil = (t) => `<${t} xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:nil="true"/>`;
    const ylg = (factor, life, yld) => `<YitraLefiGilPrisha><GIL-PRISHA>67</GIL-PRISHA><TOTAL-CHISACHON-MITZTABER-TZAFUY>16153.49</TOTAL-CHISACHON-MITZTABER-TZAFUY>`
        + (factor === null ? nil('MEKADEM-MOVTACH-LEPRISHA') : `<MEKADEM-MOVTACH-LEPRISHA>${factor}</MEKADEM-MOVTACH-LEPRISHA>`)
        + `<MEKADEM-HAVTACHST-TOCHELET>${life}</MEKADEM-HAVTACHST-TOCHELET><MEKADEM-HAVTACHST-TOCHELETPRISHA>2</MEKADEM-HAVTACHST-TOCHELETPRISHA>`
        + `<MEKADEM-HAVTACHAT-TSUA>${yld}</MEKADEM-HAVTACHAT-TSUA><MEKADEM-HAVTACHAT-TSUATKUFA>2</MEKADEM-HAVTACHAT-TSUATKUFA>${nil('TKUFAT-HAGBALA-BESHANIM')}`
        + `<TOCHELET-MASHPIA-KITZBA>2</TOCHELET-MASHPIA-KITZBA><TSUA-MASHPIA-KITZBA>1</TSUA-MASHPIA-KITZBA></YitraLefiGilPrisha>`;
    const mk = (body) => `<Mimshak><YeshutYatzran><SHEM-YATZRAN>מבטחת לדוגמה</SHEM-YATZRAN><Mutzar><SUG-MUTZAR>2</SUG-MUTZAR><HeshbonOPolisa><SHEM-TOCHNIT>פוליסה לדוגמה</SHEM-TOCHNIT><MISPAR-POLISA-O-HESHBON>1</MISPAR-POLISA-O-HESHBON>${body}</HeshbonOPolisa></Mutzar></YeshutYatzran></Mimshak>`;
    const mz = await import('./js/maslaka.js');
    const run = (xml) => { const into = { accounts: [], clientName: 'x', client: {}, fileCount: 0 }; mz.parseMaslakaXml('t.xml', xml, into, []); return into.accounts[0] || null; };
    return {
        guaranteed: run(mk(ylg('157.63', 1, 2))),
        noFactor: run(mk(ylg(null, 2, 2))),
        noBlock: run(mk('')),
        capitalOnly: run(mk(ylg(null, 2, 2).replace('</YitraLefiGilPrisha>', '<Kupot><Kupa><SUG-KUPA>2</SUG-KUPA></Kupa></Kupot></YitraLefiGilPrisha>'))),
        // פוליסה עם שני בלוקים (כמו בקובץ אמיתי): הוני ללא מקדם ראשון, קצבתי עם מקדם שני
        twoBlocks: run(mk(ylg(null, 2, 2).replace('</YitraLefiGilPrisha>', '<Kupot><Kupa><SUG-KUPA>2</SUG-KUPA></Kupa></Kupot></YitraLefiGilPrisha>').replace('16153.49', '61584.93')
            + ylg('157.63', 1, 2).replace('</YitraLefiGilPrisha>', '<Kupot><Kupa><SUG-KUPA>1</SUG-KUPA></Kupa></Kupot></YitraLefiGilPrisha>'))),
    };
});
const g = res.guaranteed && res.guaranteed.annuityFactor;
ok(g && g.guaranteedFactor === 157.63 && g.retireAge === 67, 'guaranteed-factor-and-age-read', JSON.stringify(g));
ok(g && g.lifeGuarantee === true && g.yieldGuarantee === false && g.lifeGuaranteeAtRetirement === false, 'flags-1-yes-2-no');
ok(g && g.lifeAffectsPension === false && g.yieldAffectsPension === true && g.limitYears === null, 'affect-flags-and-nil-limit');
ok(g && Math.abs(g.pensionFromGuaranteed - 102.48) < 0.01, 'pension-from-guaranteed = savings / factor', g && String(g.pensionFromGuaranteed));
const n = res.noFactor && res.noFactor.annuityFactor;
ok(n && n.guaranteedFactor === null && n.pensionFromGuaranteed === null && n.lifeGuarantee === false, 'nil-factor-is-null-not-zero', JSON.stringify(n));
ok(res.noBlock && res.noBlock.annuityFactor === null, 'no-forecast-block-no-factor');
const t2 = res.twoBlocks && res.twoBlocks.annuityFactor;
ok(t2 && t2.guaranteedFactor === 157.63 && t2.sugKupa === '1' && t2.projectedSavings === 16153.49, 'two-blocks-factor-from-annuity-block-not-first', JSON.stringify(t2));
ok(t2 && t2.capitalSavings === 61584.93 && t2.blocks === 2 && t2.capitalOnly === false, 'two-blocks-capital-part-reported-separately');
const co = res.capitalOnly && res.capitalOnly.annuityFactor;
ok(co && co.capitalOnly === true && co.guaranteedFactor === null && co.capitalSavings === 16153.49, 'capital-only-policy-not-treated-as-annuity', JSON.stringify(co));

// תצוגה בשלב 5 (הדגמה סינתטית): טבלת המקדם, הקצבה מהמקדם, והשוואה לקרן פנסיה אחרי חישוב מקדם בטבלה
await page.click('[data-action="demo"]');
await new Promise(r => setTimeout(r, 800));
await page.evaluate(() => { const h = document.querySelector('[data-acc="pension"]'); if (h.getAttribute('aria-expanded') !== 'true') h.click(); });
await new Promise(r => setTimeout(r, 300));
await page.evaluate(() => { const h = document.querySelector('[data-acc="guaranteed"]'); if (h && h.getAttribute('aria-expanded') !== 'true') h.click(); });
await new Promise(r => setTimeout(r, 300));
const tbl = await page.evaluate(() => { const t = document.querySelector('[data-guaranteed]'); return t ? t.innerText : null; });
ok(tbl && tbl.includes('190') && tbl.includes('579') && tbl.includes('מגדלור'), 'pension-step-shows-guaranteed-factor-table', tbl || '');
ok(await page.evaluate(() => /לא נדרש: ציטוט קצבה/.test(document.querySelector('[data-acc="quote"]').textContent)), 'quote-marked-not-required');
ok(errs.length === 0, 'no-page-errors', errs[0] || '');
console.log(`maslaka-mekadem: PASS=${pass} FAIL=${fail}`);
await browser.close();
process.exit(fail ? 1 : 0);
