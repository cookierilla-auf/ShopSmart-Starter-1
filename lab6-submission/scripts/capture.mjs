// Walks the hosted customer journey in the installed Microsoft Edge and saves numbered screenshots,
// and renders the deployment diagram SVG to PNG.
// Usage (project root): BASE_URL=https://52-221-80-114.sslip.io node lab6-submission/scripts/capture.mjs
// Only fictional customers are created (random passwords, never shown or saved). No .env content appears on screen.
import crypto from 'node:crypto';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const BASE_URL = (process.env.BASE_URL || '').replace(/\/$/, '');
if (!BASE_URL.startsWith('https://')) { console.error('Set BASE_URL to the hosted https:// address.'); process.exit(2); }
const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(dir, 'screenshots');
const stamp = Date.now();
const ana = { name: 'Ana Santos', email: `ana.santos.${stamp}@example.com`, password: crypto.randomBytes(12).toString('base64url') };
const ben = { name: 'Ben Reyes', email: `ben.reyes.${stamp}@example.com`, password: crypto.randomBytes(12).toString('base64url') };

await mkdir(outDir, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });

// Diagram: SVG -> PNG at 2x for the PDF.
{
  const svg = await readFile(path.join(dir, 'deployment-diagram.svg'), 'utf8');
  const page = await browser.newPage({ viewport: { width: 1200, height: 640 }, deviceScaleFactor: 2 });
  await page.setContent(`<html><body style="margin:0">${svg}</body></html>`);
  await page.locator('svg').screenshot({ path: path.join(dir, 'deployment-diagram.png') });
  await page.close();
  console.log('saved deployment-diagram.png');
}

const context = await browser.newContext({ viewport: { width: 1280, height: 860 } });
let page = await context.newPage();
const shot = async (name, note) => { await page.screenshot({ path: path.join(outDir, `${name}.png`), fullPage: true }); console.log(`saved ${name}.png  ${note}`); };
const go = (route) => page.goto(`${BASE_URL}${route}`, { waitUntil: 'networkidle' });

async function register(user) {
  await go('/account');
  const form = page.getByRole('form', { name: 'Create a test account' });
  await form.getByLabel('Full name').fill(user.name);
  await form.getByLabel('Email address').fill(user.email);
  await form.getByLabel(/^Password/).fill(user.password);
  await form.getByRole('button', { name: 'Create account' }).click();
  await page.getByRole('heading', { name: /Simulated orders for/ }).waitFor();
}

async function ask(question) {
  await go('/assistant');
  await page.getByLabel('Your question').fill(question);
  await page.getByRole('button', { name: 'Ask ShopSmart' }).click();
  await page.locator('.assistant-answer').getByText(/Sources|could not/i).first().waitFor({ timeout: 30_000 });
}

await go('/api/health');
await shot('01-hosted-health', '/api/health through HTTPS with database ok');
await go('/');
await page.locator('.product-card').first().waitFor();
await shot('02-hosted-home-catalog', 'home page and catalog from PostgreSQL');
await go('/orders');
await page.getByRole('heading', { name: /Sign in to check out/ }).waitFor();
await shot('03-guest-orders-redirect', 'guest opening /orders directly is sent to sign-in (SPA route + auth)');

await register(ana);
await go('/');
const mouse = page.locator('.product-card').filter({ has: page.getByRole('heading', { name: 'Wireless Mouse', exact: true }) });
await mouse.getByRole('button', { name: 'Add to cart' }).click();
// In-app navigation: the cart is React state, so a full page load would empty it.
await page.getByRole('link', { name: /^Cart/ }).click();
await page.getByRole('button', { name: 'Increase quantity of Wireless Mouse' }).click();
await shot('04-cart-totals', 'cart with quantity 2 and total');
await page.getByRole('link', { name: 'Proceed to checkout' }).click();
await page.getByLabel('Delivery address').fill('123 Sample St, Quezon City');
await shot('05-checkout-prefilled', 'checkout prefilled from the signed-in fictional account');
await page.getByRole('button', { name: 'Place simulated order' }).click();
await page.getByText('ORDER RECEIVED').waitFor();
const orderText = await page.locator('.success-card').innerText();
const orderId = orderText.match(/#(\d+)/)[1];
await shot('06-order-saved', `simulated order #${orderId} saved`);
await page.getByRole('link', { name: 'View order' }).click();
await page.getByRole('heading', { name: `Order #${orderId}` }).waitFor();
await page.reload({ waitUntil: 'networkidle' });
await page.getByRole('heading', { name: `Order #${orderId}` }).waitFor();
await shot('07-owner-order-details-after-refresh', 'owner sees the order; page survives a browser refresh');

// Customer B in a fresh browser context (separate cookie jar).
await context.close();
const contextB = await browser.newContext({ viewport: { width: 1280, height: 860 } });
page = await contextB.newPage();
await register(ben);
await go(`/orders/${orderId}`);
await page.getByText('This order was not found in your account.').waitFor();
await shot('08-other-customer-denied', `customer B opening /orders/${orderId} gets not found (API 404)`);
const apiBody = await page.evaluate(async (id) => { const r = await fetch(`/api/orders/${id}`); return `${r.status} ${await r.text()}`; }, orderId);
await page.setContent(`<pre style="font:16px Consolas,monospace;padding:24px">GET ${BASE_URL}/api/orders/${orderId}\n(as customer B, direct API request)\n\n${apiBody.replace(/</g, '&lt;')}</pre>`);
await shot('09-other-customer-direct-api-404', 'direct API request by customer B returns 404');

await ask('Which keyboard is below ₱2,000?');
await shot('10-assistant-mock-labeled', 'assistant answer, labeled simulated (mock) provider, catalog sources');
await ask('Do you sell drones?');
await shot('11-assistant-no-match', 'no matching product');
await ask('Which keyboard is below ₱2,000? #simulate-timeout');
await shot('12-assistant-simulated-timeout', 'simulated provider timeout ends in a labeled rules fallback');
await ask('Which keyboard is below ₱2,000? #simulate-unknown-product');
await shot('13-assistant-unknown-product-rejected', 'draft citing an unknown product id is rejected');

await browser.close();
