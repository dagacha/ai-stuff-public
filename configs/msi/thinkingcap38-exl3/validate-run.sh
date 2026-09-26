#!/bin/bash
# Validate the converted ThinkingCap EXL3 checkpoint on the prod kit: vision check, teb low full+hm3, realistic xhigh A/B prompts.
# Stops prod, serves on 8102, restores prod on exit.
#   systemd-run --user --unit tc38-validate --collect bash /mnt/c/Users/<user>/dagacha/ai-stuff/configs/msi/thinkingcap38-exl3/validate-run.sh
set -uo pipefail
R=/home/<user>/runs; T=/mnt/c/Users/<user>/dagacha/ai-stuff/configs/msi/thinkingcap38-exl3; C=/mnt/c/Users/<user>/dagacha/ai-stuff/configs/msi/qwen38-exl3-canary
PY=/home/<user>/qwen38-exl3-venv/bin/python; TEB=/home/<user>/teb-venv/bin/tool-eval-bench
LANIP=$(hostname -I | awk '{for(i=1;i<=NF;i++) if ($i ~ /^192\.168\./) {print $i; exit}}'); URL=http://$LANIP:8102/v1
M=thinkingcap-qwen3.8-27b-exl3-5.5bpw
LOG=$R/tc38-validate.log; exec >>"$LOG" 2>&1
echo "=== $(date -Is) validate start url=$URL"
restore() { echo "=== $(date -Is) restoring prod"; pkill -f "serve_openai.py --model /home/<user>/models/bottlecapai" || true; sleep 8
  bash /mnt/c/Users/<user>/dagacha/ai-stuff/configs/msi/switch-lane.sh qwen38-exl3; echo "=== $(date -Is) done"; }
trap restore EXIT
[ -f /home/<user>/models/bottlecapai/ThinkingCap-Qwen3.8-27B-EXL3-5.5bpw/config.json ] || { echo "no converted checkpoint"; exit 1; }
systemctl --user stop qwen38-exl3.service qwen38.service vllm.service 2>/dev/null; sleep 8
bash $T/serve-tc38-exl3-test.sh > $R/tc38-exl3-server.log 2>&1 &
for i in $(seq 1 120); do curl -fsS -m 2 http://$LANIP:8102/health >/dev/null 2>&1 && break; sleep 5; done
curl -fsS -m 2 http://$LANIP:8102/health || { echo "server failed"; tail -30 $R/tc38-exl3-server.log; exit 1; }
echo; echo "=== $(date -Is) server up"; /usr/lib/wsl/lib/nvidia-smi --query-gpu=memory.used --format=csv,noheader
curl -s -m 300 $URL/chat/completions -H 'content-type: application/json' -d "{\"model\":\"$M\",\"messages\":[{\"role\":\"user\",\"content\":\"Reply with the single word OK.\"}],\"max_tokens\":100}" | head -c 400; echo
echo "=== $(date -Is) vision check"
$PY -u $C/vision-check.py --base_url http://$LANIP:8102 --rounds 3 --json $R/tc38-exl3-vision-check.json > $R/tc38-exl3-vision-check.log 2>&1; echo "vision rc=$?"; tail -5 $R/tc38-exl3-vision-check.log
COMMON=(--model $M --backend vllm --base-url $URL --temperature 0.6 --top-p 0.95 --top-k 20 --min-p 0.0 --seed 42 --backend-kwargs '{"reasoning_effort":"low"}' --parallel 1 --no-live)
echo "=== $(date -Is) teb low full"
$TEB run "${COMMON[@]}" --label tc38-exl3-low-full --json-file $R/tc38-exl3-teb-low-full.json > $R/tc38-exl3-teb-low-full.log 2>&1
echo "=== $(date -Is) teb low hm3"
$TEB run "${COMMON[@]}" --hardmode-only --trials 3 --label tc38-exl3-low-hm3 --json-file $R/tc38-exl3-teb-low-hm3.json > $R/tc38-exl3-teb-low-hm3.log 2>&1
echo "=== $(date -Is) realistic xhigh prompts"
rm -f $R/tc38-ab-exl3.json.samples.jsonl
python3 $T/ab/ab.py $URL $M exl3 $R/tc38-ab-exl3.json
echo "=== $(date -Is) validation done"; /usr/lib/wsl/lib/nvidia-smi --query-gpu=memory.used --format=csv,noheader
python3 - <<'PY'
import json
for f in ["tc38-exl3-teb-low-full","tc38-exl3-teb-low-hm3"]:
    try: d=json.load(open(f"/home/<user>/runs/{f}.json")); print(f, "final", d.get("final_score"), "deploy", d.get("deployability"), "resp", d.get("responsiveness"), "safety", d.get("safety_warnings"))
    except Exception as e: print(f, "ERR", e)
PY
