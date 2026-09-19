#!/usr/bin/env bash
# Serve a vision-enabled canary arm on 8102 with production stopped, run
# vision-check.py against it, tear the server down, restore production.
#   bash vision-arm-run.sh [55-mtp-262k-vision]
set -uo pipefail
ARM=${1:-55-mtp-262k-vision}
HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
PY=/home/<user>/qwen38-exl3-venv/bin/python
OUT=~/runs; mkdir -p "$OUT"
SERVER_LOG=$OUT/qwen38-exl3-$ARM-server.log

# shellcheck source=production-units.sh
source "$HERE/production-units.sh"
ACTIVE=$(active_production_units)
echo "active production: ${ACTIVE:-none}"
SERVER_PID=""
cleanup() {
  if [ -n "$SERVER_PID" ] && kill -0 "$SERVER_PID" 2>/dev/null; then
    echo "stopping canary server $SERVER_PID"; kill "$SERVER_PID"; sleep 5
    kill -9 "$SERVER_PID" 2>/dev/null
  fi
  for s in $ACTIVE; do echo "restoring $s"; systemctl --user start "$s"; done
}
trap cleanup EXIT
for s in $ACTIVE; do systemctl --user stop "$s"; done
sleep 5

bash "$HERE/run-arm.sh" "$ARM" > "$SERVER_LOG" 2>&1 &
SERVER_PID=$!
echo "canary server pid $SERVER_PID, log $SERVER_LOG"
up=0
for i in $(seq 1 120); do
  if curl -fsS --max-time 2 http://127.0.0.1:8102/health >/dev/null 2>&1; then
    echo "server healthy after ~$((i*5))s"; up=1; break
  fi
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    echo "server exited during load"; tail -n 30 "$SERVER_LOG"; exit 1
  fi
  sleep 5
done
if [ "$up" != 1 ]; then
  echo "server not healthy after 10 min; aborting (production restored by trap)"
  tail -n 30 "$SERVER_LOG"; exit 1
fi
nvidia-smi --query-gpu=memory.used --format=csv,noheader
CHECK=${CHECK_SCRIPT:-vision-check.py}
TAG=${CHECK%.py}
# shellcheck disable=SC2086
$PY -u "$HERE/$CHECK" --json "$OUT/qwen38-exl3-$ARM-$TAG.json" ${CHECK_ARGS:-} 2>&1 | tee "$OUT/qwen38-exl3-$ARM-$TAG.log"
RC=${PIPESTATUS[0]}
nvidia-smi --query-gpu=memory.used --format=csv,noheader
echo "===== done rc=$RC"
exit "$RC"
