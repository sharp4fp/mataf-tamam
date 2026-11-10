// Functional parser QA (browser DOMParser): mixed fee structures must suppress the whole SUG type basis.
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const page = await browser.newPage();
await page.goto('http://127.0.0.1:8099/', { waitUntil: 'networkidle2', timeout: 30000 });
const res = await page.evaluate(async () => {
    const mk = rows => `<Mimshak><YeshutYatzran><SHEM-YATZRAN>בדיקה</SHEM-YATZRAN><Mutzar><SUG-MUTZAR>1</SUG-MUTZAR><HeshbonOPolisa><SHEM-TOCHNIT>קרן פנסיה</SHEM-TOCHNIT>${rows}</HeshbonOPolisa></Mutzar></YeshutYatzran></Mimshak>`;
    const row = (sug, rate, mode, gova) => `<PerutMivneDmeiNihul><SUG-HOTZAA>${sug}</SUG-HOTZAA>${rate !== null ? `<SHEUR-DMEI-NIHUL>${rate}</SHEUR-DMEI-NIHUL>` : ''}<MEAFYENEI-MASLUL-DMEI-NIHUL>${mode}</MEAFYENEI-MASLUL-DMEI-NIHUL>${gova ? '<GOVA-DMEI-NIHUL-NIKBA-AL-PI-HOTZAOT-BAPOAL>1</GOVA-DMEI-NIHUL-NIKBA-AL-PI-HOTZAOT-BAPOAL>' : ''}</PerutMivneDmeiNihul>`;
    const mz = await import('./js/maslaka.js');
    const run = xml => { const into = { accounts: [], clientName: 'x', client: {}, fileCount: 0 }; const report = []; mz.parseMaslakaXml('t.xml', xml, into, report); return { acc: into.accounts[0] || null, report }; };
    const fixed = row(1, 0.5, 1, false);
    return {
        singleFixed: run(mk(fixed)),
        mixedVariable: run(mk(fixed + row(1, 0.7, 5, false))),       // case H: fixed 0.5 + variable mode 5
        mixedExpense: run(mk(fixed + row(1, 0.4, 1, true))),          // fixed + expense-basis fund-average
        repeatedFixed: run(mk(fixed + row(1, 0.6, 1, false))),        // two differing fixed rows
        fixedRateless: run(mk(fixed + row(1, null, 1, false))),       // fixed mode, unreadable rate
        depOnlyFixed: run(mk(row(2, 3.5, 1, false))),                 // deposit fee only, acc untouched
    };
});
let pass = 0, fail = 0;
const ok = (c, n, x = '') => { console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? ' :: ' + x : '')); c ? pass++ : fail++; };
const warn = r => r.report.map(e => e.detail || '').join(' | ');
ok(res.singleFixed.acc && res.singleFixed.acc.feeContractAcc === 0.5, 'single-fixed-row-eligible', JSON.stringify(res.singleFixed.acc && res.singleFixed.acc.feeContractAcc));
ok(res.mixedVariable.acc && res.mixedVariable.acc.feeContractAcc === null && /משתנים/.test(warn(res.mixedVariable)), 'caseH-fixed-plus-variable-suppressed', JSON.stringify(res.mixedVariable.acc && res.mixedVariable.acc.feeContractAcc));
ok(res.mixedExpense.acc && res.mixedExpense.acc.feeContractAcc === null && /ממוצע ברמת הקופה/.test(warn(res.mixedExpense)), 'fixed-plus-expense-basis-suppressed');
ok(res.repeatedFixed.acc && res.repeatedFixed.acc.feeContractAcc === null && /חוזרות/.test(warn(res.repeatedFixed)), 'repeated-differing-fixed-suppressed');
ok(res.fixedRateless.acc && res.fixedRateless.acc.feeContractAcc === null, 'fixed-row-unreadable-rate-suppresses');
ok(res.depOnlyFixed.acc && res.depOnlyFixed.acc.feeContractDep === 3.5 && res.depOnlyFixed.acc.feeContractAcc === null, 'deposit-only-fixed-eligible-acc-null');
console.log(`maslaka-mixed: PASS=${pass} FAIL=${fail}`);
await browser.close();
process.exit(fail ? 1 : 0);
