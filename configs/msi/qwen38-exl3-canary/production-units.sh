#!/usr/bin/env bash
# Shared by the canary runners: which systemd --user units hold the GPU in
# production. Every runner stops the active ones before loading a canary and
# restores them on exit. Keep in sync with configs/msi/switch-lane.sh (plus
# any other GPU-resident unit on the box, e.g. the llama.cpp Gemma lane).
#   source production-units.sh; ACTIVE=$(active_production_units)
PRODUCTION_UNITS_RE='^(qwen38|qwen38-exl3|vllm|gemma)\.service$'

active_production_units() {
  systemctl --user list-units --type=service --state=active --no-pager --plain \
    | awk '{print $1}' | grep -E "$PRODUCTION_UNITS_RE" || true
}
