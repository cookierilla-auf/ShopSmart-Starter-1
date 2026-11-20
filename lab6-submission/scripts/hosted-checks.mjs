// Runs the guide's "What to verify on the hosted version" checks against the real deployment.
// Usage (project root): BASE_URL=https://52-221-80-114.sslip.io node lab6-submission/scripts/hosted-checks.mjs [label]
// Writes lab6-submission/evidence/<label>-hosted-checks.json. Uses only fictional test accounts it creates itself;
// passwords are random per run and never written to the evidence file.
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE_URL = (process.env.BASE_URL || '').replace(/\/$/, '');
if (!BASE_URL.startsWith('https://')) { console.error('Set BASE_URL to the hosted https:// address.'); process.exit(2); }
const label = process.argv[2] || 'final';
const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const stamp = Date.now();
const results = [];

function record(id, check, expected, actual, pass, extra = {}) {
  results.push({ id, check, expected, actual, pass, ...extra });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${id}  ${check}  ->  ${actual}`);
}

// A tiny cookie jar per fictional customer, so each one has its own session.
function client() {
  let cookie = '';
  return async (route, { method = 'GET', body, headers = {} } = {}) => {
    const response = await fetch(`${BASE_URL}${route}`, {
      method, redirect: 'manual',
      headers: { ...(body && typeof body !== 'string' ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}), ...headers },
      body: typeof body === 'string' ? body : body ? JSON.stringify(body) : undefined
    });
    const setCookie = response.headers.get('set-cookie');
    if (setCookie) cookie = setCookie.split(';')[0].endsWith('=') ? '' : setCookie.split(';')[0];
    const text = await response.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* HTML or empty */ }
    return { status: response.status, headers: response.headers, text, json };
  };
}

const guest = client();
const ana = client();
const ben = client();
const password = () => crypto.randomBytes(12).toString('base64url');
const anaUser = { name: 'Ana Santos', email: `ana.santos.${stamp}@example.com`, password: password() };
const benUser = { name: 'Ben Reyes', email: `ben.reyes.${stamp}@example.com`, password: password() };
const address = '123 Sample St, Quezon City';

// 1. Frontend and direct route
const home = await guest('/');
record('H1', 'Home page served over HTTPS', '200 text/html with the React root', `${home.status} ${home.headers.get('content-type')}`, home.status === 200 && home.text.includes('id="root"'));
const deep = await guest('/orders/1');
record('H2', 'Direct load of a React route (/orders/1)', '200 index.html (SPA rewrite), not a 404', `${deep.status}, root div ${deep.text.includes('id="root"') ? 'present' : 'missing'}`, deep.status === 200 && deep.text.includes('id="root"'));
const http = await fetch(BASE_URL.replace('https://', 'http://') + '/', { redirect: 'manual' });
record('H3', 'Plain HTTP redirects to HTTPS', '301/308 to https://', `${http.status} -> ${http.headers.get('location')}`, [301, 308].includes(http.status) && (http.headers.get('location') || '').startsWith('https://'));

// 2. API connection
const health = await guest('/api/health');
record('A1', 'GET /api/health through Caddy', '200 {"status":"ok","database":"ok"}', `${health.status} ${health.text}`, health.status === 200 && health.json?.database === 'ok');
record('A2', 'Security headers on API responses', 'HSTS present, no X-Powered-By', `hsts=${Boolean(health.headers.get('strict-transport-security'))}, x-powered-by=${health.headers.get('x-powered-by')}`, Boolean(health.headers.get('strict-transport-security')) && !health.headers.get('x-powered-by'));

// 3. Catalog
const products = await guest('/api/products');
const list = products.json?.products || [];
record('C1', 'Catalog loads from PostgreSQL', '200 with active products', `${products.status}, ${list.length} products`, products.status === 200 && list.length > 0);
const search = await guest('/api/products?search=keyboard');
record('C2', 'Search filters on the server', 'only keyboard products', (search.json?.products || []).map((p) => p.name).join(', '), (search.json?.products || []).length > 0 && search.json.products.every((p) => /keyboard/i.test(`${p.name} ${p.description}`)));
const product = list.find((p) => p.stock >= 2) || list[0];

// 4. Account and order ownership
const guestOrders = await guest('/api/orders');
record('O1', 'Guest asks for private orders', '401 AUTH_REQUIRED', `${guestOrders.status} ${guestOrders.json?.error?.code}`, guestOrders.status === 401);
const guestCheckout = await guest('/api/orders', { method: 'POST', body: { customerName: 'Guest', email: 'guest@example.com', address, items: [{ productId: product.id, quantity: 1 }] } });
record('O2', 'Guest tries to place an order', '401, nothing saved', `${guestCheckout.status} ${guestCheckout.json?.error?.code}`, guestCheckout.status === 401);
const regA = await ana('/api/auth/register', { method: 'POST', body: anaUser });
record('O3', 'Register fictional customer A', '201 + HttpOnly Secure SameSite cookie', `${regA.status} cookie=${(regA.headers.get('set-cookie') || '').replace(/sid=[^;]+/, 'sid=<redacted>')}`, regA.status === 201 && /HttpOnly/i.test(regA.headers.get('set-cookie') || '') && /Secure/i.test(regA.headers.get('set-cookie') || '') && /SameSite=Lax/i.test(regA.headers.get('set-cookie') || ''));
const badLogin = await ben('/api/auth/login', { method: 'POST', body: { email: anaUser.email, password: 'not-the-password' } });
record('O4', 'Wrong password', '401 INVALID_CREDENTIALS, no cookie', `${badLogin.status} ${badLogin.json?.error?.code}`, badLogin.status === 401 && !badLogin.headers.get('set-cookie'));

// 5. Simulated checkout
const order = await ana('/api/orders', { method: 'POST', body: { customerName: anaUser.name, email: anaUser.email, address, customerId: 999, total: 1, items: [{ productId: product.id, quantity: 1 }] } });
record('K1', 'Customer A places a valid simulated order', '201, server total = price, owner from session', `${order.status} order #${order.json?.id} total ${order.json?.total} customerId ${order.json?.customerId}`, order.status === 201 && order.json?.total === Number(product.price) && order.json?.customerId !== 999);
const excess = await ana('/api/orders', { method: 'POST', body: { customerName: anaUser.name, email: anaUser.email, address, items: [{ productId: product.id, quantity: 21 }] } });
record('K2', 'Quantity above the 20-unit cap', '422 naming the limit', `${excess.status} ${excess.json?.error?.message}`, excess.status === 422 && /20 units/.test(excess.json?.error?.message || ''));
const badEmail = await ana('/api/orders', { method: 'POST', body: { customerName: anaUser.name, email: 'juan@example', address, items: [{ productId: product.id, quantity: 1 }] } });
record('K3', 'Invalid email at checkout', '422 naming the email field', `${badEmail.status} ${badEmail.json?.error?.message}`, badEmail.status === 422 && /email/i.test(badEmail.json?.error?.message || ''));
const lowStock = list.find((p) => p.stock < 20);
if (lowStock) {
  const over = await ana('/api/orders', { method: 'POST', body: { customerName: anaUser.name, email: anaUser.email, address, items: [{ productId: lowStock.id, quantity: lowStock.stock + 1 }] } });
  record('K4', `More than stock of ${lowStock.name} (${lowStock.stock})`, '409 INSUFFICIENT_STOCK', `${over.status} ${over.json?.error?.code}`, over.status === 409);
}
const ownerGet = await ana(`/api/orders/${order.json?.id}`);
record('O5', 'Owner opens their order', '200 with the same order', `${ownerGet.status} order #${ownerGet.json?.id}`, ownerGet.status === 200 && ownerGet.json?.id === order.json?.id);
await ben('/api/auth/register', { method: 'POST', body: benUser });
const otherGet = await ben(`/api/orders/${order.json?.id}`);
record('O6', "Customer B requests A's order by direct API call", '404 ORDER_NOT_FOUND', `${otherGet.status} ${otherGet.json?.error?.code}`, otherGet.status === 404);
const otherList = await ben('/api/orders');
record('O7', "Customer B's order list", 'empty (no other customer data)', `${otherList.status} ${JSON.stringify(otherList.json)}`, otherList.status === 200 && Array.isArray(otherList.json) && otherList.json.length === 0);
const logout = await ana('/api/auth/logout', { method: 'POST' });
const afterLogout = await ana('/api/orders');
record('O8', 'After sign-out the session no longer works', '204 then 401', `${logout.status} then ${afterLogout.status}`, logout.status === 204 && afterLogout.status === 401);
const csrf = await guest('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: `email=${encodeURIComponent(anaUser.email)}&password=x` });
record('O9', 'Form-encoded POST (what a cross-site HTML form sends)', '415 UNSUPPORTED_MEDIA_TYPE', `${csrf.status} ${csrf.json?.error?.code}`, csrf.status === 415);

// 6. Assistant
const ask = (question) => guest('/api/assistant/questions', { method: 'POST', body: { question } });
const ai = await ask('Which keyboard is below ₱2,000?');
const ids = new Set(list.map((p) => p.id));
record('S1', 'Supported product question', 'answer citing only current catalog ids, provider labeled', `${ai.status} mode=${ai.json?.mode} provider=${JSON.stringify(ai.json?.provider)} sources=${(ai.json?.sources || []).map((s) => s.id)}`, ai.status === 200 && (ai.json?.sources || []).length > 0 && ai.json.sources.every((s) => ids.has(s.id)));
const none = await ask('Do you sell drones?');
record('S2', 'No matching product', 'mode no-match, no sources', `${none.status} mode=${none.json?.mode}`, none.json?.mode === 'no-match' && none.json.sources.length === 0);
for (const [tag, reason] of [['timeout', 'PROVIDER_TIMEOUT'], ['rate-limit', 'PROVIDER_RATE_LIMITED'], ['bad-response', 'PROVIDER_BAD_RESPONSE'], ['unknown-product', 'UNKNOWN_PRODUCT_ID']]) {
  const failed = await ask(`Which keyboard is below ₱2,000? #simulate-${tag}`);
  record(`S-${tag}`, `Simulated provider ${tag}`, `rules fallback, reason ${reason}, notice shown`, `${failed.status} mode=${failed.json?.mode} reason=${failed.json?.fallbackReason}`, failed.json?.mode === 'rules' && failed.json?.fallbackReason === reason && Boolean(failed.json?.notice));
}
const shortQ = await ask('hi');
record('S3', 'Invalid (too short) question', '422 INVALID_QUESTION', `${shortQ.status} ${shortQ.json?.error?.code}`, shortQ.status === 422);

// 7. Network exposure: only 80/443 should answer from outside.
for (const port of [3000, 5432]) {
  const host = new URL(BASE_URL).hostname;
  const open = await new Promise((resolve) => {
    import('node:net').then(({ default: net }) => {
      const socket = net.connect({ host, port, timeout: 4000 });
      socket.once('connect', () => { socket.destroy(); resolve(true); });
      socket.once('timeout', () => { socket.destroy(); resolve(false); });
      socket.once('error', () => resolve(false));
    });
  });
  record(`N-${port}`, `Port ${port} from the internet`, 'not reachable', open ? 'OPEN' : 'closed/filtered', !open);
}

// 8. Secrets: nothing secret in the served JavaScript bundle.
const assetPaths = [...home.text.matchAll(/(?:src|href)="(\/assets\/[^"]+\.js)"/g)].map((m) => m[1]);
let bundle = '';
for (const asset of assetPaths) bundle += (await guest(asset)).text;
const secretPatterns = { 'postgres URL': /postgres(?:ql)?:\/\//i, 'Google API key': /AIza[0-9A-Za-z_-]{30,}/, 'AWS access key': /AKIA[0-9A-Z]{16}/, 'DATABASE_URL': /DATABASE_URL/, 'GEMINI_API_KEY': /GEMINI_API_KEY/, localhost: /localhost:3000/ };
const found = Object.entries(secretPatterns).filter(([, re]) => re.test(bundle)).map(([name]) => name);
record('X1', `Served JS bundle (${assetPaths.length} file(s), ${bundle.length} bytes)`, 'no secrets or localhost URLs', found.length ? found.join(', ') : 'none found', found.length === 0);
const tracked = execFileSync('git', ['ls-files'], { cwd: path.resolve(dir, '..'), encoding: 'utf8' }).split('\n');
const envFiles = tracked.filter((file) => /(^|\/)\.env($|\.)/.test(file) && !file.endsWith('.env.example'));
record('X2', 'Repository tracks no .env files', 'only .env.example', envFiles.length ? envFiles.join(', ') : 'none', envFiles.length === 0);

const version = execFileSync('git', ['describe', '--tags', '--always'], { cwd: path.resolve(dir, '..'), encoding: 'utf8' }).trim();
const summary = { baseUrl: BASE_URL, codeVersion: version, ranAt: new Date().toISOString(), passed: results.filter((r) => r.pass).length, failed: results.filter((r) => !r.pass).length, results };
await mkdir(path.join(dir, 'evidence'), { recursive: true });
await writeFile(path.join(dir, 'evidence', `${label}-hosted-checks.json`), JSON.stringify(summary, null, 2));
console.log(`\n${summary.passed} passed, ${summary.failed} failed  (${version})`);
process.exit(summary.failed ? 1 : 0);
