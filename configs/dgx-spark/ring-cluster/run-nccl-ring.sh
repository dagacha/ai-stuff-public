#!/bin/bash
# 3-node ring NCCL all_gather test, same recipe as the DGX Spark playbook's spark_cluster_setup.py (run on head).
set -euo pipefail
export CUDA_HOME=/usr/local/cuda MPI_HOME=/usr/lib/aarch64-linux-gnu/openmpi
export NCCL_HOME=$HOME/nccl_spark_cluster/build
export LD_LIBRARY_PATH=$NCCL_HOME/lib:$CUDA_HOME/lib64:$MPI_HOME/lib:${LD_LIBRARY_PATH:-}
SIZE_B=${1:-16G}; SIZE_E=${2:-16G}; BIN=${3:-all_gather_perf}
# Bootstrap/socket plane (MPI, UCX, NCCL sockets) on the one L3 that reaches all three ranks: the playbook
# uses the RJ45 enP7s7; here that is unplugged, so Wi-Fi wlP9s9 / 192.168.1.0/24. The ring /24s are NOT
# usable for bootstrap (each node advertises one address only one peer can reach → init hangs). Data goes
# over RoCE: all four CX7 functions, subnet-aware routing picks the one that shares a /24 with each peer.
BOOT_IF=${BOOT_IF:-wlP9s9}; BOOT_NET=${BOOT_NET:-192.168.1.0/24}
exec mpirun -np 3 -H 10.10.0.1:1,10.10.0.2:1,10.10.2.2:1 --oversubscribe \
  --mca plm_rsh_agent "ssh -o UserKnownHostsFile=/dev/null -o StrictHostKeyChecking=no" \
  --mca btl_tcp_if_include "$BOOT_NET" \
  -x LD_LIBRARY_PATH -x UCX_NET_DEVICES="$BOOT_IF" -x NCCL_SOCKET_IFNAME="$BOOT_IF" \
  -x NCCL_IB_HCA=rocep1s0f0,rocep1s0f1,roceP2p1s0f0,roceP2p1s0f1 \
  -x NCCL_IB_SUBNET_AWARE_ROUTING=1 -x NCCL_IB_MERGE_NICS=0 -x NCCL_NET_PLUGIN=none \
  -x NCCL_DEBUG="${NCCL_DEBUG:-WARN}" \
  "$HOME/nccl-tests_spark_cluster/build/$BIN" -b "$SIZE_B" -e "$SIZE_E" -f 2
