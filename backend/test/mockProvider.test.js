import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { createMockProvider, createProviderFromEnv, splitMockDirective } from '../src/services/aiProvider.js';

// Improvement 2: a clearly labeled simulated provider, so the hosted demo needs no paid AI key
// and every provider failure path can be shown on demand.
const rows = [
  { id: 2, name: 'Compact Mechanical Keyboard', description: 'Hot-swappable compact keyboard with tactile switches.', category: 'Accessories', price: 1850, stock: 8 }
];

async function withServer(provider, run) {
  const db = { product: { findMany: async () => rows } };
  const server = createApp({ assistant: { db, provider, logger: { warn: () => {} } } }).listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const ask = async (question) => (await fetch(`http://127.0.0.1:${server.address().port}/api/assistant/questions`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question })
  })).json();
  try { await run(ask); } finally { server.close(); }
}

test('AI_PROVIDER=mock builds the simulated provider without any key', () => {
  const provider = createProviderFromEnv({ AI_PROVIDER: 'mock' });
  assert.equal(provider.name, 'mock');
  assert.equal(provider.simulated, true);
});

test('a "#simulate-..." tag is removed from the question before retrieval', () => {
  assert.deepEqual(splitMockDirective('keyboard below 2000 #simulate-timeout'), { question: 'keyboard below 2000', failure: 'timeout' });
  assert.deepEqual(splitMockDirective('keyboard'), { question: 'keyboard', failure: null });
});

test('a mock draft passes verification and is labeled as simulated', () => withServer(createMockProvider(), async (ask) => {
  const body = await ask('Which keyboard is below ₱2,000?');
  assert.equal(body.mode, 'ai');
  assert.deepEqual(body.provider, { name: 'mock', simulated: true });
  assert.match(body.answer, /₱1,850/);
  assert.deepEqual(body.sources.map((source) => source.id), [2]);
}));

for (const [tag, reason] of [['timeout', 'PROVIDER_TIMEOUT'], ['rate-limit', 'PROVIDER_RATE_LIMITED'], ['bad-response', 'PROVIDER_BAD_RESPONSE'], ['unknown-product', 'UNKNOWN_PRODUCT_ID']]) {
  test(`simulated ${tag} ends in a labeled, verified rules fallback`, () => withServer(createMockProvider(), async (ask) => {
    const body = await ask(`Which keyboard is below ₱2,000? #simulate-${tag}`);
    assert.equal(body.mode, 'rules');
    assert.equal(body.fallbackReason, reason);
    assert.ok(body.notice);
    assert.deepEqual(body.provider, { name: 'mock', simulated: true });
    assert.deepEqual(body.sources.map((source) => source.id), [2]);
  }));
}

test('a live (non-simulated) provider treats "#simulate-..." as ordinary text', () => withServer({ name: 'live', draftAnswer: async ({ facts }) => ({ answer: `${facts[0].name} fits.`, productIds: [facts[0].id] }) }, async (ask) => {
  const body = await ask('Which keyboard is below ₱2,000? #simulate-timeout');
  assert.equal(body.mode, 'ai');
  assert.deepEqual(body.provider, { name: 'live', simulated: false });
}));
