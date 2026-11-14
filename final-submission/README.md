# PDC50 final laboratory: ShopSmart quality and deployment

**Local release candidate only.** No staging was approved, so nothing was deployed.

## Documents

| File | Contents |
|---|---|
| [`release-note.md`](release-note.md) | Version, working features, known limitations, evaluator startup steps, release checks, team record |
| [`test-record.md`](test-record.md) | Feature inventory and 29 test cases (expected, observed, evidence, decision) |
| [`defects.md`](defects.md) | D1–D4 reproductions, causes, fixes and tests; D5 left open with its impact |
| [`deployment-plan.md`](deployment-plan.md) | Answers to the 7 plan questions, configuration per service, migration and rollback steps |
| [`deployment-diagram.png`](deployment-diagram.png) / [`.svg`](deployment-diagram.svg) | Browser, frontend host, API, PostgreSQL and Gemini, showing which connections cross the internet |

## Screenshots (`screenshots/`)

| # | Shows |
|---|---|
| 00 | `/api/health` → `{"status":"ok","database":"ok"}` |
| 01–03 | Catalog, description search ("privacy"), no-results state ("drone") |
| 04–06 | Cart totals before and after **+**, quantity above stock refused, remove |
| 07 | **D1 fixed:** quantity 21 refused at the 20-unit limit |
| 08 | **D2 fixed:** `juan@example` refused with a message naming the email field |
| 09 | Valid simulated checkout, order #3, ₱1,300.00 |
| 10–11 | Stock changed by another order: checkout refused, cart unchanged |
| 12–13 | Assistant catalog match (rule fallback during the Gemini 503 outage) and honest no-match |
| 14 | Cart after refresh (known limitation) |
| 15 | AI provider timeout (`AI_TIMEOUT_MS=1`) leads to a rule answer with a notice |
| 16–17 | API stopped: catalog and assistant error states |
| 18–20 | Release smoke test: cart, checkout (order #5), assistant |

## Evidence (`evidence/`)

- `00-baseline-check.txt`: `npm run check` before any change (pass: 17 frontend, 31 backend tests).
- `01-baseline-api.json` and `02-baseline-db-down.json`: the baseline API behaviour, including D2's vague 422 and D3's false "ok".
- `03-new-tests-before-fix-*.txt`: the new regression tests **failing** on the old code.
- `04-check-after-fixes.txt` and `final-check.txt`: `npm run check` after the fixes (pass: 22 frontend, 39 backend tests).
- `05-migrate-status.txt`: `prisma migrate status` ("Database schema is up to date"), with credentials redacted.
- `06-after-fix-db-down.json` and `07-after-fix-api.json`: the same cases after the fixes.
- `08-capture-normal.txt` and `09-ai-timeout-server.log`: Playwright run log and the server log for the timeout case.
- `10-…`, `11-…` and `13-smoke-test.txt`: row counts showing no data was reset.
- `12-secret-scan.json`: secret and bundle scan.
- `14-assistant-source-check.json`: each assistant source compared against `GET /api/products/:id`.

## Scripts (`scripts/`, run from the project root)

| Script | Purpose |
|---|---|
| `db-counts.mjs` | Read-only product and order counts |
| `api-cases.mjs <label> [--place-order]` | API journey cases; saves `evidence/<label>.json` |
| `fixture.mjs add\|remove` | Adds or removes the disposable "Test Bulk Cable (fixture)" (stock 25) used for D1 |
| `capture.mjs normal\|smoke\|ai-timeout\|backend-down` | Playwright (`playwright-core` with the installed Microsoft Edge) screenshots |
| `secret-scan.mjs` | Checks for committed `.env` files, and for secrets in submitted files and `frontend/dist`. Prints yes/no only. |

Submit without `node_modules`, `.env` files, `frontend/dist`, keys or database passwords.
