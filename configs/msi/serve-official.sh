#!/bin/bash
# PRODUCTION launcher for the official nvidia/Qwen3.6-27B-NVFP4 on vLLM 0.24.0.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
. "$SCRIPT_DIR/common.sh"

export MAX_JOBS=4
export CUDA_NVCC_THREADS=2

exec /home/<user>/vllm-official-venv/bin/vllm serve "$MSI_OFFICIAL_MODEL" \
  --host 0.0.0.0 --port "$MSI_INTERNAL_PORT" \
  --served-model-name "$MSI_OFFICIAL_SERVED_NAME" \
  --quantization modelopt \
  --kv-cache-dtype fp8 --max-model-len "$MSI_MAX_MODEL_LEN" \
  --gpu-memory-utilization "$MSI_GPU_MEMORY_UTILIZATION" --max-num-seqs "$MSI_MAX_NUM_SEQS" \
  --max-num-batched-tokens "$MSI_MAX_NUM_BATCHED_TOKENS" --language-model-only \
  --enable-auto-tool-choice --tool-call-parser "$MSI_TOOL_CALL_PARSER" \
  --speculative-config '{"method":"mtp","num_speculative_tokens":4}' \
  --kernel-config '{"enable_flashinfer_autotune": false}' \
  "$@" 2>&1 | tee /home/<user>/vllm.log
