# Resource register

Account plan: **Free plan** (credits). $108.97 estimated remaining on 2026-11-20. Free access ends May 6, 2027. Region for everything below: **ap-southeast-1 (Singapore)**. Owner: cookierilla (account owner). No credentials or account IDs are recorded here.

| Resource | Name / ID | Region | Owner | Purpose | Created | Planned removal |
|----------|-----------|--------|-------|---------|---------|-----------------|
| EC2 instance (t3.micro, Ubuntu 24.04) | `shopsmart-demo` / `i-0c47264e4a6a881f5` | ap-southeast-1c | cookierilla | Runs Caddy, Express API and PostgreSQL | 2026-11-20 | 2026-12-18 (after grading): terminate |
| EBS volume (20 GiB gp3, root) | attached to `shopsmart-demo` | ap-southeast-1c | cookierilla | OS, app, database, backups | 2026-11-20 | Deleted with the instance (Delete on termination); confirm under Volumes |
| Elastic IP (public IPv4) | `52.221.80.114` / `eipalloc-0bf70363dcccf6321`, tag `Name=shopsmart-demo` | ap-southeast-1 | cookierilla | Stable address for `52-221-80-114.sslip.io` | 2026-11-20 | 2026-12-18: disassociate and **release** (it still costs credits while allocated) |
| Security group | `shopsmart-web` / `sg-02d6de62dbfbaa258` | ap-southeast-1 | cookierilla | 80/443 public; 22 only from the EC2 Instance Connect prefix list | 2026-11-20 | 2026-12-18: delete after the instance is gone |
| Let's Encrypt certificate | for `52-221-80-114.sslip.io` | n/a (on the instance) | cookierilla | HTTPS, managed by Caddy | 2026-11-20 | Removed with the instance |

**Not created:** RDS, Amplify, a key pair, IAM users or access keys, S3, or a paid AI provider.

**Not ours:** the instance `kape-lumen` (t3.small) and its Elastic IP in the same Region belong to another project. They were not changed and are not part of this demo.

## Expected credit use

- **The instance:** a t3.micro running all month is about $9.6 at on-demand rates for Linux in Singapore ($0.0132/h). It is drawn from credits.
- **Public IPv4:** about $3.6 a month ($0.005/h).
- **20 GiB of gp3:** about $1.9 a month.
- **Total:** about $15 a month at most for the demo period. That fits within the $108.97 remaining, and the planned removal date keeps it to about one month.

## Teardown checklist

1. Optional: copy the newest file from `/var/backups/shopsmart/` off the instance.
2. Terminate `i-0c47264e4a6a881f5`, then confirm under Volumes that no ShopSmart volume is left.
3. Release Elastic IP `52.221.80.114`.
4. Delete security group `sg-02d6de62dbfbaa258`.
5. Filter on the tag `Project=ShopSmart` in `ap-southeast-1`, and check Elastic IPs by `Name=shopsmart-demo`. Confirm nothing remains, then record the date here.
