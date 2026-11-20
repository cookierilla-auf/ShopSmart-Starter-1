# ShopSmart AWS deployment submission

| | |
|---|---|
| Site URL | **https://52-221-80-114.sslip.io** |
| Release | **Hosted** on AWS (not a local-only release) |
| Code version | Git tag `v1.1.0-aws` (commit `bea961b`) in https://github.com/cookierilla-auf/ShopSmart-Starter-1 |
| AWS account plan | **Free plan**. $120.00 credits issued, $108.97 estimated remaining on 2026-11-20. Free access ends **May 6, 2027** (169 days left; the credits themselves expire Nov 6, 2027). See screenshot 00. |
| Region | `ap-southeast-1` (Asia Pacific, Singapore) |
| Services | Amazon EC2 (one t3.micro instance with a 20 GiB gp3 EBS volume), one Elastic IP (public IPv4), one security group. No RDS, Amplify or paid AI provider. |
| Architecture | Single EC2 host: Caddy (HTTPS) → Express API (systemd) → PostgreSQL 16, all on the instance. Mock AI provider, labeled in the UI. |
| Data | Fictional products, fictional test accounts and simulated checkout only |
| Hosted checks | 31/31 passed at 10:37 UTC and 31/31 again after a reboot at 10:39 UTC on 2026-11-20 |

## Tested URLs

| URL | Purpose |
|-----|---------|
| `https://52-221-80-114.sslip.io/` | Home and catalog |
| `https://52-221-80-114.sslip.io/account` | Sign in or create a fictional test account |
| `https://52-221-80-114.sslip.io/orders` and `/orders/<id>` | Private order history (React routes; a direct refresh works) |
| `https://52-221-80-114.sslip.io/assistant` | Grounded assistant (mock provider). Add `#simulate-timeout`, `#simulate-rate-limit`, `#simulate-bad-response` or `#simulate-unknown-product` to a question to show each failure path. |
| `https://52-221-80-114.sslip.io/api/health` | API and database health |
| `http://52-221-80-114.sslip.io/` | Redirects (308) to HTTPS |

## Contents

| File | What it is |
|------|------------|
| [`deployment-diagram.png`](deployment-diagram.png) / [`.svg`](deployment-diagram.svg) | Deployment diagram with public and internal ports |
| [`decision-record.md`](decision-record.md) | Architecture decision record: why a single EC2 host |
| [`verification-record.md`](verification-record.md) | Every check from the guide: expected result first, then the observed result. Also the two improvements and their retests. |
| [`release-note.md`](release-note.md) | What changed, the migration and data decision, known limits, rollback |
| [`resource-register.md`](resource-register.md) | AWS resources with Region, owner, purpose, dates and the teardown plan |
| `screenshots/` | `00`–`15`: redacted billing, hosted journey, assistant, server status, reboot |
| `evidence/` | `01-initial-hosted-checks.json`, `02-after-reboot-hosted-checks.json`, `final-check.txt` |
| `scripts/` | `hosted-checks.mjs` (API checks against the live URL), `capture.mjs` (screenshots), `build-pdfs.mjs` |
| `pdf/` | PDF versions of all of the above |
| [`../deploy/`](../deploy/README.md) | Caddyfile, systemd unit and the setup, update and backup scripts used on the instance |

## Re-running the evidence

```bash
BASE_URL=https://52-221-80-114.sslip.io node lab6-submission/scripts/hosted-checks.mjs recheck
BASE_URL=https://52-221-80-114.sslip.io node lab6-submission/scripts/capture.mjs
node lab6-submission/scripts/build-pdfs.mjs
```
