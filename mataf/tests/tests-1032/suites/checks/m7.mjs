import { m, chk } from './common.mjs';
let bad = 0; const f = (msg, c) => { if (bad++ < 6) console.log('FAIL', msg, JSON.stringify(c)); };
let prev = null;
for (let g = 0; g <= 120000; g += 50) { const t = m.monthlyTaxBrackets2026(g); if (prev !== null) { const mr = (t - prev) / 50; if (t < prev - 1e-9) f('tax decreases', {g}); if (mr > 0.5 + 1e-9) f('marginal >50%', {g, mr}); } prev = t; }
for (const eligible of [false, true]) for (const sim of ['', 'full', 'used']) for (const used of [0, 40, 100, 150, -5]) for (const cert of [null, 0, 30, 57.5, 80, NaN]) for (const other of [0, 5000, 20000, 70000]) for (const cp of [0, 2.25, 5]) {
  let last = null;
  for (const gross of [0, 1000, 5422, 5423, 9430, 15000, 30000, 80000]) {
    const r = m.pensionNetMonthly2026({ gross, eligible, kibuaUsedPct: used, certExemptRatePct: cert, simChoice: sim, creditPoints: cp, otherIncome: other });
    const c = { gross, eligible, sim, used, cert, other, cp, r };
    if (![r.exempt, r.taxablePension, r.pensionTax, r.netPension, r.netTotal].every(Number.isFinite)) f('non-finite', c);
    if (r.pensionTax < -1 || r.pensionTax > gross + 1) f('tax out of [0,gross]', c);
    if (r.netPension > gross + 1 || r.netPension < -1) f('net out of range', c);
    if (r.exempt > gross + 1 || r.exempt < 0) f('exempt out of range', c);
    if (Math.abs(r.exempt + r.taxablePension - gross) > 1.01) f('exempt+taxable != gross', c);
    if (!eligible && r.exempt !== 0) f('ineligible got exemption', c);
    if (last !== null && r.netPension < last - 1) f('net pension decreases with gross', {...c, last}); last = r.netPension;
  }
  for (const gross of [0, 5000, 9430, 9431, 20000]) { const s = m.survivorNetMonthly2026({ gross, creditPoints: cp, otherIncome: other }); if (!(s.netPension <= gross + 1 && s.netPension >= 0 && s.exempt === Math.round(Math.min(gross, 9430)))) f('survivor', {gross, s}); }
}
chk('tax/net invariants over 3k+ combinations', bad === 0);
