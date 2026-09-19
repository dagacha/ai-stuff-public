#!/bin/bash
# EXPERIMENT launcher: vision + MTP on vLLM NIGHTLY (>0.26).
#
# Replica of the 2026-07-23 production vision config (vision enabled, MTP
# n=5, 131K context) that crashed with CUDA illegal-memory-access on vLLM
# 0.24 and 0.26 (0.24 details: serve-thinkingcap.sh header; 0.26 + this
# nightly repro: benchmarks/lane-assessments/report-msi-nemotron-3.5-lightning-30b.md).
# Only deltas: nightly venv (/home/<user>/vllm-nightly-venv), TEST port
# 8102, own log file. --kernel-config is kept deliberately: this replica
# was benchmarked with the 0.24-era recipe intact (prod dropped the flag
# on 0.27 as untested; changing it here would invalidate the A/B).
#
# VLLM_WSL2_ENABLE_PIN_MEMORY=1: harmless on the V1 runner, required if
# nightly routes this config to the V2 model runner (V2 needs UVA, which
# vLLM disables by default under WSL2 — pinned copies verified working on
# this driver 2026-08-04, see serve-thinkingcap-dflash-test.sh).
#
# GPU is exclusive: STOP production first (systemctl --user stop vllm).
# Drive with vision-dflash-repro.sh (same repro works — it targets :8102).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
. "$SCRIPT_DIR/common.sh"

export MAX_JOBS=4
export CUDA_NVCC_THREADS=2
export VLLM_WSL2_ENABLE_PIN_MEMORY=1

exec /home/<user>/vllm-nightly-venv/bin/vllm serve "$MSI_THINKINGCAP_MODEL" \
  --host 0.0.0.0 --port 8102 \
  --served-model-name "$MSI_THINKINGCAP_SERVED_NAME" \
  --quantization modelopt \
  --kv-cache-dtype fp8 --max-model-len "$MSI_MAX_MODEL_LEN" \
  --gpu-memory-utilization "$MSI_GPU_MEMORY_UTILIZATION" --max-num-seqs "$MSI_MAX_NUM_SEQS" \
  --max-num-batched-tokens "$MSI_MAX_NUM_BATCHED_TOKENS" \
  --enable-auto-tool-choice --tool-call-parser "$MSI_TOOL_CALL_PARSER" \
  --speculative-config '{"method":"mtp","num_speculative_tokens":5}' \
  --kernel-config '{"enable_flashinfer_autotune": false}' \
  --reasoning-parser qwen3 \
  --override-generation-config '{"temperature":0.6,"top_p":0.95,"top_k":20,"min_p":0.0}' \
  "$@" 2>&1 | tee /home/<user>/vllm-vision-mtp-nightly-test.log
