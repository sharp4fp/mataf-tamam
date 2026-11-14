// check-constants-year.mjs - M-069: בודק אם קבועי המס באתר עדיין בתוקף (נקרא מ-monitor.yml כל 3 שעות).
// פלט ל-GITHUB_OUTPUT: state=ok|reminder|stale, year, list (שורות הקבועים).
// exit 0 תמיד - ה-workflow מחליט לפי state. NOW=YYYY-MM-DD לבדיקה עם תאריך מדומה.
import { appendFileSync } from 'node:fs';
import path from 'node:path';
const root = path.resolve(process.argv[2] || 'mataf/site/js');
const { constantsStatus, YEAR_CONSTANTS } = await import(path.join(root, 'constants-year.js'));
const now = process.env.NOW ? new Date(process.env.NOW + 'T12:00:00') : new Date();
const st = constantsStatus(now);
const state = st.stale.length ? 'stale' : st.reminder ? 'reminder' : 'ok';
const rows = (st.stale.length ? st.stale : YEAR_CONSTANTS.filter(c => c.validThrough === st.year))
    .map(c => `- ${c.label} (\`${c.name}\`, ${c.file}): בתוקף עד ${c.validThrough}. מקור: ${c.source}`);
const out = { state, year: String(st.year), next: String(st.year + 1) };
console.log(`state=${state} year=${st.year}`);
rows.forEach(r => console.log(r));
if (process.env.GITHUB_OUTPUT) {
    let s = '';
    for (const [k, v] of Object.entries(out)) s += `${k}=${v}\n`;
    s += `list<<EOF_LIST\n${rows.join('\n')}\nEOF_LIST\n`;
    appendFileSync(process.env.GITHUB_OUTPUT, s);
}
