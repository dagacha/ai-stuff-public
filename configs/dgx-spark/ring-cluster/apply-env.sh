#!/bin/bash
# Repoint both serving stacks to the ring addressing. Run on the head after verify-ring.sh exits 0.
# Refuses to overwrite an existing *.pre-ring.bak (that is the rollback copy); set FORCE_BACKUP=1
# to take a fresh timestamped backup instead. A run that dies mid-way leaves the backup in place
# and the next run refuses — inspect, then rerun with FORCE_BACKUP=1.
set -euo pipefail
G=~/GLM-5.3-Flash-EXL3-2x-DGX-Sparks/.env
S=~/DeepSeek-v4-Flash-DSpark-2x-DGX-Spark/.env.dspark
backup(){ # keep the first pre-ring copy intact; never clobber it
  if [ -e "$1.pre-ring.bak" ]; then
    if [ "${FORCE_BACKUP:-0}" = 1 ]; then cp -p "$1" "$1.pre-ring.$(date +%Y%m%d-%H%M%S).bak"; echo "backup exists, wrote timestamped copy for $1"
    else echo "refusing: $1.pre-ring.bak already exists (rerun? set FORCE_BACKUP=1 for a timestamped copy)"; exit 1; fi
  else cp -p "$1" "$1.pre-ring.bak"; fi
}
set_kv(){ # set_kv FILE KEY VALUE — replace the line if the key exists, else append
  if grep -qE "^$2=" "$1"; then sed -i "s|^$2=.*|$2=$3|" "$1"; else printf '%s=%s\n' "$2" "$3" >> "$1"; fi
}
backup "$G"; backup "$S"
# GLM launcher: per-node CX7 pins are first-class keys (head pin = Port0, the deliberate divergence
# from upstream's Port1 head cabling; wrong pin hangs ncclCommInitRank)
set_kv "$G" HEAD_IP 10.10.0.1;   set_kv "$G" WORKER_IP 10.10.0.2
set_kv "$G" HEAD_CX7_IF enp1s0f0np0; set_kv "$G" HEAD_CX7_IB rocep1s0f0
set_kv "$G" WORKER_CX7_IF enp1s0f1np1; set_kv "$G" WORKER_CX7_IB rocep1s0f1
# DSpark launcher: head values are the plain keys, the worker gets WORKER_* overrides
# (start-deepseek-v4-flash-dspark.sh: WORKER_NCCL_IB_HCA / WORKER_{NCCL,TP,GLOO}_SOCKET_IFNAME default to
# the head values; the compose injects only NCCL_IB_HCA + the three *_SOCKET_IFNAME keys, nothing reads a
# VLLM_SOCKET_IFNAME). The launcher validates each node's HCA + RoCEv2 GID at boot and exits FATAL on a
# wrong pin instead of hanging.
set_kv "$S" WORKER_HOST 10.10.0.2;  set_kv "$S" MASTER_ADDR 10.10.0.1
set_kv "$S" VLLM_HOST_IP 10.10.0.1; set_kv "$S" WORKER_VLLM_HOST_IP 10.10.0.2
set_kv "$S" NCCL_IB_HCA rocep1s0f0
for k in NCCL_SOCKET_IFNAME TP_SOCKET_IFNAME GLOO_SOCKET_IFNAME; do set_kv "$S" $k enp1s0f0np0; done
set_kv "$S" WORKER_NCCL_IB_HCA rocep1s0f1
for k in WORKER_NCCL_SOCKET_IFNAME WORKER_TP_SOCKET_IFNAME WORKER_GLOO_SOCKET_IFNAME; do set_kv "$S" $k enp1s0f1np1; done
sed -i '/^VLLM_SOCKET_IFNAME=/d' "$S"   # dead key (no reader in the launcher or compose); drop it if present
echo "== GLM"; grep -nE '^(HEAD|WORKER)_(IP|CX7)' "$G" || true
echo "== DSpark"; grep -nE '^(WORKER_)?(NCCL_IB_HCA|(NCCL|TP|GLOO)_SOCKET_IFNAME|WORKER_HOST|MASTER_ADDR|VLLM_HOST_IP|WORKER_VLLM_HOST_IP)=' "$S" || true
exit 0
