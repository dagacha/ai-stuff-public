#!/bin/bash
# PILOT launcher for meta-models/Muse-Glimmer-30B (Unsloth GGUF) on llama.cpp
# (MSI / RTX 5090 box). NOT production — runs alongside (not instead of) the
# vLLM ThinkingCap lane; both target the one GPU, so stop the vLLM units
# first, same rule as the Gemma stack (see gemma4-qat-llamacpp.md):
#   sudo systemctl stop vllm.service
#
# Why llama.cpp and not vLLM: the only vLLM-servable artifacts are BF16
# (~60 GB, doesn't fit) and NVFP4 (flagged "DOES NOT WORK FOR NOW" by
# Unsloth as of 2026-08-10). Revisit the vLLM lane when NVFP4 lands.
#
# Requires llama.cpp with Muse Glimmer support (upstream PR #26841) — pull +
# rebuild ~/llama.cpp before first run; the existing build-mtp binaries
# predate the arch. Same cmake flags as gemma4-qat-llamacpp.md.
#
# DFlash speculative decoding uses the first-party drafter, shipped in the
# same Unsloth GGUF repo as `dflash-kquant.gguf` (1.6 GB). Meta claims 3.1x
# on a 5090; measure, don't trust. To run without speculation, comment out
# the -md/--draft-* lines.
#
# Vision is native (mmproj). Unlike the vLLM lane there is no known
# vision+speculation crash on llama.cpp — but that's exactly what the
# pilot's vision soak test is for before trusting it.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
. "$SCRIPT_DIR/common.sh"

MODEL_DIR="$HOME/models/muse-glimmer-30b"
# UD-Q4_K_XL (15.9 GB) + Q8_0 mmproj (2.1 GB) + dflash drafter (1.6 GB)
# ≈ 19.6 GB weights — headroom for 128K q8_0 KV on 32 GB. For quality
# benchmarking also pull UD-Q6_K_XL (26.3 GB) and rerun the eval suites
# with -c 65536 — see muse-glimmer-pilot-plan.md.
MODEL_GGUF="$MODEL_DIR/Muse-Glimmer-30B-UD-Q4_K_XL.gguf"
MMPROJ_GGUF="$MODEL_DIR/mmproj-Muse-Glimmer-30B-Q8_0.gguf"
DRAFT_GGUF="$MODEL_DIR/dflash-kquant.gguf"

# Download (once):
#   hf download unsloth/Muse-Glimmer-30B-GGUF \
#     --include "*UD-Q4_K_XL*" "mmproj-Muse-Glimmer-30B-Q8_0*" "dflash-kquant*" \
#     --local-dir "$MODEL_DIR"

# Soak-validated build: b811-4dee52f, deployed as build-muse/ on the MSI box
# (the build the pilot report measured). Override LLAMA_BUILD_DIR only for a
# checkout that has Muse Glimmer support (PR #26841) — build-mtp predates it.
LLAMA_BUILD_DIR="${LLAMA_BUILD_DIR:-$HOME/llama.cpp/build-muse}"

# Pilot alias is the real model name, NOT qwen3.6-27b-nvfp4 — the Pi/gateway
# clients must opt in explicitly during the pilot, not be silently switched.
exec "$LLAMA_BUILD_DIR/bin/llama-server" \
  -m "$MODEL_GGUF" \
  --mmproj "$MMPROJ_GGUF" \
  -md "$DRAFT_GGUF" --draft-max 8 --draft-min 1 \
  --alias muse-glimmer-30b \
  --host 0.0.0.0 --port "$MSI_INTERNAL_PORT" \
  -ngl 99 -fa 1 --jinja \
  -c "$MSI_MAX_MODEL_LEN" \
  --cache-type-k q8_0 --cache-type-v q8_0 \
  --parallel "$MSI_MAX_NUM_SEQS" \
  --temp 1.0 --top-p 0.95 --top-k 64 \
  "$@" 2>&1 | tee "$HOME/muse-glimmer.log"
