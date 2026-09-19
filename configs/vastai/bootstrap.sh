#!/bin/bash
# Restores ephemeral state that should point at the persistent /workspace volume.
# Safe to run repeatedly. Add to your Vast.ai instance onstart command:
#   bash /workspace/configs/bootstrap.sh
set -u

# --- Logging helpers ---
log() { echo "bootstrap: $*"; }
warn() { echo "bootstrap: WARNING: $*" >&2; }
fail() { echo "bootstrap: ERROR: $*" >&2; }

# --- Persistent home/app state (only activates on a fresh container) ---
# These ln -sfn calls only run when the destination is missing or already a
# symlink, so they never destroy a live directory on the source container
# where the stash was first created.
mkdir -p /root/.local/bin /root/.local/share /root/.config

# nvm/node — claude and any global npm tooling live here
if [ -d /workspace/opt/nvm ] && { [ -L /opt/nvm ] || [ ! -e /opt/nvm ]; }; then
    ln -sfn /workspace/opt/nvm /opt/nvm
fi

# Claude Code install tree (auto-update versions land here, persist to /workspace)
if [ -d /workspace/apps/claude ] && { [ -L /root/.local/share/claude ] || [ ! -e /root/.local/share/claude ]; }; then
    ln -sfn /workspace/apps/claude /root/.local/share/claude
fi
# Recreate the user-facing wrapper at /root/.local/bin/claude pointing at the
# newest version inside the persistent install tree.
if [ -d /workspace/apps/claude/versions ]; then
    LATEST_CLAUDE=$(ls -1 /workspace/apps/claude/versions/ 2>/dev/null | sort -V | tail -1)
    if [ -n "${LATEST_CLAUDE}" ]; then
        ln -sfn "/root/.local/share/claude/versions/${LATEST_CLAUDE}" /root/.local/bin/claude
    fi
fi

# Claude state/auth/sessions (subsumes the old projects/-workspace/memory symlink)
if [ -d /workspace/state/claude ] && { [ -L /root/.claude ] || [ ! -e /root/.claude ]; }; then
    ln -sfn /workspace/state/claude /root/.claude
fi

# gh auth state
if [ -d /workspace/state/gh-config ] && { [ -L /root/.config/gh ] || [ ! -e /root/.config/gh ]; }; then
    ln -sfn /workspace/state/gh-config /root/.config/gh
fi

# Source-container fallback: when /root/.claude is still a real directory
# (i.e. the stash was created on this machine but the symlink hasn't activated),
# keep the old per-project memory symlink working so auto-memory still persists.
if [ ! -L /root/.claude ]; then
    mkdir -p /workspace/.claude/memory /root/.claude/projects/-workspace
    if [ ! -L /root/.claude/projects/-workspace/memory ]; then
        rm -rf /root/.claude/projects/-workspace/memory 2>/dev/null || true
    fi
    ln -sfn /workspace/.claude/memory /root/.claude/projects/-workspace/memory
fi

# OpenCode config — keep the persistent JSON visible at ~/.config/opencode/
mkdir -p /root/.config/opencode
ln -sfn /workspace/configs/opencode.json /root/.config/opencode/opencode.json

# Disable the template's auto-tmux on SSH login (user preference).
# /root/.bashrc auto-attaches an `ssh_tmux` session unless this flag exists.
touch /root/.no_auto_tmux

# Persist flashinfer JIT cache across container rebuilds. Without this, every
# vLLM cold start spends ~4-5 min re-running nvcc on NVFP4 GEMM kernels.
mkdir -p /workspace/.cache/flashinfer /root/.cache
if [ ! -L /root/.cache/flashinfer ]; then
    rm -rf /root/.cache/flashinfer 2>/dev/null || true
    ln -sfn /workspace/.cache/flashinfer /root/.cache/flashinfer
fi

# cuRAND dev headers are needed by FlashInfer JIT (curand_kernel.h). The Vast.ai
# image ships nvcc 12.9 without them; install on first boot only.
if ! dpkg -s libcurand-dev-12-9 >/dev/null 2>&1; then
    DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends libcurand-dev-12-9 \
        || warn "libcurand-dev-12-9 install failed (FlashInfer JIT may fail)"
fi

# gh CLI — apt-install if missing (auth state persists via /workspace/state/gh-config).
if ! command -v gh >/dev/null 2>&1; then
    DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends gh \
        || warn "gh install failed"
fi

# Install Tailscale binaries if missing (persistent in /workspace/bin/)
install_tailscale() {
    if [ -x /workspace/bin/tailscale ] && [ -x /workspace/bin/tailscaled ]; then
        log "Tailscale binaries already present"
        return 0
    fi
    
    log "Installing Tailscale binaries..."
    
    # Install via apt if not already installed
    if ! command -v tailscale >/dev/null 2>&1; then
        if ! DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends tailscale; then
            warn "Tailscale apt install failed"
            return 1
        fi
    fi
    
    # Copy binaries to persistent storage
    local copied=false
    if [ -x /usr/bin/tailscale ] && [ ! -x /workspace/bin/tailscale ]; then
        cp /usr/bin/tailscale /workspace/bin/tailscale && chmod +x /workspace/bin/tailscale && copied=true
    fi
    if [ -x /usr/sbin/tailscaled ] && [ ! -x /workspace/bin/tailscaled ]; then
        cp /usr/sbin/tailscaled /workspace/bin/tailscaled && chmod +x /workspace/bin/tailscaled && copied=true
    fi
    
    if $copied; then
        log "Tailscale binaries copied to /workspace/bin/"
    fi
}
install_tailscale || warn "Tailscale installation had issues (continuing)"

# Expose /workspace/bin tools on PATH by symlinking into /usr/local/bin (ephemeral but on PATH).
for tool in edit tailscale tailscaled opencode; do
    if [ -x "/workspace/bin/$tool" ]; then
        ln -sfn "/workspace/bin/$tool" "/usr/local/bin/$tool"
    fi
done

# Ensure Tailscale state directory exists
mkdir -p /workspace/.tailscale/state /workspace/logs

# Start tailscaled in userspace mode (idempotent). State persists in /workspace/.tailscale/
if [ -x /workspace/bin/tailscaled-launch.sh ]; then
    /workspace/bin/tailscaled-launch.sh || warn "tailscaled-launch failed"
fi

# Start inference server (vLLM or llama-server)
start_inference_server() {
    # Check if already healthy
    if curl -sf http://127.0.0.1:18080/health >/dev/null 2>&1; then
        log "Inference server already healthy on :18080"
        return 0
    fi
    
    # Try vLLM first, fall back to llama-server
    if [ -x /workspace/bin/vllm-server-launch.sh ]; then
        log "Starting vLLM server..."
        if /workspace/bin/vllm-server-launch.sh; then
            return 0
        fi
        warn "vLLM launch failed — falling back to llama-server"
    fi
    
    if [ -x /workspace/bin/llama-server-launch.sh ]; then
        log "Starting llama-server..."
        if /workspace/bin/llama-server-launch.sh; then
            return 0
        fi
        warn "llama-server launch failed"
        return 1
    fi
    
    warn "No inference server launcher found"
    return 1
}
start_inference_server || warn "Inference server start had issues (continuing)"

# Wait briefly for inference server to become healthy (best effort)
for i in {1..10}; do
    if curl -sf http://127.0.0.1:18080/health >/dev/null 2>&1; then
        log "Inference server healthy"
        break
    fi
    sleep 2
done

log "ok"
