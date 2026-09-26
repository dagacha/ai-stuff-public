#!/bin/bash
# Promote ThinkingCap-3.8 EXL3 5.5bpw to production on the existing qwen38-exl3.service,
# or roll back to the base Qwen3.8 EXL3 checkpoint. The repo launcher is the source of
# truth: promote copies it (LF-normalized) to the runtime location, no text patching.
#   bash promote.sh          -> install repo launcher (backup kept), clear any ARM_ENV
#                               override, restart, verify the ThinkingCap name is served
#   bash promote.sh rollback -> restore the pre-ThinkingCap launcher backup, restart,
#                               verify the ThinkingCap name is NOT served
# Temporary rollback without touching files (the unit does not set the variable itself;
# note the value persists in the user manager until unset, which the forward path does):
#   systemctl --user set-environment QWEN38_EXL3_ARM_ENV=$ROOT/configs/msi/qwen38-exl3-canary/55-mtp-262k-vision.env
#   systemctl --user restart qwen38-exl3.service      # undo: unset-environment + restart
set -euo pipefail
ROOT=/mnt/c/Users/<user>/dagacha/ai-stuff
SRC=$ROOT/configs/msi/serve-qwen38-exl3.sh
ARM=$ROOT/configs/msi/qwen38-exl3-canary/tc38-55-mtp-262k-vision.env
L=/mnt/c/Users/<user>/serve-qwen38-exl3.sh
B=/mnt/c/Users/<user>/serve-qwen38-exl3.sh.bak-pre-thinkingcap
BRIDGE=http://100.<tailscale-ip-1>:8100
TC_NAME=thinkingcap-qwen3.8-27b-exl3-5.5bpw
TC_MODEL=/home/<user>/models/bottlecapai/ThinkingCap-Qwen3.8-27B-EXL3-5.5bpw
# Last main revision before PR #128: its serve-qwen38-exl3.sh is the base Qwen3.8 EXL3 launcher.
BASE_REV=41fea40
MODE=${1:-promote}
# A launcher is "ThinkingCap" if it serves the TC name or points at the TC checkpoint/arm.
is_tc_launcher() { grep -qE "$TC_NAME|$TC_MODEL|tc38-55-mtp-262k-vision" "$1"; }

if [ "$MODE" = rollback ]; then
  [ -f "$B" ] || { echo "no backup at $B; recover it with: git -C $ROOT show $BASE_REV:configs/msi/serve-qwen38-exl3.sh > $B"; exit 1; }
  if is_tc_launcher "$B"; then echo "REFUSING: $B is itself a ThinkingCap launcher, not the base one; restore from git: git -C $ROOT show $BASE_REV:configs/msi/serve-qwen38-exl3.sh > $B"; exit 1; fi
  cp "$B" "$L"; echo "restored pre-ThinkingCap launcher from $B"
else
  for f in "$SRC" "$ARM"; do [ -f "$f" ] || { echo "missing $f (is the main checkout on a revision that has the tc38 arm?)"; exit 1; }; done
  if grep -q $'\r' "$ARM"; then echo "$ARM contains CR line endings; run: sed -i 's/\\r\$//' $ARM"; exit 1; fi
  # shellcheck disable=SC1090
  MODEL_DIR=$(. "$ARM"; echo "$MODEL_DIR")
  [ -f "$MODEL_DIR/config.json" ] || { echo "no checkpoint at $MODEL_DIR (run convert-run.sh)"; exit 1; }
  # Only snapshot the live launcher as the pre-ThinkingCap backup if it really is the base
  # one; a ThinkingCap launcher (e.g. the sed-patched runtime copy) must never become $B,
  # or rollback would restore ThinkingCap and the base checkpoint would be unreachable.
  if [ ! -f "$B" ]; then
    if is_tc_launcher "$L"; then
      echo "no backup at $B and the live launcher is already ThinkingCap; recovering the base launcher from git $BASE_REV"
      git -C "$ROOT" show "$BASE_REV:configs/msi/serve-qwen38-exl3.sh" | sed 's/\r$//' > "$B" || { echo "git recovery failed"; rm -f "$B"; exit 1; }
    else
      cp "$L" "$B"
    fi
  fi
  is_tc_launcher "$B" && { echo "REFUSING: backup $B is a ThinkingCap launcher; fix it before promoting (git -C $ROOT show $BASE_REV:configs/msi/serve-qwen38-exl3.sh > $B)"; exit 1; }
  sed 's/\r$//' "$SRC" > "$L"; chmod +x "$L"
  echo "installed $SRC -> $L (backup: $B)"
  # A temporary rollback leaves QWEN38_EXL3_ARM_ENV in the user manager; the installed
  # launcher honors it, so clear it or this promote would silently keep serving the base arm.
  systemctl --user unset-environment QWEN38_EXL3_ARM_ENV
fi
bash -n "$L"
systemctl --user restart qwen38-exl3.service
for i in $(seq 1 40); do curl -s -m 3 -o /dev/null -w '%{http_code}' "$BRIDGE/health" | grep -q 200 && break; sleep 5; done
curl -s -m 5 "$BRIDGE/health"; echo
models=$(curl -s -m 5 "$BRIDGE/v1/models")
echo "$models" | head -c 200; echo
if [ "$MODE" = rollback ]; then
  echo "$models" | grep -q "$TC_NAME" && { echo "FAIL: ThinkingCap name still served after rollback"; exit 1; }
  echo "$models" | grep -q '"qwen3.8-27b-exl3-5.5bpw"' || { echo "FAIL: base EXL3 name not served after rollback"; exit 1; }
  echo "rollback verified: base checkpoint served"
else
  echo "$models" | grep -q "$TC_NAME" || { echo "FAIL: $TC_NAME not in /v1/models (ARM_ENV override still set? wrong launcher?)"; exit 1; }
  echo "promote verified: $TC_NAME served"
fi
CHAT_NAME=$TC_NAME; [ "$MODE" = rollback ] && CHAT_NAME=qwen3.8-27b-exl3-5.5bpw
curl -s -m 120 "$BRIDGE/v1/chat/completions" -H 'content-type: application/json' -d "{\"model\":\"$CHAT_NAME\",\"messages\":[{\"role\":\"user\",\"content\":\"Reply with the single word OK.\"}],\"max_tokens\":100}" | grep -q '"content": *"OK"' || { echo "FAIL: chat on $CHAT_NAME"; exit 1; }
echo "chat OK on $CHAT_NAME"
