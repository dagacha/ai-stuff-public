# 3× DGX Spark ring cluster (CX7 direct-connect)

**Status:** active — verified 2026-09-12 (`verify-ring.sh` reports `all 14 checks OK`);
**GLM-5.3-Flash serves TP=3 on all three nodes since 2026-09-15** (DSpark env
repointed but not yet booted on the ring).

Runbook for the three-node ring built on 2026-09-11 from NVIDIA's
[connect-three-sparks](https://github.com/NVIDIA/dgx-spark-playbooks/tree/main/nvidia/connect-three-sparks)
playbook: `spark-head` (Node1), `gn100-worker` (Node2) and `spark-indie`
(Node3, an ASUS Ascent GX10). **GLM-5.3-Flash TP=3 is the serving job on
this ring** since 2026-09-15: the head is rank 0, the indie is rank 1 and the
worker is rank 2 ([`glm-5.3-flash-exl3.md` → TP=3](glm-5.3-flash-exl3.md#tp3-on-the-3-node-ring-2026-09-15-restart-2026-09-18)).
The indie's own single-node stack (Qwen3.8-Flash-Next) is stopped while TP=3
holds its GB10. Before 09-15 serving was 2-node TP=2 on head+worker with the
indie as a fabric participant only; that layout remains the fallback.

Files: [`ring-cluster/`](ring-cluster/) — per-node netplan, apply/verify
scripts, the env repoint script, the NCCL build + ring test runners, and the
final NCCL result.

## Topology and addressing

Cabling is always **Port0 → Port1** around the ring (Port0 = the CX7 cage next
to the RJ45 port):

| Link | A | B |
|---|---|---|
| 1 | head Port0 (`enp1s0f0np0`) | worker Port1 (`enp1s0f1np1`) |
| 2 | worker Port0 | indie Port1 |
| 3 | indie Port0 | head Port1 |

Each physical port exposes two PCIe functions (`enp1s0f*` on domain 0000 and
`enP2p1s0f*` on domain 0002); all four get an address per node, as the
playbook requires for full 200 G. **The playbook's 192.168.0–5.x subnets were
remapped to 10.10.0–5.x** because the home LAN (and both nodes' default route)
is 192.168.1.0/24.

| Node | `enp1s0f0np0` | `enP2p1s0f0np0` | `enp1s0f1np1` | `enP2p1s0f1np1` |
|---|---|---|---|---|
| head (Node1) | 10.10.0.1 | 10.10.1.1 | 10.10.2.1 | 10.10.3.1 |
| worker (Node2) | 10.10.4.1 | 10.10.5.1 | **10.10.0.2** | 10.10.1.2 |
| indie (Node3) | 10.10.2.2 | 10.10.3.2 | 10.10.4.2 | 10.10.5.2 |

The head↔worker **serving link is 10.10.0.1 ↔ 10.10.0.2**, i.e. the worker's
serving interface moved from `enp1s0f0np0`/`rocep1s0f0` to
**`enp1s0f1np1`/`rocep1s0f1`**. Node pairs are only reachable over their own
link subnet; there is no general routing across the ring (fine for NCCL,
see below) — the one exception is three `/32` control-plane routes for GLM
TP=3, see [TP=3 control-plane routes](#tp3-control-plane-routes).

Rollback to the old 2-node point-to-point config (172.31.100.1/.2 on Port0):
`/root/netplan-pre-ring/` on each node holds a copy of the previous
`/etc/netplan` plus the old `40-cx7-cluster.yaml` itself, moved there as
`40-cx7-cluster.yaml.moved` (a replaced `40-cx7.yaml` lands as
`40-cx7.yaml.replaced`); `~/dspark-backup-pre-ring/` on the head has the old
env files.

## Cutover procedure (as executed)

1. Full teardown of the serving stack on both nodes (`switch-stack.sh stop`).
2. Snapshot netplan / `ip -br addr` / `ibdev2netdev` / env files.
3. Recable per the table above (only the worker end of the existing cable moves).
4. On each node: `sudo bash apply-netplan.sh nodeN-40-cx7.yaml` — copies
   `/etc/netplan` to `/root/netplan-pre-ring` (refuses to overwrite an
   existing copy; `FORCE_BACKUP=1` uses a timestamped dir), moves the old
   `40-cx7-cluster.yaml` (and any existing `40-cx7.yaml`) into that
   backup, installs `40-cx7.yaml`
   (`optional: true` on all four interfaces so boot does not wait on a down
   link), validates with `netplan generate` and only then applies; if
   validation fails both moved files are put back and nothing is applied. Do the
   worker over Tailscale/Wi-Fi, not over the CX7 address that is going away.
5. `verify-ring.sh` on the head, after exchanging ssh keys so the head can
   ssh to the worker (Tailscale) and to the indie over the ring: pings every
   link address from both ends (4 from the head, 4 from the worker, 4 from the
   indie) and ssh's to both peers over the ring; prints `all 14 checks OK`
   or exits 1 with the failure count, so `verify-ring.sh && apply-env.sh` is a real
   gate.
6. `apply-env.sh` on the head: repoints the GLM `.env` (`HEAD_IP`,
   `WORKER_IP`; head pin `HEAD_CX7_IF=enp1s0f0np0` / `HEAD_CX7_IB=rocep1s0f0`
   — the deliberate Port0 divergence from upstream's Port1 head cabling that
   the GLM runbook's deltas table records, wrong pin hangs `ncclCommInitRank`;
   worker pin `WORKER_CX7_IF=enp1s0f1np1` / `WORKER_CX7_IB=rocep1s0f1`) and
   the DSpark `.env.dspark` (`WORKER_HOST`, `MASTER_ADDR`, `VLLM_HOST_IP`,
   `WORKER_VLLM_HOST_IP`; head keeps `NCCL_IB_HCA=rocep1s0f0` and the
   `enp1s0f0np0` socket interfaces, and the worker gets the launcher's
   per-node overrides `WORKER_NCCL_IB_HCA=rocep1s0f1` and
   `WORKER_{NCCL,TP,GLOO}_SOCKET_IFNAME=enp1s0f1np1`, which the launcher
   passes to the worker's compose and validates per node at boot — a wrong
   pin exits `FATAL` rather than hanging). It also deletes any
   `VLLM_SOCKET_IFNAME` line: nothing in the pinned launcher or compose reads
   that key. The first run writes `*.pre-ring.bak` and later runs refuse to
   overwrite it (`FORCE_BACKUP=1` takes a timestamped copy).
7. Restart the stack (`switch-stack.sh glm`) and smoke-test. GLM came back
   with the same KV pool (815 k tokens at 700 k ctx), 64 tok/s structured
   decode, tool calls parsing.

## NCCL validation (playbook step 6)

The ring needs NVIDIA's NCCL fork branch `dgxspark-3node-ring`
(`zyang-dev/nccl`, adds `NCCL_IB_SUBNET_AWARE_ROUTING` so each rank picks the
local NIC that shares a subnet with its peer). `build-nccl.sh` builds it plus
`nccl-tests` in `$HOME` on every node (no sudo; needs `libopenmpi-dev`).
`run-nccl-ring.sh` runs the playbook's `all_gather_perf -b 16G -e 16G`
across the three nodes.

Two deviations from the playbook command (the one `spark_cluster_setup.py`
in the [multi-sparks-through-switch](https://github.com/NVIDIA/dgx-spark-playbooks/tree/main/nvidia/multi-sparks-through-switch/assets/spark_cluster_setup)
assets builds; step 6 of the three-Sparks playbook delegates to it):

- **Bootstrap/socket plane on Wi-Fi (`UCX_NET_DEVICES` /
  `NCCL_SOCKET_IFNAME=wlP9s9`, `btl_tcp_if_include 192.168.1.0/24`).** The
  playbook pins all three to the wired `enP7s7`, which is unplugged here. The
  ring interfaces cannot be used for bootstrap: each node advertises one
  address and only one of its two peers can reach it, so NCCL init hangs
  forever. Data still goes over RoCE. This is the playbook's own design, not
  a workaround: the pinned DSpark launcher's 3-node mode (`DSPARK_TP3=1` /
  `start-tp3.sh`, `apply_tp3_bootstrap_ifaces()`) does the same — Gloo/NCCL
  socket/TP plane on the one LAN interface that reaches all three ranks
  ("the only L3 that reaches all three ranks"), `NCCL_IB_HCA` on both CX
  ports, `NCCL_IB_MERGE_NICS=0`, `NCCL_IB_SUBNET_AWARE_ROUTING=1`, subnet
  prefix `/24`. So the ring built here is exactly the topology that TP=3
  mode expects — and GLM's TP=3 launcher has served on it since 2026-09-15
  (its bootstrap plane is the CX7 links plus `/32` routes, see
  [TP=3 control-plane routes](#tp3-control-plane-routes), since the
  management LAN is down). The
  knob is a version boundary: NVIDIA NCCL ≤ `v2.29.7-1` (the fork's base) has
  neither `NCCL_IB_SUBNET_AWARE_ROUTING` nor `NCCL_IB_SUBNET_PREFIX_LEN`,
  NVIDIA master has both as of 2026-09-12
  (`src/transport/net_ib/connect.cc`, default 0). Cheap check for any image
  before trying TP=3: `strings <libnccl.so> | grep IB_SUBNET_AWARE_ROUTING`
  inside the container. Done 2026-09-12 for the pinned DSpark image
  (`anemll/dspark-vllm-gx10:0.1.1`): it ships two NCCLs — the system
  `libnccl.so.2.28.9` (no knob) and the pip `nvidia-nccl-cu13` 2.30.7 that
  torch actually links (`ldd libtorch_cuda.so`; knob present, even though
  `torch.cuda.nccl.version()` reports the compile-time 2.28.9). So a DSpark
  TP=3 boot would get the routing behaviour; DSpark TP=3 itself is still
  untested here (GLM TP=3, on its own image, is the one that runs).
- `--oversubscribe` (harmless; OpenMPI slot accounting).

Result 2026-09-11 (`ring-cluster/nccl-ring-16g-2026-09-11.txt`, header
records the command, ranks, NCCL fork commit `fab1850` and nccl-tests build):
**22.9 GB/s bus bandwidth**, 0 wrong values. NVIDIA's `spark_cluster_setup.py`
threshold for the ring is 10 GB/s; pairwise 2-node runs give ~21 GB/s, the
same ceiling the community reports for host-staged RoCE on GB10.
GPUDirect RDMA is **not** available on GB10
(`CU_DEVICE_ATTRIBUTE_DMA_BUF_SUPPORTED=0`, `nvidia-peermem` will not load,
[NVIDIA KB 5780](https://nvidia.custhelp.com/app/answers/detail/a_id/5780));
`GDR 0` in the NCCL log is expected and is not the bottleneck.

## Gotchas found on the way (both cost hours)

### Worker: `iommu.passthrough=0` capped NCCL at 3.0 GB/s

The worker booted with `/etc/default/grub.d/iommu.cfg` adding
`iommu.passthrough=0` (present since its initial setup, no documented reason;
the head has no such file). Its ConnectX-7 then sat in SMMU `DMA-FQ`
translated mode and **RDMA reads from the worker's memory capped at
~13–15 Gb/s per function**, even from plain `malloc` memory. Symptoms were
misleading: plain `ib_write_bw` from the head looked healthy (that only
exercises NIC *writes* into the worker), and every NCCL pair involving the
worker sat at a flat 3.0 GB/s regardless of NCCL version, channels, buffer
size, GID index, TC, cuMem or the GPU clock cap. The head↔indie pair at
20.9 GB/s was the tell. Fix: delete the file, `update-grub`, reboot →
NIC iommu group type `identity`, 21 GB/s. Check with
`cat /sys/kernel/iommu_groups/$(basename $(readlink /sys/bus/pci/devices/0000:01:00.0/iommu_group))/type`.

### Indie: `dgx-spark-mlnx-hotplug` ejects the CX7 at every boot

`dgx-spark-mlnx-hotplug` 26.01-1 (arrives with `nvidia-system-station`
2404.26.01 / kernel 6.17.0-1032) drops `/etc/nvidia/cx7-hotplug-enabled`; its
udev rule runs `/opt/nvidia/dgx-spark-mlnx-hotplug/mtk-hotplug-handler.sh`,
which enables the `cx7-pcie-hotplug` (ACPI `MTKP0001`) driver. On this unit
the driver decided "Cable removal" ~16 s after every boot and **removed all
four CX7 PCI functions** (`E-Switch: cleanup` ×4, root ports drop to Gen1).
Symptoms: no `enp1s0*/enP2p1s0*` netdevs, `lspci` shows no `15b3:` device,
and `echo 1 > /sys/bus/pci/rescan` **hangs the machine hard**. Fix: remove the
marker file (the handler's own "safe default" then disables hotplug) and
reboot. **The head and worker do not have this package yet — after any
system update, check for `/etc/nvidia/cx7-hotplug-enabled` and delete it.**
After that fix the indie's cages still reported "No cable" until its cable
ends were reseated with a firm push (the presence pin needs the latch click).

### Operational notes

- The CX7 MTU is 1500 (RoCE MTU 1024) as in the playbook; jumbo frames were
  not needed for the numbers above.
- Reaching the worker while its CX7 address changes: Tailscale
  `100.<tailscale-ip-6>` or Wi-Fi `192.168.1.175`. The indie is `dgx@10.10.2.2`
  over the ring or `100.<tailscale-ip-3>` on Tailscale.
- `pkill -f`/`pgrep -f` with a pattern that also appears in your own shell's
  command line kills your own session (bit us three times) — use `pgrep -x`.
- `switch-stack.sh` cross-checks DSpark `WORKER_HOST` against GLM
  `WORKER_IP`; both must say `10.10.0.2`.

### TP=3 control-plane routes

GLM's 3-node launcher ([`glm-5.3-flash-exl3.md` → TP=3](glm-5.3-flash-exl3.md#tp3-on-the-3-node-ring-2026-09-15-restart-2026-09-18))
bootstraps Gloo/NCCL over a per-rank `SOCKET_IFNAME` on the CX7 links
because the management LAN is down on all three nodes. Each worker
therefore needs a host route to the rank it has no cable to, via the peer
it does have a cable to. The head needs none (direct link to both).

| Node | Route | Why |
|---|---|---|
| indie gx10 (Node3) | `10.10.0.1/32 via 10.10.2.1 dev enp1s0f0np0` | head's serving address, over the gx10↔head link |
| indie gx10 (Node3) | `10.10.0.2/32 via 10.10.4.1 dev enp1s0f1np1` | gn100's serving address, over the gx10↔gn100 link |
| worker gn100 (Node2) | `10.10.2.2/32 via 10.10.4.2 dev enp1s0f0np0` | gx10's address, over the gn100↔gx10 link |

Added by hand with `ip route replace` on 2026-09-15; **declared in netplan
on 2026-09-18** as `routes:` blocks in each node's `/etc/netplan/40-cx7.yaml`
([`node2-40-cx7.yaml`](ring-cluster/node2-40-cx7.yaml),
[`node3-40-cx7.yaml`](ring-cluster/node3-40-cx7.yaml) in this directory are
the current copies). Validated with `sudo netplan generate` only — **not
`netplan apply`**, which bounces the links and hangs a live NCCL job — so
they take effect at the next reboot; the hand-added routes cover the
running session. Pre-change copies: `/root/40-cx7.yaml.pre-routes.bak` on
each node. Verify after a reboot with `ip route show | grep via`.

gn100 got the same passwordless-sudo drop-in as gx10 that day
(`/etc/sudoers.d/90-dgx-nopasswd`, `dgx ALL=(ALL) NOPASSWD: ALL`), so both
workers are now maintainable over SSH from the head.
