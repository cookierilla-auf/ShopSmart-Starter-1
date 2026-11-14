import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';

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

function mockPrisma(t) {
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

const post = (body) => fetch(baseUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

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
