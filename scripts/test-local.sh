#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
for test_file in tests/config.test.js tests/auth.test.js; do
  docker compose exec -T -w /app/src app node --input-type=module < "$test_file"
done
