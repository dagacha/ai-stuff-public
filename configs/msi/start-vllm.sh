#!/bin/bash
# Manual WSL launcher for the rollback / AEON path.
# Keeps the bridge and model choices aligned with the shared MSI constants.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
. "$SCRIPT_DIR/common.sh"

PUBLIC_PORT="$MSI_PUBLIC_PORT"
INTERNAL_PORT="$MSI_INTERNAL_PORT"
UPSTREAM_IP="$MSI_BRIDGE_UPSTREAM_HOST"

# Start the forwarder in background (Python stdlib only — survives without socat installed).
python3 "$SCRIPT_DIR/tcp-forward.py" "$PUBLIC_PORT" "$UPSTREAM_IP" "$INTERNAL_PORT" &
FWD_PID=$!
trap "kill $FWD_PID 2>/dev/null || true" EXIT

# vLLM in foreground (keeps the WSL session alive).
exec ~/vllm-venv/bin/vllm serve "$MSI_ROLLBACK_MODEL" \
  --host 0.0.0.0 --port "$INTERNAL_PORT" --served-model-name "$MSI_ROLLBACK_SERVED_NAME" \
  --kv-cache-dtype fp8 --max-model-len "$MSI_MAX_MODEL_LEN" \
  --gpu-memory-utilization "$MSI_GPU_MEMORY_UTILIZATION" --max-num-seqs "$MSI_MAX_NUM_SEQS" \
  --max-num-batched-tokens "$MSI_MAX_NUM_BATCHED_TOKENS" --language-model-only \
  --enable-auto-tool-choice --tool-call-parser "$MSI_TOOL_CALL_PARSER" 2>&1 | tee ~/vllm.log
