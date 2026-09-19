#!/bin/bash
# Flush live home-state dirs back to the persistent /workspace stash.
# Run this BEFORE stopping/destroying a container that has /root/.claude or
# /root/.config/gh as live directories (i.e. the source container where the
# stash was first created). On containers where these are already symlinks,
# this is a no-op.
set -eu

sync_dir() {
    local src=$1 dst=$2 label=$3
    if [ -L "$src" ]; then
        echo "sync-home-state: ${label} (${src}) is already a symlink, skipping"
        return 0
    fi
    if [ ! -d "$src" ]; then
        echo "sync-home-state: ${label} (${src}) not present, skipping"
        return 0
    fi
    mkdir -p "$dst"
    rsync -a --delete "${src}/" "${dst}/"
    echo "sync-home-state: ${label} ${src} -> ${dst}"
}

sync_dir /root/.claude        /workspace/state/claude     "claude state"
sync_dir /root/.config/gh     /workspace/state/gh-config  "gh auth"
sync_dir /root/.local/share/claude /workspace/apps/claude "claude binaries"
sync_dir /opt/nvm             /workspace/opt/nvm          "nvm/node"

echo "sync-home-state: done"
