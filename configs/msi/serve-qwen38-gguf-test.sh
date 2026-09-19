#!/bin/bash
# EXPERIMENT launcher: Qwen3.8-27B unsloth Q4_K_M GGUF @ 131K on llama.cpp
# master (build dir /home/<user>/llama.cpp-qwen38, CUDA sm_120).
#
# Counterpart to serve-qwen38-131k-test.sh: vLLM nightly fits 131K no-spec
# at 36 t/s but MTP + 131K don't coexist there (max ~72K). unsloth GGUF has
# the MTP head baked in; llama.cpp runs it via --spec-type draft-mtp.
# Constraint (unsloth doc): MTP excludes --mmproj and -np>1 — text-only,
# single-stream, matching the Pi workload.
#
# KV quantized to q8_0 both sides to keep 131K cheap next to 17.1 GB weights.
# TEST port 8102. GPU exclusive: stop vllm/qwen38-test first.
#
# A/B outcome (2026-08-14): --reasoning-preserve + teb temp 1.0 scored
# WORSE on hard mode (53 vs 63 @ temp 0.6 without preserve). Best-known
# teb config for this model: temp 0.6, no --reasoning-preserve.
set -euo pipefail

# Quant ladder + KV ablation (2026-08-14, seed 42 temp 0.6, hm = 3 trials):
#   Q4_K_M/q8_0 KV:      full 83 / hm 63  (17.1 GB, 24.4 GiB total)
#   UD-Q4_K_XL/q8_0 KV:  full 86 / hm 67  <- WINNER, ties prod hard-mode
#   Q5_K_M/q8_0 KV:      full 83 / hm 57  (plain 5-bit loses to dynamic 4-bit)
#   Q4_K_M/f16 KV:       hm 60           (KV dtype not the bottleneck; keep q8_0)
MODEL=$(find /home/<user>/.cache/huggingface/hub/models--unsloth--Qwen3.8-27B-GGUF/snapshots -name Qwen3.8-27B-UD-Q4_K_XL.gguf | head -1)

exec /home/<user>/llama.cpp-qwen38/build/bin/llama-server \
  -m "$MODEL" \
  --host 0.0.0.0 --port 8102 \
  --alias qwen3.8-27b-gguf-test \
  -ngl 99 -fa 1 -c 131072 \
  -ctk q8_0 -ctv q8_0 \
  --spec-type draft-mtp --spec-draft-n-max 3 \
  --jinja \
  --temp 1.0 --top-p 0.95 --top-k 20 --min-p 0.0 \
  "$@" 2>&1 | tee /home/<user>/qwen38-gguf-test.log
