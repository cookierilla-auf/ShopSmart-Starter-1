import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';

const rows = [
  { id: 2, name: 'Compact Mechanical Keyboard', description: 'Hot-swappable compact keyboard with tactile switches.', category: 'Accessories', price: 1850, stock: 8 }
];

async function withServer(assistant, run) {
  let lastQuery;
  const db = { product: { findMany: async (query) => { lastQuery = query; return rows; } } };
  const server = createApp({ assistant: { db, logger: { warn: () => {} }, ...assistant } }).listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const ask = (question) => fetch(`http://127.0.0.1:${server.address().port}/api/assistant/questions`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question })
  });
  try { await run(ask, () => lastQuery); } finally { server.close(); }
}

test('route rejects a too-short question with HTTP 422', () => withServer({ provider: null }, async (ask) => {
  const response = await ask('hi');
  assert.equal(response.status, 422);
  assert.equal((await response.json()).error.code, 'INVALID_QUESTION');
}));

test('route loads only active, in-stock public fields and keeps the response contract', () => withServer({ provider: null }, async (ask, lastQuery) => {
  const response = await ask('Which keyboard is below ₱2,000?');
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.deepEqual(lastQuery().where, { active: true, stock: { gt: 0 } });
  assert.deepEqual(Object.keys(lastQuery().select).sort(), ['category', 'description', 'id', 'name', 'price', 'stock']);
  assert.ok(typeof body.answer === 'string');
  assert.deepEqual(body.recommendedProducts.map((p) => p.id), [2]);
  assert.deepEqual(body.sources.map((s) => s.id), [2]);
}));

test('route returns a rule-based fallback when the provider is unavailable', () => withServer({
  provider: { draftAnswer: async () => { throw Object.assign(new Error('down'), { code: 'PROVIDER_UNAVAILABLE' }); } }
}, async (ask) => {
  const body = await (await ask('keyboard please')).json();
  assert.equal(body.mode, 'rules');
  assert.equal(body.fallbackReason, 'PROVIDER_UNAVAILABLE');
  assert.match(body.notice, /unavailable/);
}));
