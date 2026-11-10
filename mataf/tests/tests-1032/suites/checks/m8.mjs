// Name-only (NO code) matching of real official pension track names. Pre-existing v565 matcher (analysis.js matchTrack, token overlap >=0.6).
import { m, P, chk } from './common.mjs';
const rows = Object.values(P).filter(r => r.eq !== null && !/קצבה/.test(r.name));
let n = 0, same = 0, none = 0, wrong10 = 0, wrong25 = 0; const ex = [];
for (const r of rows) { n++; const v = m.analyzePortfolio({ accounts: [{ account: 'A', kind: 'pensia', plan: 'x', yatzran: 'y', tracks: [{ name: r.name, balance: 100000 }] }] }); const h = v.holdings[0];
  const eq = h.equityPct; if (!h.match || !h.match.row) { none++; continue; }
  if (Math.abs((eq ?? 0) - r.eq) < 1) same++; else { if (Math.abs(eq - r.eq) >= 10) wrong10++; if (Math.abs(eq - r.eq) >= 25) { wrong25++; if (ex.length < 6) ex.push(`${r.name} (true ${r.eq}) -> ${h.match.row.name} (used ${eq})`); } } }
console.log({ n, same, none, wrong10, wrong25 }); ex.forEach(e => console.log('  ', e));
chk('exact official track name without code never silently takes a >=25pp different equity exposure', wrong25 === 0, `wrong25=${wrong25} of ${n}`);
