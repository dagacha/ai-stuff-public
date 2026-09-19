#!/bin/bash
# Switch the active model lane on the MSI 5090. One lane holds the GPU at a
# time; the 8100 Tailscale bridge serves whichever is up, so clients don't
# change. Usage: switch-lane.sh thinkingcap|qwen38|qwen38-exl3|status
#   thinkingcap  vLLM ThinkingCap-Qwen3.6 (text-only)
#   qwen38       vLLM Qwen3.8 NVFP4 + TurboQuant KV (text-only, 91/67 teb)
#   qwen38-exl3  exllamav3 Qwen3.8 EXL3 5.5bpw + MTP + vision (production since 2026-09-03)
set -euo pipefail

BRIDGE_URL=http://100.<tailscale-ip-1>:8100/health
LANES=(thinkingcap qwen38 qwen38-exl3)
declare -A UNIT=( [thinkingcap]=vllm.service [qwen38]=qwen38.service [qwen38-exl3]=qwen38-exl3.service )

case "${1:-status}" in
  status)
    for lane in "${LANES[@]}"; do
      printf "%-12s %s\n" "$lane" "$(systemctl --user is-active "${UNIT[$lane]}" 2>/dev/null || true)"
    done
    exit 0 ;;
  thinkingcap|qwen38|qwen38-exl3) target=$1 ;;
  *) echo "usage: $0 thinkingcap|qwen38|qwen38-exl3|status" >&2; exit 2 ;;
esac

for lane in "${LANES[@]}"; do
  [ "$lane" = "$target" ] || systemctl --user stop "${UNIT[$lane]}" 2>/dev/null || true
done
sleep 5
systemctl --user start "${UNIT[$target]}"

echo "waiting for $target on the 8100 bridge..."
for i in $(seq 1 60); do
  if curl -s -m 3 -o /dev/null -w "%{http_code}" "$BRIDGE_URL" | grep -q 200; then
    echo "$target is up (bridge healthy)"; exit 0
  fi
  sleep 10
done
echo "TIMEOUT: $target did not become healthy in 10 min" >&2
exit 1
