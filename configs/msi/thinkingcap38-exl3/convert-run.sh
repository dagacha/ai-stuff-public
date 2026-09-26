#!/bin/bash
# EXL3 conversion of ThinkingCap-Qwen3.8-27B (BF16) at 5.5bpw, matching the prod TelperionAI recipe
# (bits 5.5 / head 6 / mtp 4 / vision bf16 / mul1 / out_scales always / cal 250x2048). No AWQ pre-pass.
# Stops prod for the duration (GPU needed), restores prod on exit. Resumable: re-run with RESUME=1.
# Run detached: systemd-run --user --unit tc38-convert --collect bash /mnt/c/Users/<user>/dagacha/ai-stuff/configs/msi/thinkingcap38-exl3/convert-run.sh
set -uo pipefail
IN=/home/<user>/models/bottlecapai/ThinkingCap-Qwen3.8-27B
WORK=/home/<user>/models/bottlecapai/tc38-exl3-work
OUT=/home/<user>/models/bottlecapai/ThinkingCap-Qwen3.8-27B-EXL3-5.5bpw
V=/home/<user>/qwen38-exl3-venv
LOG=/home/<user>/runs/tc38-convert.log; exec >>"$LOG" 2>&1
echo "=== $(date -Is) convert start (RESUME=${RESUME:-0})"
restore() { echo "=== $(date -Is) restoring prod"; bash /mnt/c/Users/<user>/dagacha/ai-stuff/configs/msi/switch-lane.sh qwen38-exl3; echo "=== $(date -Is) done"; }
trap restore EXIT
[ -f "$IN/config.json" ] || { echo "no input checkpoint"; exit 1; }
n=$(ls "$IN"/*.safetensors 2>/dev/null | wc -l); echo "input shards: $n"; du -sh "$IN"
systemctl --user stop qwen38-exl3.service qwen38.service vllm.service 2>/dev/null; sleep 8
mkdir -p "$WORK" "$OUT"
extra=(); [ "${RESUME:-0}" = 1 ] && extra=(-r)
cd /home/<user>
"$V/bin/python" -u /mnt/c/Users/<user>/dagacha/ai-stuff/configs/msi/thinkingcap38-exl3/convert.py \
  -i "$IN" -w "$WORK" -o "$OUT" \
  -b 5.5 -hb 6 -mb 4 -vb 16 -cb mul1 --out_scales always -cr 250 -cc 2048 \
  -ss 8192 -d 0 "${extra[@]}"
rc=$?
echo "=== $(date -Is) convert exit rc=$rc"
if [ $rc -eq 0 ]; then
  du -sh "$OUT"; ls "$OUT" | head -20
  cp -n "$IN"/{chat_template.jinja,preprocessor_config.json,video_preprocessor_config.json,generation_config.json} "$OUT"/ 2>/dev/null
  python3 -c "import json;c=json.load(open('$OUT/config.json'));print('quant',c.get('quantization_config'));print('arch',c.get('architectures'))"
fi
