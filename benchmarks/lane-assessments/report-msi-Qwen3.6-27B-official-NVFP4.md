# Benchmark Report: nvidia/Qwen3.6-27B-NVFP4 (official) on the MSI machine

**Model:** `nvidia/Qwen3.6-27B-NVFP4` (served as `qwen3.6-27b-official`)
**Quantization:** ModelOpt MIXED_PRECISION — MLPs `W4A16_NVFP4`, attention + KV `FP8`
**Context Window:** 64K (test config)
**Server:** vLLM 0.24.0, `/home/<user>/vllm-official-venv`, port 8102 (unbridged)
**Hardware:** RTX 5090 32 GB (SM120), WSL2, 24 cores, 48 GB WSL RAM
**Date:** 2026-07-02

---

## TL;DR

The official NVIDIA checkpoint — previously written off after two WSL-killing OOM
crashes and a "no MTP, Marlin-only, slower than AEON" verdict — **works, including
MTP speculative decoding**, and lands within ~5% of AEON's decode speed. Two of the
three blockers in the original post-mortem were misdiagnosed. AEON stays the
production default (still fastest, 128K ctx, uncensored), but the official model is
now a proven one-command fallback via `configs/msi/serve-official.sh`.

| Config | Decode | Prefill (4,022 tok) |
|--------|--------|---------------------|
| AEON (production, MTP) | **69.2 tok/s** | 0.5 s |
| Official + MTP | **65.6 tok/s** | 1.2 s |
| Official, no MTP | 41.2 tok/s | 1.3 s |

Same prompt, same box, same day, single request (`max_num_seqs` differs: AEON 16 /
official 8; batched tokens AEON 8192 / official 4096 — part of the prefill gap).

MTP draft acceptance measured from `/metrics`: **51.5%** (371/720 draft tokens,
`num_speculative_tokens=4`), vs AEON's ~57%. Per-position acceptance: 146/99/72/54.

---

## What the original post-mortem got wrong

### 1. "vLLM can't use the checkpoint's MTP layer" — FALSE

vLLM 0.24.0 ships `vllm/model_executor/models/qwen3_5_mtp.py`, a dedicated
Qwen3.5/3.6 MTP drafter. It resolves the architecture as `Qwen3_5MTP`, loads
exactly the 15 top-level `mtp.*` tensors the official checkpoint carries
(`mtp_num_hidden_layers: 1`), shares target-model embeddings with the draft, and
even contains an NVFP4-specific workaround ("mtp.fc is stored as BF16 in NVFP4
checkpoints"). The same flag AEON uses works verbatim:

```
--speculative-config '{"method":"mtp","num_speculative_tokens":4}'
```

Result: 41.2 → 65.6 tok/s (**+59%**).

### 2. "Marlin because the 5090 lacks native FP4" — MISDIAGNOSED

`cutlass_scaled_mm_supports_fp4(120)` returns `True` on vLLM 0.24 — SM120 native
FP4 is fully supported (there's even a dedicated `flashinfer_b12x` NVFP4 backend
for RTX-class Blackwell). The actual reason vLLM picks Marlin is the checkpoint's
own `hf_quant_config.json`: NVIDIA quantized the MLPs **weight-only
(`W4A16_NVFP4`) by design**, with FP8 attention. W4A16 has no FP4-tensor-core path
on any GPU — Marlin is the *correct* kernel, and vLLM's "your GPU does not have
native support for FP4" warning is just misleading wording. For single-user decode
(memory-bound) this costs little; the penalty shows up in prefill/batch throughput.

### 3. The OOM crashes — real, but a one-line fix

Root cause: FlashInfer JIT-compiles kernels through ninja with **unbounded
parallelism** unless `MAX_JOBS` is set (`flashinfer/jit/cpp_ext.py:_get_num_workers`
returns `None` without it, and ninja defaults to nproc+2). 24 cores × ~2.5 GB per
`cicc` = host-RAM exhaustion → Linux OOM-killer shot the user systemd manager and
the Tailscale bridge, taking down all of WSL. Twice.

The fix that worked, verified live:

- `MAX_JOBS=4 CUDA_NVCC_THREADS=2` — caps the compile storm (~10 concurrent cicc,
  peak RAM ~16 GB of 50).
- `--kernel-config '{"enable_flashinfer_autotune": false}'` — fewer kernels JIT'd
  at startup.
- Launch inside a memory-capped transient unit so a worst-case OOM can only kill
  the server's own cgroup, never systemd/Tailscale/AEON:

```bash
systemd-run --user --unit=vllm-official-test \
  -p MemoryMax=38G -p MemoryHigh=34G \
  /bin/bash /mnt/c/Users/<user>/serve-official.sh
```

Cold start ≈ 12 min (weights 23 s + torch.compile 45 s + FlashInfer JIT ~8.5 min).
All of it caches (`~/.cache/vllm`, `~/.cache/flashinfer`) — warm restarts ≈ 2.5 min.

---

## Gotcha found along the way: mirrored-networking loopback

Under WSL `networkingMode=mirrored`, a server bound to `127.0.0.1` inside WSL is
**connection-refused even from inside WSL itself** (the socket shows in `ss -tlnp`
but nothing can connect, from Linux or Windows). Bind `0.0.0.0` and use the
Tailscale IP (`http://100.<tailscale-ip-1>:PORT`) — that path works even WSL→WSL. This is
also why `tcp-forward.py` bridges to the Tailscale IP rather than localhost.

---

## UPDATE 2026-07-02 (later same day): promoted to PRODUCTION at 128K

The 64K/0.85 test config above was conservative debugging inheritance, not a
limit — the checkpoint is natively 262,144 positions and architecturally
identical to AEON (16 full-attention layers of 64; the other 48 are
linear-attention with fixed-size state, no per-token KV). Redeployed with
AEON's production settings (`--max-model-len 131072 --gpu-memory-utilization
0.93 --max-num-batched-tokens 8192 --max-num-seqs 16`):

- **KV cache: 162,150 tokens → 131,072 ctx at 1.24× concurrency.** Fits.
- **Decode through the public bridge (:8100): 70.6 tok/s** — faster than the
  64K test (65.6) and than AEON's 69.2 on the same prompt. MTP acceptance 53%.
- Prefill 4,022 tok in 1.2 s; 26,042-token needle test passed, 13.1 s wall.
- Tool calling verified end-to-end (`qwen3_xml` extracts `tool_calls` cleanly).
- `vllm.service` now runs `serve-official.sh` with `MemoryHigh=34G`/
  `MemoryMax=38G` baked into the unit; served model id kept as
  `qwen3.6-27b-nvfp4` so no client changed. AEON rollback = repoint
  `ExecStart=` to `serve-vllm.sh` (0.21 venv, untouched).

Incident note: redeploying the stale repo copy of `vllm-bridge.service` broke
the bridge (it targeted the old DHCP LAN IP `192.168.1.175`; the box had moved
to `.132`). Fixed by pointing the upstream at the stable Tailscale IP
`100.<tailscale-ip-1>` — canonical repo copy corrected so it can't regress.

## Verdict / when to use which

- **Official** (`nvidia/Qwen3.6-27B-NVFP4`): **production since 2026-07-02.**
  70.6 tok/s decode at 128K ctx with MTP; official + eval'd; permanent HF
  availability. Prefill ~½ of AEON's (W4A16 Marlin vs native W4A4).
- **AEON** (`AEON-7/...-NVFP4-MTP-XS`): rollback option. Marginally faster
  prefill-heavy workloads, uncensored. Community quant — could disappear from
  HF (local snapshot keeps working).
- Eval context: NVFP4 ≈ FP8 per NVIDIA (MMLU Pro 86.3); standard alignment
  (non-uncensored).

On-disk: 21 GB HF download, `/home/<user>/vllm-official-venv` (vLLM 0.24.0 —
AEON's 0.21 venv untouched as rollback), warm JIT caches, production log
`~/vllm.log` (journal: `journalctl --user -u vllm`).
