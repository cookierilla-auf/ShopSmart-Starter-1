import test from 'node:test';
import assert from 'node:assert/strict';
import { answerQuestion, buildAssistantResponse, parseBudget, rankProducts, selectCatalogFacts, verifyDraft } from '../src/services/assistant.js';

const products = [
  { id: 1, name: 'Keyboard', category: 'Accessories', description: 'Mechanical keyboard', price: 1800, stock: 2 },
  { id: 2, name: 'Mouse', category: 'Accessories', description: 'Wireless mouse', price: 600, stock: 3 }
];

test('parseBudget extracts a peso budget', () => assert.equal(parseBudget('below ₱2,000'), 2000));
test('rankProducts respects the budget', () => assert.deepEqual(rankProducts(products, 'mouse below 700').map((p) => p.id), [2]));
test('assistant response contains traceable sources', () => assert.equal(buildAssistantResponse(products, 'keyboard').sources[0].id, 1));

// Catalog shaped like the seed data; prices arrive as Prisma Decimal-like objects.
const decimal = (value) => ({ toString: () => String(value), valueOf: () => value });
const catalog = [
  { id: 1, name: 'Wireless Mouse', description: 'Quiet wireless mouse with adjustable sensitivity and USB receiver.', category: 'Accessories', price: decimal(650), stock: 12, active: true },
  { id: 2, name: 'Compact Mechanical Keyboard', description: 'Hot-swappable compact keyboard with tactile switches.', category: 'Accessories', price: decimal(1850), stock: 8, active: true },
  { id: 4, name: '1080p Webcam', description: 'Full HD webcam with privacy cover and built-in microphone.', category: 'Video', price: decimal(1450), stock: 6, active: true },
  { id: 7, name: 'Zero Stock Keyboard', description: 'Budget membrane keyboard.', category: 'Accessories', price: decimal(900), stock: 0, active: true },
  { id: 8, name: 'Retired Keyboard', description: 'Old keyboard.', category: 'Accessories', price: decimal(700), stock: 5, active: false }
];
const keyboardQuestion = 'Which keyboard is below ₱2,000?';
const keyboardFacts = () => selectCatalogFacts(catalog, keyboardQuestion);
const silentLogger = { warn: () => {} };

test('parseBudget ignores numbers that are not prices', () => {
  assert.equal(parseBudget('Do you have a 1080p webcam?'), null);
  assert.equal(parseBudget('headset for P1,500'), 1500);
  assert.equal(parseBudget('anything under 1,000 pesos'), 1000);
});

test('keyboard question selects only the real in-stock keyboard with a numeric price', () => {
  assert.deepEqual(keyboardFacts(), [{ id: 2, name: 'Compact Mechanical Keyboard', description: 'Hot-swappable compact keyboard with tactile switches.', category: 'Accessories', price: 1850, stock: 8 }]);
});

test('out-of-stock and inactive products are never selected', () => {
  const ids = selectCatalogFacts(catalog, 'any keyboard').map((fact) => fact.id);
  assert.ok(!ids.includes(7) && !ids.includes(8));
});

test('a category absent from the catalog produces no match instead of random products', () => {
  const response = buildAssistantResponse(catalog, 'Do you sell drones?');
  assert.equal(response.mode, 'no-match');
  assert.deepEqual(response.recommendedProducts, []);
  assert.deepEqual(response.sources, []);
});

test('matching uses whole words with shared stems, not substrings', () => {
  const studyCatalog = [
    { id: 1, name: 'Wireless Mouse', description: 'Quiet wireless mouse.', category: 'Accessories', price: 650, stock: 12 },
    { id: 3, name: 'USB-C Study Lamp', description: 'Adjustable desk lamp.', category: 'Study', price: 900, stock: 10 },
    { id: 5, name: 'Laptop Stand', description: 'Foldable aluminum stand.', category: 'Study', price: 1200, stock: 9 }
  ];
  assert.deepEqual(rankProducts(studyCatalog, 'What can I use for studying under ₱1,500?').map((p) => p.id), [3, 5]);
});

test('verifyDraft accepts a draft that only uses selected ids and real prices', () => {
  const result = verifyDraft({ answer: 'The Compact Mechanical Keyboard costs ₱1,850, under your ₱2,000 budget.', productIds: [2] }, keyboardFacts(), 2000);
  assert.equal(result.ok, true);
});

test('verifyDraft rejects invented ids, prices, availability claims and bad shapes', () => {
  const facts = keyboardFacts();
  assert.equal(verifyDraft({ answer: 'Try product 99.', productIds: [99] }, facts, 2000).reason, 'UNKNOWN_PRODUCT_ID');
  assert.equal(verifyDraft({ answer: 'It costs ₱1,500.', productIds: [2] }, facts, 2000).reason, 'UNSUPPORTED_PRICE');
  assert.equal(verifyDraft({ answer: 'It is only 1200 pesos.', productIds: [2] }, facts, 2000).reason, 'UNSUPPORTED_PRICE');
  assert.equal(verifyDraft({ answer: 'Sadly it is out of stock.', productIds: [2] }, facts, 2000).reason, 'UNSUPPORTED_AVAILABILITY');
  assert.equal(verifyDraft({ answer: 'Only 3 units left!', productIds: [2] }, facts, 2000).reason, 'UNSUPPORTED_AVAILABILITY');
  assert.equal(verifyDraft({ answer: 'Keyboard', productIds: [] }, facts, 2000).reason, 'INVALID_DRAFT_FORMAT');
  assert.equal(verifyDraft('not json', facts, 2000).reason, 'INVALID_DRAFT_FORMAT');
});

test('answerQuestion does not call the provider when nothing matches', async () => {
  let calls = 0;
  const provider = { draftAnswer: async () => { calls += 1; return {}; } };
  const response = await answerQuestion(catalog, 'Do you sell drones?', { provider, logger: silentLogger });
  assert.equal(calls, 0);
  assert.equal(response.mode, 'no-match');
});

test('answerQuestion uses a verified AI draft but builds products from catalog facts', async () => {
  const provider = { draftAnswer: async ({ facts }) => ({ answer: `The ${facts[0].name} is ₱1,850 and in stock.`, productIds: [2] }) };
  const response = await answerQuestion(catalog, keyboardQuestion, { provider, logger: silentLogger });
  assert.equal(response.mode, 'ai');
  assert.deepEqual(response.recommendedProducts, [{ id: 2, name: 'Compact Mechanical Keyboard', price: 1850, category: 'Accessories', stock: 8 }]);
  assert.deepEqual(response.sources.map((source) => source.id), [2]);
});

test('answerQuestion falls back to rules when the provider fails or drafts unsupported claims', async () => {
  const failing = { draftAnswer: async () => { throw Object.assign(new Error('timeout'), { code: 'PROVIDER_TIMEOUT' }); } };
  const timedOut = await answerQuestion(catalog, keyboardQuestion, { provider: failing, logger: silentLogger });
  assert.equal(timedOut.mode, 'rules');
  assert.equal(timedOut.fallbackReason, 'PROVIDER_TIMEOUT');
  assert.match(timedOut.answer, /₱1,850/);
  assert.deepEqual(timedOut.sources.map((source) => source.id), [2]);

  const lying = { draftAnswer: async () => ({ answer: 'The keyboard is just ₱999!', productIds: [2] }) };
  const rejected = await answerQuestion(catalog, keyboardQuestion, { provider: lying, logger: silentLogger });
  assert.equal(rejected.fallbackReason, 'UNSUPPORTED_PRICE');
  assert.doesNotMatch(rejected.answer, /999/);
});
