#!/usr/bin/env bash
# Runs Notka as a demo with two sample accounts: run-local.sh with DEMO=true and its own database,
# ./data/demo.db, so the demo never touches your instance in ./data/notka.db.
#
#   ./run-demo.sh           the demo, kept between runs
#   ./run-demo.sh --fresh   the demo from scratch: deletes ./data/demo.db first
set -euo pipefail
cd "$(dirname "$0")"

export DEMO=true
export NOTKA_DB_PATH="${NOTKA_DB_PATH:-$PWD/data/demo.db}"

if [[ "${1:-}" == "--fresh" ]]; then
  rm -f "$NOTKA_DB_PATH" "$NOTKA_DB_PATH-wal" "$NOTKA_DB_PATH-shm"
fi

exec ./run-local.sh
