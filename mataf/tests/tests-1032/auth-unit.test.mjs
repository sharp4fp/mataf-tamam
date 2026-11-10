// Run: node auth-unit.test.mjs path/to/functions/_middleware.js
// Only synthetic fixtures are used. No production secrets are needed.
import fs from 'node:fs';
import crypto from 'node:crypto';
const path = process.argv[2];
if (!path) throw Error('Supply the middleware source path.');
const source = fs.readFileSync(path, 'utf8');
const { onRequest } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
const role = source.includes("out[env.AUTH_USER_OWNER || 'sharon']") ? 'owner' : 'demo';
const user = role === 'owner' ? 'sharon' : 'demo';
const salt = 'synthetic-test-salt';
const password = 'synthetic-test-password-only';
const hash = crypto.createHash('sha256').update(salt + ':' + password).digest('hex');
const env = { AUTH_SECRET: 'synthetic-test-signing-key', ['AUTH_HASH_' + role.toUpperCase()]: hash, ['AUTH_SALT_' + role.toUpperCase()]: salt };
const base = 'https://example.test';
const results = [];
const check = (name, value) => { results.push({ name, passed: !!value }); console.log(value ? 'PASS' : 'FAIL', name); };
function post(extraHeaders = {}, suppliedPassword = password) {
    return new Request(base + '/__login', { method: 'POST', headers: { 'CF-Connecting-IP': '192.0.2.10', ...extraHeaders }, body: new URLSearchParams({ username: user, password: suppliedPassword }) });
}
const run = (request, customEnv = env) => onRequest({ request, env: customEnv, next: async () => new Response('synthetic protected asset') });
let response = await run(post());
check('missing rate storage denies login with 503', response.status === 503);
const broken = { ...env, AUTH_LIMITS: { prepare: () => ({ bind: () => ({}) }), batch: async () => { throw Error('synthetic quota failure'); } } };
response = await run(post(), broken);
check('storage exception denies login with 503', response.status === 503);
response = await run(post(), {});
check('missing auth configuration fails closed with 500', response.status === 500);
response = await run(post({ Origin: 'https://foreign.test' }));
check('foreign Origin rejected before login', response.status === 403);
function counterStore(ipCount = 0, accountCount = 0) {
    return {
        prepare: () => ({ bind: () => ({}) }),
        batch: async () => [{ success: true, results: [] }, { success: true, results: [{ n: ++ipCount }] }, { success: true, results: [{ n: ++accountCount }] }],
    };
}
const working = { ...env, AUTH_LIMITS: counterStore() };
response = await run(post({ Origin: base }), working);
check('valid same-origin credential issues session', response.status === 303);
const session = (response.headers.get('Set-Cookie') || '').split(';')[0];
check('session uses secure flags', /HttpOnly/.test(response.headers.get('Set-Cookie')) && /Secure/.test(response.headers.get('Set-Cookie')) && /SameSite=Strict/.test(response.headers.get('Set-Cookie')));
response = await run(new Request(base + '/', { headers: { Cookie: session } }));
check('valid session works without rate store', response.status === 200);
response = await run(new Request(base + '/', { headers: { Cookie: session } }), { ...env, ['AUTH_HASH_' + role.toUpperCase()]: 'synthetic-rotated-hash' });
check('credential-hash rotation revokes existing session', response.status === 401);
response = await run(new Request(base + '/', { headers: { Cookie: session } }), { ...env, AUTH_SECRET: 'synthetic-rotated-signing-key' });
check('signing-key rotation revokes existing session', response.status === 401);
response = await run(new Request(base + '/', { headers: { Cookie: 'metap_auth=owner.9999999999999.tampered' } }));
check('tampered session rejected', response.status === 401);
const exp = String(Date.now() - 1000);
const sig = crypto.createHmac('sha256', env.AUTH_SECRET).update(role + '.' + exp + '.' + hash).digest('hex');
response = await run(new Request(base + '/', { headers: { Cookie: 'metap_auth=' + role + '.' + exp + '.' + sig } }));
check('expired correctly signed session rejected', response.status === 401);
response = await run(post(), { ...env, AUTH_LIMITS: counterStore(10, 0) });
check('IP threshold returns 429 with Retry-After', response.status === 429 && Number(response.headers.get('Retry-After')) > 0);
response = await run(post(), { ...env, AUTH_LIMITS: counterStore(0, 40) });
check('account threshold returns 429', response.status === 429);
response = await run(new Request(base + '/__logout'));
check('logout clears browser cookie', response.status === 303 && response.headers.get('Set-Cookie').includes('Max-Age=0'));
console.log('RESULT', results.filter(r => r.passed).length + '/' + results.length);
if (results.some(r => !r.passed)) process.exitCode = 1;
