#!/usr/bin/env bash
# Sync canonical files in configs/msi/ to their runtime locations
# (C:\Users\<user>\ + WSL ~/.config/systemd/user/) and restart only the
# systemd user services whose backing files actually changed.
#
# Invoke from PowerShell:
#   wsl -d Ubuntu-24.04 -u <user> -- bash /mnt/c/Users/<user>/dagacha/ai-stuff/configs/msi/sync-to-runtime.sh
#
# Idempotent: a no-op when everything is already in sync. Each file
# is compared (`cmp -s`) before being copied so unchanged files don't
# trigger a service restart.

set -euo pipefail

SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WIN_DEPLOY="/mnt/c/Users/<user>"
SYSTEMD_DIR="$HOME/.config/systemd/user"

mkdir -p "$SYSTEMD_DIR"

restart_vllm=0
restart_bridge=0
daemon_reload=0
any_change=0

needs_update() {
  local src="$1" dst="$2"
  [ ! -f "$dst" ] && return 0
  ! cmp -s "$src" "$dst"
}

sync_file() {
  # Returns 0 if file was updated, 1 if unchanged.
  local name="$1" dst_dir="$2"
  local src="$SRC_DIR/$name" dst="$dst_dir/$name"
  if needs_update "$src" "$dst"; then
    cp "$src" "$dst"
    printf "  [updated] %-30s -> %s\n" "$name" "$dst_dir"
    any_change=1
    return 0
  fi
  printf "  [same]    %-30s\n" "$name"
  return 1
}

echo "== sync configs/msi/ -> runtime =="

# Windows-side files. `|| true` keeps set -e happy when sync_file returns 1 (unchanged).
sync_file "serve-vllm.sh"            "$WIN_DEPLOY" && restart_vllm=1   || true
sync_file "serve-official.sh"        "$WIN_DEPLOY" && restart_vllm=1   || true
sync_file "serve-thinkingcap.sh"     "$WIN_DEPLOY" && restart_vllm=1   || true
sync_file "start-vllm.sh"            "$WIN_DEPLOY"                     || true
sync_file "tcp-forward.py"           "$WIN_DEPLOY" && restart_bridge=1 || true
sync_file "common.sh"                "$WIN_DEPLOY" && restart_bridge=1 && restart_vllm=1 || true
sync_file "vllm-bridge.sh"           "$WIN_DEPLOY" && restart_bridge=1 || true
sync_file "tool-test.json"           "$WIN_DEPLOY"                     || true
# qwen38 long-context lane (dual-lane with vllm.service; switch-lane.sh
# selects). Not auto-(re)started: the active lane is an operator choice.
sync_file "serve-qwen38.sh"          "$WIN_DEPLOY"                     || true
sync_file "switch-lane.sh"           "$WIN_DEPLOY"                     || true
sync_file "connection-llm-setup.md"  "$WIN_DEPLOY"                     || true

# WSL systemd user units. Changes here imply daemon-reload + restart.
if sync_file "vllm.service"        "$SYSTEMD_DIR"; then daemon_reload=1; restart_vllm=1;   fi
if sync_file "vllm-bridge.service" "$SYSTEMD_DIR"; then daemon_reload=1; restart_bridge=1; fi
# qwen38.service: install + reload but never auto-restart — it Conflicts=
# vllm.service, so a restart here would tear down the default lane.
if sync_file "qwen38.service"      "$SYSTEMD_DIR"; then daemon_reload=1; fi

# Windows DrvFs doesn't carry the +x bit reliably; force it on shell scripts.
chmod +x "$WIN_DEPLOY/serve-vllm.sh" "$WIN_DEPLOY/serve-official.sh" "$WIN_DEPLOY/serve-thinkingcap.sh" "$WIN_DEPLOY/start-vllm.sh" "$WIN_DEPLOY/common.sh" "$WIN_DEPLOY/vllm-bridge.sh" "$WIN_DEPLOY/serve-qwen38.sh" "$WIN_DEPLOY/switch-lane.sh" 2>/dev/null || true

if [ "$daemon_reload" -eq 1 ]; then
  echo "== systemctl --user daemon-reload =="
  systemctl --user daemon-reload
fi

if [ "$restart_vllm" -eq 1 ]; then
  echo "== systemctl --user restart vllm.service =="
  systemctl --user restart vllm.service
fi

if [ "$restart_bridge" -eq 1 ]; then
  echo "== systemctl --user restart vllm-bridge.service =="
  systemctl --user restart vllm-bridge.service
fi

if [ "$any_change" -eq 0 ]; then
  echo "== already in sync; nothing to do =="
fi

echo "done."
