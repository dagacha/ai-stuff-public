#!/bin/bash
# Starts tailscaled in userspace-networking mode (no /dev/net/tun required).
# Idempotent — skips if already running. State persists in /workspace/.tailscale/state/.
set -u

STATE_DIR=/workspace/.tailscale/state
LOG=/workspace/logs/tailscaled.log

log() { echo "tailscaled-launch: $*"; }
warn() { echo "tailscaled-launch: WARNING: $*" >&2; }

mkdir -p "$STATE_DIR" /workspace/logs

# Already running?
if pgrep -x tailscaled >/dev/null 2>&1; then
    log "already running (pid $(pgrep -x tailscaled))"
    exit 0
fi

# Check if binary exists
if [ ! -x /workspace/bin/tailscaled ]; then
    warn "tailscaled binary not found at /workspace/bin/tailscaled"
    warn "Run: cp /usr/sbin/tailscaled /workspace/bin/tailscaled && chmod +x /workspace/bin/tailscaled"
    exit 1
fi

log "starting tailscaled..."
nohup /workspace/bin/tailscaled \
    --tun=userspace-networking \
    --socks5-server=localhost:1055 \
    --outbound-http-proxy-listen=localhost:1056 \
    --statedir="$STATE_DIR" \
    >>"$LOG" 2>&1 &

TAILSCALED_PID=$!
log "started (pid $TAILSCALED_PID)"

# Wait a moment and verify it's running
sleep 2
if kill -0 "$TAILSCALED_PID" 2>/dev/null; then
    log "verified running"
else
    warn "tailscaled may have failed — check $LOG"
    exit 1
fi
