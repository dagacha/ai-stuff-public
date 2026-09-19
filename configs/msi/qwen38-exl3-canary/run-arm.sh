#!/usr/bin/env bash
# Foreground test launcher. Production service management stays explicit so
# this can never replace or expose the 8100/8101 lane by accident.
set -euo pipefail

ARM=${1:-}
case "$ARM" in
  mtp|dflash2|55-mtp-262k|55-dflash2-131k|55-dflash2-160k|55-mtp-262k-vision|55-dflash2-160k-vision) ;;
  *) echo "usage: $0 mtp|dflash2|55-mtp-262k|55-dflash2-131k|55-dflash2-160k|55-mtp-262k-vision|55-dflash2-160k-vision" >&2; exit 2 ;;
esac

KIT=${QWEN38_EXL3_KIT:-/mnt/c/Users/<user>/dagacha/Qwen3.8-27B-DFlash2-EXL3-5.0bpw}
CONFIG=/mnt/c/Users/<user>/dagacha/ai-stuff/configs/msi/qwen38-exl3-canary/$ARM.env
# shellcheck disable=SC1090
source "$CONFIG"

PROBE_HOST=$HOST
if [ "$PROBE_HOST" = 0.0.0.0 ]; then PROBE_HOST=127.0.0.1; fi
if curl -fsS --max-time 2 "http://$PROBE_HOST:$PORT/health" >/dev/null 2>&1; then
  echo "$HOST:$PORT already has a healthy server; stop it before changing arms" >&2
  exit 1
fi

PYTHON="$VENV_DIR/bin/python"
SERVER="$KIT/tools/serve_openai.py"
if [ ! -x "$PYTHON" ] || [ ! -f "$SERVER" ]; then
  echo "prepared EXL3 venv/server not found; run prepare-kit.sh for this arm first" >&2
  exit 1
fi
if ! "$PYTHON" "$SERVER" --help 2>&1 | grep -q -- '--served_model_name'; then
  echo "deployment-kit compatibility patch is missing; run prepare-kit.sh first" >&2
  exit 1
fi

resolve_kit_path() {
  case "$1" in
    /*) printf '%s\n' "$1" ;;
    *) printf '%s/%s\n' "$KIT" "$1" ;;
  esac
}

MODEL_PATH=$(resolve_kit_path "$MODEL_DIR")
if [ ! -d "$MODEL_PATH" ]; then
  echo "target checkpoint not found: $MODEL_PATH" >&2
  exit 1
fi

cmd=("$PYTHON" -u "$SERVER"
     --model "$MODEL_PATH"
     --served_model_name "$SERVED_MODEL_NAME"
     --host "$HOST" --port "$PORT"
     --cache_size "$CONTEXT_SIZE"
     --grid_size "$GPU_MEM_GB"
     --cache_quant "$CACHE_QUANT")

case "$DRAFT" in
  mtp) cmd+=(--draft_model mtp) ;;
  dflash2)
    DRAFT_PATH=$(resolve_kit_path "$DRAFT_DIR")
    if [ ! -d "$DRAFT_PATH" ]; then
      echo "draft checkpoint not found: $DRAFT_PATH" >&2
      exit 1
    fi
    cmd+=(--draft_model "$DRAFT_PATH")
    ;;
esac
if [ "$CPU_CACHE_GB" != 0 ]; then
  cmd+=(--cpu_cache_size "$CPU_CACHE_GB")
fi
if [ "${VISION:-0}" = 1 ]; then
  if ! "$PYTHON" "$SERVER" --help 2>&1 | grep -q -- '--vision'; then
    echo "deployment-kit patch predates vision support; run prepare-kit.sh first" >&2
    exit 1
  fi
  cmd+=(--vision)
fi

cd "$KIT"
exec "${cmd[@]}"
