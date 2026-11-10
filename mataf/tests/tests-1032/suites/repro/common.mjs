// usage: BUILD=/path/to/build/js node <script>
export const B = process.env.BUILD || new URL('../../../js/', import.meta.url).pathname;
global.window = {};
await import(B + '/joinable-extra.js');
export const m = await import(B + '/analysis.js');
export const { OFFICIAL_PENSION: P, OFFICIAL_GEMEL: G } = await import(B + '/official.js');
export const tr = (id, bal, T = P) => ({ name: T[id].name, code: String(T[id].parentId) + String(id).padStart(7, '0'), balance: bal });
export const acct = (account, kind, tracks) => ({ account, kind, plan: 'x', yatzran: 'y', tracks });
export const whole = (v) => { const u = v.holdings.filter(h => h.equityPct === null); return { totalValue: v.totalValue, estFrozen: u.filter(h => h.estimate).map(h => ({ bal: h.track.balance, eq: h.estimate.eq, lo: h.estimate.lo, hi: h.estimate.hi })), noBasisVal: u.filter(h => !h.estimate).reduce((s, h) => s + h.track.balance, 0), unknownAssumption: null }; };
export const key = h => h.account.account + '|' + h.track.name;
export let fails = 0;
export const chk = (l, c, x = '') => { console.log((c ? 'PASS ' : 'FAIL ') + l + (x ? ' :: ' + x : '')); if (!c) fails++; };
