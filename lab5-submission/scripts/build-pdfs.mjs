// Builds the submission PDFs from the Markdown in lab5-submission/, styled like the earlier lab PDF
// (Arial 11 pt, bold name / section / GitHub header, bold section headings, full-width figures, teal-header tables).
// Usage (project root): node lab5-submission/scripts/build-pdfs.mjs
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
  ['00-health.png', '/api/health returns {"status":"ok","database":"ok"} (TC-01)'],
  ['01-catalog.png', 'Product catalog with prices and stock labels (TC-02)'],
  ['02-search-description-match.png', 'Search "privacy" matches the webcam description (TC-04)'],
  ['03-search-no-results.png', 'Search "drone" shows the no-results state (TC-05)'],
  ['04-cart-totals.png', 'Cart totals after + on the mouse: ₱2,100.00 → ₱2,750.00 (TC-07, D4)'],
  ['05-cart-above-stock-refused.png', 'Quantity 9 for a stock-6 webcam is refused; total unchanged (TC-08)'],
  ['06-cart-remove.png', 'Removing the webcam leaves ₱1,300.00 (TC-09)'],
  ['07-d1-fixed-quantity-21-refused.png', 'D1 fixed: quantity 21 stops at the 20-unit order limit (TC-16)'],
  ['08-d2-fixed-invalid-email.png', 'D2 fixed: juan@example is refused with a message naming the email field (TC-12)'],
  ['09-checkout-success.png', 'Valid simulated checkout: order #3, ₱1,300.00 (TC-11)'],
  ['10-stock-changed-refused.png', 'Stock changed by another order: checkout refused (TC-15)'],
  ['11-stock-cart-unchanged.png', 'The cart is unchanged after the stock refusal (TC-15)'],
  ['12-assistant-catalog-match.png', 'Assistant catalog match, rule answer during the Gemini HTTP 503 outage (TC-17, TC-21)'],
  ['13-assistant-no-match.png', 'Assistant honest no-match for "Do you sell drones?" (TC-18)'],
  ['14-cart-after-refresh.png', 'Cart after page refresh is empty, a known limitation (TC-10)'],
  ['15-assistant-provider-timeout.png', 'AI provider timeout (AI_TIMEOUT_MS=1) gives a rule answer with a notice (TC-20)'],
  ['16-api-down-products.png', 'API stopped: catalog error state, with the D5 repeated wording (TC-22)'],
  ['17-api-down-assistant.png', 'API stopped: assistant error state, button usable again (TC-23)'],
  ['18-smoke-cart.png', 'Release smoke test: cart with Laptop Stand, ₱1,200.00'],
  ['19-smoke-checkout.png', 'Release smoke test: simulated order #5'],
  ['20-smoke-assistant.png', 'Release smoke test: assistant answer grounded in the catalog']
];

function figures() {
  return `<h1>Screenshots</h1>${FIGURES.map(([file, caption]) => `<figure><img class="figure" src="screenshots/${file}"><figcaption>Screenshot ${file.slice(0, 2)} (${file}). ${esc(caption)}</figcaption></figure>`).join('')}`;
}

async function logs() {
  const read = async (f) => esc((await readFile(path.join(dir, 'evidence', f), 'utf8')).replace(/\r\n/g, '\n').replace(/\n?npm notice[^\n]*/g, '').trim());
  return `<h1>Final check logs</h1>
  <p>All logs were produced on 2026-11-13 against the local release candidate. Credentials are redacted or never printed. The full set of raw files is in lab5-submission/evidence/ in the repository.</p>
  <h2>npm run check (final)</h2><pre>${await read('final-check.txt')}</pre>
  <h2>Release smoke test with row counts</h2><pre>${await read('13-smoke-test.txt')}</pre>
  <h2>Secret scan</h2><pre>${await read('12-secret-scan.json')}</pre>
  <h2>Prisma migration status</h2><pre>${await read('05-migrate-status.txt')}</pre>
  <h2>Health check with the database unreachable (after fix D3)</h2><pre>${await read('06-after-fix-db-down.json')}</pre>`;
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
  <p class="status-line"><strong>ShopSmart Quality and Deployment Guided Challenge: ${esc(title)}</strong><br>Release status: local release candidate only. No staging was approved.</p>
  ${bodyHtml}</body></html>`;
}

const md = async (f) => readFile(path.join(dir, f), 'utf8');
const sections = {
  release: markdown(await md('release-note.md')),
  record: `<h1>Test record</h1>${testRecord(await md('test-record.md'))}`,
  deploy: markdown(await md('deployment-plan.md')),
  defects: markdown(await md('defects.md')),
  figures: figures(),
  logs: await logs()
};

const documents = [
  ['01-Release-Note.pdf', 'Release note', sections.release],
  ['02-Test-Record.pdf', 'Test record', sections.record],
  ['03-Deployment-Diagram-and-Plan.pdf', 'Deployment diagram and plan', sections.deploy],
  ['04-Defect-Log.pdf', 'Defect log', sections.defects],
  ['05-Screenshots-and-Final-Check-Logs.pdf', 'Screenshots and final check logs', `${sections.figures}<div class="page-break"></div>${sections.logs}`],
  ['Escoto_Lab - ShopSmart Quality and Deployment Guided Challenge.pdf', 'Complete submission',
    [sections.figures, sections.release, sections.deploy, sections.defects, sections.record, sections.logs].map((s, k) => (k ? `<div class="page-break"></div>${s}` : s)).join('\n')]
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
