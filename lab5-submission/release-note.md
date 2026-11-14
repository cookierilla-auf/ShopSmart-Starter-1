# ShopSmart release note: local release candidate RC1

| | |
|---|---|
| Version | `shopsmart-starter` 1.0.0-rc1, fixes committed in `735d9e9` (baseline `1bfc8a3`); this submission folder is `lab5-submission/` |
| Date | 2026-11-13 |
| Deployment status | **Local release candidate only.** No hosting or database was approved for this class, so **no staging or live site exists**. The deployment plan is in [`deployment-plan.md`](deployment-plan.md). |
| Checks | `npm run check` passes: lint clean, **22 frontend + 39 backend tests**, Vite build OK (`evidence/final-check.txt`). |
| Smoke test | Passed locally on 2026-11-13 23:07 PHT: health → products → cart → simulated checkout (order #5, ₱1,200.00) → assistant (`evidence/13-smoke-test.txt`, screenshots 18–20). |

## Working features (verified in `test-record.md`)

- Catalog browsing, product details, search by name or description, a no-results state, category filter and sort.
- Cart: add, +/−, typed quantity, remove. Totals are exact to the centavo and always show two decimals. Quantities are limited to `min(stock, 20)`.
- Simulated checkout with fictional details. It creates exactly one order with a server-calculated total, refuses invalid input with a message naming the field, and refuses quantities above stock (409) without changing the cart or stock.
- Product assistant: answers grounded in the active, in-stock catalog with linked product sources. It gives an honest no-match, and when Gemini is off, slow or failing it falls back to catalog rules with a notice.
- Error states: when the API is unreachable, loading ends with a message on the catalog and assistant pages. `/api/health` returns 503 when the database is unreachable.

## Changes in this release

| ID | Change | Files |
|---|---|---|
| D1 | The cart stops at the API's 20-units-per-product limit, so checkout no longer fails for large quantities | `frontend/src/utils/cart.js`, `frontend/src/pages/CartPage.jsx` |
| D2 | Checkout refusals name the field to fix (for example "Enter a complete email address…") | `backend/src/validators/schemas.js`, `backend/src/routes/orders.js` |
| D3 | `/api/health` checks the database: 200 `{"status":"ok","database":"ok"}` or 503 `degraded` | `backend/src/app.js` |
| D4 | Totals use centavo arithmetic, and every peso amount shows two decimals | `frontend/src/utils/cart.js`, `CartPage.jsx`, `CheckoutPage.jsx` |
| Ops | New `npm run db:deploy` (`prisma migrate deploy`) for non-development databases | `package.json`, `backend/package.json` |
| Tests | New `backend/test/orders.test.js` and `backend/test/health.test.js`, plus 5 cart tests | |

## Known limitations

- **No authentication or roles.** Anyone who can reach the API can place a simulated order, and orders store a name, email and address. There is no API route that reads orders, so customer records are not exposed through the API, but the app **must not be made public** or used with real personal data.
- **The cart is lost on page refresh.** It is kept in memory only (the starter design). Server checks prevent wrong orders, but the customer has to rebuild the cart.
- **Live AI depends on Gemini.** During testing Gemini returned HTTP 503 for most of the session, and the assistant correctly used catalog rules with a notice. Without `GEMINI_API_KEY` the assistant always uses rules.
- **Stock.** Stock is checked in the cart (using the value when the item was added) and enforced again on the server inside a transaction. A cart can still show stale stock until checkout refuses it (TC-15).
- **D5 (cosmetic, open):** with the API stopped, the catalog error repeats "backend is running", and the category hint says "Clear search to retry" even when the search is empty.
- **Hosting:** local only. `app.set('trust proxy', 1)` and a strong database password are needed before any hosted staging (see the deployment plan).
- **Local credentials:** the local database still uses the sample password from `backend/.env.example`. This is fine on a local machine, but never for staging.

## Local startup for an evaluator

Follow the root [`README.md`](../README.md) "Evaluator quick start". In short:

1. Node 20.19+ and PostgreSQL running with a database and user you control.
2. `npm ci` at the project root.
3. Copy `backend/.env.example` to `backend/.env` and set `DATABASE_URL`. `GEMINI_API_KEY` is **optional**; without it the assistant uses catalog rules.
4. Run `npm run db:generate`, then `npm run db:deploy` to create the tables. This never deletes data.
5. **Empty database only:** `npm run db:seed` loads the 6 sample products. It deletes all existing products and orders, so never run it on a database you need to keep.
6. Run `npm run dev`, then open http://localhost:5173 and http://localhost:3000/api/health. The health check should return `{"status":"ok","database":"ok"}`.
7. Run `npm run check` for lint, tests and the build.

No extra configuration was added beyond the existing `.env.example` keys.

## Release checks

| Release check | Result |
|---|---|
| Build and tests | **Pass.** `npm run check` exit 0 (`evidence/final-check.txt`) |
| Health and API | **Pass.** `/api/health` 200 with the database up and 503 with it down. The frontend reaches `http://localhost:3000/api`. |
| Database | **Pass.** Products load, and orders #3 and #5 were placed through the UI. The original order #1 survived, and no seed was run (TC-27). |
| Assistant | **Pass.** Sources match the database (`evidence/14-assistant-source-check.json`). Timeout and real 503 outage both give a controlled rule answer. |
| Secrets | **Pass.** No `.env` tracked or ever committed. Key absent from repo files and from `frontend/dist` (`evidence/12-secret-scan.json`). Screenshots show only localhost pages. |
| Privacy | **Pass.** Only fictional customers (Juan Dela Cruz, Maria Santos, `@example.com`) were used. |

## Team record

The team for this submission has one member.

| Member | Test they ran | Contribution | Issue they can explain |
|---|---|---|---|
| Edzl Renzo M. Escoto | TC-16: typing 21 units of a stock-25 product reached checkout and was refused with a vague message. Also ran the full journey, the failure cases (API down, DB down, AI timeout) and the release smoke test. | Fixed D1–D4 with regression tests, added `db:deploy`, wrote the deployment plan and diagram, the test record and this release note. | **D1:** the cart allowed up to `stock` units while the API caps each line at 20. The two rules disagreed, so a valid-looking cart could never be ordered. The fix makes the cart apply the same limit, `min(stock, 20)`, using a constant that matches the API's and is marked "must match" on both sides. |
