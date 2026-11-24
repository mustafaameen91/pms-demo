#!/usr/bin/env bash
# Run on the server, in /var/www/pms.codility.tech/app (deploy/upload.sh does this for you).
# Installs packages, applies new database migrations, builds, and restarts the app with no data loss.
set -euo pipefail

cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  echo "Missing .env — copy deploy/env.production.example to .env and fill it in first." >&2
  exit 1
fi

echo "→ Installing packages"
pnpm install --frozen-lockfile

echo "→ Applying database migrations"
pnpm db:migrate

echo "→ Building"
pnpm build

echo "→ Restarting"
if pm2 describe tamm > /dev/null 2>&1; then
  pm2 reload tamm --update-env
else
  pm2 start deploy/ecosystem.config.cjs
fi
pm2 save

sleep 3
code=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3002/login || true)
echo "→ App answers on 127.0.0.1:3002 with HTTP $code"
[ "$code" = "200" ] || { echo "Not 200: check  pm2 logs tamm" >&2; exit 1; }
