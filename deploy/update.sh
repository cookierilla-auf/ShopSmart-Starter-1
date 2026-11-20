#!/usr/bin/env bash
# Deploys a newer tagged version on the same instance, keeping the database.
#   sudo GIT_REF=<tag> bash /srv/shopsmart/deploy/update.sh
# Rollback: run it again with the previous tag (migrations are additive; see the release note).
set -euo pipefail
GIT_REF="${GIT_REF:?Set GIT_REF to the tag to deploy}"
APP_DIR=/srv/shopsmart
as_app() { sudo -u shopsmart -H "$@"; }
cd "$APP_DIR"
sudo -u postgres /usr/local/bin/shopsmart-backup-db || echo "warning: backup failed" >&2
as_app git fetch --tags --force origin
as_app git checkout --force "$GIT_REF"
as_app npm ci --no-audit --no-fund
as_app npm run db:generate
as_app npm run db:deploy
as_app npm run build
systemctl restart shopsmart-api
for _ in $(seq 1 30); do curl -fsS http://127.0.0.1:3000/api/health && break; sleep 2; done
echo
echo "Deployed $(git -C "$APP_DIR" describe --tags --always)"
