#!/bin/bash
# ThinkingCap-3.8 sweep: one server load, 3 arms via per-request sampler/effort, then restore prod.
#   A card-xhigh : temp 1.0, reasoning_effort xhigh   (card recipe)
#   B card-low   : temp 1.0, reasoning_effort low
#   C t06-xhigh  : temp 0.6, reasoning_effort xhigh   (baseline Qwen3.8 = 91/63 here)
set -uo pipefail
R=/home/<user>/runs; T=/mnt/c/Users/<user>/dagacha/ai-stuff/configs/msi/thinkingcap38-exl3; TEB=/home/<user>/teb-venv/bin/tool-eval-bench
LANIP=$(hostname -I | awk '{for(i=1;i<=NF;i++) if ($i ~ /^192\.168\./) {print $i; exit}}')
URL=http://$LANIP:8102/v1; M=thinkingcap-qwen3.8-27b-nvfp4a4
LOG=$R/tc38-sweep.log; exec >>"$LOG" 2>&1
echo "=== $(date -Is) sweep start url=$URL"
restore() { echo "=== $(date -Is) restoring prod"; pkill -f "vllm serve /home/<user>/models/bottlecapai" || true; sleep 8
  bash /mnt/c/Users/<user>/dagacha/ai-stuff/configs/msi/switch-lane.sh qwen38-exl3; echo "=== $(date -Is) done"; }
trap restore EXIT
systemctl --user stop qwen38-exl3.service qwen38.service vllm.service 2>/dev/null; sleep 8
bash $T/serve-thinkingcap38-test.sh > $R/tc38-sweep-server.log 2>&1 &
for i in $(seq 1 90); do curl -s -m 3 $URL/models | grep -q "$M" && break; sleep 10; done
curl -s -m 3 $URL/models | grep -q "$M" || { echo "server failed"; tail -30 $R/tc38-sweep-server.log; exit 1; }
echo "=== $(date -Is) server up"
gen_tokens() { curl -s -m 5 http://$LANIP:8102/metrics | awk '/^vllm:generation_tokens_total/ {print int($2)}' | head -1; }
run_arm() { # name temp effort
  local name=$1 temp=$2 eff=$3 t0 t1 t2
  local COMMON=(--model $M --backend vllm --base-url $URL --temperature $temp --top-p 0.95 --top-k 20 --min-p 0.0 --seed 42 --backend-kwargs "{\"reasoning_effort\":\"$eff\"}" --parallel 1 --no-live)
  t0=$(gen_tokens); echo "=== $(date -Is) arm $name full start"
  $TEB run "${COMMON[@]}" --label tc38-$name-full --json-file $R/tc38-$name-full.json > $R/tc38-$name-full.log 2>&1
  t1=$(gen_tokens); echo "=== $(date -Is) arm $name hm3 start (full gen tokens: $((t1-t0)))"
  $TEB run "${COMMON[@]}" --hardmode-only --trials 3 --label tc38-$name-hm3 --json-file $R/tc38-$name-hm3.json > $R/tc38-$name-hm3.log 2>&1
  t2=$(gen_tokens); echo "=== $(date -Is) arm $name done (hm3 gen tokens: $((t2-t1)))"
  echo "TOKENS $name full=$((t1-t0)) hm3=$((t2-t1))" >> $R/tc38-sweep-tokens.txt
}
run_arm card-xhigh 1.0 xhigh
run_arm card-low   1.0 low
run_arm t06-xhigh  0.6 xhigh
python3 - <<'PY'
import json
for a in ["card-xhigh","card-low","t06-xhigh"]:
  for s in ["full","hm3"]:
    try: d=json.load(open(f"/home/<user>/runs/tc38-{a}-{s}.json")); print(f"{a} {s}: final={d.get('final_score')} deploy={d.get('deployability')} resp={d.get('responsiveness')} safety={d.get('safety_warnings')}")
    except Exception as e: print(a,s,"ERR",e)
PY
cat $R/tc38-sweep-tokens.txt
