#!/bin/bash
# EXPERIMENT launcher: Qwen3.8-27B NVFP4 @ 131K context fit test.
#
# Question under test: do the 131K-ctx KV blocks fit next to the ~24.6 GiB
# NVFP4 weights on the 32 GB 5090? Hybrid (gated-delta-net) arch means only
# the sparse full-attention layers hold growing KV, so per-token KV should
# be far below dense-27B numbers — but nobody has measured it on this box.
#
# Config choices (see PR discussion / Qwen3.8 recipe):
#   - vLLM 0.27.1 venv, TEST port 8102, own log file
#   - --language-model-only: shed the vision tower (~1-2 GiB back)
#   - fp8 KV + 131072 max-model-len: the non-negotiable target
#   - --max-num-seqs 16 explicit: hybrid layers fail startup sizing
#     otherwise ("Mamba cache blocks" error, seen on Nemotron + 3.6/0.27)
#   - gpu-mem-util 0.92 (prod uses 0.90; margin is tight here)
#   - tool parser qwen3_coder per the official 3.8 recipe (NOT qwen3_xml)
#   - no speculative decoding: MTP on this arch needs the 0.27.2/nightly
#     gated-delta-net fix; spec decode is a later experiment
#
# PASS = server reaches "Application startup complete" and the startup log
# reports enough KV blocks for 131072 tokens. FAIL = OOM / block shortfall.
# GPU is exclusive: STOP production first (systemctl --user stop vllm).
set -euo pipefail

export MAX_JOBS=4
export CUDA_NVCC_THREADS=2
export VLLM_MEMORY_PROFILER_ESTIMATE_CUDAGRAPHS=0
# Attempt 7 (0.27.1, util 0.945, seqs 1, batch 512): FAIL by 130 MiB
# (4.03/4.16 GiB, est. max 127K). Attempt 8: nightly venv (0.27.2rc1) —
# carries the GDN fixes and is the MTP prerequisite anyway.
# Attempt 11 (nightly2 venv, torch 2.13/fi 0.6.16 JIT): PASS — 6.24 GiB KV,
# 189,326 tokens, 1.44x @131K, 36.1 t/s single-stream (graphs on).
# Attempt 12 (+ MTP n=3): FAIL — KV need jumps to 5.03 GiB, available drops
# to 3.16 (draft KV + MTP weights/graphs); est. max 72K. MTP and 131K are
# mutually exclusive on this GPU in vLLM; llama.cpp MTP GGUF is the
# both-at-once candidate.
export VLLM_WSL2_ENABLE_PIN_MEMORY=1
# flashinfer JIT path needs nvcc (no matching flashinfer-cubin for 0.6.16)
export PATH="/usr/local/cuda/bin:$PATH"
# Attempt 1 (util 0.92, seqs 16): FAIL — 131K needs 4.16 GiB KV, only 2.6
# available (weights 23.31 GiB; est. max len 79968). Squeeze levers below.
# Attempt 2 (util 0.95): FAIL — WSL2 leaves only 30.12/31.84 GiB free.
# Attempt 3 (util 0.94, seqs 4, batch 2048, enforce-eager): FITS —
# 5.96 GiB KV = 186,815 tokens (1.43x @131K) — but eager decode is 8.8 t/s
# (kernel-launch bound on the GDN path). Attempt 4: graphs back on; the
# ~1.8 GiB KV surplus absorbs the 0.47 GiB graph reservation.

exec /home/<user>/vllm-nightly2-venv/bin/vllm serve Inferact/Qwen3.8-27B-NVFP4 \
  --host 0.0.0.0 --port 8102 \
  --served-model-name qwen3.8-27b-nvfp4-test \
  --language-model-only \
  --kv-cache-dtype fp8 --max-model-len 131072 \
  --gpu-memory-utilization 0.945 --max-num-seqs 1 \
  --max-num-batched-tokens 512 \
  --compilation-config '{"cudagraph_capture_sizes":[1,2,4]}' \
  --enable-auto-tool-choice --tool-call-parser qwen3_coder \
  --reasoning-parser qwen3 \
  --override-generation-config '{"temperature":1.0,"top_p":0.95,"top_k":20,"min_p":0.0}' \
  "$@" 2>&1 | tee /home/<user>/vllm-qwen38-131k-test.log
