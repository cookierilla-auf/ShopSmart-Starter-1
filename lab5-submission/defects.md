# Defect log

Each defect was reproduced on the baseline (commit `1bfc8a3`) before any change. Each fix got a regression test that **failed before the fix** (`evidence/03-new-tests-before-fix-*.txt`) and passes after it (`evidence/final-check.txt`). No existing test was deleted or weakened.

Priority follows the task: anything that breaks checkout, exposes data, gives wrong totals or gives an unsupported assistant answer comes first.

---

## D1: The cart allows a quantity the API will always refuse (checkout broken). **Fixed**

| | |
|---|---|
| Severity | High: breaks checkout |
| Starting state | Catalog contains a product with stock above 20 (disposable fixture "Test Bulk Cable (fixture)", stock 25, inserted with `scripts/fixture.mjs add`). Cart already has Wireless Mouse × 3 and 1080p Webcam × 1. |
| Action | Add the cable, type **21** in its cart quantity, proceed to checkout, enter valid fictional details (Juan Dela Cruz, `juan.delacruz@example.com`, 123 Sample St, Quezon City), click **Place simulated order**. |
| Actual (before) | The cart accepted 21 (input `max=25`, line ₱2,079, total ₱5,479). Checkout was refused with only *"Check the customer and cart information."*, even though every customer field was valid. The customer had no way to know the cart caused it. The API returned 422 with `fieldErrors.items: ["Too big: expected number to be <=20"]`. No order was created (count stayed at 1). |
| Expected | The cart should never allow more units than the API accepts. |
| Cause | `frontend/src/utils/cart.js` capped quantity only at `stock`, while `orderSchema` in `backend/src/validators/schemas.js` caps each line at 20. The two rules disagreed. |
| Fix | Added `MAX_QUANTITY_PER_ITEM = 20` and `maxOrderQuantity(item) = min(stock, 20)` in `cart.js`. Both are used by `addProductToCart`, `updateCartQuantity`, the quantity input's `max` and the **+** button in `CartPage.jsx`. The constant is exported on both sides with a "must match" comment. |
| Tests | `cart.test.js`: "caps a typed quantity at the 20-unit order limit…", "stops Add to cart at the 20-unit order limit", "still uses stock as the limit when stock is below 20". `orders.test.js`: "a quantity above the 20-unit order cap explains the limit". |
| Verified | Screenshot `07-d1-fixed-quantity-21-refused.png`: typing 21 shows *"You can order up to 20 units of Test Bulk Cable (fixture) per order."*, the input has `max=20`, and the cart is unchanged. |

## D2: A checkout refusal does not say which field is wrong. **Fixed**

| | |
|---|---|
| Severity | Medium: failure state not useful, blocks checkout for an ordinary typo |
| Starting state | Cart with Wireless Mouse × 3 and 1080p Webcam × 1. |
| Action | Checkout with email `juan@example`. The browser's `type="email"` check accepts it. |
| Actual (before) | Red message *"Check the customer and cart information."* with nothing else. The real reason (`fieldErrors.email: ["Invalid email address"]`) was in the response but never shown. The same happened for a 6-character address and quantity 21 (`evidence/01-baseline-api.json`). |
| Expected | The message names the field and what to change. |
| Fix | `orderSchema` now has customer-facing messages for each rule. `routes/orders.js` adds them to the 422 message ("Check the customer and cart information: Enter a complete email address, such as juan@example.com."). The `code` and `details` fields are unchanged, so existing clients still work. `CheckoutPage` already shows `error.message`, so no frontend change was needed. |
| Tests | `orders.test.js`: "an email the browser accepts but the API rejects names the email field", "a short address names the delivery address field". |
| Verified | `08-d2-fixed-invalid-email.png` and `evidence/07-after-fix-api.json` (email, address, empty cart and quantity-cap messages). |

## D3: `/api/health` reports healthy while the database is down. **Fixed**

| | |
|---|---|
| Severity | Medium for deployment: a host health check would keep a broken release live |
| Starting state | A second API instance on port 3001 with `DATABASE_URL` pointing at a closed port (`127.0.0.1:5999`). The real database was untouched. |
| Action | `GET :3001/api/health`, then `GET :3001/api/products`. |
| Actual (before) | Health returned **200 `{"status":"ok"}`** while products returned **500** (`evidence/02-baseline-db-down.json`). |
| Expected | The health check fails when the API cannot serve the catalog. |
| Fix | `backend/src/app.js` runs `SELECT 1` through Prisma with a 3-second timeout. It returns 200 `{"status":"ok","database":"ok"}` or **503 `{"status":"degraded","database":"unreachable"}`**. The database client can be injected (`createApp({ db })`) so tests don't need PostgreSQL. |
| Tests | `backend/test/health.test.js` (ok and unreachable). |
| Verified | `evidence/06-after-fix-db-down.json`: 503 with the database down, 200 against the real database. `00-health.png`. |

## D4: Totals are formatted inconsistently and summed with floating point. **Fixed**

| | |
|---|---|
| Severity | Low to medium: affects how totals display; amounts were correct for the current whole-peso catalog |
| Starting state | Checkout with Wireless Mouse × 3 and 1080p Webcam × 1. |
| Actual (before) | Line items showed **₱1,950.00** and **₱1,450.00**, but the total showed **₱3,400** and the cart page showed **₱650 each** (no centavos). In code, `price * quantity` used floating point, so 3 × ₱1,299.95 would give `3899.8500000000004`. |
| Expected | Every peso amount shows two decimals, and totals are exact to the centavo. |
| Fix | `cart.js` adds prices in whole centavos and exports `formatPeso()` (always 2 decimals). It is used for every amount in `CartPage.jsx` and `CheckoutPage.jsx`. The server still recalculates the total with `Prisma.Decimal`, so the order itself was never affected. |
| Tests | `cart.test.js`: "adds centavo prices without floating-point drift", "formats every peso amount with two decimals". |
| Verified | `04-cart-totals.png` (₱2,100.00 → ₱2,750.00), `10-stock-changed-refused.png` (₱1,980.00 on both lines). |

---

## D5: The "API down" message on the products page repeats itself. **Not fixed (cosmetic)**

| | |
|---|---|
| Severity | Low: wording only |
| Reproduction | Stop the API and open `/`. |
| Actual | *"ShopSmart could not reach the server. Check that the backend is running and try again. Make sure the backend is running."* There is also a separate *"Could not load category choices. Clear search to retry."* even though the search box is already empty (`16-api-down-products.png`). |
| Expected | One clear message and a retry hint that matches the screen. |
| Impact | None on data or checkout. Loading ends and the customer is told the server is unreachable. |
| Why deferred | Cosmetic. The category message is asserted in `ProductsPage.test.jsx`, so changing it needs a test update. We prioritized D1–D4. |
| Safe temporary limitation | Leave as is. Evaluators should read it as "the API is down; restart it and reload". |

## Observations that are limitations, not defects

- **The cart is lost on page refresh** (`14-cart-after-refresh.png`: Cart (1) → Cart (0)). The cart is in React state only, which is the starter design ("as your team's design allows"). Server-side stock and price checks mean nothing incorrect can be ordered. This is recorded as a known limitation in the release note.
- **The live AI provider was unavailable for most of the session.** Gemini returned HTTP 503 from about 15:00 (local 23:00) onward. The baseline call at 14:58 UTC got a verified AI answer (`mode: "ai"`, 6.1 s). Every later call fell back to catalog rules with the notice *"The AI writer is unavailable right now…"*. This is the planned fallback working against a real outage, not a ShopSmart defect.
