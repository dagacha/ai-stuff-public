#!/bin/bash
# Starts llama-server serving Gemma-4-31B-it UD-Q4_K_XL on 127.0.0.1:18080 with 131K context.
# No --parallel flag: llama-server auto-picks n_parallel=4 with a unified KV cache
# (kv_unified=true) — each slot serves the full 131072-token context (not divided),
# and up to 4 requests run concurrently. See configs/vastai/OPENCODE.md.
# Idempotent — skips if already healthy.
set -u

PORT=18080
MODEL=/workspace/models/gemma-4-31B-it-GGUF/gemma-4-31B-it-UD-Q4_K_XL.gguf
LOG=/workspace/logs/llama-server-31b.log

log() { echo "llama-server-launch: $*"; }
warn() { echo "llama-server-launch: WARNING: $*" >&2; }

# Already healthy?
if curl -fsS --max-time 2 "http://127.0.0.1:${PORT}/health" >/dev/null 2>&1; then
    log "already healthy on :${PORT}"
    exit 0
fi

# Already starting?
if pgrep -f "llama-server.*${PORT}" >/dev/null 2>&1; then
    log "process already running, waiting on /health"
    exit 0
fi

# Check if model exists
if [ ! -f "$MODEL" ]; then
    warn "model not found at $MODEL"
    exit 1
fi

# Check if llama-server binary exists
LLAMA_SERVER="/workspace/unsloth/llama.cpp/build/bin/llama-server"
if [ ! -x "$LLAMA_SERVER" ]; then
    warn "llama-server binary not found at $LLAMA_SERVER"
    exit 1
fi

mkdir -p /workspace/logs

log "starting llama-server..."
nohup "$LLAMA_SERVER" \
  -m "${MODEL}" \
  --host 127.0.0.1 \
  --port "${PORT}" \
  --ctx-size 131072 \
  --n-gpu-layers 99 \
  --flash-attn on \
  --cache-type-k q8_0 \
  --cache-type-v q8_0 \
  --no-mmap \
  --temp 1.0 \
  --top-p 0.95 \
  --top-k 64 \
  >>"${LOG}" 2>&1 &

LLAMA_PID=$!
log "started (pid $LLAMA_PID) — tail ${LOG} for progress"

# Wait a bit and check if process is still running
sleep 5
if kill -0 "$LLAMA_PID" 2>/dev/null; then
    log "process running, waiting for model to load..."
else
    warn "llama-server may have failed — check ${LOG}"
    exit 1
fi
