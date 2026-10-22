#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
control_file=$(mktemp)
restore() {
  rm -f "$control_file"
  docker compose up -d --wait app proxy >/dev/null
}
trap restore EXIT
docker compose exec -T app node scripts/persistence-row.js create > "$control_file"
docker compose stop app proxy
docker compose up -d --force-recreate --wait --wait-timeout 120 db
docker compose up -d --wait --wait-timeout 120 app proxy
docker compose exec -T app node scripts/persistence-row.js verify < "$control_file"
docker compose exec -T app npm run smoke
