#!/usr/bin/env bash
set -euo pipefail

MODE="${1:-success}"
shift || true

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
CLIENT="$SCRIPT_DIR/heartbeat-client.mjs"

node "$CLIENT" --mode "$MODE" "$@"
