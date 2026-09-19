#!/usr/bin/env bash
# ROLLBACK LANE since 2026-09-03 (was production 2026-08-17 .. 2026-09-03):
# production moved to serve-qwen38-exl3.sh / qwen38-exl3.service (EXL3 5.5bpw
# + MTP + vision on exllamav3). This lane keeps the best Hard Mode score
# (67 vs 63) and faster prefill, but is text-only. `switch-lane.sh qwen38`
# brings it back.
#
# Qwen3.8-27B NVFP4 on vLLM with TurboQuant KV,
# thinking enabled, MTP-3, and the native 262,144-token context window.
#
# Promoted 2026-08-17 after tool-eval-bench v2.5.1 validation on this RTX 5090:
#   - low thinking: 91/100 full suite (126/138), 67/100 Hard Mode (3/3 stable)
#   - xhigh thinking: 91/100 full suite (126/138), 63/100 Hard Mode
#   - no-thinking recipe: 86/100 full suite, 67/100 Hard Mode
# VulcanBench v0.6.0-16-gbc85af6, no judges, concurrency 1 (2026-08-18):
#   - v1: 50/52; v1-carbyne: 18/22; v3 frontier-hard: 13/23
# Low-effort thinking is the production default because it preserves planning,
# recovery, multi-turn state, and structured-output quality. Clients may still
# override reasoning_effort per request or use none to disable thinking.
#
# The conservative single-sequence/MNBT=1024 profile is the exact stable setup
# used for the 256K benchmarks. Dynamic MTP uses three draft tokens at batch
# sizes 1-4 and forces PIECEWISE CUDA graphs in vLLM 0.27.1.
#
# Served-name order makes Qwen3.8 the canonical response/metrics name while
# retaining the old qwen3.6 alias so existing Pi/gateway clients keep working.
#
# Do NOT add repetition/presence/frequency penalties to the generation config:
# A/B'd 2026-08-22 after a repetition-loop incident — every penalty costs 5-6
# full-suite teb points as a server-wide default (presence 1.0 also regresses
# TC-58 to CRITICAL). Loop protection is client-side: frequency_penalty 0.5 in
# the coding agent's request params. See the loop-incident section of
# benchmarks/lane-assessments/report-msi-qwen3.8-27b-131k.md.
#
# Rollback:
#   systemctl --user disable --now qwen38.service
#   systemctl --user enable --now vllm.service
set -euo pipefail

MODEL_DIR=/home/<user>/models/unsloth/Qwen3.8-27B-NVFP4
VLLM_BIN=/home/<user>/unsloth-nvfp4-env/bin/vllm

if [[ ! -x "$VLLM_BIN" ]]; then
  printf 'error: vLLM executable not found: %s\n' "$VLLM_BIN" >&2
  exit 1
fi
if [[ ! -f "$MODEL_DIR/config.json" ]]; then
  printf 'error: Qwen3.8 checkpoint not found: %s\n' "$MODEL_DIR" >&2
  exit 1
fi

export MAX_JOBS=4
export CUDA_NVCC_THREADS=2
export PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True
# vLLM 0.27.1's strict validator rejects tool-call forms that the qwen3_xml
# parser accepts with this Qwen3.8 MTP recipe, so keep parser validation permissive.
export VLLM_ENFORCE_STRICT_TOOL_CALLING=0

exec "$VLLM_BIN" serve "$MODEL_DIR" \
  --host 0.0.0.0 \
  --port 8101 \
  --served-model-name qwen3.8-27b-nvfp4 qwen3.8-27b qwen3.6-27b-nvfp4 \
  --max-model-len 262144 \
  --kv-cache-dtype turboquant_4bit_nc \
  --kv-cache-memory-bytes 5800000000 \
  --max-num-seqs 1 \
  --max-num-batched-tokens 1024 \
  --gpu-memory-utilization 0.93 \
  --attention-config.flash_attn_version=2 \
  --speculative-config '{"method":"mtp","num_speculative_tokens":3,"num_speculative_tokens_per_batch_size":[[1,4,3]]}' \
  --enable-auto-tool-choice \
  --tool-call-parser qwen3_xml \
  --reasoning-parser qwen3 \
  --default-chat-template-kwargs '{"enable_thinking":true,"reasoning_effort":"low"}' \
  --override-generation-config '{"temperature":0.6,"top_p":0.95,"top_k":20,"min_p":0.0}' \
  "$@"
