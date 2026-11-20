import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { hashPassword, hashToken, parseCookies, verifyPassword } from '../src/lib/auth.js';

// An in-memory stand-in for the Customer and Session tables, so no database is needed.
function memoryDb() {
  const customers = [];
  const sessions = [];
  return {
    customers, sessions,
    customer: {
      findUnique: async ({ where }) => customers.find((c) => c.email === where.email) || null,
      create: async ({ data }) => { const row = { id: customers.length + 1, ...data }; customers.push(row); return row; }
    },
    session: {
      create: async ({ data }) => { sessions.push(data); return data; },
      findUnique: async ({ where }) => {
        const row = sessions.find((s) => s.tokenHash === where.tokenHash);
        return row ? { ...row, customer: customers.find((c) => c.id === row.customerId) } : null;
      },
      deleteMany: async ({ where }) => {
        const kept = sessions.filter((s) => s.tokenHash !== where.tokenHash);
        const count = sessions.length - kept.length;
        sessions.splice(0, sessions.length, ...kept);
        return { count };
      }
    }
  };
}

let server;
let baseUrl;
let db;

before(async () => {
  db = memoryDb();
  server = createApp({ db, auth: { limit: 1000 }, assistant: { provider: null, db: {}, logger: { warn() {} } } }).listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}/api/auth`;
});

after(async () => { if (server) await new Promise((resolve) => server.close(resolve)); });

const send = (path, body, headers = {}) => fetch(`${baseUrl}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
const sidFrom = (response) => parseCookies((response.headers.get('set-cookie') || '').split(';')[0]).sid;

test('passwords are stored as salted scrypt hashes and verified', async () => {
  const one = await hashPassword('correct horse');
  const two = await hashPassword('correct horse');
  assert.match(one, /^scrypt\$/);
  assert.notEqual(one, two, 'each hash has its own salt');
  assert.equal(await verifyPassword('correct horse', one), true);
  assert.equal(await verifyPassword('wrong horse', one), false);
});

test('register creates a customer, stores no plain password and starts an HttpOnly session', async () => {
  const response = await send('/register', { name: 'Ana Santos', email: 'Ana@Example.com', password: 'fictional-pass-1' });
  assert.equal(response.status, 201);
  const body = await response.json();
  assert.deepEqual(body.customer, { id: 1, name: 'Ana Santos', email: 'ana@example.com' });
  assert.equal(JSON.stringify(body).includes('passwordHash'), false);
  assert.notEqual(db.customers[0].passwordHash, 'fictional-pass-1');
  const setCookie = response.headers.get('set-cookie');
  assert.match(setCookie, /HttpOnly/);
  assert.match(setCookie, /SameSite=Lax/);
  const sid = sidFrom(response);
  assert.equal(db.sessions[0].tokenHash, hashToken(sid), 'only the token hash is stored');
  assert.equal(JSON.stringify(db.sessions).includes(sid), false);
});

test('a duplicate email is refused with 409', async () => {
  const response = await send('/register', { name: 'Ana Again', email: 'ana@example.com', password: 'fictional-pass-2' });
  assert.equal(response.status, 409);
});

test('invalid registration names the fields to fix', async () => {
  const response = await send('/register', { name: 'A', email: 'nope', password: 'short' });
  assert.equal(response.status, 422);
  const { error } = await response.json();
  assert.match(error.message, /Full name/);
  assert.match(error.message, /email address/);
  assert.match(error.message, /at least 8 characters/);
});

test('login with a wrong password or unknown email gives the same 401', async () => {
  const wrong = await send('/login', { email: 'ana@example.com', password: 'not-the-password' });
  const unknown = await send('/login', { email: 'nobody@example.com', password: 'not-the-password' });
  assert.equal(wrong.status, 401);
  assert.equal(unknown.status, 401);
  assert.equal((await wrong.json()).error.message, (await unknown.json()).error.message);
  assert.equal(wrong.headers.get('set-cookie'), null);
});

test('login, me and logout use the session cookie', async () => {
  const login = await send('/login', { email: 'ana@example.com', password: 'fictional-pass-1' });
  assert.equal(login.status, 200);
  const sid = sidFrom(login);
  const me = await fetch(`${baseUrl}/me`, { headers: { Cookie: `sid=${sid}` } });
  assert.equal(me.status, 200);
  assert.equal((await me.json()).customer.email, 'ana@example.com');

  const logout = await fetch(`${baseUrl}/logout`, { method: 'POST', headers: { Cookie: `sid=${sid}` } });
  assert.equal(logout.status, 204);
  assert.match(logout.headers.get('set-cookie'), /Max-Age=0/);
  assert.equal((await fetch(`${baseUrl}/me`, { headers: { Cookie: `sid=${sid}` } })).status, 401, 'the session is deleted on the server');
});

test('a guest calling me gets 401', async () => {
  assert.equal((await fetch(`${baseUrl}/me`)).status, 401);
});

test('a form-encoded POST is refused (CSRF guard)', async () => {
  const response = await fetch(`${baseUrl}/login`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'email=a%40b.com&password=x' });
  assert.equal(response.status, 415);
});

test('cookies are marked Secure in production', async () => {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    const response = await send('/register', { name: 'Ben Reyes', email: 'ben@example.com', password: 'fictional-pass-3' });
    assert.match(response.headers.get('set-cookie'), /Secure/);
  } finally { process.env.NODE_ENV = previous; }
});
