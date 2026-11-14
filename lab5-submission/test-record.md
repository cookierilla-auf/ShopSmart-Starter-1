# Test record: ShopSmart customer journey and failure cases

- **Recorded:** 2026-11-13, 14:57–15:08 UTC (22:57–23:08 PHT)
- **Environment:** Windows 10, Node v24.21.0, local PostgreSQL `shopsmart` database
- **App and API:** frontend `http://localhost:5173` (Vite dev), API `http://localhost:3000/api`
- **Baseline commit:** `1bfc8a3`
- **Recorder:** Edzl Renzo M. Escoto
- **Browser runs:** Microsoft Edge driven by `scripts/capture.mjs` (Playwright), plus manual runs in the Claude desktop browser pane
- **API runs:** `scripts/api-cases.mjs`
- **Test data:** fictional only. The customer is "Juan Dela Cruz", `juan.delacruz@example.com`, "123 Sample St, Quezon City". A second fictional customer, "Maria Santos", `maria.santos@example.com`, was used only for the competing-order case.
- **Database safety:** `db:seed` and `db:migrate` were never run.

## Feature inventory

| Feature | Present? | Notes |
|---|---|---|
| Catalog, details, search (name and description), category filter, sort | Present | Lab 3 |
| Cart (add, +/−, typed quantity, remove) | Present | In memory only, so it is lost on refresh |
| Simulated checkout with server-side stock and total | Present | `POST /api/orders` |
| Product assistant with sources | Present | Lab 4 |
| **Live AI** | **Present** | Gemini `gemini-3.6-flash`, server-side only, with a rule-based fallback |
| **Authentication / roles** | **Absent** | No sign-in. There is no route that reads orders, so the guest, owner and another-customer tests are **not applicable** (see TC-26). |

## Baseline

`npm run check` passed on the untouched baseline: lint clean, 17 frontend tests, 31 backend tests, build OK (`evidence/00-baseline-check.txt`).

Starting data: 6 active products and 1 order (`evidence/01-baseline-api.json`, `scripts/db-counts.mjs`). `/api/health` returned `{"status":"ok"}`.

## Results summary

| Result | Count | Cases |
|---|---|---|
| Pass | 23 | All others, including TC-21 (fallback during a real Gemini outage) |
| Failed on the baseline, then fixed and passed | 4 | TC-08b (D4), TC-12 (D2), TC-16 (D1), TC-24 (D3) |
| Known limitation | 1 | TC-10, cart lost on refresh |
| Not applicable | 1 | TC-26, auth (absent) |
| Open cosmetic defect | 1 | D5, seen in TC-22 |

---

### TC-01: Health endpoint

| Field | Record |
|---|---|
| Case and starting state | API running against the real database. |
| Action and test data | `GET http://localhost:3000/api/health` |
| Expected | 200 and an "ok" status. |
| Observed and evidence | Baseline: 200 `{"status":"ok"}`. After D3: 200 `{"status":"ok","database":"ok"}`. Evidence: `00-health.png`, `evidence/07-after-fix-api.json`. |
| Decision | **Pass** |

### TC-02: Browse catalog

| Field | Record |
|---|---|
| Case and starting state | 6 active products. |
| Action and test data | Open `/`. |
| Expected | All active products with emoji, price with 2 decimals, and a stock label. Loading ends. |
| Observed and evidence | 6 cards, for example Wireless Mouse ₱650.00 "12 in stock" and Compact Mechanical Keyboard ₱1,850.00 "Only 7 left". Evidence: `01-catalog.png` (taken while the D1 fixture was present, so it shows 7 cards). |
| Decision | **Pass** |

### TC-03: Search by name

| Field | Record |
|---|---|
| Case and starting state | Catalog page. |
| Action and test data | `GET /api/products?search=keyboard` |
| Expected | Only the keyboard. |
| Observed and evidence | 200, one product: id 2, Compact Mechanical Keyboard. Evidence: `evidence/01-baseline-api.json`. |
| Decision | **Pass** |

### TC-04: Search by description

| Field | Record |
|---|---|
| Case and starting state | Catalog page. |
| Action and test data | Type `privacy` in **Search products**. |
| Expected | The webcam, whose description mentions a "privacy cover". |
| Observed and evidence | Only "1080p Webcam" is shown. The API returned id 4. Evidence: `02-search-description-match.png`. |
| Decision | **Pass** |

### TC-05: Search with no results

| Field | Record |
|---|---|
| Case and starting state | Catalog page. |
| Action and test data | Type `drone`. |
| Expected | A clear empty state, with no error and no endless loading. |
| Observed and evidence | "No products match your filters." The API returned `{"products":[]}`. Evidence: `03-search-no-results.png`. |
| Decision | **Pass** |

### TC-06: Unknown or invalid product id

| Field | Record |
|---|---|
| Case and starting state | API running. |
| Action and test data | `GET /api/products/9999` and `GET /api/products/abc` |
| Expected | 404 and 400 with readable messages. |
| Observed and evidence | 404 `PRODUCT_NOT_FOUND` "Product could not be found." and 400 `INVALID_PRODUCT_ID` "Product ID must be a positive integer." Evidence: `evidence/01-baseline-api.json`. |
| Decision | **Pass** |

### TC-07: Cart add and totals

| Field | Record |
|---|---|
| Case and starting state | Empty cart. |
| Action and test data | Add Wireless Mouse (₱650) and 1080p Webcam (₱1,450). Open Cart, then click **+** on the mouse. |
| Expected | Before: total ₱2,100.00, 2 items. After **+**: ₱2,750.00, 3 items. |
| Observed and evidence | Before ₱2,100.00, after ₱2,750.00, and the mouse line shows ₱1,300.00. On the baseline (manual run) the totals were correct (₱3,550 = 650 + 2 × 1,450, then ₱3,400 after mouse 3 / webcam 1), but they were shown without centavos (see TC-08b). Evidence: `04-cart-totals.png`. |
| Decision | **Pass** |

### TC-08: Cart quantity typed above stock

| Field | Record |
|---|---|
| Case and starting state | Cart: mouse × 2, webcam × 1 (stock 6). |
| Action and test data | Type `9` in the webcam's quantity field. |
| Expected | Refused with a stock message. The quantity and total stay the same. |
| Observed and evidence | "Only 6 unit(s) are available." The total stays ₱2,750.00. Evidence: `05-cart-above-stock-refused.png`. |
| Decision | **Pass** |

### TC-08b: Total formatting and precision (D4)

| Field | Record |
|---|---|
| Case and starting state | Checkout with mouse × 3 and webcam × 1. |
| Action and test data | Read the **Amount due** panel. |
| Expected | Every amount shows centavos, and the total matches the lines. |
| Observed and evidence | **Baseline: failed.** The lines showed ₱1,950.00 and ₱1,450.00, but the total showed ₱3,400, and the cart showed "₱650 each". Unit tests showed floating-point drift (3 × 1,299.95 = 3899.8500000000004). **After fix:** ₱1,980.00 / ₱1,980.00, and the unit tests pass. Evidence: `10-stock-changed-refused.png`, `defects.md#d4`. |
| Decision | **Fail → fixed → Pass** |

### TC-09: Cart remove

| Field | Record |
|---|---|
| Case and starting state | Cart: mouse × 2 (₱1,300.00) and webcam × 1. |
| Action and test data | Click **Remove** on the webcam. |
| Expected | Only the mouse remains. Total ₱1,300.00. |
| Observed and evidence | Total ₱1,300.00, with "Item removed from cart." Evidence: `06-cart-remove.png`. |
| Decision | **Pass** |

### TC-10: Cart refresh

| Field | Record |
|---|---|
| Case and starting state | Cart (1) with a USB Headset. |
| Action and test data | Press browser reload. |
| Expected | By design the cart is in memory, so it is expected to empty. |
| Observed and evidence | Cart (1) → Cart (0). Opening `/cart` directly from the address bar also shows an empty cart. Evidence: `14-cart-after-refresh.png`. |
| Decision | **Known limitation.** Listed in the release note. |

### TC-11: Simulated checkout with valid details

| Field | Record |
|---|---|
| Case and starting state | Cart: Wireless Mouse × 2 (₱1,300.00). Wireless Mouse stock 11. |
| Action and test data | Checkout with Juan Dela Cruz / `juan.delacruz@example.com` / 123 Sample St, Quezon City. Click **Place simulated order**. |
| Expected | Exactly one order, a confirmation with an order number and the total, and the cart cleared. |
| Observed and evidence | "ORDER RECEIVED … Your simulated order number is **#3**. Total: **₱1,300.00**." The cart showed (0). The API run also created order #2 (201, total 650), and the mouse stock went from 12 to 11. Evidence: `09-checkout-success.png`, `evidence/07-after-fix-api.json`. |
| Decision | **Pass** |

### TC-12: Checkout with an email the browser accepts (D2)

| Field | Record |
|---|---|
| Case and starting state | Cart with items. |
| Action and test data | Email `juan@example`, other fields valid. |
| Expected | Refused, and the message names the email field. |
| Observed and evidence | **Baseline: failed.** "Check the customer and cart information." gave no field. The API sent `fieldErrors.email` but the UI hid it. **After fix:** "Check the customer and cart information: Enter a complete email address, such as juan@example.com." No order was created. Evidence: `08-d2-fixed-invalid-email.png`. |
| Decision | **Fail → fixed → Pass** |

### TC-13: Checkout with other invalid input (API)

| Field | Record |
|---|---|
| Case and starting state | API running. |
| Action and test data | `POST /api/orders` three times: with address `Manila`, with `items: []`, and with product 9999. |
| Expected | 422 for each, with a readable reason. |
| Observed and evidence | After fix: "…Delivery address must have at least 10 characters.", "…Your cart is empty.", and `PRODUCT_UNAVAILABLE` "One or more products are unavailable." The order count did not change. Evidence: `evidence/07-after-fix-api.json`. |
| Decision | **Pass** |

### TC-14: Stock rule, order above stock (API)

| Field | Record |
|---|---|
| Case and starting state | 1080p Webcam stock 6. |
| Action and test data | `POST /api/orders` with webcam × 7. |
| Expected | 409. Stock and orders unchanged. |
| Observed and evidence | 409 `INSUFFICIENT_STOCK` "Only 6 unit(s) of 1080p Webcam are available." `GET /products/4` still shows stock 6, and the order count stayed at 1. Evidence: `evidence/01-baseline-api.json`. |
| Decision | **Pass** |

### TC-15: Stock rule, stock changed after the cart was built (UI)

| Field | Record |
|---|---|
| Case and starting state | Fixture cable stock 25. Cart has cable × 20 (₱1,980.00). Checkout form filled. |
| Action and test data | Before submitting, a competing fictional order (Maria Santos) buys 10 cables through the API (201), leaving stock 15. Then click **Place simulated order**. |
| Expected | Refused. No order is created for Juan, and the cart is unchanged. |
| Observed and evidence | "Only 15 unit(s) of Test Bulk Cable (fixture) are available." The cart still has 20 × cable at ₱1,980.00. Evidence: `10-stock-changed-refused.png`, `11-stock-cart-unchanged.png`. |
| Decision | **Pass** |

### TC-16: Quantity above the 20-unit order cap (D1)

| Field | Record |
|---|---|
| Case and starting state | Fixture cable stock 25 in the cart. |
| Action and test data | Type `21` in the cable quantity, then check out with valid details. |
| Expected | The cart stops at the order limit with an explanation. |
| Observed and evidence | **Baseline: failed.** The cart accepted 21 (₱2,079), and checkout was refused with only "Check the customer and cart information." while every customer field was valid. **After fix:** "You can order up to 20 units of Test Bulk Cable (fixture) per order.", `max=20`, and the cart is unchanged. Evidence: `07-d1-fixed-quantity-21-refused.png`, `defects.md#d1`. |
| Decision | **Fail → fixed → Pass** |

### TC-17: Assistant catalog question

| Field | Record |
|---|---|
| Case and starting state | 6 active products. |
| Action and test data | Ask "Which keyboard is below ₱2,000?" |
| Expected | The keyboard at ₱1,850 with a source linking to product #2, and the price and stock matching the database. |
| Observed and evidence | Baseline (live AI, 6.1 s): `mode: "ai"`, "The Compact Mechanical Keyboard is priced at ₱1,850, which is below ₱2,000…", source id 2. Later runs during the Gemini outage gave a rule answer: "Compact Mechanical Keyboard costs ₱1,850 (7 in stock)". For three questions (keyboard, video calls, studying under ₱1,000), each source id (2, 4, 3) matches `GET /api/products/:id` for name, price, stock and active. Evidence: `12-assistant-catalog-match.png`, `evidence/14-assistant-source-check.json`. |
| Decision | **Pass** |

### TC-18: Assistant with no matching product

| Field | Record |
|---|---|
| Case and starting state | 6 active products. |
| Action and test data | Ask "Do you sell drones?" |
| Expected | An honest no-match, with no products or sources. |
| Observed and evidence | `mode: "no-match"`: "I could not find an active, in-stock ShopSmart product that matches that request…". Sources: "No catalog product supports a recommendation for this question." Evidence: `13-assistant-no-match.png`. |
| Decision | **Pass** |

### TC-19: Assistant with an invalid question

| Field | Record |
|---|---|
| Case and starting state | API running. |
| Action and test data | `POST /api/assistant/questions` with `{"question":"hi"}` |
| Expected | 422 with a readable message. |
| Observed and evidence | 422 `INVALID_QUESTION` "Question must contain between 3 and 300 characters." Evidence: `evidence/07-after-fix-api.json`. |
| Decision | **Pass** |

### TC-20: AI provider timeout

| Field | Record |
|---|---|
| Case and starting state | API restarted with `AI_TIMEOUT_MS=1`. |
| Action and test data | Ask the keyboard question on `/assistant`. |
| Expected | Loading ends with a grounded fallback answer and a notice. |
| Observed and evidence | "Answer from ShopSmart catalog rules – The AI writer took too long to respond…". The rule answer cites ₱1,850 and 7 in stock. The server log shows `[assistant] fallback: PROVIDER_TIMEOUT (Gemini did not respond within 1 ms.)` and no key. Evidence: `15-assistant-provider-timeout.png`, `evidence/09-ai-timeout-server.log`. |
| Decision | **Pass** |

### TC-21: AI provider real outage

| Field | Record |
|---|---|
| Case and starting state | Normal configuration. Gemini returned HTTP 503 during the session. |
| Action and test data | Any catalog question after about 15:00 UTC. |
| Expected | Controlled fallback, not an error. |
| Observed and evidence | Every request returned 200 with `mode: "rules"`, `fallbackReason: "PROVIDER_UNAVAILABLE"` and the notice "The AI writer is unavailable right now…". The log shows `Gemini responded with HTTP 503.` Evidence: `20-smoke-assistant.png`, `evidence/14-assistant-source-check.json`. |
| Decision | **Pass.** The fallback works against a real outage. |

### TC-22: API down, catalog page

| Field | Record |
|---|---|
| Case and starting state | API process stopped. Frontend running. |
| Action and test data | Open `/`. |
| Expected | Loading ends with a useful error. |
| Observed and evidence | "ShopSmart could not reach the server. Check that the backend is running and try again." There is no endless spinner. The message repeats itself (D5, cosmetic, not fixed). Evidence: `16-api-down-products.png`. |
| Decision | **Pass** (with D5 noted) |

### TC-23: API down, assistant page

| Field | Record |
|---|---|
| Case and starting state | API stopped. |
| Action and test data | Ask the keyboard question. |
| Expected | Loading ends, an error is shown, and the button becomes usable again. |
| Observed and evidence | Alert: "ShopSmart could not reach the server…". The button returns to "Ask ShopSmart". Evidence: `17-api-down-assistant.png`. |
| Decision | **Pass** |

### TC-24: Database down, health check (D3)

| Field | Record |
|---|---|
| Case and starting state | A second API on :3001 with `DATABASE_URL` pointing at a closed port. The real database was untouched. |
| Action and test data | `GET :3001/api/health` and `GET :3001/api/products` |
| Expected | Health reports the failure. |
| Observed and evidence | **Baseline: failed.** Health returned 200 `{"status":"ok"}` while products returned 500. **After fix:** 503 `{"status":"degraded","database":"unreachable"}`, and products still return 500 with a generic message and a trace id (no internal detail). Evidence: `evidence/02-baseline-db-down.json`, `evidence/06-after-fix-db-down.json`. |
| Decision | **Fail → fixed → Pass** |

### TC-25: Unknown API route

| Field | Record |
|---|---|
| Case and starting state | API running. |
| Action and test data | `GET /api/nope` |
| Expected | A 404 in JSON. |
| Observed and evidence | 404 `ROUTE_NOT_FOUND` "API route could not be found." |
| Decision | **Pass** |

### TC-26: Sign-in and roles

| Field | Record |
|---|---|
| Case and starting state | No authentication exists. |
| Action and test data | Checked for protected routes. The only order route is `POST /api/orders`, and there is no route that returns orders. |
| Expected | Not applicable. |
| Observed and evidence | No record of any customer can be read through the API, so the "another customer's record" test has nothing to test. `POST /api/orders` is open to anyone, which is recorded as a privacy limitation. |
| Decision | **N/A** (limitation in the release note) |

### TC-27: Data survives testing (no reseed)

| Field | Record |
|---|---|
| Case and starting state | Before testing: 6 products, 1 order. |
| Action and test data | Count rows before testing, after removing the fixture, and before and after the smoke test. |
| Expected | Original rows remain, and the counts only grow by the orders we placed. |
| Observed and evidence | Order #1 from before testing is still present. Test orders #2 (API), #3 (UI) and #5 (smoke) were added. Fixture product 9 and its fixture-only order #4 were removed by `fixture.mjs remove`. Final count: 6 products, 4 orders. Evidence: `evidence/10-…`, `11-…`, `13-smoke-test.txt`. |
| Decision | **Pass** |

### TC-28: Secrets

| Field | Record |
|---|---|
| Case and starting state | Release build in `frontend/dist`. |
| Action and test data | `node lab5-submission/scripts/secret-scan.mjs` |
| Expected | No `.env` tracked or ever committed. No key or `DATABASE_URL` in submitted files or the bundle. |
| Observed and evidence | No `.env` is tracked or in the history, and both `.env` files are git-ignored. The Gemini key is not in any submitted file or in the bundle. There are no `DATABASE_URL`, `postgresql://` or `GEMINI_API_KEY` markers in the bundle. The bundle contains only the public `http://localhost:3000/api`. Note: the local database still uses the starter's **sample** password from `.env.example`, which is acceptable locally but must change for staging. Evidence: `evidence/12-secret-scan.json`. |
| Decision | **Pass** |
