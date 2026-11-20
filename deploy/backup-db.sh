#!/usr/bin/env bash
# Nightly logical backup of the ShopSmart database, run by cron as the postgres user. Keeps 7 days.
# These files live on the same EBS volume: copy one off the instance before terminating it.
set -euo pipefail
DIR=/var/backups/shopsmart
mkdir -p "$DIR"
pg_dump --format=custom shopsmart > "$DIR/shopsmart-$(date +%Y%m%d-%H%M).dump"
find "$DIR" -name 'shopsmart-*.dump' -mtime +7 -delete
