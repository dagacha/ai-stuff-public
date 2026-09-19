#!/usr/bin/env bash
# PRODUCTION launcher: Qwen3.8-27B EXL3 5.5bpw on the pinned exllamav3 fork,
# built-in MTP drafting, BF16 vision tower, 262,144-token NVFP4 KV cache.
# This is the canary arm `55-mtp-262k-vision` promoted to the 8101 slot.
#
# Why (2026-09-03): the only lane on this box that serves vision AND
# speculative decoding — vLLM 0.24/0.26/nightly crash on vision+MTP, so the
# vLLM lane has been text-only since July. Measured on this RTX 5090
# (configs/msi/qwen38-exl3-canary/README.md, PR #109):
#   - tool-eval-bench v2.5.1: 90-91 full / 63 Hard Mode (vLLM lane: 91 / 67)
#   - median decode ~198 tok/s (vLLM lane ~107); prefill ~1.4K tok/s (slower)
#   - 28 MP image + 2K decode x3, multi-image, image after 78K text, image
#     inside tool turns: all pass
#   - loads in ~85 s at 26.3 GiB; ~29 GiB with a warm 262K cache
# Trade-off accepted: -4 Hard Mode and slower long-prompt prefill, for
# vision + 2x decode. Prompt/prefix caching is ON in this engine (the vLLM
# lane's TurboQuant KV disabled it).
#
# Serving contract kept from serve-qwen38.sh: thinking on at reasoning_effort
# "low"; temp 0.6 / top_p 0.95 / top_k 20 / min_p 0 (kit defaults); Qwen3 XML
# tool calling with OpenAI tool_calls out; served names keep the old aliases.
# No server-side penalties. Clients send frequency_penalty 0 (at most 0.2):
# on this engine the cumulative freq_p degenerates long generations from ~0.5
# (2026-09-16 addendum in the EXL3 lane report). The 32K client max_tokens
# cap is the loop bound; presence_penalty <= 1.0 is the only safe guard.
#
# Reproduce the engine/kit: configs/msi/qwen38-exl3-canary/prepare-kit.sh
# 55-mtp-262k-vision (pinned kit commit + checked-in patch + venv).
#
# Rollback (vLLM Qwen3.8 lane):
#   systemctl --user disable --now qwen38-exl3.service
#   systemctl --user enable --now qwen38.service
# or: configs/msi/switch-lane.sh qwen38
set -euo pipefail

ARM_ENV=/mnt/c/Users/<user>/dagacha/ai-stuff/configs/msi/qwen38-exl3-canary/55-mtp-262k-vision.env
KIT=${QWEN38_EXL3_KIT:-/mnt/c/Users/<user>/dagacha/Qwen3.8-27B-DFlash2-EXL3-5.0bpw}
# shellcheck disable=SC1090
source "$ARM_ENV"

PYTHON="$VENV_DIR/bin/python"
SERVER="$KIT/tools/serve_openai.py"
MODEL_PATH="$KIT/$MODEL_DIR"
for f in "$PYTHON" "$SERVER" "$MODEL_PATH/config.json"; do
  if [[ ! -e "$f" ]]; then
    printf 'error: missing %s (run prepare-kit.sh 55-mtp-262k-vision)\n' "$f" >&2
    exit 1
  fi
done
if ! "$PYTHON" "$SERVER" --help 2>&1 | grep -q -- '--vision'; then
  printf 'error: deployment-kit patch predates vision support; run prepare-kit.sh\n' >&2
  exit 1
fi

export MAX_JOBS
cd "$KIT"
# Production slot: bind all interfaces on 8101 (the 8100 bridge forwards to
# the Tailscale IP; loopback is not reachable in WSL2 mirrored mode) and
# advertise the canonical name plus the aliases existing clients send.
exec "$PYTHON" -u "$SERVER" \
  --model "$MODEL_PATH" \
  --served_model_name qwen3.8-27b-exl3-5.5bpw qwen3.8-27b-nvfp4 qwen3.8-27b qwen3.6-27b-nvfp4 \
  --host 0.0.0.0 --port 8101 \
  --cache_size "$CONTEXT_SIZE" \
  --grid_size "$GPU_MEM_GB" \
  --cache_quant "$CACHE_QUANT" \
  --draft_model mtp \
  --vision \
  "$@"
