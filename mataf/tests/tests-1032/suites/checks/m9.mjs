// Pre-existing v565 matcher: אג"ח tokenizes to 'אג' (ח dropped), so TYPE_TOKENS 'אגח' never fires and bond tracks can match equity tracks by name.
import { m, chk } from './common.mjs';
const run = name => { const v = m.analyzePortfolio({ accounts: [{ account: 'A', kind: 'pensia', plan: 'x', yatzran: 'y', tracks: [{ name, balance: 100000 }] }] }); const h = v.holdings[0]; return { eq: h.equityPct, row: h.match && h.match.row && h.match.row.name }; };
for (const n of ['מגדל מקפת אישית אשראי ואג"ח', 'מגדל מקפת משלימה אשראי ואג"ח', 'מגדל מקפת אישית לבני 60 ומעלה', 'מנורה מבטחים משלימה מסלול לבני 50-60']) console.log(n, '->', JSON.stringify(run(n)));
const r = run('מגדל מקפת אישית אשראי ואג"ח');
chk('bond/credit track name without code must not take an equity-track exposure (>=50%)', !(r.eq !== null && r.eq >= 50), JSON.stringify(r));
