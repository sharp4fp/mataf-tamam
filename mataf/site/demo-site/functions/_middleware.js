// שער כניסה למתה"פ - Pages Functions middleware: רץ לפני כל נכס סטטי באתר.
// בלי סשן תקף לא מוגש אף בייט מהאתר. אם הסודות לא הוגדרו - השער נכשל סגור (אין גישה).
// שינוי סיסמה משנה את ה-hash שבסוד, ולכן מבטל מיד כל סשן פעיל של אותו תפקיד.
// Login attempts use atomic D1 counters. Missing storage or storage errors deny new logins.

const enc = new TextEncoder();
const hex = (buf) => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
async function sha256Hex(text) { return hex(await crypto.subtle.digest('SHA-256', enc.encode(text))); }
async function hmacHex(secret, text) {
    const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    return hex(await crypto.subtle.sign('HMAC', key, enc.encode(text)));
}
function eqConst(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
    let r = 0;
    for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return r === 0;
}
function cookiesOf(request) {
    const out = {};
    for (const part of (request.headers.get('Cookie') || '').split(';')) {
        const i = part.indexOf('=');
        if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
    }
    return out;
}
const SESSION_MS = 12 * 60 * 60 * 1000;

function loginPage(err) {
    return new Response(`<!doctype html>
<html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="same-origin"><meta name="robots" content="noindex">
<title>כניסה - מתה"פ</title>
<style>
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#10243e;font-family:Heebo,Arial,sans-serif;color:#1a1a1a}
.card{background:#fff;border-radius:14px;box-shadow:0 8px 40px rgba(0,0,0,.35);padding:34px 38px;width:320px;border-top:4px solid #c9a227}
h1{margin:0 0 4px;font-size:20px;color:#10243e}
.sub{margin:0 0 18px;font-size:13px;color:#666}
label{display:block;font-size:13px;margin:10px 0 4px;color:#10243e;font-weight:600}
input{width:100%;box-sizing:border-box;padding:10px;border:1px solid #c5cede;border-radius:8px;font-size:15px}
button{margin-top:18px;width:100%;padding:11px;background:#10243e;color:#fff;border:0;border-radius:8px;font-size:15px;font-weight:700;cursor:pointer}
button:hover{background:#1a3362}
.err{background:#fdecea;color:#a12622;border:1px solid #f2c1bd;border-radius:8px;padding:8px 10px;font-size:13px;margin-top:14px}
</style></head><body>
<form class="card" method="post" action="/__login" autocomplete="off">
<h1>מתה"פ - מערכת תומכת החלטה פנסיונית</h1>
<p class="sub">כניסה עם שם משתמש וסיסמה</p>
<label for="u">שם משתמש</label><input id="u" name="username" required>
<label for="p">סיסמה</label><input id="p" name="password" type="password" required>
<button type="submit">כניסה</button>
${err ? `<div class="err">${err}</div>` : ''}
</form></body></html>`, { status: err ? 401 : 401, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'" } });
}

function accounts(env) {
    const out = {};
    if (env.AUTH_HASH_DEMO && env.AUTH_SALT_DEMO) out[env.AUTH_USER_DEMO || 'demo'] = { role: 'demo', salt: env.AUTH_SALT_DEMO, hash: env.AUTH_HASH_DEMO };
    return out;
}

async function sessionRole(request, env) {
    if (!env.AUTH_SECRET) return null;
    const raw = cookiesOf(request)['metap_auth'];
    if (!raw) return null;
    const parts = raw.split('.');
    if (parts.length !== 3) return null;
    const [role, exp, sig] = parts;
    if (role !== 'owner' && role !== 'demo') return null;
    const rec = Object.values(accounts(env)).find(a => a.role === role);
    if (!rec) return null;
    if (!/^\d+$/.test(exp) || +exp < Date.now()) return null;
    const expect = await hmacHex(env.AUTH_SECRET, `${role}.${exp}.${rec.hash}`);
    return eqConst(sig, expect) ? role : null;
}

const WINDOW_MS = 15 * 60 * 1000;
function denied(status, message, retry = null) {
    const headers = { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' };
    if (retry) headers['Retry-After'] = String(retry);
    return new Response(message, { status, headers });
}
async function reserveAttempt(request, env, username, now = Date.now()) {
    if (!env.AUTH_LIMITS) throw new Error('rate-store-missing');
    const ip = request.headers.get('CF-Connecting-IP');
    if (!ip) throw new Error('client-ip-missing');
    const window = Math.floor(now / WINDOW_MS);
    const expires = (window + 1) * WINDOW_MS;
    // Store only HMAC pseudonyms and counters, never credentials or raw IP addresses.
    const realm = 'demo';
    const ipKey = await hmacHex(env.AUTH_SECRET, realm + ':ip:' + ip + ':' + window);
    const account = accounts(env)[username];
    const accountKey = await hmacHex(env.AUTH_SECRET, realm + ':account:' + (account ? account.role : 'unknown') + ':' + window);
    const query = 'INSERT INTO auth_limits (key,n,expires) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET n=MIN(n+1,1001) RETURNING n';
    const rows = await env.AUTH_LIMITS.batch([
        env.AUTH_LIMITS.prepare('DELETE FROM auth_limits WHERE expires < ?').bind(now - WINDOW_MS),
        env.AUTH_LIMITS.prepare(query).bind(ipKey, expires),
        env.AUTH_LIMITS.prepare(query).bind(accountKey, expires)
    ]);
    if (rows.some(r => !r.success) || !rows[1].results?.[0] || !rows[2].results?.[0]) throw new Error('rate-store-failed');
    return { allowed: rows[1].results[0].n <= 10 && rows[2].results[0].n <= 40, retry: Math.max(1, Math.ceil((expires-now)/1000)) };
}

export async function onRequest(context) {
    const { request, env, next } = context;
    const url = new URL(request.url);

    if (!env.AUTH_SECRET || !env.AUTH_HASH_DEMO || !env.AUTH_SALT_DEMO) {
        return new Response('שער הכניסה אינו מוגדר - אין גישה.', { status: 500, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
    }

    if (url.pathname === '/__logout') {
        return new Response(null, { status: 303, headers: { Location: '/', 'Set-Cookie': 'metap_auth=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0', 'Cache-Control': 'no-store' } });
    }

    if (url.pathname === '/__login') {
        if (request.method !== 'POST') return loginPage('');
        const origin = request.headers.get('Origin');
        if (origin && origin !== url.origin) return denied(403, 'בקשת הכניסה נדחתה.');
        if (Number(request.headers.get('Content-Length') || 0) > 4096) return denied(413, 'בקשה גדולה מדי.');
        let form;
        try { form = await request.formData(); } catch { return loginPage('בקשה לא תקינה'); }
        const u = String(form.get('username') || '');
        const p = String(form.get('password') || '');
        if (u.length > 128 || p.length > 256) return denied(400, 'בקשה לא תקינה.');
        let limit;
        try { limit = await reserveAttempt(request, env, u); }
        catch { return denied(503, 'הכניסה אינה זמינה זמנית. נסו שוב מאוחר יותר.'); }
        if (!limit.allowed) return denied(429, 'יותר מדי ניסיונות כניסה. נסו שוב לאחר זמן ההמתנה.', limit.retry);
        const rec = accounts(env)[u];
        const candidate = await sha256Hex((rec ? rec.salt : 'no-such-user') + ':' + p);
        if (!rec || !eqConst(candidate, rec.hash)) {
            await new Promise(r => setTimeout(r, 800));
            return loginPage('שם משתמש או סיסמה שגויים.');
        }
        const exp = String(Date.now() + SESSION_MS);
        const sig = await hmacHex(env.AUTH_SECRET, `${rec.role}.${exp}.${rec.hash}`);
        return new Response(null, { status: 303, headers: { Location: '/', 'Set-Cookie': `metap_auth=${rec.role}.${exp}.${sig}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_MS / 1000}`, 'Cache-Control': 'no-store' } });
    }

    const role = await sessionRole(request, env);
    if (!role) return loginPage('');
    if (!["/", "/index.html", "/index", "/retirement.html", "/retirement", "/css/heebo.css", "/css/style.css", "/fonts/NGS6v5_NC0k9P9H0TbFzsQ.woff2", "/fonts/NGS6v5_NC0k9P9H2TbE.woff2", "/fonts/NGS6v5_NC0k9P9H4TbFzsQ.woff2", "/fonts/NGS6v5_NC0k9P9GKTbFzsQ.woff2", "/fonts/NGS6v5_NC0k9P9GYTbFzsQ.woff2"].includes(url.pathname)) return denied(404, 'העמוד אינו קיים בגרסת ההדגמה.');
    const res = await next();
    const headers = new Headers(res.headers);
    headers.set('X-Robots-Tag', 'noindex');
    headers.set('Cache-Control', 'private, no-store');
    const out = new Response(res.body, { status: res.status, headers });
    return out;
}
