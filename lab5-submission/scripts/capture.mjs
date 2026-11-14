// Walks the customer journey in the installed Microsoft Edge and saves numbered screenshots.
// Usage (project root, frontend on :5173):
//   node lab5-submission/scripts/capture.mjs normal        API running normally (needs the D1 fixture: fixture.mjs add)
//   node lab5-submission/scripts/capture.mjs ai-timeout    API restarted with AI_TIMEOUT_MS=1
//   node lab5-submission/scripts/capture.mjs backend-down  API stopped
// Only fictional customer details are typed. No .env content or keys appear on screen.
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const APP = 'http://localhost:5173';
const API = 'http://localhost:3000/api';
const FIXTURE = 'Test Bulk Cable (fixture)';
const customer = { name: 'Juan Dela Cruz', email: 'juan.delacruz@example.com', address: '123 Sample St, Quezon City' };
const outDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../screenshots');
const phase = process.argv[2] || 'normal';

await mkdir(outDir, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const shot = async (name, note) => { await page.screenshot({ path: path.join(outDir, `${name}.png`), fullPage: true }); console.log(`saved ${name}.png  ${note}`); };
const statusText = async () => (await page.locator('.status').allInnerTexts()).join(' | ');
const nav = (label) => page.getByRole('link', { name: label }).first().click();
const card = (name) => page.locator('.product-card').filter({ has: page.getByRole('heading', { name, exact: true }) });
const cartRow = (name) => page.locator('.cart-item').filter({ has: page.getByRole('heading', { name, exact: true }) });
const cartTotal = async () => page.locator('.summary-total strong').innerText();

async function fillCheckout(email = customer.email) {
  await page.getByLabel('Full name').fill(customer.name);
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Delivery address').fill(customer.address);
}

async function ask(question) {
  await nav('AI Assistant');
  await page.getByLabel('Your question').fill(question);
  await page.getByRole('button', { name: 'Ask ShopSmart' }).click();
  await page.locator('.assistant-answer').getByText(/Sources|could not|took too long/i).first().waitFor({ timeout: 30_000 });
}

try {
  if (phase === 'normal') {
    await page.goto(`${API}/health`);
    await shot('00-health', await page.innerText('body'));

    await page.goto(APP);
    await card('Wireless Mouse').waitFor();
    await shot('01-catalog', `${await page.locator('.product-card').count()} products`);

    await page.getByLabel('Search products').fill('privacy');
    await page.getByRole('heading', { name: '1080p Webcam' }).waitFor();
    await shot('02-search-description-match', `privacy -> ${await page.locator('.product-card h2').allInnerTexts()}`);
    await page.getByLabel('Search products').fill('drone');
    await page.getByText('No products match your filters.').waitFor();
    await shot('03-search-no-results', await statusText());
    await page.getByLabel('Search products').fill('');
    await card('Wireless Mouse').waitFor();

    // Cart: add, change, totals.
    await card('Wireless Mouse').getByRole('button', { name: 'Add to cart' }).click();
    await card('1080p Webcam').getByRole('button', { name: 'Add to cart' }).click();
    await nav(/Cart \(/);
    const before = await cartTotal();
    await page.getByRole('button', { name: 'Increase quantity of Wireless Mouse' }).click();
    await shot('04-cart-totals', `before + : ${before}, after: ${await cartTotal()}`);

    await cartRow('1080p Webcam').getByRole('spinbutton').fill('9');
    await shot('05-cart-above-stock-refused', `${await statusText()} | total ${await cartTotal()}`);
    await page.getByRole('button', { name: 'Remove' }).nth(1).click();
    await shot('06-cart-remove', `total after removing webcam: ${await cartTotal()}`);

    // D1 after fix: a product with stock 25 cannot be set above the 20-unit order limit.
    await nav('Products');
    await card(FIXTURE).getByRole('button', { name: 'Add to cart' }).click();
    await nav(/Cart \(/);
    await cartRow(FIXTURE).getByRole('spinbutton').fill('21');
    await shot('07-d1-fixed-quantity-21-refused', `${await statusText()} | max=${await cartRow(FIXTURE).getByRole('spinbutton').getAttribute('max')}`);
    await cartRow(FIXTURE).getByRole('button', { name: 'Remove' }).click();

    // D2 after fix: an email the browser accepts is refused with a message that names the field.
    await page.getByRole('link', { name: 'Proceed to checkout' }).click();
    await fillCheckout('juan@example');
    await page.getByRole('button', { name: 'Place simulated order' }).click();
    await page.getByRole('alert').waitFor();
    await shot('08-d2-fixed-invalid-email', await statusText());

    // Valid simulated order with fictional details.
    await page.getByLabel('Email address').fill(customer.email);
    await page.getByRole('button', { name: 'Place simulated order' }).click();
    await page.getByText('ORDER RECEIVED').waitFor();
    await shot('09-checkout-success', (await page.locator('.success-card').innerText()).replace(/\s+/g, ' '));

    // Stock rule: another buyer takes fixture stock after this cart was built, so checkout must be refused.
    await nav('Products');
    await card(FIXTURE).getByRole('button', { name: 'Add to cart' }).click();
    await nav(/Cart \(/);
    await cartRow(FIXTURE).getByRole('spinbutton').fill('20');
    await page.getByRole('link', { name: 'Proceed to checkout' }).click();
    await fillCheckout();
    const products = (await (await fetch(`${API}/products?search=${encodeURIComponent('Bulk Cable')}`)).json()).products;
    const fixture = products.find((p) => p.name === FIXTURE);
    const other = await fetch(`${API}/orders`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ customerName: 'Maria Santos', email: 'maria.santos@example.com', address: '45 Example Ave, Pasig City', items: [{ productId: fixture.id, quantity: 10 }] }) });
    console.log(`  competing fixture order: HTTP ${other.status}`);
    await page.getByRole('button', { name: 'Place simulated order' }).click();
    await page.getByRole('alert').waitFor();
    await shot('10-stock-changed-refused', await statusText());
    await nav(/Cart \(/);
    await shot('11-stock-cart-unchanged', `cart still ${await cartRow(FIXTURE).getByRole('spinbutton').inputValue()} x fixture, total ${await cartTotal()}`);
    await cartRow(FIXTURE).getByRole('button', { name: 'Remove' }).click();

    await ask('Which keyboard is below ₱2,000?');
    await shot('12-assistant-catalog-match', (await page.locator('.assistant-answer').innerText()).replace(/\s+/g, ' ').slice(0, 300));
    await ask('Do you sell drones?');
    await shot('13-assistant-no-match', (await page.locator('.assistant-answer').innerText()).replace(/\s+/g, ' ').slice(0, 300));

    // Refresh behaviour (known limitation): the cart lives in memory only.
    await nav('Products');
    await card('USB Headset').getByRole('button', { name: 'Add to cart' }).click();
    const beforeReload = await page.getByRole('link', { name: /Cart \(/ }).innerText();
    await page.reload();
    await shot('14-cart-after-refresh', `before reload: ${beforeReload}, after: ${await page.getByRole('link', { name: /Cart \(/ }).innerText()}`);
  } else if (phase === 'smoke') {
    // Release-candidate smoke test: health, products, cart, simulated checkout, assistant.
    await page.goto(`${API}/health`);
    const health = await page.innerText('body');
    await page.goto(APP);
    await card('Laptop Stand').waitFor();
    const count = await page.locator('.product-card').count();
    await card('Laptop Stand').getByRole('button', { name: 'Add to cart' }).click();
    await nav(/Cart \(/);
    await shot('18-smoke-cart', `health ${health}; ${count} products; cart total ${await cartTotal()}`);
    await page.getByRole('link', { name: 'Proceed to checkout' }).click();
    await fillCheckout();
    await page.getByRole('button', { name: 'Place simulated order' }).click();
    await page.getByText('ORDER RECEIVED').waitFor();
    await shot('19-smoke-checkout', (await page.locator('.success-card').innerText()).replace(/\s+/g, ' '));
    await ask('Which keyboard is below ₱2,000?');
    await shot('20-smoke-assistant', (await page.locator('.assistant-answer').innerText()).replace(/\s+/g, ' ').slice(0, 300));
  } else if (phase === 'ai-timeout') {
    await page.goto(APP);
    await ask('Which keyboard is below ₱2,000?');
    await shot('15-assistant-provider-timeout', (await page.locator('.assistant-answer').innerText()).replace(/\s+/g, ' ').slice(0, 300));
  } else if (phase === 'backend-down') {
    await page.goto(APP);
    await page.getByRole('alert').first().waitFor({ timeout: 15_000 });
    await shot('16-api-down-products', await statusText());
    await nav('AI Assistant');
    await page.getByLabel('Your question').fill('Which keyboard is below ₱2,000?');
    await page.getByRole('button', { name: 'Ask ShopSmart' }).click();
    await page.getByRole('alert').waitFor({ timeout: 25_000 });
    await shot('17-api-down-assistant', `${await statusText()} | button: ${await page.getByRole('button', { name: /Ask ShopSmart|Searching/ }).innerText()}`);
  } else {
    throw new Error(`Unknown phase ${phase}`);
  }
} finally {
  await browser.close();
}
