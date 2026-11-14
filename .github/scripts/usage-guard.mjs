// usage-guard.mjs - שומר מכסת הדקות (תכנית הייעול 14.11.2026; מאגר פרטי חינמי = 2,000 דקות בחודש).
// פעם ביום: סוכם את דקות המשימות של אתמול (כל משימה מעוגלת לדקה שלמה, כמו בחיוב של גיטהאב;
// משימה על ubuntu-slim נספרת כשליש - המחיר שלה שליש) ושומר מונה חודשי בגוף issue "מונה דקות הרצה - YYYY-MM".
// ב-70% (1,400) וב-90% (1,800) נפתח issue התראה. זו הערכה - המקור המחייב הוא דף Billing בגיטהאב.
// הרצה: GITHUB_TOKEN, GITHUB_REPOSITORY; DAY=YYYY-MM-DD לבדיקה (ברירת מחדל: אתמול, UTC); DRY=1 בלי כתיבה.
const repo = process.env.GITHUB_REPOSITORY, token = process.env.GITHUB_TOKEN;
const LIMIT = 2000, ALERTS = [0.7, 0.9];
const api = async (p, opt = {}) => {
    const r = await fetch('https://api.github.com/' + p, { ...opt, headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' } });
    if (!r.ok) throw new Error(`${r.status} ${p}`);
    return r.status === 204 ? null : r.json();
};
const day = process.env.DAY || new Date(Date.now() - 86400000).toISOString().slice(0, 10);
const month = day.slice(0, 7);
let minutes = 0, jobs = 0;
for (let page = 1; ; page++) {
    const runs = (await api(`repos/${repo}/actions/runs?per_page=100&page=${page}&created=${day}`)).workflow_runs;
    for (const run of runs) {
        const js = (await api(`repos/${repo}/actions/runs/${run.id}/jobs?per_page=100`)).jobs;
        for (const j of js) {
            if (!j.started_at || !j.completed_at) continue;
            const sec = (new Date(j.completed_at) - new Date(j.started_at)) / 1000;
            const m = Math.ceil(Math.max(sec, 1) / 60);
            minutes += (j.labels || []).includes('ubuntu-slim') ? m / 3 : m; jobs++;
        }
    }
    if (runs.length < 100) break;
}
minutes = Math.round(minutes * 10) / 10;
console.log(`${day}: ${jobs} משימות, ${minutes} דקות (שקולות)`);
if (process.env.DRY) process.exit(0);
const title = `מונה דקות הרצה - ${month}`;
const q = encodeURIComponent(`repo:${repo} is:issue in:title "${title}"`);
const found = (await api(`search/issues?q=${q}`)).items.find(i => i.title === title);
let data = { days: {} };
if (found) { const m = /```json\n([\s\S]*?)\n```/.exec(found.body || ''); if (m) data = JSON.parse(m[1]); }
data.days[day] = minutes;
const total = Math.round(Object.values(data.days).reduce((a, b) => a + b, 0));
const body = `מונה אוטומטי (usage-guard.yml). מכסה חינמית: ${LIMIT} דקות בחודש. נצבר עד ${day}: **${total} דקות (${Math.round(total / LIMIT * 100)}%)**.\nהערכה בלבד - המקור המחייב: Settings ← Billing.\n\n\`\`\`json\n${JSON.stringify(data, null, 1)}\n\`\`\`\n`;
if (found) await api(`repos/${repo}/issues/${found.number}`, { method: 'PATCH', body: JSON.stringify({ body }) });
else await api(`repos/${repo}/issues`, { method: 'POST', body: JSON.stringify({ title, body }) });
for (const a of ALERTS) {
    if (total < LIMIT * a) continue;
    const t = `ניטור: דקות הרצה ${Math.round(a * 100)}% מהמכסה - ${month}`;
    const q2 = encodeURIComponent(`repo:${repo} is:issue in:title "${t}"`);
    if ((await api(`search/issues?q=${q2}`)).items.some(i => i.title === t)) continue;
    await api(`repos/${repo}/issues`, { method: 'POST', body: JSON.stringify({ title: t, body: `נצברו ${total} מתוך ${LIMIT} דקות בחודש ${month}. בלי כרטיס אשראי, בסוף המכסה ההרצות נעצרות עד החודש הבא (גם פריסות). לשקול: להאט את משימת הספרייה המתוזמנת, לאחד דחיפות.` }) });
}
console.log(`חודש ${month}: ${total} / ${LIMIT}`);
