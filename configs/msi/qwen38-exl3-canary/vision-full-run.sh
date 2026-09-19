#!/usr/bin/env bash
# Full measurement of a vision-enabled canary arm with production stopped:
# vision-check (incl. multi-image), benchmark-arm (needles/code/tools/speed),
# tool-eval-bench full suite and Hard Mode x3 — the same teb invocation the
# 2026-09-01 text-only arms used (seed 42, temp 0.6, reasoning_effort low).
# Restores production on exit.
#   bash vision-full-run.sh 55-mtp-262k-vision [55-dflash2-160k-vision ...]
set -uo pipefail
HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
PY=/home/<user>/qwen38-exl3-venv/bin/python
TEB=/home/<user>/teb-venv/bin/tool-eval-bench
OUT=~/runs; mkdir -p "$OUT"

# shellcheck source=production-units.sh
source "$HERE/production-units.sh"
ACTIVE=$(active_production_units)
echo "active production: ${ACTIVE:-none}"
SERVER_PID=""
stop_server() {
  if [ -n "$SERVER_PID" ] && kill -0 "$SERVER_PID" 2>/dev/null; then
    echo "stopping canary server $SERVER_PID"
    pkill -TERM -P "$SERVER_PID" 2>/dev/null; kill "$SERVER_PID" 2>/dev/null; sleep 8
    pkill -KILL -P "$SERVER_PID" 2>/dev/null; kill -9 "$SERVER_PID" 2>/dev/null
  fi
  SERVER_PID=""
}
cleanup() {
  stop_server
  for s in $ACTIVE; do echo "restoring $s"; systemctl --user start "$s"; done
}
trap cleanup EXIT
for s in $ACTIVE; do systemctl --user stop "$s"; done
sleep 5

OVERALL=0
for ARM in "$@"; do
  echo "===== arm $ARM"
  # shellcheck disable=SC1090
  source "$HERE/$ARM.env"
  SERVER_LOG=$OUT/qwen38-exl3-$ARM-server.log
  bash "$HERE/run-arm.sh" "$ARM" > "$SERVER_LOG" 2>&1 &
  SERVER_PID=$!
  up=0
  for i in $(seq 1 120); do
    if curl -fsS --max-time 2 "http://127.0.0.1:$PORT/health" >/dev/null 2>&1; then
      echo "server healthy after ~$((i*5))s"; up=1; break
    fi
    if ! kill -0 "$SERVER_PID" 2>/dev/null; then break; fi
    sleep 5
  done
  if [ "$up" != 1 ]; then
    echo "server failed to come up"; tail -n 30 "$SERVER_LOG"; OVERALL=1; stop_server; continue
  fi
  nvidia-smi --query-gpu=memory.used --format=csv,noheader

  echo "----- vision-check"
  $PY -u "$HERE/vision-check.py" --base_url "http://127.0.0.1:$PORT" \
      --json "$OUT/qwen38-exl3-$ARM-vision-check.json" 2>&1 | tee "$OUT/qwen38-exl3-$ARM-vision-check.log"
  [ "${PIPESTATUS[0]}" = 0 ] || OVERALL=1

  echo "----- benchmark-arm"
  bash "$HERE/benchmark-arm.sh" "$ARM" > "$OUT/qwen38-exl3-$ARM-benchmark-v2.log" 2>&1
  rc=$?; echo "benchmark-arm rc=$rc"; [ "$rc" = 0 ] || OVERALL=1
  grep -E '^\[(speed|tool|needle|code)\]' "$OUT/qwen38-exl3-$ARM-benchmark-v2.log" | grep -vE 'PASS$' ; grep -E '^\[speed\]' "$OUT/qwen38-exl3-$ARM-benchmark-v2.log"

  echo "----- tool-eval-bench full"
  (cd "$OUT" && $TEB run --model "$SERVED_MODEL_NAME" --backend vllm \
      --base-url "http://127.0.0.1:$PORT" \
      --temperature 0.6 --top-p 0.95 --top-k 20 --min-p 0.0 --seed 42 \
      --backend-kwargs '{"reasoning_effort":"low"}' \
      --label "qwen38-exl3-$ARM-teb-v251-low-full" \
      --json-file "$OUT/qwen38-exl3-$ARM-teb-v251-low-full.json" --no-live \
      > "$OUT/qwen38-exl3-$ARM-teb-v251-low-full.log" 2>&1)
  rc=$?; echo "teb full rc=$rc"; [ "$rc" = 0 ] || OVERALL=1
  grep -o '"event": "benchmark_complete".*' "$OUT/qwen38-exl3-$ARM-teb-v251-low-full.log" | tail -1

  echo "----- tool-eval-bench hard mode x3"
  (cd "$OUT" && $TEB run --model "$SERVED_MODEL_NAME" --backend vllm \
      --base-url "http://127.0.0.1:$PORT" \
      --temperature 0.6 --top-p 0.95 --top-k 20 --min-p 0.0 --seed 42 \
      --backend-kwargs '{"reasoning_effort":"low"}' \
      --hardmode-only --trials 3 \
      --label "qwen38-exl3-$ARM-teb-v251-low-hm3" \
      --json-file "$OUT/qwen38-exl3-$ARM-teb-v251-low-hm3.json" --no-live \
      > "$OUT/qwen38-exl3-$ARM-teb-v251-low-hm3.log" 2>&1)
  rc=$?; echo "teb hard mode rc=$rc"; [ "$rc" = 0 ] || OVERALL=1
  grep -o '"event": "benchmark_complete".*' "$OUT/qwen38-exl3-$ARM-teb-v251-low-hm3.log" | tail -1

  nvidia-smi --query-gpu=memory.used --format=csv,noheader
  stop_server
  sleep 5
done
echo "===== done rc=$OVERALL"
exit "$OVERALL"
