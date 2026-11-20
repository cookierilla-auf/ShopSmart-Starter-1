# Deploying ShopSmart to a single EC2 host

One Ubuntu 24.04 instance runs everything for a short classroom demo with fictional data:

| Part | Runs as | Listens on | Public? |
|------|---------|-----------|---------|
| Caddy (HTTPS, static files, reverse proxy) | `caddy` service | 80, 443 | **Yes**, the only public entry |
| Express API | `shopsmart-api` systemd service, user `shopsmart` | 127.0.0.1:3000 | No |
| PostgreSQL 16 | `postgresql` service | localhost:5432 | No |
| Mock AI provider | inside the API process | n/a | n/a (no outbound AI call) |

The browser talks only to `https://<ip-with-dashes>.sslip.io`. Caddy serves `frontend/dist` and forwards `/api/*` to Express. The frontend and API share one origin, so there is no CORS, no mixed content, and the session cookie is first-party (`HttpOnly; Secure; SameSite=Lax`).

## Before creating anything (AWS console)

1. **Billing and Cost Management:** check the plan (Free or Paid), the credit balance and the plan end date, then take a redacted screenshot.
2. **Root account:** protected by MFA and not shared. Teammates get their own IAM identities.
3. **Region:** `ap-southeast-1` (Singapore). Write every resource into the resource register.

## Console steps used for this release

1. **Security group `shopsmart-web`:**
   - TCP 80 and 443 from `0.0.0.0/0`.
   - TCP 22 only from the prefix list `com.amazonaws.ap-southeast-1.ec2-instance-connect`.
   - No rule for 3000 or 5432.
2. **Launch instance `shopsmart-demo`:**
   - Ubuntu Server 24.04 LTS (x86), t3.micro, 20 GiB gp3.
   - No key pair; access is through EC2 Instance Connect.
   - Security group `shopsmart-web`.
   - Tags `Project=ShopSmart`, `Owner=<you>`.
3. **Allocate an Elastic IP** and associate it with the instance, so the sslip.io hostname survives a stop/start.
4. **Connect** with EC2 Instance Connect as `ubuntu` and run:

   ```bash
   curl -fsSL https://raw.githubusercontent.com/cookierilla-auf/ShopSmart-Starter-1/v1.1.0-aws/deploy/setup-ec2.sh -o setup-ec2.sh
   sudo GIT_REF=v1.1.0-aws bash setup-ec2.sh 2>&1 | tee setup.log
   ```

   The script prints the site URL and both health checks at the end.

## What `setup-ec2.sh` does

- Adds a 1 GiB swapfile and installs Node.js 22, PostgreSQL 16, git and Caddy.
- Creates the `shopsmart` system user and clones the repository at the given tag into `/srv/shopsmart`.
- Creates the `shopsmart_app` database role with a random password.
  - The password is sent to `psql` on stdin, never on the command line.
  - It is written only to `/srv/shopsmart/backend/.env`, mode 600.
- Runs `npm ci`, `prisma generate` and `prisma migrate deploy`.
  - It **seeds only if the Product table is empty**, because the seed deletes orders.
- Builds the frontend.
- Installs the systemd unit, the Caddyfile (with the sslip.io domain) and a nightly `pg_dump` cron job (7-day retention), then starts everything.

## Day-2 operations

| Task | Command (on the instance) |
|------|---------------------------|
| API logs | `journalctl -u shopsmart-api -n 100 --no-pager` |
| Caddy logs | `journalctl -u caddy -n 100 --no-pager` |
| Restart API | `sudo systemctl restart shopsmart-api` |
| Health | `curl -s http://127.0.0.1:3000/api/health` |
| Deploy a new tag | `sudo GIT_REF=<tag> bash /srv/shopsmart/deploy/update.sh` |
| Manual backup | `sudo -u postgres /usr/local/bin/shopsmart-backup-db` |

## Teardown (after grading)

1. Optional: copy the newest file in `/var/backups/shopsmart/` off the instance.
2. **Terminate** `shopsmart-demo`. The 20 GiB root volume is deleted with it, because Delete on termination is on by default. Check under Volumes.
3. **Release** the Elastic IP. An allocated IP still uses credits when nothing is attached to it.
4. **Delete** the security group `shopsmart-web`.
5. Check EC2, then Volumes, Elastic IPs and Security groups in `ap-southeast-1` for leftovers, then update the resource register.
