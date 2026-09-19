#!/usr/bin/env bash
set -euo pipefail

ARM=${1:-}
case "$ARM" in
  mtp|dflash2|55-mtp-262k|55-dflash2-131k|55-dflash2-160k|55-mtp-262k-vision|55-dflash2-160k-vision) ;;
  *) echo "usage: $0 mtp|dflash2|55-mtp-262k|55-dflash2-131k|55-dflash2-160k|55-mtp-262k-vision|55-dflash2-160k-vision" >&2; exit 2 ;;
esac

ROOT=/mnt/c/Users/<user>/dagacha/ai-stuff
CONFIG="$ROOT/configs/msi/qwen38-exl3-canary/$ARM.env"
# shellcheck disable=SC1090
source "$CONFIG"
OUT=/home/<user>/runs/qwen38-exl3-$ARM-benchmark-v2.json
mkdir -p /home/<user>/runs
ENDPOINT_HOST=$HOST
if [ "$ENDPOINT_HOST" = 0.0.0.0 ]; then ENDPOINT_HOST=127.0.0.1; fi

MODEL=$SERVED_MODEL_NAME
if [[ "$ARM" == 55-* ]]; then
  TARGET_NOTE="EXL3 5.5bpw AWQ-smoothed target"
else
  TARGET_NOTE="EXL3 3.5bpw target"
fi

if [ "$DRAFT" = mtp ]; then MTP_NOTE=on; else MTP_NOTE=off; fi

if [ "$CONTEXT_SIZE" -ge 196610 ]; then
  QUALITY_ARGS=(--full)
elif [ "$CONTEXT_SIZE" -ge 150002 ]; then
  QUALITY_ARGS=(--needle-lengths 8192,65536,131072,150000
                --code-lengths 65536,131072)
else
  QUALITY_ARGS=(--needle-lengths 8192,65536,120000
                --code-lengths 65536,120000)
fi

python3 "$ROOT/benchmarks/throughput/benchmark_v2.py" all \
  --url "http://$ENDPOINT_HOST:$PORT/v1/chat/completions" \
  --model "$MODEL" \
  --out "$OUT" \
  --label "qwen38-exl3-$ARM-nvfp4" \
  "${QUALITY_ARGS[@]}" \
  --warmups 2 \
  --repetitions 5 \
  --output-tokens 400 \
  --concurrency 1 \
  --server-max-num-seqs 1 \
  --mtp "$MTP_NOTE" \
  --notes "RTX 5090; $TARGET_NOTE; $DRAFT drafter; NVFP4 KV; $CONTEXT_SIZE context"
