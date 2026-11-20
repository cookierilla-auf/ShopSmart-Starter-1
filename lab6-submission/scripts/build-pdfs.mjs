// Builds the submission PDFs from the Markdown in lab6-submission/, styled like the earlier lab PDF
// (Arial 11 pt, bold name / section / GitHub header, bold section headings, full-width figures, teal-header tables).
// Usage (project root): node lab6-submission/scripts/build-pdfs.mjs
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(dir, 'pdf');
const STUDENT = { name: 'Edzl Renzo M. Escoto', section: 'BSIT 4A', github: 'https://github.com/cookierilla-auf/ShopSmart-Starter-1.git' };

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Inline Markdown: code is shown as plain text (as in the Google Docs original), relative file links become plain text.
function inline(text) {
  const codes = [];
  let s = esc(text).replace(/`([^`]+)`/g, (_m, c) => { codes.push(c); return `\u0000${codes.length - 1}\u0000`; });
  s = s.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img class="figure" alt="$1" src="$2">')
    .replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, '<a href="$2">$1</a>')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[\s(])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>');
  return s.replace(/\u0000(\d+)\u0000/g, (_m, i) => `<span class="code">${codes[i]}</span>`);
}

const cells = (line) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split(/(?<!\\)\|/).map((c) => c.trim());

function table(lines) {
  const head = cells(lines[0]);
  const body = lines.slice(2).map(cells);
  const keyValue = head.every((h) => h === '');
  const thead = keyValue ? '' : `<thead><tr>${head.map((h) => `<th>${inline(h)}</th>`).join('')}</tr></thead>`;
  const rows = body.map((r) => `<tr>${r.map((c, i) => (keyValue && i === 0 ? `<th class="key">${inline(c)}</th>` : `<td>${inline(c)}</td>`)).join('')}</tr>`).join('');
  return `<table class="${keyValue ? 'kv' : 'grid'}">${thead}<tbody>${rows}</tbody></table>`;
}

function markdown(md, { skipTitle = false } = {}) {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    if (/^\s*```/.test(line)) {
      const code = [];
      i++;
      while (i < lines.length && !/^\s*```/.test(lines[i])) code.push(lines[i++].replace(/^ {3}/, ''));
      i++;
      out.push(`<pre>${esc(code.join('\n'))}</pre>`); continue;
    }
    const h = line.match(/^(#{1,3})\s+(.*)$/);
    if (h) {
      if (!(skipTitle && h[1] === '#')) out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`);
      i++; continue;
    }
    if (/^---+\s*$/.test(line)) { out.push('<hr>'); i++; continue; }
    if (line.trim().startsWith('|')) {
      const block = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) block.push(lines[i++]);
      out.push(table(block)); continue;
    }
    if (/^\s*(?:[-*]|\d+\.)\s+/.test(line)) {
      // Lists, with one level of nesting by indentation.
      const items = [];
      while (i < lines.length && (/^\s*(?:[-*]|\d+\.)\s+/.test(lines[i]) || (/^\s{2,}\S/.test(lines[i]) && items.length))) {
        const m = lines[i].match(/^(\s*)([-*]|\d+\.)\s+(.*)$/);
        if (m) items.push({ indent: m[1].length, ordered: /\d/.test(m[2]), text: m[3] });
        else items[items.length - 1].text += ` ${lines[i].trim()}`;
        i++;
      }
      const base = items[0].indent;
      let html = `<${items[0].ordered ? 'ol' : 'ul'}>`;
      for (let k = 0; k < items.length; k++) {
        const it = items[k];
        if (it.indent > base) continue;
        const children = [];
        for (let j = k + 1; j < items.length && items[j].indent > base; j++) children.push(items[j]);
        const sub = children.length ? `<${children[0].ordered ? 'ol' : 'ul'}>${children.map((c) => `<li>${inline(c.text)}</li>`).join('')}</${children[0].ordered ? 'ol' : 'ul'}>` : '';
        html += `<li>${inline(it.text)}${sub}</li>`;
      }
      out.push(`${html}</${items[0].ordered ? 'ol' : 'ul'}>`); continue;
    }
    const para = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,3}\s|\||---|\s*(?:[-*]|\d+\.)\s)/.test(lines[i])) para.push(lines[i++].trim());
    out.push(`<p>${inline(para.join(' '))}</p>`);
  }
  return out.join('\n');
}

// The test record's per-case tables become one table in the same layout as the earlier lab's test record.
function testRecord(md) {
  const [intro, rest] = md.replace(/\r\n/g, '\n').split(/\n---\n/);
  const cases = [...rest.matchAll(/### (TC-[\w]+): ([^\n]+)\n\n((?:\|[^\n]*\n?)+)/g)].map((m) => {
    const fields = Object.fromEntries(m[3].trim().split('\n').slice(2).map(cells).map(([k, v]) => [k, v]));
    return { id: m[1], title: m[2], ...fields };
  });
  const rows = cases.map((c) => `<tr>
    <td><strong>${c.id}</strong><br>${inline(c.title)}<div class="state">${inline(c['Case and starting state'] || '')}</div></td>
    <td>${inline(c['Action and test data'] || '')}</td>
    <td>${inline(c.Expected || '')}</td>
    <td>${inline(c['Observed and evidence'] || '')}</td>
    <td>${inline(c.Decision || '')}</td></tr>`).join('');
  return `${markdown(intro, { skipTitle: true })}
  <h2 class="page-break">Test cases</h2>
  <table class="grid record"><thead><tr><th>Case and starting state</th><th>Action and test data</th><th>Expected</th><th>Observed and evidence</th><th>Result</th></tr></thead><tbody>${rows}</tbody></table>`;
}

const FIGURES = [
  ['00-aws-free-plan-credits.png', 'AWS Billing: Free plan credits, $108.97 estimated remaining (account ID cropped out)'],
  ['01-hosted-health.png', 'https://52-221-80-114.sslip.io/api/health returns {"status":"ok","database":"ok"} (A1)'],
  ['02-hosted-home-catalog.png', 'Hosted home page with the catalog from PostgreSQL (H1, C1)'],
  ['03-guest-orders-redirect.png', 'Guest opening /orders directly is sent to sign-in: SPA route works and private data is refused (H2, O1)'],
  ['04-cart-totals.png', 'Signed-in customer: cart with Wireless Mouse x 2, total ₱1,300.00'],
  ['05-checkout-prefilled.png', 'Checkout prefilled from the fictional account; owner is set by the server'],
  ['06-order-saved.png', 'Simulated order #3 saved (K1)'],
  ['07-owner-order-details-after-refresh.png', 'Owner sees order #3, after a browser refresh of /orders/3 (O5, H2)'],
  ['08-other-customer-denied.png', 'Customer B opening /orders/3 sees "not found in your account" (O6)'],
  ['09-other-customer-direct-api-404.png', 'Customer B direct API request GET /api/orders/3 returns 404 ORDER_NOT_FOUND (O6)'],
  ['10-assistant-mock-labeled.png', 'Assistant answer grounded in product #2, labeled "Simulated AI provider (mock)" (S1)'],
  ['11-assistant-no-match.png', 'Assistant honest no-match for "Do you sell drones?" (S2)'],
  ['12-assistant-simulated-timeout.png', 'Simulated provider timeout ends in a labeled catalog-rules fallback (S-timeout)'],
  ['13-assistant-unknown-product-rejected.png', 'Draft citing an unknown product id is rejected; verified rules answer shown (S-unknown-product)'],
  ['14-server-ports-services-logs.png', 'EC2 Instance Connect: tag v1.1.0-aws, services enabled, only :80/:443 public (3000/5432 on 127.0.0.1), .env mode 600, logs without secrets'],
  ['15-after-reboot-services-and-data.png', 'After sudo reboot: booted 10:38:32, API started by systemd 10:38:40, health 10:38:42, saved order still present']
];

function figures() {
  return `<h1>Screenshots</h1>${FIGURES.map(([file, caption]) => `<figure><img class="figure" src="screenshots/${file}"><figcaption>Screenshot ${file.slice(0, 2)} (${file}). ${esc(caption)}</figcaption></figure>`).join('')}`;
}

async function logs() {
  const read = async (f) => esc((await readFile(path.join(dir, 'evidence', f), 'utf8')).replace(/\r\n/g, '\n').trim());
  const checks = async (f) => {
    const j = JSON.parse(await readFile(path.join(dir, 'evidence', f), 'utf8'));
    const rows = j.results.map((r) => `<tr><td>${esc(r.id)}</td><td>${esc(r.check)}</td><td>${esc(r.expected)}</td><td>${esc(String(r.actual))}</td><td>${r.pass ? 'PASS' : 'FAIL'}</td></tr>`).join('');
    return `<p>${esc(j.baseUrl)} · code ${esc(j.codeVersion)} · ran ${esc(j.ranAt)} · <strong>${j.passed} passed, ${j.failed} failed</strong></p>
    <table class="grid checks"><thead><tr><th>ID</th><th>Check</th><th>Expected</th><th>Observed</th><th>Result</th></tr></thead><tbody>${rows}</tbody></table>`;
  };
  return `<h1>Hosted check logs</h1>
  <p>Produced on 2026-11-20 by scripts/hosted-checks.mjs against the live HTTPS site. Test accounts are fictional with random passwords that are never stored; the session cookie value is redacted.</p>
  <h2>Run 1: initial hosted deployment</h2>${await checks('01-initial-hosted-checks.json')}
  <h2 class="page-break">Run 2: after sudo reboot of the instance</h2>${await checks('02-after-reboot-hosted-checks.json')}
  <h2 class="page-break">npm run check (lint, tests, build) before tagging v1.1.0-aws</h2><pre>${await read('final-check.txt')}</pre>`;
}

const CSS = `
  @page { size: Letter; margin: 1in; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 11pt; line-height: 1.38; color: #000; margin: 0; }
  .student { font-weight: 700; font-size: 12pt; line-height: 1.3; margin: 0; }
  .github { font-size: 12pt; margin: 14pt 0 10pt; }
  a { color: #1155cc; text-decoration: underline; }
  h1 { font-size: 13pt; font-weight: 700; margin: 18pt 0 6pt; }
  h2 { font-size: 11.5pt; font-weight: 700; margin: 14pt 0 4pt; }
  h3 { font-size: 11pt; font-weight: 700; margin: 12pt 0 4pt; }
  h1, h2, h3 { break-after: avoid; }
  p { margin: 0 0 6pt; }
  ul, ol { margin: 0 0 6pt; padding-left: 24pt; }
  li { margin: 0 0 2pt; }
  hr { border: 0; border-top: 1px solid #b7c4cc; margin: 12pt 0; }
  .code { font-family: inherit; }
  table { border-collapse: collapse; width: 100%; margin: 6pt 0 10pt; font-size: 10pt; }
  th, td { border: 1px solid #b7c4cc; padding: 6pt 6pt; vertical-align: top; text-align: center; overflow-wrap: break-word; }
  table.record td { overflow-wrap: anywhere; }
  thead th { background: #deefef; font-weight: 700; vertical-align: middle; }
  tr { break-inside: avoid; }
  table.kv th.key { background: #deefef; width: 24%; text-align: left; }
  table.kv td { text-align: left; }
  table.record { font-size: 9pt; table-layout: fixed; }
  table.checks { font-size: 8pt; } table.checks td { text-align: left; overflow-wrap: anywhere; }
  table.record th:nth-child(1) { width: 17%; } table.record th:nth-child(2) { width: 19%; } table.record th:nth-child(3) { width: 16%; }
  table.record th:nth-child(4) { width: 36%; } table.record th:nth-child(5) { width: 12%; }
  .state { margin-top: 4pt; font-size: 8.5pt; color: #333; }
  img.figure { width: 100%; display: block; margin: 6pt 0 0; }
  figure { margin: 0 0 14pt; break-inside: avoid; }
  figcaption { font-size: 9.5pt; font-style: italic; margin-top: 3pt; }
  pre { font-family: Consolas, "Courier New", monospace; font-size: 7.5pt; line-height: 1.25; white-space: pre-wrap; word-break: break-all; border: 1px solid #b7c4cc; padding: 6pt; margin: 4pt 0 10pt; }
  .page-break { break-before: page; }
  .status-line { margin: 0 0 8pt; }
`;

function page(title, bodyHtml) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
  <base href="${pathToFileURL(dir).href}/"><style>${CSS}</style></head><body>
  <p class="student">${STUDENT.name}</p><p class="student">${STUDENT.section}</p>
  <p class="github">Github Link: <a href="${STUDENT.github}">${STUDENT.github}</a></p>
  <p class="status-line"><strong>ShopSmart AWS Deployment: ${esc(title)}</strong><br>Release status: hosted on AWS EC2 (ap-southeast-1, Free plan) at <a href="https://52-221-80-114.sslip.io">https://52-221-80-114.sslip.io</a>, code version v1.1.0-aws.</p>
  ${bodyHtml}</body></html>`;
}

const md = async (f) => readFile(path.join(dir, f), 'utf8');
const sections = {
  readme: markdown(await md('README.md')),
  diagram: `<h1>Deployment diagram</h1><figure><img class="figure" src="deployment-diagram.png"><figcaption>Single EC2 host: public HTTPS entry (Caddy :443), internal API (127.0.0.1:3000) and database (localhost:5432).</figcaption></figure>`,
  decision: markdown(await md('decision-record.md')),
  verification: markdown(await md('verification-record.md')),
  release: markdown(await md('release-note.md')),
  register: markdown(await md('resource-register.md')),
  deploy: markdown(await readFile(path.join(dir, '..', 'deploy', 'README.md'), 'utf8')),
  figures: figures(),
  logs: await logs()
};
const join = (parts) => parts.map((s, k) => (k ? `<div class="page-break"></div>${s}` : s)).join('\n');

const documents = [
  ['01-Submission-Summary-and-Diagram.pdf', 'Submission summary and deployment diagram', join([sections.readme, sections.diagram])],
  ['02-Architecture-Decision-Record.pdf', 'Architecture decision record', join([sections.decision, sections.deploy])],
  ['03-Verification-and-Improvements.pdf', 'Verification record and improvements', sections.verification],
  ['04-Release-Note-and-Resource-Register.pdf', 'Release note and resource register', join([sections.release, sections.register])],
  ['05-Screenshots-and-Logs.pdf', 'Screenshots and hosted check logs', join([sections.figures, sections.logs])],
  ['Escoto_ShopSmart AWS Deployment.pdf', 'Complete submission',
    join([sections.readme, sections.diagram, sections.decision, sections.verification, sections.release, sections.register, sections.deploy, sections.figures, sections.logs])]
];

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });
const tmp = path.join(os.tmpdir(), 'shopsmart-pdf-build');
await mkdir(tmp, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  for (const [file, title, body] of documents) {
    const htmlPath = path.join(tmp, `${file}.html`);
    await writeFile(htmlPath, page(title, body));
    const tab = await browser.newPage();
    await tab.goto(pathToFileURL(htmlPath).href, { waitUntil: 'load' });
    await tab.pdf({ path: path.join(outDir, file), format: 'Letter', printBackground: true, margin: { top: '1in', bottom: '1in', left: '1in', right: '1in' } });
    await tab.close();
    console.log(`built pdf/${file}`);
  }
} finally {
  await browser.close();
}
if (!existsSync(path.join(outDir, documents.at(-1)[0]))) process.exitCode = 1;
