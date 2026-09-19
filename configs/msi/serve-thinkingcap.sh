#!/bin/bash
# PRODUCTION launcher for morosystems/ThinkingCap-Qwen3.6-27B-NVFP4 on vLLM
# 0.27.1 (vllm-0.27-venv). Clone of serve-official.sh with the ThinkingCap
# RL finetune (~50% fewer thinking tokens, MTP head preserved in BF16).
#
# CARD-RECIPE PROMOTION 2026-08-13 (backup: serve-thinkingcap.sh.pre-cardrecipe.bak):
# per updated morosystems model card (2026-07-31) + hard-mode A/B (60 -> 67 @131K):
#  - venv 0.24 -> 0.27.1; spec decode mtp n=5 -> qwen3_next_mtp (card says n=3;
#    n=5 promoted 2026-08-13 after ablation: same hard-mode 67, identical
#    per-scenario results, median turn 2.2s vs 2.9s / responsiveness 61 vs 51)
#  - VLLM_ENFORCE_STRICT_TOOL_CALLING=0 (required for spec decode + tool calling)
#  - temp override 0.6 -> 1.0 (BottleCap/Qwen agentic recommendation)
#  - kept fp8 KV to preserve 131K ctx (bf16 KV scores 70 but caps ctx ~57K);
#    card warns fp8 KV scale is uncalibrated - costs TC-74 vs bf16
#  - dropped --kernel-config flashinfer autotune flag (0.24-era, untested on 0.27)
#
# Same served model id (`qwen3.6-27b-nvfp4`) so Pi/gateway clients keep
# working unchanged. MTP n=5 chosen by sweep on 2026-07-22 (quicksort/512tok,
# temp 0): n=2 70.4, n=3 80.5, n=4 83.4, n=5 95.2, n=6 88.5, n=7 96.4 tok/s —
# n=5 ties the peak within noise with less wasted draft compute.
#
# Vision DISABLED again 2026-07-26 (--language-model-only restored): three
# CUDA illegal-memory-access engine crashes, all mid-decode on large vision
# requests (~12-15K prompt tokens) with MTP spec decode active. The third
# crash happened after --async-scheduling was already removed, so the trigger
# is vision + MTP in vLLM 0.24 itself. Chose to keep MTP (~92 tok/s) and drop
# vision rather than the reverse. To re-try vision later: remove
# --language-model-only AND drop --speculative-config. Upgrading vLLM does
# NOT help: the crash reproduced on 0.26 and on nightly >0.27 (2026-08-13,
# see benchmarks/lane-assessments/report-msi-nemotron-3.5-lightning-30b.md).
#
# --async-scheduling also removed 2026-07-26 (first mitigation attempt;
# keeping it off — it didn't fix the crash but is the least-hardened path).
#
# Rollback: point vllm.service ExecStart back to serve-official.sh
# (daemon-reload + restart).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
. "$SCRIPT_DIR/common.sh"

export MAX_JOBS=4
export CUDA_NVCC_THREADS=2
export VLLM_ENFORCE_STRICT_TOOL_CALLING=0

exec /home/<user>/vllm-0.27-venv/bin/vllm serve "$MSI_THINKINGCAP_MODEL" \
  --host 0.0.0.0 --port "$MSI_INTERNAL_PORT" \
  --served-model-name "$MSI_THINKINGCAP_SERVED_NAME" \
  --language-model-only \
  --quantization modelopt \
  --kv-cache-dtype fp8 --max-model-len "$MSI_MAX_MODEL_LEN" \
  --gpu-memory-utilization "$MSI_GPU_MEMORY_UTILIZATION" --max-num-seqs "$MSI_MAX_NUM_SEQS" \
  --max-num-batched-tokens "$MSI_MAX_NUM_BATCHED_TOKENS" \
  --enable-auto-tool-choice --tool-call-parser "$MSI_TOOL_CALL_PARSER" \
  --speculative-config '{"method":"qwen3_next_mtp","num_speculative_tokens":5}' \
  --reasoning-parser qwen3 \
  --override-generation-config '{"temperature":1.0,"top_p":0.95,"top_k":20,"min_p":0.0}' \
  "$@" 2>&1 | tee -a /home/<user>/vllm.log
