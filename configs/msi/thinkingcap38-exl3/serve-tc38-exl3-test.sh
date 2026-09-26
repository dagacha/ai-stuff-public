#!/bin/bash
# Canary launcher: ThinkingCap-Qwen3.8-27B EXL3 5.5bpw (own conversion) on the prod EXL3 kit,
# identical to /mnt/c/Users/<user>/serve-qwen38-exl3.sh except MODEL_PATH, served name, port 8102.
set -euo pipefail
ARM_ENV=/mnt/c/Users/<user>/dagacha/ai-stuff/configs/msi/qwen38-exl3-canary/55-mtp-262k-vision.env
KIT=${QWEN38_EXL3_KIT:-/mnt/c/Users/<user>/dagacha/Qwen3.8-27B-DFlash2-EXL3-5.0bpw}
# shellcheck disable=SC1090
source "$ARM_ENV"
PYTHON="$VENV_DIR/bin/python"
SERVER="$KIT/tools/serve_openai.py"
MODEL_PATH=${MODEL_PATH:-/home/<user>/models/bottlecapai/ThinkingCap-Qwen3.8-27B-EXL3-5.5bpw}
for f in "$PYTHON" "$SERVER" "$MODEL_PATH/config.json"; do [[ -e "$f" ]] || { echo "missing $f" >&2; exit 1; }; done
export MAX_JOBS
cd "$KIT"
exec "$PYTHON" -u "$SERVER" \
  --model "$MODEL_PATH" \
  --served_model_name thinkingcap-qwen3.8-27b-exl3-5.5bpw qwen3.8-27b-exl3-5.5bpw qwen3.8-27b-nvfp4 qwen3.8-27b qwen3.6-27b-nvfp4 \
  --host 0.0.0.0 --port "${PORT_OVERRIDE:-8102}" \
  --cache_size "$CONTEXT_SIZE" \
  --grid_size "$GPU_MEM_GB" \
  --cache_quant "$CACHE_QUANT" \
  --draft_model mtp \
  --vision \
  "$@"
