#!/bin/bash
# Full canary: stop prod -> serve ThinkingCap-3.8 on 8102 -> teb full + hm3 -> restore prod.
# Run detached:  systemd-run --user --unit tc38-canary --collect bash /mnt/c/Users/<user>/dagacha/ai-stuff/configs/msi/thinkingcap38-exl3/run-canary.sh
set -uo pipefail
R=/home/<user>/runs; T=/mnt/c/Users/<user>/dagacha/ai-stuff/configs/msi/thinkingcap38-exl3; TEB=/home/<user>/teb-venv/bin/tool-eval-bench
LANIP=$(hostname -I | awk '{for(i=1;i<=NF;i++) if ($i ~ /^192\.168\./) {print $i; exit}}')
URL=http://$LANIP:8102/v1; M=thinkingcap-qwen3.8-27b-nvfp4a4
LOG=$R/tc38-canary.log; exec >>"$LOG" 2>&1
echo "=== $(date -Is) canary start"
restore() { echo "=== $(date -Is) restoring prod"; pkill -f "port 8102" || true; sleep 8
  bash /mnt/c/Users/<user>/dagacha/ai-stuff/configs/msi/switch-lane.sh qwen38-exl3; echo "=== $(date -Is) done"; }
trap restore EXIT
systemctl --user stop qwen38-exl3.service qwen38.service vllm.service 2>/dev/null; sleep 8
echo "url=$URL"
bash $T/serve-thinkingcap38-test.sh > $R/tc38-server.log 2>&1 &
for i in $(seq 1 90); do curl -s -m 3 -o /dev/null -w '%{http_code}' $URL/models | grep -q 200 && break; sleep 10; done
curl -s -m 3 $URL/models | grep -q "$M" || { echo "server failed to come up"; tail -40 $R/tc38-server.log; exit 1; }
echo "=== $(date -Is) server up"; nvidia-smi --query-gpu=memory.used --format=csv,noheader
# smoke: thinking-token count on a fixed prompt vs prod-lane convention
curl -s -m 300 $URL/chat/completions -H 'content-type: application/json' -d '{"model":"'$M'","messages":[{"role":"user","content":"A train leaves at 14:35 and arrives 3h50m later. What time does it arrive? Answer briefly."}],"max_tokens":2000}' > $R/tc38-smoke.json; echo "smoke usage: $(grep -o '"usage":{[^}]*}' $R/tc38-smoke.json | head -c 300)"
COMMON=(--model $M --backend vllm --base-url $URL --temperature 0.6 --top-p 0.95 --top-k 20 --min-p 0.0 --seed 42 --backend-kwargs '{"reasoning_effort":"low"}' --parallel 1 --no-live)
$TEB run "${COMMON[@]}" --label tc38-nvfp4a4-tq-low-full --json-file $R/tc38-teb-v251-low-full.json > $R/tc38-teb-v251-low-full.log 2>&1
$TEB run "${COMMON[@]}" --hardmode-only --trials 3 --label tc38-nvfp4a4-tq-low-hm3 --json-file $R/tc38-teb-v251-low-hm3.json > $R/tc38-teb-v251-low-hm3.log 2>&1
python3 - <<'PY'
import json
for f in ["tc38-teb-v251-low-full","tc38-teb-v251-low-hm3"]:
    d=json.load(open(f"/home/<user>/runs/{f}.json")); print(f, "final", d.get("final_score"), "deploy", d.get("deployability"), "resp", d.get("responsiveness"), "safety", d.get("safety_warnings"))
PY
grep -h "Mean acceptance length" $R/tc38-server.log | tail -3
