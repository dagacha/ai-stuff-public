#!/usr/bin/env bash
# switch-stack.sh — flip the 2x DGX Spark cluster between its two serving
# stacks. They are mutually exclusive: both bind :8888 on the head and each
# needs ~all of every GB10's 128 GB unified memory, so exactly one may run.
#
#   deepseek : DeepSeek V4 Flash DSpark   ~/DeepSeek-v4-Flash-DSpark-2x-DGX-Spark
#              (compose project deepseek-v4-flash, model id deepseek-v4-flash-dspark)
#   glm      : GLM-5.3-Flash EXL3         ~/GLM-5.3-Flash-EXL3-2x-DGX-Sparks
#              (containers glm53-exl3-head / -worker, model id GLM-5.3-Flash-EXL3)
#
#   ./switch-stack.sh status      # what is running on head + worker, API health, served model
#   ./switch-stack.sh deepseek    # tear down whatever runs (BOTH nodes), start DSpark, wait for health
#   ./switch-stack.sh glm         # tear down whatever runs (BOTH nodes), start GLM, wait for health
#   ./switch-stack.sh stop        # tear down whatever runs (BOTH nodes), start nothing
#
# Each stack is started/stopped through its own launcher (they scp/rsync their
# config to the worker and know their own container/compose names), so this
# script only sequences them and adds the cross-stack safety checks:
#   * refuses to start while either stack still has a container on either node
#     (a rank left on the worker joins the wrong NCCL rendezvous and hangs);
#   * waits for unified memory to be released on BOTH nodes before starting —
#     killing a stack mid-warmup can leave GPU state that crashes the next
#     boot with "Triton Error [CUDA]: operation not permitted";
#   * aborts if the worker is unreachable (a stop that cannot reach the worker
#     leaves a stale rank that resurrects on reboot).
#
# Knobs (env):
#   DSPARK_DIR / GLM_DIR   repo checkouts (defaults above)
#   GLM_FRESH=1            let the GLM launcher docker-pull, re-verify the overlay
#                          and rsync weights to the worker (default: skip all —
#                          image + weights are already on both nodes; ~7.5 min boot)
#   MEM_FREE_MIN_GB        unified memory that must be available on each node
#                          before a start (default 100)
#
# Run from the head node. Both launchers block until their API is healthy (or
# time out), so a switch takes ~8 min (glm) / ~10+ min (deepseek) end to end.
set -euo pipefail

DSPARK_DIR="${DSPARK_DIR:-$HOME/DeepSeek-v4-Flash-DSpark-2x-DGX-Spark}"
GLM_DIR="${GLM_DIR:-$HOME/GLM-5.3-Flash-EXL3-2x-DGX-Sparks}"
MEM_FREE_MIN_GB="${MEM_FREE_MIN_GB:-100}"
PORT=8888

DSPARK_ENV="$DSPARK_DIR/.env.dspark"
GLM_ENV="$GLM_DIR/.env"
DSPARK_NAME_RE='^deepseek-v4-flash'      # compose project name prefix (main + VL sidecar)
GLM_NAME_RE='^glm53-exl3-'

log()  { printf '[switch-stack] %s\n' "$*"; }
warn() { printf '[switch-stack] WARN: %s\n' "$*" >&2; }
die()  { printf '[switch-stack] ERROR: %s\n' "$*" >&2; exit 1; }

# Read a value from an env file the way its launcher would (sourced, in a
# subshell, output discarded).
env_get() { ( set +u; . "$1" >/dev/null 2>&1; eval "printf '%s' \"\${$2-}\"" ); }

[ -d "$DSPARK_DIR" ] || die "DSpark checkout not found at $DSPARK_DIR"
[ -d "$GLM_DIR" ]    || die "GLM checkout not found at $GLM_DIR"
[ -f "$DSPARK_ENV" ] || die "$DSPARK_ENV missing"
[ -f "$GLM_ENV" ]    || die "$GLM_ENV missing (cp .env.example .env and set HEAD_IP/WORKER_IP/CX7 pins)"

WORKER_HOST="$(env_get "$DSPARK_ENV" WORKER_HOST)"
GLM_WORKER_IP="$(env_get "$GLM_ENV" WORKER_IP)"
GLM_WORKER_USER="$(env_get "$GLM_ENV" WORKER_USER)"
[ -n "$WORKER_HOST" ] || die "WORKER_HOST not set in $DSPARK_ENV"
[ "$WORKER_HOST" = "$GLM_WORKER_IP" ] \
  || die "worker mismatch: DSpark WORKER_HOST=$WORKER_HOST vs GLM WORKER_IP=$GLM_WORKER_IP — fix one .env before switching"
WORKER_SSH="${GLM_WORKER_USER:+$GLM_WORKER_USER@}$WORKER_HOST"

worker_ssh() { ssh -o BatchMode=yes -o ConnectTimeout=10 "$WORKER_SSH" "$@"; }

# ------------------------------------------------------------------ probes --
# Container names of either stack on a node. $1 = local|remote.
# Fail-closed by RETURN CODE: a failed docker/ssh probe must not read as
# "no containers" (an unreadable node may still hold a live rank). die here
# would only exit the $()-subshell of a caller, so the failure is returned
# instead and EVERY caller must check it.
stack_containers() {
  local out
  if [ "$1" = local ]; then
    out="$(docker ps -a --format '{{.Names}}\t{{.Status}}')" \
      || { warn "docker ps failed on the head"; return 1; }
  else
    out="$(worker_ssh 'docker ps -a --format "{{.Names}}\t{{.Status}}"')" \
      || { warn "docker ps failed on ${WORKER_SSH}"; return 1; }
  fi
  printf '%s\n' "$out" | grep -E "$DSPARK_NAME_RE|$GLM_NAME_RE" || true
}
# deepseek | glm | none | mixed; propagates a failed probe as nonzero rc.
stack_on() {
  local names ds=0 glm=0
  names="$(stack_containers "$1")" || return 1
  names="$(printf '%s\n' "$names" | cut -f1)"
  grep -qE "$DSPARK_NAME_RE" <<<"$names" && ds=1
  grep -qE "$GLM_NAME_RE"    <<<"$names" && glm=1
  case "$ds$glm" in 10) echo deepseek ;; 01) echo glm ;; 00) echo none ;; *) echo mixed ;; esac
}
mem_avail_gb() {  # $1 = local|remote
  local cmd="free -g | awk 'NR==2{print \$7}'"
  if [ "$1" = local ]; then eval "$cmd"; else worker_ssh "$cmd"; fi
}
api_health() { curl -fsS -m 5 "http://127.0.0.1:${PORT}/health" >/dev/null 2>&1; }
api_model()  { curl -fsS -m 5 "http://127.0.0.1:${PORT}/v1/models" 2>/dev/null \
                 | python3 -c 'import sys,json; print(",".join(m["id"] for m in json.load(sys.stdin)["data"]))' 2>/dev/null || true; }

require_worker() {
  worker_ssh true 2>/dev/null || die "cannot ssh to ${WORKER_SSH} — refusing to switch (a stale worker rank would survive)"
}

# ------------------------------------------------------------------ status --
status() {
  local node
  for node in local remote; do
    local label="head ($(hostname))"; [ "$node" = remote ] && label="worker ($WORKER_SSH)"
    if [ "$node" = remote ] && ! worker_ssh true 2>/dev/null; then
      echo "$label: UNREACHABLE"; continue
    fi
    local st mem
    st="$(stack_on "$node")" || { echo "$label: container probe FAILED"; continue; }
    mem="$(mem_avail_gb "$node")" || mem="?"
    echo "$label: stack=$st  mem_avail=$mem GB"
    { stack_containers "$node" || true; } | sed 's/^/    /'
  done
  if api_health; then
    echo "API :${PORT}: healthy, serving [$(api_model)]"
  else
    echo "API :${PORT}: not responding"
  fi
  echo "configured: deepseek ABLITERATED=$(env_get "$DSPARK_ENV" ABLITERATED) MAX_MODEL_LEN=$(env_get "$DSPARK_ENV" MAX_MODEL_LEN)"
  echo "            glm      MAX_MODEL_LEN=$(env_get "$GLM_ENV" MAX_MODEL_LEN) GPU_MEM_UTIL=$(env_get "$GLM_ENV" GPU_MEM_UTIL) LANGUAGE_MODEL_ONLY=$(env_get "$GLM_ENV" LANGUAGE_MODEL_ONLY) SPEC_METHOD=$(env_get "$GLM_ENV" SPEC_METHOD) ABLIT=$(env_get "$GLM_ENV" ABLIT)"
}

# -------------------------------------------------------------------- stop --
stop_all() {
  local head worker
  head="$(stack_on local)"    || die "cannot inspect containers on the head"
  worker="$(stack_on remote)" || die "cannot inspect containers on the worker"
  if [ "$head" = none ] && [ "$worker" = none ]; then
    log "nothing running on either node"; return 0
  fi
  if { [ "$head" != glm ] && [ "$head" != none ]; } \
     || { [ "$worker" != glm ] && [ "$worker" != none ]; }; then
    log "stopping DeepSeek DSpark on both nodes ..."
    (cd "$DSPARK_DIR" && ./stop-deepseek-v4-flash-dspark.sh) \
      || die "DSpark stop reported failures — not starting anything on top of a possibly-live rank"
  fi
  if { [ "$head" != deepseek ] && [ "$head" != none ]; } \
     || { [ "$worker" != deepseek ] && [ "$worker" != none ]; }; then
    log "stopping GLM-5.3-Flash on both nodes ..."
    (cd "$GLM_DIR" && ./start.sh stop) || die "GLM stop failed"
  fi
  # Sweep non-running leftovers of either stack (a crashed boot leaves an
  # Exited container behind — e.g. an OOM-killed head — which must not block
  # later switches). Only names matching the two stacks' patterns are removed.
  local node names
  for node in local remote; do
    names="$(stack_containers "$node")" \
      || die "cannot re-inspect containers on $node after stop"
    names="$(printf '%s\n' "$names" | awk -F'\t' '$2 !~ /^Up/ {print $1}')"
    [ -n "$names" ] || continue
    log "removing stopped leftover container(s) on $node: $(printf '%s ' $names)"
    if [ "$node" = local ]; then
      printf '%s\n' $names | xargs -r docker rm -f >/dev/null
    else
      worker_ssh "docker rm -f $(printf '%s ' $names)" >/dev/null
    fi
  done
  # Belt and braces: nothing of either stack may still be RUNNING anywhere.
  local left_l left_r left
  left_l="$(stack_containers local)"  || die "cannot re-inspect containers on the head"
  left_r="$(stack_containers remote)" || die "cannot re-inspect containers on the worker"
  left="$(printf '%s\n%s\n' "$left_l" "$left_r" | awk -F'\t' '$2 ~ /^Up/')"
  if [ -n "$left" ]; then
    warn "containers still running after stop:"; printf '%s\n' "$left" >&2
    die "stop them by hand (docker rm -f on the node shown) and re-run"
  fi
  log "both nodes clear"
}

wait_memory_released() {
  local node avail i
  for node in local remote; do
    for i in $(seq 1 30); do
      avail="$(mem_avail_gb "$node")"
      [ "${avail:-0}" -ge "$MEM_FREE_MIN_GB" ] && break
      [ "$i" = 1 ] && log "waiting for unified memory to drain on $node (avail ${avail} GB, need ${MEM_FREE_MIN_GB}) ..."
      sleep 2
    done
    [ "${avail:-0}" -ge "$MEM_FREE_MIN_GB" ] \
      || die "$node still has only ${avail} GB available after 60s — something else holds memory; not starting"
  done
}

port_free() {
  # Fail-closed: if ss itself is missing or fails, do not report "free".
  local out
  out="$(ss -ltn 2>&1)" || die "ss -ltn failed (${out}) — cannot verify port ${PORT} is free"
  ! printf '%s\n' "$out" | awk '{print $4}' | grep -qE "[:.]${PORT}$"
}

# ------------------------------------------------------------------- start --
start_deepseek() {
  log "starting DeepSeek DSpark (its launcher waits for health) ..."
  (cd "$DSPARK_DIR" && ./start-deepseek-v4-flash-dspark.sh)
}
start_glm() {
  if [ "${GLM_FRESH:-0}" = "1" ]; then
    log "starting GLM-5.3-Flash EXL3 with pull + overlay verify + worker rsync (GLM_FRESH=1) ..."
    (cd "$GLM_DIR" && ./start.sh)
  else
    log "starting GLM-5.3-Flash EXL3 (image + weights assumed present on both nodes; GLM_FRESH=1 to pull/sync) ..."
    (cd "$GLM_DIR" && SKIP_PULL=1 SKIP_DOWNLOAD=1 SKIP_SYNC=1 SKIP_OVERLAY_VERIFY=1 ./start.sh)
  fi
}

switch_to() {
  local target="$1" head worker
  require_worker
  head="$(stack_on local)"    || die "cannot inspect containers on the head"
  worker="$(stack_on remote)" || die "cannot inspect containers on the worker"
  if [ "$head" = "$target" ] && [ "$worker" = "$target" ] && api_health; then
    log "$target is already running and healthy (serving [$(api_model)]) — nothing to do"
    return 0
  fi
  stop_all
  port_free || die "port ${PORT} still bound on the head after stop"
  wait_memory_released
  case "$target" in
    deepseek) start_deepseek ;;
    glm)      start_glm ;;
  esac
  local i
  for i in $(seq 1 12); do api_health && break; sleep 5; done
  api_health || die "$target launcher returned but :${PORT}/health is not answering — check its logs"
  log "======================================================================"
  log "$target is UP — http://127.0.0.1:${PORT}/v1  serving [$(api_model)]"
  log "======================================================================"
}

# -------------------------------------------------------------------- main --
case "${1:-}" in
  status)        status ;;
  stop)          require_worker; stop_all ;;
  deepseek|glm)  switch_to "$1" ;;
  ""|-h|--help|help)
    awk 'NR==1{next} /^#/{sub(/^# ?/,""); print; next} {exit}' "$0"
    [ -n "${1:-}" ] || exit 1 ;;
  *) die "unknown command '$1' (status | deepseek | glm | stop)" ;;
esac
