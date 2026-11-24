#!/usr/bin/env bash
# Run on your Mac, from the project folder:   deploy/upload.sh user@82.39.115.116
# Copies the source code to the server (no node_modules, builds, secrets, uploads or the phone app),
# then runs deploy/server-update.sh there to install, migrate, build and restart.
set -euo pipefail

TARGET="${1:?usage: deploy/upload.sh user@82.39.115.116}"
APP_DIR="/var/www/pms.codility.tech/app"

cd "$(dirname "$0")/.."

rsync -az --delete \
  --exclude '.git/' \
  --exclude 'node_modules/' \
  --exclude '.next/' \
  --exclude '.env*' \
  --exclude 'uploads/' \
  --exclude 'mobile/' \
  --exclude 'brand/' \
  --exclude '.claude/' \
  --exclude '*.tsbuildinfo' \
  --exclude '.DS_Store' \
  ./ "$TARGET:$APP_DIR/"

ssh -t "$TARGET" "cd $APP_DIR && bash deploy/server-update.sh"
