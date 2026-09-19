#!/usr/bin/env bash
# Reproduce the locally validated deployment-kit server without loading the GPU.
set -euo pipefail

ARM=${1:-}
case "$ARM" in
  mtp|dflash2|55-mtp-262k|55-dflash2-131k|55-dflash2-160k|55-mtp-262k-vision|55-dflash2-160k-vision) ;;
  *) echo "usage: $0 mtp|dflash2|55-mtp-262k|55-dflash2-131k|55-dflash2-160k|55-mtp-262k-vision|55-dflash2-160k-vision" >&2; exit 2 ;;
esac

ROOT=/mnt/c/Users/<user>/dagacha/ai-stuff
KIT=${QWEN38_EXL3_KIT:-/mnt/c/Users/<user>/dagacha/Qwen3.8-27B-DFlash2-EXL3-5.0bpw}
CONFIG="$ROOT/configs/msi/qwen38-exl3-canary/$ARM.env"
PATCH="$ROOT/configs/msi/qwen38-exl3-canary/deployment-kit-81ba06e.patch"
EXPECTED_BASE=81ba06efe415b3049f16950d35c3b5d3fe890edf

if [ ! -d "$KIT/.git" ]; then
  echo "deployment-kit checkout not found: $KIT" >&2
  exit 1
fi

if git -C "$KIT" apply --unidiff-zero --ignore-space-change --reverse --check "$PATCH" >/dev/null 2>&1; then
  echo "deployment-kit compatibility patch is already applied"
else
  actual_base=$(git -C "$KIT" rev-parse HEAD)
  if [ "$actual_base" != "$EXPECTED_BASE" ]; then
    if [ -n "$(git -C "$KIT" status --porcelain --untracked-files=normal)" ]; then
      echo "deployment-kit HEAD is $actual_base; expected $EXPECTED_BASE" >&2
      echo "refusing to change revisions because the kit worktree is not clean" >&2
      exit 1
    fi
    echo "fetching pinned deployment-kit commit $EXPECTED_BASE"
    git -C "$KIT" fetch --no-tags origin "$EXPECTED_BASE"
    git -C "$KIT" checkout --detach "$EXPECTED_BASE"
    actual_base=$(git -C "$KIT" rev-parse HEAD)
  fi
  if [ "$actual_base" != "$EXPECTED_BASE" ]; then
    echo "deployment-kit HEAD is $actual_base after checkout; expected $EXPECTED_BASE" >&2
    exit 1
  fi
  git -C "$KIT" apply --unidiff-zero --ignore-space-change --check "$PATCH"
  git -C "$KIT" apply --unidiff-zero --ignore-space-change "$PATCH"
  echo "applied deployment-kit compatibility patch"
fi

cd "$KIT"
exec env ENV_FILE="$CONFIG" PREPARE_ONLY=1 ./start.sh
