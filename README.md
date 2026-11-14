# ShopSmart-Starter
PDC50 ShopSmart Webapp created using Node.js and React.js

## Run locally

Use Node.js 20.19 or later and an existing PostgreSQL ShopSmart database.

1. Run `npm ci` at the project root.
2. Copy `backend/.env.example` to `backend/.env` and set `DATABASE_URL` privately for your existing database. Copy `frontend/.env.example` to `frontend/.env` if you need to change the API URL.
3. Run `npm run db:generate` to generate Prisma Client.
4. Run `npm run dev`, then open http://localhost:5173 and check http://localhost:3000/api/health.

An existing database must already contain the ShopSmart schema. Database migrations and seeding are separate setup operations; the seed script deletes existing products and orders, so do not run it against a database containing work.

## Evaluator quick start (final release candidate)

Status: **local release candidate only**. No staging or live site exists. See the [final submission](final-submission/README.md).

1. Install Node.js 20.19+ and start PostgreSQL with a database and user you control.
2. Run `npm ci` at the project root.
3. Copy `backend/.env.example` to `backend/.env` and set `DATABASE_URL`. `GEMINI_API_KEY` is optional; without it the assistant answers from catalog rules. Keep `backend/.env` out of git and screenshots.
4. Run `npm run db:generate`.
5. Run `npm run db:deploy` (`prisma migrate deploy`). It applies the committed migrations and never resets data. `npm run db:migrate` is only for creating new migrations during development.
6. **New, empty database only:** run `npm run db:seed` to load the 6 sample products. It **deletes all products and orders** first.
7. Run `npm run dev`, open http://localhost:5173, and check that http://localhost:3000/api/health returns `{"status":"ok","database":"ok"}`. It returns 503 if the database is unreachable.
8. Run `npm run check` (lint, frontend and backend tests, production build).

Use only fictional names, emails and addresses at checkout. The app has no sign-in.

## Laboratory 3: live catalog search

Search requests go to `GET /api/products?search=...`. The API matches names or descriptions without regard to case, returns active products in ascending ID order, and returns the whole active catalog for an empty or whitespace-only term. Categories and sorting are applied to the current API results in the browser, while category choices come from a separate full-catalog snapshot.

Run `npm run check` for linting, frontend and backend tests, and the production build. Route tests mock Prisma and never write database records; component tests cover request races, loading, errors, category choices, and sorting.

The [lab submission](lab3-submission/README.md) contains the explanation, screenshots, API results, live verification notes, and final check output. Keep `node_modules`, `.env` files, and generated builds out of a source submission.
