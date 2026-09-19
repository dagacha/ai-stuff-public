#!/bin/bash
# EXPERIMENT launcher: vision + DFlash speculative decoding on ThinkingCap.
#
# Purpose: vision + MTP crashes vLLM 0.24 AND 0.26 (CUDA illegal memory
# access mid-decode on large vision requests — see serve-thinkingcap.sh
# header). MiaAI-Lab/Qwen3.6-27B-NVFP4-DFlash-DGX-Spark runs the
# same base model with vision enabled + DFlash speculative decoding
# (z-lab/Qwen3.6-27B-DFlash draft, 10 spec tokens) instead of MTP. If that
# combo is stable here, we get vision back without losing spec decode.
#
# Deltas from production serve-thinkingcap.sh:
#   - --kernel-config kept deliberately (0.24-era recipe this experiment was
#     benchmarked with; prod dropped it on 0.27 as untested)
#   - vLLM 0.26 venv (/home/<user>/vllm-0.26-venv), TEST port 8102
#   - no --language-model-only (vision tower loads)
#   - MTP spec-config swapped for DFlash (draft cached in HF hub, 3.3 GB)
#   - max-model-len 40960 + gpu-mem-util 0.90: vision tower (BF16) + draft
#     weights (3.3 GB) leave only ~3.5 GB for KV on the 32 GB 5090 (65536
#     needed 4.02 GiB; vLLM estimated max ~48K — 40960 leaves margin)
#   - VLLM_WSL2_ENABLE_PIN_MEMORY=1: DFlash needs the V2 model runner
#     (draft mixes sliding/full attention), V2 needs UVA/pinned memory,
#     and vLLM disables pinned memory by default under WSL2. Verified
#     pinned-memory async H2D copies work on this driver (2026-08-04).
#   - own log file (vllm-dflash-test.log), separate from production
#
# GPU is exclusive: STOP production first (systemctl --user stop vllm).
# Use vision-dflash-repro.sh to drive the test end-to-end.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
. "$SCRIPT_DIR/common.sh"

export MAX_JOBS=4
export CUDA_NVCC_THREADS=2
export VLLM_WSL2_ENABLE_PIN_MEMORY=1

exec /home/<user>/vllm-0.26-venv/bin/vllm serve "$MSI_THINKINGCAP_MODEL" \
  --host 0.0.0.0 --port 8102 \
  --served-model-name "$MSI_THINKINGCAP_SERVED_NAME" \
  --quantization modelopt \
  --kv-cache-dtype fp8 --max-model-len 40960 \
  --gpu-memory-utilization 0.90 --max-num-seqs "$MSI_MAX_NUM_SEQS" \
  --max-num-batched-tokens "$MSI_MAX_NUM_BATCHED_TOKENS" \
  --enable-auto-tool-choice --tool-call-parser "$MSI_TOOL_CALL_PARSER" \
  --speculative-config '{"method":"dflash","model":"z-lab/Qwen3.6-27B-DFlash","num_speculative_tokens":10}' \
  --kernel-config '{"enable_flashinfer_autotune": false}' \
  --reasoning-parser qwen3 \
  --override-generation-config '{"temperature":0.6,"top_p":0.95,"top_k":20,"min_p":0.0}' \
  "$@" 2>&1 | tee /home/<user>/vllm-dflash-test.log
