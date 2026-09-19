#!/bin/bash
# Run vLLM in the foreground on the internal port (8101).
# Rollback / AEON path only; the public bridge and production service stay separate.
#
# Usage:
#   bash serve-vllm.sh                                         # defaults (AEON rollback)
#   bash serve-vllm.sh Qwen/Qwen3-32B-Instruct qwen3-32b qwen3_xml   # full override
#   bash serve-vllm.sh Qwen/Qwen3-32B-Instruct qwen3-32b qwen3_xml --max-model-len 32768
#
# ⚠️ Extra vLLM flags (after the three positional args) are passed through verbatim.
#    If you pass a flag without supplying all three positional args, the flag will
#    be consumed as MODEL instead of passed through. E.g.:
#      serve-vllm.sh --max-model-len 32768   # WRONG — --max-model-len becomes MODEL
#      serve-vllm.sh . . . --max-model-len 32768  # RIGHT — '.' preserves defaults
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
. "$SCRIPT_DIR/common.sh"

MODEL="${1:-$MSI_ROLLBACK_MODEL}"
SERVED_NAME="${2:-$MSI_ROLLBACK_SERVED_NAME}"
PARSER="${3:-$MSI_TOOL_CALL_PARSER}"
# Drop the three positional args we've consumed; anything left is passed to vLLM.
shift $(( $# >= 3 ? 3 : $# ))

~/vllm-venv/bin/vllm serve "$MODEL" \
  --host 0.0.0.0 --port "$MSI_INTERNAL_PORT" \
  --served-model-name "$SERVED_NAME" \
  --kv-cache-dtype fp8 --max-model-len "$MSI_MAX_MODEL_LEN" \
  --gpu-memory-utilization "$MSI_GPU_MEMORY_UTILIZATION" --max-num-seqs "$MSI_MAX_NUM_SEQS" \
  --max-num-batched-tokens "$MSI_MAX_NUM_BATCHED_TOKENS" --language-model-only \
  --enable-auto-tool-choice --tool-call-parser "$PARSER" \
  "$@" 2>&1 | tee ~/vllm.log
