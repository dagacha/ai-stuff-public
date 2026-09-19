#!/usr/bin/env bash
# Runs the EXL3 vision smoke arms with production stopped, then restores
# whichever production service was active. Logs to ~/runs/qwen38-exl3-vision-*.
set -uo pipefail
KIT=${QWEN38_EXL3_KIT:-/mnt/c/Users/<user>/dagacha/Qwen3.8-27B-DFlash2-EXL3-5.0bpw}
PY=/home/<user>/qwen38-exl3-venv/bin/python
HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
MODEL=${1:-$KIT/models/Qwen3.8-27B-EXL3-5.5bpw}
OUT=~/runs; mkdir -p "$OUT"

# shellcheck source=production-units.sh
source "$HERE/production-units.sh"
ACTIVE=$(active_production_units)
echo "active production: ${ACTIVE:-none}"
restore() {
  for s in $ACTIVE; do echo "restoring $s"; systemctl --user start "$s"; done
}
trap restore EXIT
for s in $ACTIVE; do systemctl --user stop "$s"; done
sleep 5
nvidia-smi --query-gpu=memory.used --format=csv,noheader

cd "$KIT"
OVERALL=0
if [ "${SKIP_PLAIN:-0}" != 1 ]; then
echo "===== arm 1: vision, no spec decode, native 2.9MP"
$PY -u "$HERE/vision-smoke.py" --model "$MODEL" --json "$OUT/qwen38-exl3-vision-plain.json" 2>&1 | tee "$OUT/qwen38-exl3-vision-plain.log"
rc=${PIPESTATUS[0]}; echo "arm 1 rc=$rc"; [ "$rc" = 0 ] || OVERALL=1
fi
echo "===== arm 2: vision + MTP, 28MP crash repro x3"
$PY -u "$HERE/vision-smoke.py" --model "$MODEL" --mtp --scale 3.1 --rounds 3 --max_tokens 2048 --json "$OUT/qwen38-exl3-vision-mtp-28mp.json" 2>&1 | tee "$OUT/qwen38-exl3-vision-mtp-28mp.log"
rc=${PIPESTATUS[0]}; echo "arm 2 rc=$rc"; [ "$rc" = 0 ] || OVERALL=1
echo "===== done rc=$OVERALL"
exit "$OVERALL"
