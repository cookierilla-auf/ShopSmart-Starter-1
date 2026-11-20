import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { hashToken } from '../src/lib/auth.js';

// Route tests replace Prisma methods, so no database row is ever read or written.
const catalog = [
  { id: 1, name: 'Wireless Mouse', price: '650.00', stock: 12, active: true },
  { id: 4, name: '1080p Webcam', price: '1450.00', stock: 6, active: true },
  { id: 9, name: 'Bulk Cable', price: '99.00', stock: 25, active: true }
];
const customer = { customerName: 'Juan Dela Cruz', email: 'juan.delacruz@example.com', address: '123 Sample St, Quezon City' };

let server;
let baseUrl;

before(async () => {
  server = createApp({ assistant: { provider: null, db: {}, logger: { warn() {} } } }).listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}/api/orders`;
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  await prisma.$disconnect();
});

// Two fictional signed-in customers. Only the token hash is looked up, as in production.
const customers = { 'token-ana': { id: 1, name: 'Ana Santos', email: 'ana@example.com' }, 'token-ben': { id: 2, name: 'Ben Reyes', email: 'ben@example.com' } };
const sessionsByHash = new Map(Object.entries(customers).map(([token, owner]) => [hashToken(token), owner]));

function mockSessions(t) {
  const original = prisma.session.findUnique;
  prisma.session.findUnique = async ({ where }) => {
    const owner = sessionsByHash.get(where.tokenHash);
    return owner ? { tokenHash: where.tokenHash, customerId: owner.id, expiresAt: new Date(Date.now() + 60_000), customer: owner } : null;
  };
  t.after(() => { prisma.session.findUnique = original; });
}

function mockPrisma(t) {
  mockSessions(t);
  const originals = { findMany: prisma.product.findMany, transaction: prisma.$transaction };
  const created = [];
  const findMany = t.mock.fn(async ({ where }) => catalog.filter((product) => where.id.in.includes(product.id)));
  const transaction = t.mock.fn(async (callback) => callback({
    product: { updateMany: async () => ({ count: 1 }) },
    order: {
      create: async ({ data }) => {
        created.push(data);
        return { id: 42, ...data, status: 'PENDING', items: data.items.create.map((item, index) => ({ id: index + 1, orderId: 42, ...item })) };
      }
    }
  }));
  prisma.product.findMany = findMany;
  prisma.$transaction = transaction;
  t.after(() => { prisma.product.findMany = originals.findMany; prisma.$transaction = originals.transaction; });
  return { findMany, transaction, created };
}

const cookie = (token) => (token ? { Cookie: `sid=${token}` } : {});
const post = (body, token = 'token-ana') => fetch(baseUrl, { method: 'POST', headers: { 'Content-Type': 'application/json', ...cookie(token) }, body: JSON.stringify(body) });
const get = (path = '', token = 'token-ana') => fetch(`${baseUrl}${path}`, { headers: cookie(token) });

test('a valid order is created once with a server-computed total', async (t) => {
  const { transaction, created } = mockPrisma(t);
  const response = await post({ ...customer, total: 1, items: [{ productId: 1, quantity: 3 }, { productId: 4, quantity: 1 }] });
  const body = await response.json();
  assert.equal(response.status, 201);
  assert.equal(transaction.mock.callCount(), 1);
  assert.equal(created.length, 1);
  assert.equal(body.total, 3400, 'client-sent total is ignored');
  assert.deepEqual(body.items.map((item) => [item.productId, item.quantity, item.unitPrice]), [[1, 3, 650], [4, 1, 1450]]);
});

test('a quantity above stock is refused with 409 and no order is written', async (t) => {
  const { transaction } = mockPrisma(t);
  const response = await post({ ...customer, items: [{ productId: 4, quantity: 7 }] });
  const body = await response.json();
  assert.equal(response.status, 409);
  assert.equal(body.error.code, 'INSUFFICIENT_STOCK');
  assert.match(body.error.message, /Only 6 unit\(s\) of 1080p Webcam/);
  assert.equal(transaction.mock.callCount(), 0);
});

test('an unknown or inactive product is refused with 422 and no order is written', async (t) => {
  const { transaction } = mockPrisma(t);
  const response = await post({ ...customer, items: [{ productId: 9999, quantity: 1 }] });
  assert.equal(response.status, 422);
  assert.equal((await response.json()).error.code, 'PRODUCT_UNAVAILABLE');
  assert.equal(transaction.mock.callCount(), 0);
});

// D2: the refusal must say which field to correct, not only "check the customer and cart information".
test('an email the browser accepts but the API rejects names the email field', async (t) => {
  const { findMany } = mockPrisma(t);
  const response = await post({ ...customer, email: 'juan@example', items: [{ productId: 1, quantity: 1 }] });
  const body = await response.json();
  assert.equal(response.status, 422);
  assert.equal(body.error.code, 'INVALID_ORDER');
  assert.match(body.error.message, /email address/i);
  assert.equal(findMany.mock.callCount(), 0);
});

test('a short address names the delivery address field', async (t) => {
  mockPrisma(t);
  const body = await (await post({ ...customer, address: 'Manila', items: [{ productId: 1, quantity: 1 }] })).json();
  assert.match(body.error.message, /delivery address/i);
});

// D1 (server side): quantity 21 exceeds the per-order cap; the message must explain the cap.
test('a quantity above the 20-unit order cap explains the limit', async (t) => {
  const { transaction } = mockPrisma(t);
  const response = await post({ ...customer, items: [{ productId: 9, quantity: 21 }] });
  const body = await response.json();
  assert.equal(response.status, 422);
  assert.match(body.error.message, /20 units/);
  assert.equal(transaction.mock.callCount(), 0);
});

// Improvement 1: orders belong to the signed-in customer, and the API enforces it.
test('a guest cannot place an order and nothing is read or written', async (t) => {
  const { findMany, transaction } = mockPrisma(t);
  const response = await post({ ...customer, items: [{ productId: 1, quantity: 1 }] }, null);
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error.code, 'AUTH_REQUIRED');
  assert.equal(findMany.mock.callCount() + transaction.mock.callCount(), 0);
});

test('an unknown session cookie is treated as a guest', async (t) => {
  mockSessions(t);
  assert.equal((await get('', 'forged-token')).status, 401);
});

test('the order owner comes from the session, never from the request body', async (t) => {
  const { created } = mockPrisma(t);
  const response = await post({ ...customer, customerId: 2, items: [{ productId: 1, quantity: 1 }] }, 'token-ana');
  assert.equal(response.status, 201);
  assert.equal(created[0].customerId, 1);
});

function mockOrders(t) {
  mockSessions(t);
  const stored = [{ id: 42, customerId: 1, customerName: 'Ana Santos', email: 'ana@example.com', address: '123 Sample St, Quezon City', status: 'PENDING', total: '650.00', items: [{ id: 1, orderId: 42, productId: 1, quantity: 1, unitPrice: '650.00' }] }];
  const originals = { findFirst: prisma.order.findFirst, findMany: prisma.order.findMany };
  const findFirst = t.mock.fn(async ({ where }) => stored.find((order) => order.id === where.id && order.customerId === where.customerId) || null);
  const findMany = t.mock.fn(async ({ where }) => stored.filter((order) => order.customerId === where.customerId));
  prisma.order.findFirst = findFirst;
  prisma.order.findMany = findMany;
  t.after(() => { prisma.order.findFirst = originals.findFirst; prisma.order.findMany = originals.findMany; });
  return { findFirst, findMany };
}

test('a guest is refused private order data', async (t) => {
  const { findFirst, findMany } = mockOrders(t);
  assert.equal((await get('', null)).status, 401);
  assert.equal((await get('/42', null)).status, 401);
  assert.equal(findFirst.mock.callCount() + findMany.mock.callCount(), 0);
});

test('the owner can list and open their own order', async (t) => {
  mockOrders(t);
  const list = await get('', 'token-ana');
  assert.equal(list.status, 200);
  assert.deepEqual((await list.json()).map((order) => order.id), [42]);
  const one = await get('/42', 'token-ana');
  assert.equal(one.status, 200);
  const body = await one.json();
  assert.equal(body.total, 650);
  assert.equal(body.items[0].unitPrice, 650);
});

test('another customer gets 404 for an order they do not own, and sees none in their list', async (t) => {
  const { findFirst } = mockOrders(t);
  const response = await get('/42', 'token-ben');
  assert.equal(response.status, 404);
  assert.equal((await response.json()).error.code, 'ORDER_NOT_FOUND');
  assert.deepEqual(findFirst.mock.calls[0].arguments[0].where, { id: 42, customerId: 2 }, 'ownership is part of the query');
  assert.deepEqual(await (await get('', 'token-ben')).json(), []);
});

test('a non-numeric order id is a 404, not a server error', async (t) => {
  mockOrders(t);
  assert.equal((await get('/abc', 'token-ana')).status, 404);
});
