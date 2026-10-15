import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import productsRouter from '../src/routes/products.js';
import { prisma } from '../src/lib/prisma.js';

let server;
let baseUrl;

function mockFindMany(t, implementation) {
  // Prisma delegates are proxies, so replace the property rather than its descriptor.
  const original = prisma.product.findMany;
  const stub = t.mock.fn(implementation);
  prisma.product.findMany = stub;
  t.after(() => { prisma.product.findMany = original; });
  return stub;
}

before(async () => {
  const app = express();
  app.use('/api/products', productsRouter);
  app.use((_error, _request, response, _next) => response.status(500).json({ error: 'Database unavailable' }));
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}/api/products`;
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  await prisma.$disconnect();
});

for (const term of ['keyboard', 'privacy', '  PrIvAcY  ', 'notfoundword']) {
  test(`search ${JSON.stringify(term)} asks for either field, active products, and stable order`, async (t) => {
    const expectedProducts = term === 'notfoundword' ? [] : [{ id: 4, name: 'Example', price: '1450.00' }];
    const findMany = mockFindMany(t, async () => expectedProducts);
    const response = await fetch(`${baseUrl}?search=${encodeURIComponent(term)}`);
    assert.equal(response.status, 200);
    assert.deepEqual(findMany.mock.calls[0].arguments[0], {
      where: {
        active: true,
        OR: [
          { name: { contains: term.trim(), mode: 'insensitive' } },
          { description: { contains: term.trim(), mode: 'insensitive' } }
        ]
      },
      orderBy: { id: 'asc' }
    });
    assert.deepEqual(await response.json(), {
      products: expectedProducts.map((product) => ({ ...product, price: Number(product.price) }))
    });
  });
}

for (const suffix of ['', '?search=', '?search=%20%20']) {
  test(`unfiltered request ${JSON.stringify(suffix)} keeps active filtering without an OR clause`, async (t) => {
    const findMany = mockFindMany(t, async () => []);
    const response = await fetch(`${baseUrl}${suffix}`);
    assert.equal(response.status, 200);
    assert.deepEqual(findMany.mock.calls[0].arguments[0], {
      where: { active: true }, orderBy: { id: 'asc' }
    });
    assert.deepEqual(await response.json(), { products: [] });
  });
}

test('database failures reach the error handler', async (t) => {
  mockFindMany(t, async () => { throw new Error('offline'); });
  const response = await fetch(`${baseUrl}?search=privacy`);
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { error: 'Database unavailable' });
});
