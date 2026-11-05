# Design note: ShopSmart grounded product assistant

## Request flow

```
AssistantPage.jsx (form submit, loading state)
  └─ api.askAssistant(question)            frontend/src/services/api.js  (20 s client timeout)
      └─ POST /api/assistant/questions     backend/src/routes/assistant.js
          ├─ assistantLimiter (20/min) + zod validation  → 422 INVALID_QUESTION
          ├─ prisma.product.findMany({ active: true, stock > 0 }, 6 public fields)
          └─ answerQuestion(products, question, { provider })   backend/src/services/assistant.js
              ├─ selectCatalogFacts()  → no facts? return no-match (provider NOT called)
              ├─ provider.draftAnswer() backend/src/services/aiProvider.js → Gemini Interactions API
              │     error/timeout/429/bad JSON → rule-based answer + notice
              ├─ verifyDraft()          ids, prices, availability checked vs facts → reject → rules
              └─ { answer, recommendedProducts, sources, mode, notice? }  (products built from DB facts)
  ← AssistantPage shows mode badge, notice, answer, product links, Sources list
```

## Five design decisions

1. **Fields sent to the provider.** Only `id, name, description, category, price, stock` of at most three selected products, plus the question. These are the facts a customer-facing recommendation needs (what it is, what it costs, whether it can be bought); the provider never sees emoji, timestamps, orders, names, emails or addresses. The Prisma `Decimal` price is converted to a number once, in `selectCatalogFacts`.
2. **Preventing invented sources.** The model returns `productIds`, but `verifyDraft` rejects the whole draft if any id is not in this request's selected facts. `recommendedProducts` and `sources` are then built from the database facts by id, so their names, prices and links can never come from model text.
3. **No catalog match.** Retrieval runs first. If no active, in-stock product matches the question (and budget), the server returns an honest no-match answer with empty products and sources and **does not call the provider**: there is nothing grounded for it to say, and it saves quota.
4. **Provider unavailable.** Timeouts (`AI_TIMEOUT_MS`, 12 s), HTTP 429, other HTTP errors/network failures and malformed output all become typed `ProviderError`s. The customer still gets the rule-based answer built from the same verified facts (names, real ₱ prices, stock, description), with a notice saying why the AI writer was skipped. The page always leaves its loading state.
5. **Public data and permissions.** This project has no user accounts yet (Week 4 auth was not added), so the only data the assistant reads is the public active catalog. The restriction is enforced on the server in the route's Prisma `where`/`select`, not in React. The Gemini key lives only in `backend/.env` (git-ignored), is sent only in the `x-goog-api-key` header, and is never logged or returned.

## Template answers

- **Provider:** Google Gemini, official REST Interactions API (`POST https://generativelanguage.googleapis.com/v1beta/interactions`) with structured JSON output (`response_format` + schema), model `gemini-3.6-flash` (configurable with `GEMINI_MODEL`). We used plain `fetch`, so no SDK dependency. `gemini-2.5-flash` is deprecated, and during testing `gemini-3.5-flash-lite` and `gemini-3.8-flash` returned HTTP 503 repeatedly, so we chose the stable 3.6 Flash.
- **Verification:** `verifyDraft` checks (a) the shape with zod (answer 1–600 chars, 1–3 integer ids), (b) every id is a selected product, (c) every ₱/PHP/"pesos" amount equals a selected product's price or the customer's own budget, (d) no "out of stock / sold out / unavailable" claim, and every stated unit count matches the real stock. Any failure means the rule-based answer is used instead.
- **Fallback, as the customer sees it:**
  - *No match:* "I could not find an active, in-stock ShopSmart product…"
  - *Timeout:* "The AI writer took too long…"
  - *Malformed output or failed checks:* "The AI draft did not pass ShopSmart's catalog checks…"
  - *Rate limit:* "The AI writer is busy right now (rate limit reached)…"

  Each one except no match still lists the real product links and sources.
- **Evidence (first failing case):** On the starter, "Do you sell drones?" returned three random products, and "Is there a 1080p webcam?" read 1080 as a ₱1,080 budget and missed the webcam (`evidence/00-starter-baseline.txt`). The cause: ranking never required a keyword match, and any 2–6 digit number counted as a budget. We fixed it with stopwords, budget phrases that need a currency sign or a word like "below", and a rule that only the best-matching products are kept. Unit tests in `backend/test/assistant.test.js` cover it. Later, the source check found that "use" matched inside "m**ouse**". Matching now uses whole words with shared stems (a test covers it as well).

## Known limitations

- Descriptive claims (for example "ideal for video calls") cannot be fully machine-checked. They are limited by the prompt and by the short descriptions sent, but only prices, ids and availability are strictly verified.
- Keyword retrieval with stemming has no synonyms: "earphones" will not find "USB Headset".
- The rate limiter and provider quota are per server process. Gemini's free-tier limits are shown in AI Studio, not in the docs.
