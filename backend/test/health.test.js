import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';

async function getHealth(db) {
  const server = createApp({ db, assistant: { provider: null, db: {}, logger: { warn() {} } } }).listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/health`);
    return { status: response.status, body: await response.json() };
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('health reports ok when the database answers', async () => {
  const result = await getHealth({ $queryRaw: async () => [{ ok: 1 }] });
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, { status: 'ok', database: 'ok' });
});

// D3: a host health check must not report a deployment healthy while PostgreSQL is unreachable.
test('health returns 503 when the database cannot be reached', async () => {
  const result = await getHealth({ $queryRaw: async () => { throw new Error("Can't reach database server"); } });
  assert.equal(result.status, 503);
  assert.deepEqual(result.body, { status: 'degraded', database: 'unreachable' });
});
