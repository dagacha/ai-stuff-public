#!/usr/bin/env bash
# Switch the served weights between the two 0731-based lanes, then restart the
# stack. Since upstream 3ff61cf the launcher resolves DSPARK_MODEL itself from
# the ABLITERATED flag in .env.dspark (setting DSPARK_MODEL by hand is
# overridden), so this script toggles that flag instead of the model id.
#
#   ./switch-dspark-model.sh official  # ABLITERATED=0: DSPARK_MODEL_OFFICIAL (Vision-Exp since 2026-09-03)
#                                      #   (pinned to DSPARK_REVISION / launcher default)
#   ./switch-dspark-model.sh ablit     # ABLITERATED=1: drowzeys keys 32-32 (0731 base, uncensored)
#   ./switch-dspark-model.sh status    # show which is configured / running
#
# ("ga" and "ablit-ga" are accepted as aliases of official / ablit. The
# pre-0731 preview lanes — stock DSpark and the mida v1.1-alpha build — are
# gone: the launcher can no longer select them.)
#
# SERVED_MODEL_NAME stays "deepseek-v4-flash-dspark" in both lanes, so no
# client reconfiguration is needed either way.
#
# MTP_NUM_TOKENS preflight is policy-aware (full-stock policy, 2026-09-06):
# unset or equal to the compose default (parsed from docker-compose.dspark.yml,
# 6 on Vision-Exp: n_predict=3 -> k>=5 and k%3==0) passes; 5 also passes when
# DSPARK_ENABLE_DSPARK_BLOCK_K=1 (the block-k hotfix lifts the divisibility
# rule). 0 is still REJECTED: the compose renders --speculative-config
# unconditionally, so 0 would mean num_speculative_tokens:0 — NOT disabled
# speculation. Any other value is rejected (lower than dspark_block_size=5
# silently truncates draft blocks).
#
# Both-node semantics: only the HEAD node's .env.dspark is edited here. That is
# sufficient because start-deepseek-v4-flash-dspark.sh scp's the head's
# .env.dspark + compose files to the worker on every start and then starts
# both containers, so the head env is the single source of truth and a switch
# always applies to both nodes. Before switching to ablit, this script
# validates the hub-cached weights on BOTH nodes (config.json plus every shard
# referenced by model.safetensors.index.json, safetensors-header size check)
# and aborts before touching the running stack otherwise. Rollback is
# `./switch-dspark-model.sh official`. Run from the head node. WORKER_HOST /
# HF_CACHE / WORKER_HF_CACHE are resolved from .env.dspark only (the same file
# the launcher sources unconditionally); process-environment overrides are
# deliberately NOT honored so preflight/status always inspect exactly the
# host/cache the restart will use.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/.env.dspark"

# Resolve deployment values from the same .env.dspark the launcher uses, by
# sourcing it in a subshell (so ${HOME}-style references expand exactly as
# they do for the launcher). Sourcing output/errors are discarded so stray
# echoes in the env file can't pollute the captured value.
env_get() { ( set +u; . "$ENV_FILE" >/dev/null 2>&1; eval "printf '%s' \"\${$1-}\"" ); }
WORKER_HOST="$(env_get WORKER_HOST)"
[ -n "$WORKER_HOST" ] || { echo "WORKER_HOST not set in $ENV_FILE" >&2; exit 1; }
HF_CACHE="$(env_get HF_CACHE)"
HF_CACHE="${HF_CACHE:-$HOME/.cache/huggingface}"
WORKER_HF_CACHE="$(env_get WORKER_HF_CACHE)"
WORKER_HF_CACHE="${WORKER_HF_CACHE:-$HF_CACHE}"

# Model ids mirror the launcher's defaults but honor env overrides the same
# way the launcher does, so status/validation track whatever will actually run.
OFFICIAL_MODEL="$(env_get DSPARK_MODEL_OFFICIAL)"
OFFICIAL_MODEL="${OFFICIAL_MODEL:-deepseek-ai/DeepSeek-V4-Flash-0731}"
ABLIT_MODEL="$(env_get DSPARK_MODEL_ABLITERATED)"
ABLIT_MODEL="${ABLIT_MODEL:-drowzeys/keys-DeepSeekV4-Flash-GA-0731-Dspark-Abliterated-32-32}"
ABLIT_REL="hub/models--${ABLIT_MODEL//\//--}"
ABLIT_REVISION="$(env_get DSPARK_REVISION_ABLITERATED)"

# The launcher passes DSPARK_REVISION_ABLITERATED verbatim as --revision, but
# this switcher locates the snapshot as a literal snapshots/<value> directory,
# which only exists for a full commit SHA (symbolic refs and short prefixes
# resolve through refs/* or the hub API). Require the full-SHA form so
# validate and serve provably target the same directory. Called only from the
# ablit lane: a mis-set ablit var must not block status or a switch back to
# official (the production-restore path, which never uses this revision).
# Hub snapshot dirs are lowercase; normalize case rather than reject it.
require_full_sha_revision() {
  [ -n "$ABLIT_REVISION" ] || return 0
  ABLIT_REVISION="$(printf '%s' "$ABLIT_REVISION" | tr 'A-F' 'a-f')"
  if ! printf '%s' "$ABLIT_REVISION" | grep -qE '^[0-9a-f]{40}$'; then
    echo "ERROR: DSPARK_REVISION_ABLITERATED='$ABLIT_REVISION' is not a full 40-hex commit SHA. Symbolic refs and short prefixes cannot be validated against a snapshot dir; pin the full SHA (e.g. from ls $HF_CACHE/$ABLIT_REL/snapshots/)." >&2
    exit 1
  fi
}

# Validate a model directory: config present, and every shard referenced by
# model.safetensors.index.json exists with EXACTLY the size its own
# safetensors header declares (8-byte header-length prefix + JSON header +
# data section spanning to the max tensor end-offset). Catches partial HF
# downloads and truncated copies without reading the full ~156 GB.
# $1 = "" (local) or ssh host.
validate_weights() {
  local host="$1" runner=(bash -s --)
  [ -n "$host" ] && runner=(ssh -o BatchMode=yes -o ConnectTimeout=10 "$host" bash -s --)
  "${runner[@]}" "$2" <<'EOS'
set -euo pipefail
dir="$1"
[ -f "$dir/config.json" ] || { echo "missing $dir/config.json"; exit 1; }
idx="$dir/model.safetensors.index.json"
[ -f "$idx" ] || { echo "missing $idx (cannot verify shards)"; exit 1; }
command -v python3 >/dev/null 2>&1 || { echo "python3 not found on this node (required to verify shards)"; exit 1; }
python3 - "$idx" <<'PY'
import json, os, struct, sys
idx = sys.argv[1]; d = os.path.dirname(idx)
shards = sorted(set(json.load(open(idx))["weight_map"].values()))
def check(path):
    if not os.path.isfile(path):
        return "missing"
    size = os.path.getsize(path)
    try:
        with open(path, "rb") as f:
            (hlen,) = struct.unpack("<Q", f.read(8))
            header = json.loads(f.read(hlen))
    except Exception as e:
        return f"unreadable safetensors header ({type(e).__name__})"
    data_end = max((v["data_offsets"][1] for k, v in header.items()
                    if k != "__metadata__"), default=0)
    expected = 8 + hlen + data_end
    if size != expected:
        return f"size {size} != header-declared {expected} (truncated?)"
    return None
bad = [f"{s}: {err}" for s in shards if (err := check(os.path.join(d, s)))]
if bad:
    print("bad shards: " + "; ".join(bad[:5])
          + (f" (+{len(bad)-5} more)" if len(bad) > 5 else ""))
    sys.exit(1)
print(f"{len(shards)} shards OK (safetensors header/size verified)")
PY
EOS
}

# Locate the ablit snapshot dir in a node's hub cache. Uses the pinned
# DSPARK_REVISION_ABLITERATED when set (validated above as a full SHA, so the
# launcher's --revision and this lookup name the same directory). With no pin,
# a single cached snapshot is accepted; multiple snapshots ABORT — the
# launcher would serve whatever the default ref resolves to, which this
# switcher cannot determine offline, so validate==serve is not guaranteed.
# $1 = "" (local) or ssh host, $2 = cache root. Prints the dir or nothing.
find_ablit_snapshot() {
  local host="$1" cache="$2" cmd out n
  if [ -n "$ABLIT_REVISION" ]; then
    cmd="ls -d '$cache/$ABLIT_REL/snapshots/$ABLIT_REVISION' 2>/dev/null"
  else
    cmd="ls -d '$cache/$ABLIT_REL'/snapshots/*/ 2>/dev/null"
  fi
  if [ -n "$host" ]; then
    out="$(ssh -o BatchMode=yes -o ConnectTimeout=10 "$host" "$cmd" || true)"
  else
    out="$(bash -c "$cmd" || true)"
  fi
  n="$(printf '%s' "$out" | grep -c . || true)"
  if [ -z "$ABLIT_REVISION" ] && [ "$n" -gt 1 ]; then
    echo "ERROR: multiple ablit snapshots cached under $cache/$ABLIT_REL/snapshots on ${host:-head}; cannot determine which one the launcher would serve. Pin DSPARK_REVISION_ABLITERATED=<full sha> in .env.dspark and re-run." >&2
    exit 1
  fi
  printf '%s\n' "$out" | head -1
}

current_flag() { grep -E '^ABLITERATED=' "$ENV_FILE" | tail -1 | cut -d= -f2-; }

label() {
  case "$1" in
    0|"$OFFICIAL_MODEL") echo "official ($OFFICIAL_MODEL)" ;;
    1|"$ABLIT_MODEL") echo "ablit (0731 base, uncensored: $ABLIT_MODEL)" ;;
    *) echo "unknown: $1" ;;
  esac
}

case "${1:-status}" in
  status)
    flag="$(current_flag)"
    echo "configured (head env, synced to worker on start): $(label "${flag:-0}") [ABLITERATED=${flag:-unset→0}]"
    NODE_CMD='if docker ps --format "{{.Names}}" | grep -qx deepseek-v4-flash-vllm-dspark-1; then
        docker inspect deepseek-v4-flash-vllm-dspark-1 --format "{{join .Args \" \"}}" \
          | grep -oE "'"$ABLIT_MODEL|$OFFICIAL_MODEL"'" | head -1
      else echo DOWN; fi'
    node_status() { # $1 = node label, $2 = transport exit code, $3 = raw command output
      if [ "$2" -ne 0 ]; then
        echo "$1: unreachable (ssh exit $2)"
      elif [ "$3" = "DOWN" ]; then
        echo "$1: stack is down"
      elif [ -z "$3" ]; then
        echo "$1: container up, model not recognized"
      else
        echo "$1: container up ($(label "$3"))"
      fi
    }
    head_out="$(bash -c "$NODE_CMD")" && head_rc=0 || head_rc=$?
    node_status "head  " "$head_rc" "$head_out"
    worker_out="$(ssh -o BatchMode=yes -o ConnectTimeout=10 "$WORKER_HOST" "$NODE_CMD" 2>/dev/null)" && worker_rc=0 || worker_rc=$?
    node_status "worker" "$worker_rc" "$worker_out"
    exit 0
    ;;
  official|ga) TARGET_FLAG=0 ;;
  ablit|ablit-ga)
    TARGET_FLAG=1
    require_full_sha_revision
    HEAD_DIR="$(find_ablit_snapshot "" "$HF_CACHE")"
    [ -n "$HEAD_DIR" ] || { echo "ablit weights not found under $HF_CACHE/$ABLIT_REL${ABLIT_REVISION:+ (revision $ABLIT_REVISION)}" >&2; exit 1; }
    WORKER_DIR="$(find_ablit_snapshot "$WORKER_HOST" "$WORKER_HF_CACHE")"
    [ -n "$WORKER_DIR" ] || { echo "ablit weights not found on worker under $WORKER_HF_CACHE/$ABLIT_REL${ABLIT_REVISION:+ (revision $ABLIT_REVISION)}" >&2; exit 1; }
    echo "Validating ablit weights on head ($HEAD_DIR)..."
    validate_weights "" "${HEAD_DIR%/}" || { echo "ablit weights invalid on head" >&2; exit 1; }
    echo "Validating ablit weights on worker $WORKER_HOST ($WORKER_DIR)..."
    validate_weights "$WORKER_HOST" "${WORKER_DIR%/}" || { echo "ablit weights invalid on worker $WORKER_HOST" >&2; exit 1; }
    ;;
  *) echo "usage: $0 {official|ablit|status}" >&2; exit 2 ;;
esac

# Preflight, BEFORE any env mutation: a hand-set DSPARK_MODEL in the env file
# is dead config under the flag scheme (the launcher overwrites it) — refuse
# rather than leave a misleading line that suggests it still selects the model.
if grep -qE '^DSPARK_MODEL=' "$ENV_FILE"; then
  echo "ERROR: $ENV_FILE sets DSPARK_MODEL directly; since 3ff61cf the launcher ignores it (model comes from ABLITERATED / DSPARK_MODEL_OFFICIAL / DSPARK_MODEL_ABLITERATED). Remove that line and re-run. Aborting with no changes." >&2
  exit 1
fi

# Preflight: MTP_NUM_TOKENS must match the recipe. 0 is rejected (the compose
# renders --speculative-config unconditionally, so 0 means
# num_speculative_tokens:0, NOT disabled speculation). Otherwise the value
# must equal the compose default, or be 5 with DSPARK_ENABLE_DSPARK_BLOCK_K=1
# (block-k lifts the k%3 rule). Unset is fine: the compose default applies.
compose_mtp_default="$(grep -oE 'MTP_NUM_TOKENS:-[0-9]+' "$SCRIPT_DIR/docker-compose.dspark.yml" 2>/dev/null | head -1 | cut -d- -f2)"
compose_mtp_default="${compose_mtp_default:-6}"
current_mtp="$(grep -E '^MTP_NUM_TOKENS=' "$ENV_FILE" | tail -1 | cut -d= -f2- || true)"
block_k="$(grep -E '^DSPARK_ENABLE_DSPARK_BLOCK_K=' "$ENV_FILE" | tail -1 | cut -d= -f2- || true)"
if [ -n "$current_mtp" ] && [ "$current_mtp" != "$compose_mtp_default" ] && ! { [ "$current_mtp" = "5" ] && [ "${block_k:-0}" = "1" ]; }; then
  echo "ERROR: MTP_NUM_TOKENS=$current_mtp is set, but the recipe default is $compose_mtp_default (0 would render num_speculative_tokens:0 — not disabled speculation — and values below dspark_block_size=5 silently truncate draft blocks; 5 is only valid with DSPARK_ENABLE_DSPARK_BLOCK_K=1). Set MTP_NUM_TOKENS=$compose_mtp_default or remove the line (compose default applies) and re-run. Aborting with no changes to .env.dspark." >&2
  exit 1
fi

if [ "$(current_flag)" = "$TARGET_FLAG" ]; then
  echo "Already configured for: $(label "$TARGET_FLAG")"
elif grep -qE '^ABLITERATED=' "$ENV_FILE"; then
  sed -i -E "s|^ABLITERATED=.*|ABLITERATED=$TARGET_FLAG|" "$ENV_FILE"
  echo "Set ABLITERATED -> $TARGET_FLAG ($(label "$TARGET_FLAG"))"
else
  printf 'ABLITERATED=%s\n' "$TARGET_FLAG" >> "$ENV_FILE"
  echo "Set ABLITERATED -> $TARGET_FLAG (was unset; $(label "$TARGET_FLAG"))"
fi

echo "Restarting stack..."
"$SCRIPT_DIR/stop-deepseek-v4-flash-dspark.sh"
"$SCRIPT_DIR/start-deepseek-v4-flash-dspark.sh"
