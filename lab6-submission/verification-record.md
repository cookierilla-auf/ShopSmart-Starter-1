# Verification record (hosted)

- **Deployment:** https://52-221-80-114.sslip.io
- **Code version:** `v1.1.0-aws`
- **Date:** 2026-11-20 (UTC)

**Method:**

1. The expected result for each check was written in `scripts/hosted-checks.mjs` before the check ran. Each check runs against the **real hosted URL** from a fresh client: no cookies, and new fictional accounts with random passwords that are never saved.
2. The browser journey was recorded with `scripts/capture.mjs` in a fresh Edge profile.
3. Server-side observations come from EC2 Instance Connect (screenshots 14 and 15).

**Runs:**

| Run | Time (UTC) | Result | Evidence |
|-----|-----------|--------|----------|
| Initial hosted run | 10:37:58 | **31 passed, 0 failed** | `evidence/01-initial-hosted-checks.json` |
| After `sudo reboot` | 10:39:33 | **31 passed, 0 failed** | `evidence/02-after-reboot-hosted-checks.json`, screenshot 15 |
| Local `npm run check` | before tagging | lint OK, **63 backend + 27 frontend tests passed**, build OK | `evidence/final-check.txt` |

## Results by guide check

| Guide check | Expected (written first) | Observed on the hosted site | Evidence | Result |
|---|---|---|---|---|
| **Frontend and direct route** | Home loads over HTTPS. A direct load or refresh of a React route still shows the app. HTTP redirects to HTTPS. | `/` returns 200 HTML (H1). `/orders/1` loaded directly returns 200 `index.html` (H2). The owner refreshing `/orders/3` still sees the order. `http://` returns 308 to `https://` (H3). | H1–H3, screenshots 02, 03, 07 | Pass |
| **API connection** | The browser calls the intended HTTPS API on the same origin. `/api/health` reports the database. | `GET /api/health` returns 200 `{"status":"ok","database":"ok"}` (A1). HSTS is present and `X-Powered-By` is absent (A2). The bundle has no `localhost:3000` (X1). | A1, A2, X1, screenshot 01 | Pass |
| **Catalog and cart** | Current products appear. Search, quantity and totals behave correctly. | 6 products from PostgreSQL (C1). Search for "keyboard" returns only the keyboard (C2). The cart with quantity 2 totals ₱1,300.00. | C1, C2, screenshots 02, 04 | Pass |
| **Account and order** | A guest is refused private data. The owner succeeds. Another customer is denied by a direct API request. | Guest `GET /api/orders` returns 401 `AUTH_REQUIRED` (O1). A guest `POST` returns 401 (O2). The owner's `GET /api/orders/1` returns 200 (O5). Customer B's `GET /api/orders/1` returns **404 `ORDER_NOT_FOUND`** (O6), and B's own list is `[]` (O7). The cookie is `HttpOnly; Secure; SameSite=Lax` (O3). A wrong password gets 401 with no cookie (O4). After logout the session is rejected (O8). A form-encoded POST gets 415 (O9). | O1–O9, screenshots 03, 07, 08, 09 | Pass |
| **Simulated checkout** | A fictional valid order is saved. Invalid input or excess quantity is refused. | A valid order returns 201 with a server-computed total of ₱650. A client-sent `customerId: 999` and `total: 1` were ignored (K1). Quantity 21 returns 422 "limited to 20 units" (K2). `juan@example` returns 422 naming the email field (K3). Quantity 13 of a 12-stock item returns 409 `INSUFFICIENT_STOCK` (K4). | K1–K4, screenshots 05, 06 | Pass |
| **Assistant** | Product claims and links match current records. No-match and provider failures are clear. The mock provider is labeled. | The keyboard question gets an answer citing product #2 at ₱1,850 / 8 in stock, labeled **"Simulated AI provider (mock), not a live AI call"** (S1). "Do you sell drones?" returns `no-match` with no sources (S2). Timeout, rate limit, malformed response and unknown product id each end in `mode: rules` with the matching `fallbackReason` and a notice. A 2-character question returns 422 (S3). | S1–S3, S-timeout to S-unknown-product, screenshots 10–13 | Pass |
| **Restart and logs** | The API recovers after a restart. Errors can be traced without secrets in logs. | After `sudo reboot` the instance booted at 10:38:32. systemd started the API at 10:38:40, the first health check was 10:38:42, and the saved order was still in PostgreSQL (1 row). The full suite passed again at 10:39:33. Log lines show method, path, status, time and request id only. The assistant fallbacks log only a reason code. | screenshots 14, 15, `02-after-reboot` JSON | Pass |
| **Secrets and credits** | No secret in the repository, browser files or screenshots. Credits stay within the plan. | The served JS bundle has no DB URL, API key or `DATABASE_URL` (X1). Git tracks only `.env.example` (X2). `backend/.env` on the server is mode 600, owned by `shopsmart` (screenshot 14). Ports 3000 and 5432 are closed from the internet (N-3000, N-5432). Credits: $108.97 remaining on the Free plan, with an expected ~$15 a month (screenshot 00, resource register). | X1, X2, N-3000, N-5432, screenshots 00, 14 | Pass |

## The two improvements and their retests

### Improvement 1: customer sign-in and order ownership enforced by the API

| | |
|---|---|
| Problem (baseline `415b0a6`, lab 5) | No sign-in. `POST /api/orders` accepted anyone, and there was no way to read an order back. Lab 5 TC-26 recorded the guest, owner and other-customer checks as "not applicable". The guide requires all three. |
| Change | `Customer` and `Session` tables, plus `Order.customerId` (additive migration `20261120090000_customer_accounts`). Passwords are stored as salted scrypt hashes. The session token is 32 random bytes in an `HttpOnly; Secure; SameSite=Lax` cookie, and only its SHA-256 is stored. Every `/api/orders` route requires sign-in. The owner comes from the session, never the body. `GET /api/orders/:id` queries `where: { id, customerId }`, so another customer gets the same 404 as a missing order. New Account, My orders and Order details pages. Checkout requires sign-in. |
| Retest (automated, local) | `backend/test/orders.test.js`: guest 401, forged cookie treated as a guest, owner from session not body, owner 200, other customer 404 with ownership in the query, non-numeric id 404. `backend/test/auth.test.js`: hashing, cookie flags, duplicate email, same 401 for wrong password and unknown email, logout kills the session, Secure in production, form POST 415. `frontend/src/pages/AccountOrders.test.jsx`: guest redirect, sign-in then the list, 404 message. **All pass** (`final-check.txt`). |
| Retest (hosted) | O1–O9 pass both before and after the reboot. Screenshots 03, 07, 08 and 09 show the guest redirect, the owner's view after a refresh, the other customer's "not found" and the raw 404. |

### Improvement 2: deployment hardening for a hosted release

| | |
|---|---|
| Problem (baseline) | The frontend defaulted to `http://localhost:3000/api`. Express had no `trust proxy`, so behind a proxy every visitor would share one rate-limit bucket. The API listened on all interfaces. There was no process manager or HTTPS. The AI was either a live Gemini key or "off", with no labeled simulated provider. `.gitignore` missed `.env.production` and similar files. |
| Change | Same-origin `/api` default and a Vite dev proxy. `TRUST_PROXY=1` behind Caddy. `HOST=127.0.0.1`. Secure cookies in production. A JSON-only guard on state-changing requests. Request ids in logs, with no bodies or cookies. `AI_PROVIDER=mock`, labeled in the UI, with on-demand `#simulate-*` failures that go through the same verification and fallback code. `.env*` is ignored except `.env.example`. `deploy/` adds the Caddyfile, a systemd unit (restart and boot), an idempotent setup script that seeds only an empty database, an update script and nightly `pg_dump`. |
| Retest (automated, local) | `backend/test/mockProvider.test.js`: mock is labeled, tags are stripped before retrieval, all 4 failure paths fall back to verified rules, and a live provider ignores the tags. `AccountOrders.test.jsx`: badge shown. **All pass.** |
| Retest (hosted) | Ports: only 80 and 443 are public, and 3000/5432 are bound to 127.0.0.1 (screenshot 14, N-3000, N-5432). Reboot recovery (screenshot 15, second run 31/31). HTTPS redirect and HSTS (H3, A2). Bundle free of secrets and localhost (X1). Assistant failure paths (S-*). |

## Not covered or limits

- The cart is React state and is lost on a full page refresh. This is a known limit carried over from lab 5 (TC-10). It is unchanged and does not affect saved orders.
- A live Gemini call was not used on the hosted site. Only the labeled mock provider was. The live adapter is unchanged and covered by `aiProvider.test.js`.
- The site uses a free `sslip.io` hostname tied to the Elastic IP, not a registered domain.
