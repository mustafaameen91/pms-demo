#!/usr/bin/env bash
# Nightly backup of the database and uploaded files. Keeps the last 14 days.
#   crontab -e  →  30 2 * * * bash /var/www/pms.codility.tech/app/deploy/backup.sh
set -euo pipefail

BASE="/var/www/pms.codility.tech"
OUT="$BASE/backups"
STAMP="$(date +%Y-%m-%d_%H%M)"
mkdir -p "$OUT"

docker exec tamm-db pg_dump -U tamm -d tamm --format=custom > "$OUT/db_$STAMP.dump"
tar -czf "$OUT/uploads_$STAMP.tar.gz" -C "$BASE" uploads

find "$OUT" -type f -mtime +14 -delete
echo "Backup written to $OUT ($STAMP)"
