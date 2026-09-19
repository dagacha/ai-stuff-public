#!/bin/bash
# Download + serve NVIDIA-Nemotron-3.5-Lightning-30B-A3B-NVFP4 on vLLM 0.27.1.
# Chosen default launcher per benchmarks/lane-assessments/report-msi-nemotron-3.5-lightning-30b.md
# (vLLM NVFP4, no spec decode — MTP measured 2.4x slower on this model).
# TEST port 8102 (prod ThinkingCap owns 8101); not run under systemd.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
. "$SCRIPT_DIR/common.sh"

V=/home/<user>/vllm-0.27-venv
# pipefail makes a failed download abort here instead of silently serving a
# stale cached snapshot (tail alone would mask the hf exit code).
"$V/bin/hf" download nvidia/NVIDIA-Nemotron-3.5-Lightning-30B-A3B-NVFP4 2>&1 | tail -2
echo "=== download done, starting server ==="
exec "$V/bin/vllm" serve nvidia/NVIDIA-Nemotron-3.5-Lightning-30B-A3B-NVFP4 \
  --host 0.0.0.0 --port 8102 \
  --served-model-name nemotron-3.5-lightning \
  --kv-cache-dtype fp8 \
  --enable-auto-tool-choice \
  --tool-call-parser "$MSI_TOOL_CALL_PARSER" \
  --reasoning-parser qwen3 \
  --gpu-memory-utilization 0.90 \
  --max-model-len "$MSI_MAX_MODEL_LEN" \
  "$@" \
  2>&1 | tee /home/<user>/nemotron-vllm.log
