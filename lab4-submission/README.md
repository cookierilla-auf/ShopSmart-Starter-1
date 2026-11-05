# Laboratory 4 submission: grounded product assistant

## Included evidence

- `design-note.md`: request flow, the five design decisions, provider, verification, fallback and known limitations.
- `test-record.md`: the six required test cases with observed results, plus regression and secret checks.
- `01-catalog-match.png`: keyboard below ₱2,000 → verified AI answer, real ₱1,850 price, working link and source.
- `02-no-match.png`: drones → honest no-match, no products or sources.
- `03-provider-failure.png`: provider timeout → rule-based answer with a clear notice.
- `04a-availability-no-match.png`, `04b-availability-match.png`: zero-stock fixture never recommended.
- `05-checkout-still-works.png`: assistant link → product → cart → simulated checkout.
- `check-output.txt`: final output of the root `npm run check` (lint, tests, build), all passing.
- `evidence/`: raw API responses, including the starter baseline that showed the original no-match bug.

## Code changes

- `backend/src/services/assistant.js`: retrieval (`selectCatalogFacts`), rule answer, `verifyDraft`, `answerQuestion`.
- `backend/src/services/aiProvider.js`: server-only Gemini Interactions API call with timeout and typed errors.
- `backend/src/routes/assistant.js`: same endpoint and validation; loads only active, in-stock public fields.
- `frontend/src/pages/AssistantPage.jsx`, `frontend/src/services/api.js`: waiting state, notice, mode badge, sources, client timeout.
- Tests: `backend/test/assistant.test.js`, `aiProvider.test.js`, `assistantRoute.test.js`, `frontend/src/pages/AssistantPage.test.jsx`.

## Setup

Copy `backend/.env.example` to `backend/.env` and set `GEMINI_API_KEY` (from https://aistudio.google.com/apikey). Without a key, the assistant still answers with catalog rules. `backend/.env` is excluded from this submission.

## Team contributions

Each member: one contribution and one issue resolved.

| Member | Contribution | Issue resolved |
|--------|--------------|----------------|
| _name_ | | |
| _name_ | | |
| _name_ | | |
