# Decision record: host ShopSmart on a single EC2 instance

| | |
|---|---|
| Status | Accepted and deployed (2026-11-20) |
| Decision | One Ubuntu 24.04 t3.micro in `ap-southeast-1` runs Caddy, the Express API and PostgreSQL 16 |
| Scope | Short classroom demonstration with fictional data and simulated checkout |

## Context

- ShopSmart has three parts: the React and Vite frontend, the Express API, and PostgreSQL. The assistant can optionally call an AI provider.
- The account is on the AWS **Free plan**: $108.97 of credits left, with free access ending May 6, 2027. Every resource draws on those credits.
- The guide requires:
  - an HTTPS API before any sign-in flow;
  - a database the browser can never reach;
  - secrets kept on the server only;
  - an architecture the team can explain.

## Options considered

| | Single EC2 host (chosen) | Amplify + EC2 + RDS |
|---|---|---|
| Services to configure | EC2, one security group, one Elastic IP | Amplify, EC2, RDS, two security groups, a subnet group, and an HTTPS endpoint for the API |
| HTTPS | Caddy gets a free Let's Encrypt certificate for `52-221-80-114.sslip.io`. Frontend and API share one origin. | Amplify gives HTTPS for the frontend. The API still needs its own HTTPS name and certificate, otherwise the browser blocks requests to it as mixed content. |
| Cookies and CORS | First-party cookie, `SameSite=Lax`, and no CORS needed | Cross-origin cookie (`SameSite=None`), plus CORS with credentials |
| Database | PostgreSQL on localhost. The team owns backups (nightly `pg_dump`). | Managed RDS with automatic backups, in a private subnet |
| Credit use | One small instance, one public IPv4 and 20 GiB | Adds an RDS instance and its storage. Amplify build minutes and transfer are extra. |
| Failure modes | **Single point of failure.** One instance and one volume. | More moving parts, but each one does a single job |

## Decision

Use the single EC2 host. For a short demo it needs the fewest services and the least credit. It also gives a real HTTPS origin, which keeps the session cookie simple and secure. Every connection in the guide's request trace is still visible and can be explained:

1. **Browser → Caddy :443** is public. Caddy serves `frontend/dist`, with an SPA rewrite to `index.html`.
2. **Caddy → Express on 127.0.0.1:3000** is internal. Only `/api/*` is forwarded.
3. **Express → PostgreSQL on localhost:5432** is internal. The connection uses `DATABASE_URL` from `backend/.env`, which has mode 600.
4. **Express → AI provider:** the mock provider runs in-process, with no key and no network call. Gemini stays optional and server-only.

The security group opens only 80 and 443 to the internet. Port 22 is open only to the AWS EC2 Instance Connect prefix list, so there is no key file and SSH is not open to everyone. Ports 3000 and 5432 are not open; screenshot 14 and checks N-3000 and N-5432 confirm this.

## Consequences

- **The team owns operations:**
  - OS updates;
  - restarts (systemd `Restart=always`, enabled at boot; tested by a reboot);
  - logs (`journalctl -u shopsmart-api`);
  - backups (nightly `pg_dump`, kept 7 days, on the same volume);
  - cleanup.
- **Backups live on the same volume.** Terminating the instance deletes the database and its backups. Copy a dump off the instance first if the data matters. For this demo the data is fictional.
- **The hostname depends on the IP.** `sslip.io` derives the name from the Elastic IP. Releasing the IP changes the URL, and a real domain would replace it for anything beyond a demo.
- **Going further** would mean moving the database to RDS (private), putting the frontend on Amplify or CloudFront, and using a real domain with ACM. The application code would not change: `VITE_API_URL` and `FRONTEND_URL` already allow separate origins.
- **Cost control:**
  - All resources are tagged `Project=ShopSmart` and listed in `resource-register.md`.
  - Teardown is planned for after grading, by **2026-12-18**.
  - The separate instance `kape-lumen` in the same Region belongs to another project. It was not changed.
