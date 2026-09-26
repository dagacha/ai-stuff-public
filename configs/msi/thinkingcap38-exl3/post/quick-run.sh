#!/bin/bash
# Post-promotion checks against LIVE production (8100 bridge), no lane switch:
#  1. benchmark_v2 all --full (needles to 196K, code edits 65K/131K, deterministic tools, decode/prefill speed)
#  2. vision-context-check (image after 40K/100K text, image in tool turns)
#  3. penalty-degeneration-check (freq/rep penalty loop->soup)
#  4. tool-eval full + hm3 at reasoning_effort xhigh (the effort prod actually runs)
set -uo pipefail
R=/home/<user>/runs; ROOT=/mnt/c/Users/<user>/dagacha/ai-stuff; C=$ROOT/configs/msi/qwen38-exl3-canary
PY=/home/<user>/qwen38-exl3-venv/bin/python; TEB=/home/<user>/teb-venv/bin/tool-eval-bench
BRIDGE=http://100.<tailscale-ip-1>:8100; M=thinkingcap-qwen3.8-27b-exl3-5.5bpw
LOG=$R/tc38-post.log; exec >>"$LOG" 2>&1
echo "=== $(date -Is) post-promotion quick set start"
curl -s -m 5 "$BRIDGE/v1/models" | grep -q "$M" || { echo "prod does not serve $M"; exit 1; }

echo "=== $(date -Is) 1/4 benchmark_v2 all --full"
python3 $ROOT/benchmarks/throughput/benchmark_v2.py all \
  --url "$BRIDGE/v1/chat/completions" --model "$M" \
  --out $R/tc38-prod-benchmark-v2.json --label tc38-exl3-55-mtp-262k-vision-prod \
  --full --warmups 2 --repetitions 5 --output-tokens 400 --concurrency 1 --server-max-num-seqs 1 --mtp on \
  --notes "RTX 5090; ThinkingCap-Qwen3.8-27B EXL3 5.5bpw own conversion; mtp drafter; NVFP4 KV; 262144 context; LIVE production via 8100 bridge" \
  > $R/tc38-prod-benchmark-v2.log 2>&1; echo "benchmark_v2 rc=$?"

echo "=== $(date -Is) 2/4 vision-context-check"
$PY -u $C/vision-context-check.py --base_url "$BRIDGE" --json $R/tc38-prod-vision-context.json > $R/tc38-prod-vision-context.log 2>&1; echo "vision-context rc=$?"; tail -4 $R/tc38-prod-vision-context.log

echo "=== $(date -Is) 3/4 penalty-degeneration-check"
$PY -u $C/penalty-degeneration-check.py "$BRIDGE" "$M" > $R/tc38-prod-penalty.log 2>&1; echo "penalty rc=$?"

echo "=== $(date -Is) 4/4 tool-eval xhigh full + hm3"
COMMON=(--model $M --backend vllm --base-url $BRIDGE/v1 --temperature 0.6 --top-p 0.95 --top-k 20 --min-p 0.0 --seed 42 --backend-kwargs '{"reasoning_effort":"xhigh"}' --parallel 1 --no-live)
$TEB run "${COMMON[@]}" --label tc38-exl3-prod-xhigh-full --json-file $R/tc38-prod-teb-xhigh-full.json > $R/tc38-prod-teb-xhigh-full.log 2>&1
$TEB run "${COMMON[@]}" --hardmode-only --trials 3 --label tc38-exl3-prod-xhigh-hm3 --json-file $R/tc38-prod-teb-xhigh-hm3.json > $R/tc38-prod-teb-xhigh-hm3.log 2>&1
python3 - <<'PY'
import json
for f in ["tc38-prod-teb-xhigh-full","tc38-prod-teb-xhigh-hm3"]:
    try: d=json.load(open(f"/home/<user>/runs/{f}.json")); print(f,"final",d.get("final_score"),"deploy",d.get("deployability"),"resp",d.get("responsiveness"),"safety",d.get("safety_warnings"))
    except Exception as e: print(f,"ERR",e)
PY
echo "=== $(date -Is) quick set done"
