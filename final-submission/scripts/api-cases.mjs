// Runs the API side of the customer-journey test cases and saves every request and response.
// Usage (from the project root, with the API running on :3000):
//   node final-submission/scripts/api-cases.mjs <label> [--place-order]
// Only fictional customer details are used. Without --place-order no order is created.
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const API = process.env.API_URL || 'http://localhost:3000/api';
const label = process.argv[2] || 'api-cases';
const placeOrder = process.argv.includes('--place-order');
const outDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../evidence');

const customer = { customerName: 'Juan Dela Cruz', email: 'juan.delacruz@example.com', address: '123 Sample St, Quezon City' };
const results = [];

async function call(name, method, route, body) {
  const started = Date.now();
  let status; let data;
  try {
    const response = await fetch(`${API}${route}`, {
      method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined
    });
    status = response.status;
    data = await response.json().catch(() => null);
  } catch (error) {
    status = 'NETWORK_ERROR'; data = { message: error.message };
  }
  results.push({ name, request: { method, url: `${API}${route}`, body }, status, ms: Date.now() - started, response: data });
  console.log(`${String(status).padEnd(13)} ${name}`);
  return data;
}

const health = await call('health', 'GET', '/health');
const catalog = await call('all products', 'GET', '/products');
await call('search name "keyboard"', 'GET', '/products?search=keyboard');
await call('search description "privacy"', 'GET', '/products?search=privacy');
await call('search no results "drone"', 'GET', '/products?search=drone');
await call('product not found', 'GET', '/products/9999');
await call('product invalid id', 'GET', '/products/abc');

const products = catalog?.products || [];
const first = products.find((p) => p.stock > 0);
const lowest = [...products].filter((p) => p.stock > 0).sort((a, b) => a.stock - b.stock)[0];
if (first && lowest) {
  await call('checkout: invalid email accepted by browser (juan@example)', 'POST', '/orders', { ...customer, email: 'juan@example', items: [{ productId: first.id, quantity: 1 }] });
  await call('checkout: address too short', 'POST', '/orders', { ...customer, address: 'Manila', items: [{ productId: first.id, quantity: 1 }] });
  await call('checkout: empty cart', 'POST', '/orders', { ...customer, items: [] });
  await call('checkout: unknown product', 'POST', '/orders', { ...customer, items: [{ productId: 9999, quantity: 1 }] });
  await call(`stock: ${lowest.stock + 1} x ${lowest.name} (stock ${lowest.stock})`, 'POST', '/orders', { ...customer, items: [{ productId: lowest.id, quantity: lowest.stock + 1 }] });
  await call('stock: quantity 21 (API cap is 20)', 'POST', '/orders', { ...customer, items: [{ productId: first.id, quantity: 21 }] });
  await call('stock after refused orders', 'GET', `/products/${lowest.id}`);
  if (placeOrder) {
    const order = await call(`checkout: valid order 1 x ${first.name}`, 'POST', '/orders', { ...customer, items: [{ productId: first.id, quantity: 1 }] });
    if (order?.id) await call('stock after valid order', 'GET', `/products/${first.id}`);
  }
}

await call('assistant: catalog match', 'POST', '/assistant/questions', { question: 'Which keyboard is below ₱2,000?' });
await call('assistant: no match', 'POST', '/assistant/questions', { question: 'Do you sell drones?' });
await call('assistant: question too short', 'POST', '/assistant/questions', { question: 'hi' });
await call('unknown API route', 'GET', '/nope');

await mkdir(outDir, { recursive: true });
const file = path.join(outDir, `${label}.json`);
await writeFile(file, `${JSON.stringify({ recordedAt: new Date().toISOString(), api: API, health, results }, null, 2)}\n`);
console.log(`Saved ${path.relative(process.cwd(), file)}`);
