#!/bin/bash
# Canary launcher: bottlecapai/ThinkingCap-Qwen3.8-27B-NVFP4A4-AWQ on the vLLM
# TurboQuant lane recipe (identical to configs/msi/serve-qwen38.sh except model,
# served name, test port 8102 on loopback). Card says vLLM 0.29 tested; this venv
# is 0.27.1 (the 91/67 baseline lane). If load fails, retry with VLLM_BIN from
# ~/vllm-nightly2-venv (0.27.2rc1).
set -euo pipefail
MODEL_DIR=/home/<user>/models/bottlecapai/ThinkingCap-Qwen3.8-27B-NVFP4A4-AWQ
VLLM_BIN=${VLLM_BIN:-/home/<user>/unsloth-nvfp4-env/bin/vllm}
[[ -x "$VLLM_BIN" ]] || { echo "no vllm at $VLLM_BIN" >&2; exit 1; }
[[ -f "$MODEL_DIR/config.json" ]] || { echo "no checkpoint at $MODEL_DIR" >&2; exit 1; }
export MAX_JOBS=4 CUDA_NVCC_THREADS=2 PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True
export VLLM_ENFORCE_STRICT_TOOL_CALLING=0
exec "$VLLM_BIN" serve "$MODEL_DIR" \
  --host 0.0.0.0 --port 8102 \
  --served-model-name thinkingcap-qwen3.8-27b-nvfp4a4 \
  --max-model-len 262144 \
  --kv-cache-dtype turboquant_4bit_nc \
  --kv-cache-memory-bytes 5800000000 \
  --max-num-seqs 1 --max-num-batched-tokens 1024 \
  --gpu-memory-utilization 0.93 \
  --attention-config.flash_attn_version=2 \
  --speculative-config '{"method":"mtp","num_speculative_tokens":3,"num_speculative_tokens_per_batch_size":[[1,4,3]]}' \
  --enable-auto-tool-choice --tool-call-parser qwen3_xml --reasoning-parser qwen3 \
  --default-chat-template-kwargs '{"enable_thinking":true,"reasoning_effort":"low"}' \
  --override-generation-config '{"temperature":0.6,"top_p":0.95,"top_k":20,"min_p":0.0}' \
  "$@"
