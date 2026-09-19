#!/bin/bash
set -eu

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
. "$SCRIPT_DIR/common.sh"

exec /usr/bin/python3 "$SCRIPT_DIR/tcp-forward.py" \
  "$MSI_PUBLIC_PORT" "$MSI_BRIDGE_UPSTREAM_HOST" "$MSI_BRIDGE_UPSTREAM_PORT"
