# Release note: ShopSmart v1.1.0-aws

| | |
|---|---|
| Version | `v1.1.0-aws` (commit `bea961b`), released 2026-11-20 |
| Previous | `415b0a6` (lab 5 local release candidate) |
| Where | **Hosted** at https://52-221-80-114.sslip.io: AWS EC2, `ap-southeast-1`, Free plan credits |
| Data | Fictional accounts and products, simulated checkout only. No real payment and no real personal data. |

## What changed

**For customers**
- Create a test account, sign in and sign out (`/account`).
- Checkout requires sign-in. Name and email are prefilled from the account.
- **My orders** (`/orders`) and **Order details** (`/orders/:id`) show only your own simulated orders.
- The assistant shows a **"Simulated AI provider (mock)"** badge when the mock writer is used.

**API**
- `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout` and `GET /api/auth/me`. Sign-in attempts are rate-limited.
- `POST /api/orders` now requires sign-in and stores the owner from the session.
- New `GET /api/orders` (your own orders) and `GET /api/orders/:id` (404 unless it is yours).
- State-changing requests must be JSON (415 otherwise).
- `TRUST_PROXY`, `HOST`, and Secure cookies when `NODE_ENV=production`.
- `AI_PROVIDER=mock`, plus `MOCK_AI_FAILURE` or `#simulate-*` question tags.

**Operations:** the `deploy/` folder (Caddy, systemd, setup, update and backup scripts) and `.gitattributes` (LF for shell scripts).

## Database migration and data preservation

- **Migration:** `20261120090000_customer_accounts` is **additive only**. It adds the `Customer` and `Session` tables, plus a nullable `Order.customerId` with an index and an `ON DELETE SET NULL` foreign key. Existing orders keep `customerId = NULL` and are not lost.
- **How it is applied:** with `prisma migrate deploy`, which applies only committed migrations and never resets data. `migrate dev` and `migrate reset` are never used on the server.
- **Seed:** `prisma/seed.js` deletes orders and replaces products, so `setup-ec2.sh` runs it **only when the Product table is empty**, which happened once on first install. Re-running setup or `update.sh` skips it.
- **Backups:** a nightly `pg_dump` to `/var/backups/shopsmart` (7 days kept). `update.sh` takes a backup before each deploy.

## Configuration

| Setting | Where | Public or secret |
|---------|-------|------------------|
| `VITE_API_URL` | Unset, so the frontend uses same-origin `/api` | Public (would be bundled) |
| `DATABASE_URL` | `/srv/shopsmart/backend/.env`, mode 600, random password generated on the server | **Secret**; never in git, `VITE_` vars or screenshots |
| `NODE_ENV=production`, `HOST=127.0.0.1`, `PORT=3000`, `TRUST_PROXY=1`, `FRONTEND_URL`, `AI_PROVIDER=mock` | Same `.env` | Not secret |
| `GEMINI_API_KEY` | Not set on the server | Secret, if ever used |

## Known limitations

- **Single EC2 host:** a single point of failure. The database and its backups share one EBS volume (see the decision record).
- **Cart:** the cart is not saved across a full page refresh (lab 5 TC-10).
- **Sign-in hardening:** there is no password reset or email verification. The accounts are fictional test accounts.
- **Hostname:** the `sslip.io` name depends on the Elastic IP.

## Rollback

- **Application:** `sudo GIT_REF=<previous tag> bash /srv/shopsmart/deploy/update.sh`. The migration is additive, so older code still runs against the new schema; it ignores the extra tables and column.
- **Data:** restore the latest dump with `pg_restore --clean -d shopsmart <file>`.
- **Infrastructure:** follow the teardown checklist in `resource-register.md`.
