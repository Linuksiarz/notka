#!/usr/bin/env bash
# Builds Notka and runs it as a single process on http://localhost:8080 — no Docker needed.
#
#   ./run-local.sh              your own instance, data in ./data/notka.db
#   ./run-demo.sh               a demo with two sample accounts, data in ./data/demo.db
#
# Needs Java 21 and Node.js 22+. pnpm is used when it is installed, otherwise fetched with npx.
set -euo pipefail
cd "$(dirname "$0")"

if ! command -v java >/dev/null; then
  echo "Java 21 is required — for example: brew install openjdk@21" >&2
  exit 1
fi
if command -v pnpm >/dev/null; then
  PNPM=(pnpm)
elif command -v npx >/dev/null; then
  PNPM=(npx --yes pnpm@11)
else
  echo "Node.js 22+ is required — for example: brew install node" >&2
  exit 1
fi

echo "› Building the frontend"
(cd frontend && "${PNPM[@]}" install --frozen-lockfile && "${PNPM[@]}" run build)

echo "› Building the backend"
./gradlew :backend:shadowJar --console=plain -q

mkdir -p data
export NOTKA_DB_PATH="${NOTKA_DB_PATH:-$PWD/data/notka.db}"

# A new instance needs its administrator; ask for one instead of failing on the first start.
if [[ ! -f "$NOTKA_DB_PATH" && "${DEMO:-false}" != "true" && -z "${NOTKA_ADMIN_USERNAME:-}" ]]; then
  echo "› A new instance needs an administrator (asked only now, on the first start)"
  read -r -p "  Username: " NOTKA_ADMIN_USERNAME
  read -r -s -p "  Password (at least 8 characters): " NOTKA_ADMIN_PASSWORD
  echo
  export NOTKA_ADMIN_USERNAME NOTKA_ADMIN_PASSWORD
fi
export NOTKA_STATIC_DIR="$PWD/frontend/dist"
export NOTKA_HOST="${NOTKA_HOST:-127.0.0.1}"
export NOTKA_PORT="${NOTKA_PORT:-8080}"

echo "› Notka on http://localhost:${NOTKA_PORT} (Ctrl+C to stop)"
exec java -jar backend/build/libs/notka-backend-all.jar
