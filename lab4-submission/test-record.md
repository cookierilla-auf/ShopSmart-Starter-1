# Test record: grounded assistant

Recorded 2026-11-05 against the local PostgreSQL catalog (6 active products, no `db:seed` rerun). Live provider: Gemini `gemini-3.6-flash`. Raw responses are in `evidence/`.

| # | Case | Action | Observed | Result |
|---|------|--------|----------|--------|
| 1 | Catalog match | Asked "Which keyboard is below ₱2,000?" on the page | `mode: "ai"`. Answer: "The Compact Mechanical Keyboard is available for ₱1,850, which is below ₱2,000…". One link to `/products/2` (₱1,850 · 8 in stock), source id 2. | Pass (`01-catalog-match.png`) |
| 2 | No match | Asked "Do you sell drones?" | `mode: "no-match"`, honest message, `recommendedProducts: []`, `sources: []`, no links. The provider was not called (47 ms response). | Pass (`02-no-match.png`) |
| 3 | Invalid input | `POST /api/assistant/questions` with `{"question":"hi"}` | HTTP 422 `INVALID_QUESTION`: "Question must contain between 3 and 300 characters." | Pass (`evidence/05-…json`) |
| 4 | Availability | Inserted disposable "Zero Stock Test Keyboard" (₱1,000, stock 0), then asked two keyboard questions | It appeared in `GET /api/products` with stock 0, but was never recommended. "Keyboard under ₱1,200" gave an honest no-match; "below ₱2,000" recommended only the in-stock keyboard. The fixture was deleted afterwards (0 left). | Pass (`04a`, `04b`, `evidence/04-availability.txt`) |
| 5 | Provider failure | Restarted the backend with `AI_TIMEOUT_MS=1`, asked the keyboard question, then restored 12000 | Loading ended. `mode: "rules"`, `fallbackReason: "PROVIDER_TIMEOUT"`, notice "The AI writer took too long…". Rule answer cites ₱1,850 and 8 in stock, and the link still works. Server log: `[assistant] fallback: PROVIDER_TIMEOUT` (no key). | Pass (`03-provider-failure.png`) |
| 6 | Source check | For three questions, compared each source id against `GET /api/products/:id` | Ids 2, 4 and 1: name, price, stock and active all match the database. The check also found a relevance bug: the study question returned Wireless Mouse ("use" matched inside "mouse"). After the whole-word fix it returns Study Lamp #3 and Laptop Stand #5. The linked page `/products/2` shows ₱1,850.00 and the stock count. | Pass (`evidence/05-…json`) |

## Additional observations

- **Real provider outage:** before switching models, `gemini-3.5-flash-lite` returned HTTP 503 and one 15 s timeout. The page showed the rule-based answer with the "unavailable" notice each time, which is the fallback working against a real failure, not a simulated one.
- **Regression:** browsing all 6 products, opening the product from the assistant link, adding it to the cart and placing a simulated checkout (order #1, ₱1,850.00) all worked (`05-checkout-still-works.png`). After that order the assistant reported 7 in stock, so it reads live data.
- **Secret check:** a scan of all 141 project files outside `node_modules`/`.git` (including `frontend/dist`, evidence files and the dev-server log) found the key only in git-ignored `backend/.env`.
- **Automated tests:** 31 backend tests (node:test) and 17 frontend tests (vitest). `npm run check` passed, see `check-output.txt`.
