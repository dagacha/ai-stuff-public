#!/usr/bin/env bash
# PRODUCTION launcher: ThinkingCap-Qwen3.8-27B EXL3 5.5bpw (own conversion) on
# the pinned exllamav3 fork, built-in MTP drafting, BF16 vision tower,
# 262,144-token NVFP4 KV cache. Canary arm `tc38-55-mtp-262k-vision` promoted
# to the 8101 slot on 2026-09-24; it replaced the base Qwen3.8-27B checkpoint
# (`55-mtp-262k-vision`, production 2026-09-03 .. 2026-09-24).
#
# Why (2026-09-24): bottlecapai's brief-thinking finetune of the same base.
# Same engine, kit and flags as the base lane; only the checkpoint differs.
# Measured on this RTX 5090
# (benchmarks/lane-assessments/report-msi-thinkingcap-qwen3.8-27b.md):
#   - tool-eval-bench v2.5.1 low: 88 full / 63 Hard Mode (base EXL3: 90 / 63)
#   - realistic xhigh coding prompts, 20K cap: base finished 0/4, ThinkingCap
#     2-3/4 with ~27% fewer tokens; EXL3 decode ~85 tok/s at xhigh (vLLM: 48)
#   - vision check (28 MP x3, multi-image): pass; 26.4 GiB after load
# Trade-off accepted: -2 full-suite at low effort for usable xhigh turns.
# Rollback to the base checkpoint (the unit does not set the variable itself,
# so a bare shell assignment does nothing to the running service):
#   systemctl --user set-environment QWEN38_EXL3_ARM_ENV=/mnt/c/Users/<user>/dagacha/ai-stuff/configs/msi/qwen38-exl3-canary/55-mtp-262k-vision.env
#   systemctl --user restart qwen38-exl3.service
#   (undo: systemctl --user unset-environment QWEN38_EXL3_ARM_ENV; restart)
# Permanent rollback: configs/msi/thinkingcap38-exl3/promote.sh rollback
# (restores the pre-ThinkingCap runtime launcher backup). Re-install this
# launcher to the runtime path: promote.sh (plain copy, no text patching).
# Rebuild the checkpoint: configs/msi/thinkingcap38-exl3/convert-run.sh.
#
# Previous rationale (2026-09-03, base EXL3 lane): the only lane on this box that serves vision AND
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

ARM_ENV=${QWEN38_EXL3_ARM_ENV:-/mnt/c/Users/<user>/dagacha/ai-stuff/configs/msi/qwen38-exl3-canary/tc38-55-mtp-262k-vision.env}
KIT=${QWEN38_EXL3_KIT:-/mnt/c/Users/<user>/dagacha/Qwen3.8-27B-DFlash2-EXL3-5.0bpw}
# Refuse CR line endings before sourcing: a hidden \r on VENV_DIR crash-looped
# production on 2026-09-24 with a misleading "missing .../bin/python" error
# (the repo lives on NTFS and is edited from other machines).
if grep -q $'\r' "$ARM_ENV"; then
  printf 'error: %s has CR line endings; run: sed -i '"'"'s/\\r$//'"'"' %s\n' "$ARM_ENV" "$ARM_ENV" >&2
  exit 1
fi
# shellcheck disable=SC1090
source "$ARM_ENV"

PYTHON="$VENV_DIR/bin/python"
SERVER="$KIT/tools/serve_openai.py"
# MODEL_DIR is absolute for own conversions on the ext4 home volume, or relative to the kit.
case "$MODEL_DIR" in /*) MODEL_PATH="$MODEL_DIR" ;; *) MODEL_PATH="$KIT/$MODEL_DIR" ;; esac
for f in "$PYTHON" "$SERVER" "$MODEL_PATH/config.json"; do
  if [[ ! -e "$f" ]]; then
    printf 'error: missing %s (run prepare-kit.sh 55-mtp-262k-vision, or thinkingcap38-exl3/convert-run.sh)\n' "$f" >&2
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
  --served_model_name thinkingcap-qwen3.8-27b-exl3-5.5bpw qwen3.8-27b-exl3-5.5bpw qwen3.8-27b-nvfp4 qwen3.8-27b qwen3.6-27b-nvfp4 \
  --host 0.0.0.0 --port 8101 \
  --cache_size "$CONTEXT_SIZE" \
  --grid_size "$GPU_MEM_GB" \
  --cache_quant "$CACHE_QUANT" \
  --draft_model mtp \
  --vision \
  "$@"
