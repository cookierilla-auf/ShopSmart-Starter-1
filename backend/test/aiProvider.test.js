import test from 'node:test';
import assert from 'node:assert/strict';
import { createGeminiProvider, createProviderFromEnv } from '../src/services/aiProvider.js';

const facts = [{ id: 2, name: 'Compact Mechanical Keyboard', description: 'Tactile switches.', category: 'Accessories', price: 1850, stock: 8 }];
const jsonResponse = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const completed = (text) => ({ id: 'i1', status: 'completed', steps: [{ type: 'model_output', content: [{ type: 'text', text }] }] });

test('provider sends the key in a header and parses a structured draft', async () => {
  let captured;
  const fetchImpl = async (url, options) => { captured = { url, options }; return jsonResponse(200, completed('{"answer":"Keyboard at ₱1,850.","productIds":[2]}')); };
  const provider = createGeminiProvider({ apiKey: 'test-key-123', fetchImpl });
  const draft = await provider.draftAnswer({ question: 'keyboard?', facts });

  assert.deepEqual(draft, { answer: 'Keyboard at ₱1,850.', productIds: [2] });
  assert.equal(captured.options.headers['x-goog-api-key'], 'test-key-123');
  assert.ok(!captured.url.includes('test-key-123'));
  const sent = JSON.parse(captured.options.body);
  assert.equal(sent.response_format.mime_type, 'application/json');
  assert.match(sent.input, /Compact Mechanical Keyboard/);
  assert.ok(!captured.options.body.includes('test-key-123'));
});

async function failureCode(fetchImpl) {
  const provider = createGeminiProvider({ apiKey: 'k', fetchImpl, timeoutMs: 50 });
  try { await provider.draftAnswer({ question: 'q', facts }); } catch (error) { return error.code; }
  return 'NO_ERROR';
}

test('provider maps failures to typed error codes', async () => {
  assert.equal(await failureCode(async () => jsonResponse(429, { error: {} })), 'PROVIDER_RATE_LIMITED');
  assert.equal(await failureCode(async () => jsonResponse(503, { error: {} })), 'PROVIDER_UNAVAILABLE');
  assert.equal(await failureCode(async () => { throw new TypeError('fetch failed'); }), 'PROVIDER_UNAVAILABLE');
  assert.equal(await failureCode(async () => jsonResponse(200, completed('not json at all'))), 'PROVIDER_BAD_RESPONSE');
  assert.equal(await failureCode(async () => jsonResponse(200, { status: 'failed', steps: [] })), 'PROVIDER_BAD_RESPONSE');
  const hanging = (_url, { signal }) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason)));
  assert.equal(await failureCode(hanging), 'PROVIDER_TIMEOUT');
});

test('provider error messages never contain the key', async () => {
  const provider = createGeminiProvider({ apiKey: 'secret-abc', fetchImpl: async () => jsonResponse(403, { error: { message: 'bad key secret-abc' } }) });
  await assert.rejects(provider.draftAnswer({ question: 'q', facts }), (error) => !error.message.includes('secret-abc'));
});

test('no key or AI_PROVIDER=off means no provider (rule-based answers)', () => {
  assert.equal(createProviderFromEnv({}), null);
  assert.equal(createProviderFromEnv({ GEMINI_API_KEY: '  ' }), null);
  assert.equal(createProviderFromEnv({ GEMINI_API_KEY: 'k', AI_PROVIDER: 'off' }), null);
  assert.equal(createProviderFromEnv({ GEMINI_API_KEY: 'k' }).name, 'gemini');
});
