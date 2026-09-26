# GLM-5.3-Flash (EXL3 4bpw) inference server on 2x DGX Spark

**Status:** active — **TP=3 across all three Sparks since 2026-09-15**, restarted 2026-09-21 on upstream `775a58b` with `GLM53_KDA_BF16_LARGE_M=1` (receipts in [TP=3 on the 3-node ring](#tp3-on-the-3-node-ring-2026-09-15-restarts-2026-09-18-and-2026-09-21)); the 2× TP=2 profile below (verified 2026-09-07 on `6599585`, benchmarked 2026-09-09) is **stopped** and remains the fallback

Second serving stack for the 2-node DGX Spark cluster, alongside the
[DeepSeek V4 Flash DSpark stack](deepseek-v4-flash-server.md). Deployed and
measured 2026-08-28. The two stacks are **mutually exclusive** (same port,
each needs ~all of every GB10's 128 GB unified memory) — flip between them
with [`switch-stack.sh`](switch-stack.sh).

This supersedes the desk-only [GLM-5.2 sizing analysis](glm-5.2.md)
(llama.cpp / 1-bit GGUF, never run): GLM-5.3-Flash at 4 bpw EXL3 runs at
full vLLM speed on this hardware.

## Overview

- **Model:** served as `GLM-5.3-Flash-EXL3` — `zai-org/GLM-5.3-Flash`
  (321B total MoE, MIT) as **`Mia-AiLab/GLM-5.3-Flash-EXL3-TR3-4bpw`**
  (revision `25a44fdb…`), a byte-identical mirror of
  `brandonmusic/GLM-5.3-Flash-tr3-4bpw` snapshot `5ab363a8…`: uniform-K4
  EXL3/TR3 routed experts, 4 bpw, ~164 GiB / 120 shards. Quality per the
  independent KLD panel on the Hub discussion: 0.0246 nats, statistically
  equal to the official FP8 checkpoint on the same stack (~2.5x better than
  the NVFP4 build) at 54% of the bytes.
- **Speculator:** DFlash2 k=7 (`incoai/GLM-5.3-Flash-DFlash2`, ~2.3 GiB,
  BF16, **CC BY-NC-ND 4.0** research/eval licence); drafter sharded across
  both ranks (`DFLASH_DRAFT_TP=2`, upstream default since `b5ab809` —
  `DFLASH_DRAFT_TP=1` pins it to rank 0 and returns ~18% of the KV pool at
  a C4 throughput cost, upstream #56). Rollback `SPEC_METHOD=mtp` (k=2,
  ~24.6 tok/s per upstream).
- **Stack:** vLLM (`vllm/vllm-openai:glm53-flash-arm64-cu130` + MiaAI-Lab's
  NoPE-sparse-MLA/EXL3 overlay) as
  `ghcr.io/miaai-lab/glm-5.3-flash-2x-dgx-sparks:exl3`
  (since 2026-09-01 **rebuilt locally** from the repo — the GHCR tag predates
  the E2 fat-expert kernel; `start.sh` stamps and rebuilds automatically on
  recipe drift), bare `docker run` on both nodes,
  `mp` executor, `--nnodes 2 --tensor-parallel-size 2` over CX7
  - head `spark-head` / 10.10.0.1 (rank 0 + API), container `glm53-exl3-head`
  - worker 10.10.0.2 (`--headless`), container `glm53-exl3-worker`
    (addresses since the 2026-09-11 ring cutover, see
    [`ring-cluster.md`](ring-cluster.md); previously 172.31.100.1/.2)
- **TP=3 (live since 2026-09-15):** the same image and weights on all three
  ring nodes via `./start-tp3.sh` — rank 0 head `10.10.0.1` (API), rank 1
  indie/gx10 `10.10.2.2`, rank 2 worker/gn100 `10.10.0.2`; containers
  `glm53-exl3-tp3-head` / `-w1` / `-w2` plus the `glm53-nfs` weight exporter
  on the head. Config is `.env.tp3` (sourced after `.env`). Stop with
  `./stop.sh tp3` — `start.sh` and `switch-stack.sh` do **not** know the
  TP=3 containers. Details in
  [TP=3 on the 3-node ring](#tp3-on-the-3-node-ring-2026-09-15-restarts-2026-09-18-and-2026-09-21).
- **Repo:** `~/GLM-5.3-Flash-EXL3-2x-DGX-Sparks`
  (github.com/MiaAI-Lab/GLM-5.3-Flash-EXL3-2x-DGX-Sparks), upstream **`775a58b`** (2026-09-21, 20 commits past `ca85576` = release 1.6.0 + thin-decode/numerical-panel commits; TP=3 runs it with the KDA large-M flag on — see the TP=3 section); the TP=2 profile was last verified on **`6599585`** (2026-09-07, E3 grouped fat-expert kernel `EXL3_FAT_GROUPED=1`, util 0.86 — the configuration benchmarked in [the 6599585 report](../../benchmarks/tool-eval/report-2x-dgx-spark-glm-5.3-flash-exl3-6599585.md)); previously **`c190db1`**
  (2026-09-01; previously `b5ab809` 2026-08-30, first deployed at `c91754f`
  2026-08-28 — see
  [Upstream update 2026-09-01](#upstream-update-2026-09-01-b5ab809--c190db1))
- **Endpoint:** `http://spark-head:8888/v1` (OpenAI-compatible, binds 0.0.0.0)
- **Start/stop:** `./start.sh [start|restart|stop|status|logs [worker]]`,
  `./stop.sh`, `./download.sh` — or, preferably, `~/switch-stack.sh glm`
  (see [Switching stacks](#switching-stacks))

## Serving profile — TP=3 (live since 2026-09-15)

The running configuration: `./start-tp3.sh`, `.env` + `.env.tp3` (details,
rank layout and receipts in
[TP=3 on the 3-node ring](#tp3-on-the-3-node-ring-2026-09-15-restarts-2026-09-18-and-2026-09-21)).

| Setting | Value | Note |
|---|---|---|
| Ranks | **TP=3 + expert parallel** over `--nnodes 3`, `mp` executor: rank 0 head `10.10.0.1` (API), rank 1 gx10 `10.10.2.2`, rank 2 gn100 `10.10.0.2` | 96 of 288 routed experts per rank; attention heads padded 64 → 66 (`TP3_HEAD_OVERRIDE=66`) |
| Context window | **1,000,000** tokens (`MAX_MODEL_LEN`, upstream example default) | the TP=2 700k trade-down does not apply: three GB10s hold the 1M KV |
| KV pool | **2,519,708 tokens** (2.52× a full 1M request; 2026-09-21 boot with the KDA large-M copy, `Available KV cache memory: 31.21 GiB`) | stock 775a58b boot the same day: 2,667,153 (34.51 GiB); the KDA BF16 copy costs 2.30 GiB/rank of model memory (−5.5 % KV pool) |
| GPU memory utilization | **0.80** (`GPU_MEM_UTIL`, upstream example default) | head `MemAvailable` ≈ 12 GB after boot, workers ~17 GB |
| Image / loader | `…:exl3-instanttensor` **built locally** (stamp `e4aa088b26ef`, image ID `ef9f5013c41a`, rebuilt 2026-09-21), `LOAD_FORMAT=instanttensor` | shipped to both workers by the launcher; the stamp hashes the overlay dir, so an overlay-only pull still rebuilds |
| Weights | one 164 GiB copy on the head, exported over **NFSv4.2** (`glm53-nfs`), mounted per rank over its own CX7 link | load **~51 s per rank** (`Model loading took 56.55 GiB` each on the 2026-09-21 flag-on boot; the stock arm loads 54.25 GiB in ~45–49 s) |
| Scheduler | **fair v5 mixed-prefill on** (`GLM53_MIXED_PREFILL_CHUNK=fair`: share 0.30, probe chunk 256, ladder 128..2048, interval 2 s, max 1 chunk) | upstream default for TP=3 since #188/#194; unmeasured here |
| Max concurrent sequences | 4 | inherited from `.env` |
| Prefill chunk | 7168 tokens (`MAX_NUM_BATCHED_TOKENS`) | inherited from `.env`; never 8192 (GB10 indexer smem) |
| Fat-expert prefill | E3 grouped kernel (`EXL3_FAT_GROUPED=1`), `GLM53_INDEXER_WORKSPACE=rightsize` | inherited from `.env` |
| Dense FP8 | `GLM53_DENSE_FP8=dense,kda` | at TP=3 the KDA `f_b_proj`/`g_b_proj` stay BF16 (boot log line expected) |
| KDA large-M prefill | **`GLM53_KDA_BF16_LARGE_M=1`** (opt-in, upstream default 0; #233/#237) | KDA `in_proj` rows with M > 512 run a retained BF16 copy on cuBLAS instead of FP8-Marlin: **−7 % cold TTFT at 8k…256k** on this kit, +2.30 GiB/rank, decode path untouched — see [Measured performance](#measured-performance) |
| Speculative decoding | DFlash2 k=7, **draft TP=1** (pinned to rank 0; 32/8 heads do not divide by 3, GQA padded 36/9), adaptive-k **off** | drafter revision `dc77ff1c` |
| Prefix caching | on; #207 per-group retention, drafter (SWA) retention interval 0 | a finished long chat is no longer evicted by DFlash skipped-window blocks |
| Vision | **on, images only** (`LIMIT_MM='{"image":100,"video":0}'`, `MM_ENCODER_TP_MODE=data`) | video must stay 0 |
| Tools / reasoning | `--tool-call-parser glm47 --enable-auto-tool-choice --reasoning-parser glm45`; `tool_choice:"none"` masks the `<tool_call>` opener (#215) | |
| Control plane | Gloo/NCCL bootstrap over per-rank CX7 `*_SOCKET_IFNAME` / `*_HOST_IP`; `/32` routes in netplan | management LAN is down on all three nodes ([ring-cluster.md](ring-cluster.md#tp3-control-plane-routes)) |
| Boot | ~230 s from `docker run` to healthy (after the image is built and shipped) | smoke: 36-token no-think completion in 1.34 s |
| Performance | cold prefill **~1.75–1.80k tok/s** (8k→256k, flag on; ~1.65k stock); decode / tool-eval / VulcanBench **not yet run at TP=3** | see [Measured performance](#measured-performance) and [Caveats](#caveats--open-items) |

## Serving profile — TP=2 (stopped 2026-09-15, fallback)

Not running. This is the 2× TP=2 profile as last verified 2026-09-07 on
`6599585` (benchmarked 2026-09-09); its `.env` is untouched and `switch-stack.sh
glm` boots it. Do not copy it as the live configuration.

| Setting | Value | Note |
|---|---|---|
| Context window | **700,000** tokens (`MAX_MODEL_LEN`; 2026-09-01, traded down from 1M for the MNBT=7168 prefill chunk) | at MNBT 7168 the 1M profile no longer fits KV (see the 2026-09-01 update); the 1M/MNBT 2048 alternative (pool 1,702,898, 1.70x) is a two-line `.env` change back |
| KV pool | **827,142 tokens** (1.18x a full 700k request; boot 12, 2026-09-07, E3 at util 0.86) — DFlash2 draft KV padded-slot-shares the MLA pages. History (each at its own ctx/MNBT/util, so not a single series): 1,413,612 at 1M/MNBT 1024/util 0.87 → 1,289,855 at 1M/MNBT 2048 → 1,115,942 at 1M/MNBT 2048/util 0.86 → 1,702,898 at 1M/MNBT 2048/rightsize → 910,000 at 700k/MNBT 7168/util 0.87 (E2, `c190db1`) → current | `--kv-cache-dtype fp8` → packed `fp8_ds_mla`; only format the SM12x sparse-MLA kernel accepts |
| GPU memory utilization | **0.86** (since the E3 adoption 2026-09-07; 0.87 from 2026-09-01 to 09-07, 0.86 before that for host headroom) | the E3 grouped kernel charges ~560 MiB of persistent scratch to the KV budget and upstream saw a head crash at 0.87 on a 256k prefill; our head also runs GNOME |
| Indexer prefill workspace | **`GLM53_INDEXER_WORKSPACE=rightsize`** (opt-in since `c190db1`) | stock locks `max_model_len × 40` gather entries (~5 GiB at 1M); rightsize allocates the legal per-step maximum instead |
| Fat-expert prefill | **E3 grouped fat-expert MoE kernel** (`EXL3_FAT_GROUPED=1`, upstream default since `6599585`, adopted 2026-09-07; needs the locally rebuilt image, stamp `bbf0dd67`) — supersedes the E2 direct trellis kernel of `c190db1` | boot-12 diag `configured_tier=grouped effective_tier=grouped tier_reason=grouped_ok`; cold prefill 12k **1517** / 16k **1545** / 100k **1555** / 256k **1223** tok/s (receipts and baselines in the [2026-09-07 update](#upstream-update-2026-09-07-c190db1--6599585)) |
| Max concurrent sequences | 4 | in-flight generations, not parked sessions |
| Prefill chunk | **7168** tokens (`MAX_NUM_BATCHED_TOKENS`, upstream E2 keep; adopted 2026-09-01) | measured 1104 tok/s cold prefill at ~295k depth (was ~915 at MNBT 2048). Never 8192 (GB10 indexer smem) |
| Speculative decoding | DFlash2 k=7, draft TP=2 (upstream default since `b5ab809`), draft KV bf16, FLASH_ATTN | never pin `TRITON_ATTN` for the draft (causal-in-block, collapses accept) |
| CUDA graphs | on, capture sizes 1 2 4 8 16 24 32 | 36 s capture, 1.27 GiB with the drafter at TP=2 (0.17 GiB at TP=1) |
| Vision | **on, images only** (`LANGUAGE_MODEL_ONLY=0`, `LIMIT_MM='{"image":4,"video":0}'`) | video must stay 0: its startup warmup OOM-kills the head, see below |
| Tools / reasoning | `--tool-call-parser glm47 --enable-auto-tool-choice --reasoning-parser glm45` | |
| Prefix caching | on, block-aligned hits only (`KpoolTailManager`) | 44k warm repeat 12 s vs 58 s cold (measured on the 800k text-only profile) |
| Abliteration | `ABLIT=0` (stock) | runtime o_proj orthogonalization available, layers 15–45; untested here |
| Weights on disk | 164 GiB per node in `~/.cache/huggingface/hub/models--Mia-AiLab--GLM-5.3-Flash-EXL3-TR3-4bpw` | plus 2.2 GiB DFlash2 |

Model load is ~82 GiB per rank (vLLM's `Model loading took 82.01 GiB`; the
163.6 GiB checkpoint splits across 2 ranks — the larger "consumed" figures
in the boot logs below add non-torch overhead on top of weights); a cold boot to healthy takes ~7.5 min
(weights 325 s from NVMe, init/graphs/warmup 90 s). First requests after a
boot JIT a handful of Triton/TileLang kernels (latency spikes of a few
seconds, `jit_monitor` warns once each) — same behaviour as the DSpark stack.

## `.env` deltas from upstream

`cp .env.example .env`, then these. The IP/CX7 rows are hard requirements on
this kit (wrong pins hang NCCL); the remaining rows record where this deploy
diverged from upstream and, in two cases, later reconverged:

| Key | Upstream | Here | Why |
|---|---|---|---|
| `HEAD_IP` / `WORKER_IP` | `10.0.0.1` / `10.0.0.2` | `10.10.0.1` / `10.10.0.2` | 3-node ring addressing since 2026-09-11 ([`ring-cluster.md`](ring-cluster.md)); was `172.31.100.1` / `.2` point-to-point |
| `HEAD_CX7_IF` / `HEAD_CX7_IB` | `enp1s0f1np1` / `rocep1s0f1` | `enp1s0f0np0` / `rocep1s0f0` | upstream's head cable is in port 1; ours is port 0 (since the 2026-09-11 ring our head's f1 carries the indie link, before that it was DOWN). Wrong pin → `ncclCommInitRank` hangs |
| `WORKER_CX7_IF` / `WORKER_CX7_IB` | `enp1s0f0np0` / `rocep1s0f0` | `enp1s0f1np1` / `rocep1s0f1` | since 2026-09-11 the worker's cable to the head sits in its Port1 (ring cabling is Port0→Port1) |
| `WORKER_USER` | unset | unset | same `dgx` user + home on both nodes |
| `GPU_MEM_UTIL` | `0.87` | `0.86` | 0.86 again since the E3 adoption 2026-09-07 (560 MiB grouped-kernel scratch + GNOME head headroom); was 0.87 from 2026-09-01 (was 0.86 for host headroom 2026-08-31; 0.89 in the text-only era) |
| `MAX_MODEL_LEN` | `1000000` | **`700000`** | 2026-09-01: MNBT 7168 + vision tower doesn't fit 1M KV on this kit (see update section); was 600k/800k on the pre-slot-share launcher (boots 1–4), 1M from `b5ab809` to 2026-09-01 |
| `MAX_NUM_BATCHED_TOKENS` | `7168` | `7168` | upstream E2 keep, adopted 2026-09-01 (1024 → 2048 on 2026-08-31 → 7168) |
| `GLM53_INDEXER_WORKSPACE` | `stock` | **`rightsize`** | opt-in; frees the ~5 GiB (at 1M) locked gather workspace for KV |
| `LANGUAGE_MODEL_ONLY` | `0` | `0` | vision on (was `1` between boots 3 and 4) |
| `LIMIT_MM` | `{"image":4,"video":1}` | **`{"image":4,"video":0}`** | see boots 2 and 4 below |

Everything else (DFlash2 k=7, `MAX_NUM_SEQS=4`, `KV_CACHE_DTYPE=fp8`,
`ABLIT=0`, image NCCL) is upstream default.

## Deployment log (2026-08-28)

Download (`./download.sh`, head only, non-disruptive while DSpark was still
serving): 164 GiB at ~40 MB/s → ~70 min. Worker got its copy from the
launcher's rsync over the CX7 link: 175.7 GB in 5.5 min (~500 MB/s).

Four boots to the final profile:

1. **Upstream defaults (util 0.87, 900k ctx, vision on) — engine refused.**
   `Available KV cache memory: 11.81 GiB` vs 13.9 GiB needed for one 900k
   request (`estimated maximum model length is 609280`). Upstream's kit gets
   ~15 GiB at the same util; our head loses ~3 GiB to the GNOME desktop
   (Xorg + gnome-shell on the UMA) and vLLM's CUDA-graph memory profiling
   (its own log says 0.87 "is equivalent to 0.8525 without profiling").
   Fix: `GPU_MEM_UTIL=0.89`, `MAX_MODEL_LEN=800000` (upstream's own earlier
   recipe was 800k).
2. **Util 0.89, 800k, vision on — head OOM-killed after startup.** Engine
   came up fine (pool 940,540 tokens, 1.18x), but the API server then ran a
   **65-minute multimodal warmup** (`Multi-modal warmup completed in
   3925.134s`) during which `/health` never opened, and at its end the kernel
   killed the TP0 worker (`docker inspect` → `OOMKilled: true`). Same memory
   class upstream warns about for `--skip-mm-profiling`, just in the warmup.
   Fix: `LANGUAGE_MODEL_ONLY=1`.
3. **Text-only (util 0.89, 800k) — healthy in ~7.5 min.** Pool 1,006,949
   tokens (1.26x). `Free memory on device (110.2/121.69 GiB)`; usage
   88.35 GiB consumed (weights + non-torch) + 3.35 GiB peak activation +
   0.17 GiB graphs +
   16.28 GiB KV. Head host memory ~1 GB available — thin.
4. **Vision on, video off (util 0.87, 600k) — final profile.** Root cause
   of boot 2 found in the image's vLLM (`renderers/base.py`
   `_warmup_mm_processor`): at API-server start it renders a dummy prompt
   sized to `max_model_len` with one of every modality whose limit is > 0,
   on the CPU. A `video:1` dummy at 800k context = thousands of frames →
   65 min and a host-RAM spike. With `video:0` the warmup is a single image:
   **`Multi-modal warmup completed in 1.671s`**. Pool 762,337 tokens
   (1.27x), usage 87.6 GiB weights + 3.3 GiB activation + 14.85 GiB KV of a
   105.87 GiB budget; head host memory ~3 GB available. Image test: shapes,
   colours and embedded text read correctly (12.9 s first image request incl.
   JIT, 3.7 s after). Decode unchanged: structured 67.3 / prose 27.0 tok/s.

Operational gotchas hit on the way:

- The launcher's preflight only **warns** about other containers on the
  worker; it will happily start on top of a running DSpark. Always tear the
  other stack down on both nodes first (`switch-stack.sh` enforces this).
- `pkill -f start.sh` from a shell whose own command line contains
  `start.sh` kills that shell. Launch with `setsid nohup ./start.sh … &`.
- `./start.sh` pulls the GHCR image on every start unless `SKIP_PULL=1` —
  and since `c190db1` that pull clobbers the locally rebuilt E2 image and
  triggers a rebuild; the fast restart is
  `SKIP_PULL=1 SKIP_DOWNLOAD=1 SKIP_SYNC=1 SKIP_SHIP=1 ./start.sh restart`.
- `READY_TIMEOUT` is 3600 s; the launcher exits non-zero if health never
  comes (and dumps `logs/head.log` + `logs/worker.log`).

## Upstream update 2026-08-30 (`c91754f` → `b5ab809`)

48 commits in two days; adopted the same day. The GHCR image did **not**
change (`sha256:ad0cdd86…`) — everything below is runtime-mounted overlay
patches applied by the new `start.sh` at container start, so adopting was
`git pull` + `.env` (`MAX_MODEL_LEN=1000000`) + restart. No re-download, no
rebuild; the launcher re-shipped the image once (its new digest comparison
misreads the worker's layer list) and wrote its new rsync marker.

What it brought, verified live on this kit:

| Change | Result here |
|---|---|
| DFlash2 draft KV **padded slot-share** of MLA pages (`patch_glm5_drafter_group.py`, fixes upstream #13) | pool **762k → 1,413,612 tokens** on the same memory; 1M context allocates (1.41x). Upstream's own kit reports 1.75M; the difference is leftover UMA |
| Hybrid prefix-cache hit fix (`patch_hybrid_prefix_hit.py`, #18) | `tests/bench_prefix_cache.py --runs 3`: follow-up turns hit **82%** of an 8.7k prompt (page-aligned, eff 1.0), warm TTFT 11.1 → 3.2 s. 44k needle warm repeat **12.2 → 2.0 s**. Was 46% reuse |
| Scheduler decode floor (`GLM53_MIXED_PREFILL_CHUNK=skip`, issue #6) | on by default; measured in [the 6599585 benchmark report §2](../../benchmarks/tool-eval/report-2x-dgx-spark-glm-5.3-flash-exl3-6599585.md#2-vulcanbench): prefills serialize under a 4-way agent load (c=4 v1 25/52 with 29 budget flags vs 49/52 at c=1), so multi-request agent clients should run one stream |
| XGrammar termination backports (#19/#21), K-pool tail slot-map pin (#50) | on by default; structured-output stalls fixed upstream |
| `DFLASH_DRAFT_TP=2` default | decode unchanged: structured 67.4 / prose 26.6 tok/s |
| Ops: `VLLM_API_KEY`, per-rank GID preflight, worker self-pull / `SKIP_SHIP`, rsync marker / `FORCE_SYNC`, `CG_ESTIMATE`, warm-restart stdout fix (#15) | all compatible; GID index 3 = `::ffff:172.31.100.x` on both nodes at the time (`::ffff:10.10.0.x` since the 2026-09-11 ring cutover, still index 3 on `rocep1s0f0`/`rocep1s0f1`) |

Boot 5 (b5ab809, 1M, vision images-only): weights 322 s, health at 460 s,
`Free memory on device (108.54/121.69 GiB)`, usage 88.43 GiB consumed
(weights + non-torch) + 3.76 GiB activation + 1.27 GiB graphs +
12.26 GiB KV. MM warmup 2.3 s.
Image, tool-call, thinking and 3x-concurrency smoke all clean, 0 errors.

Known upstream issues to keep in mind: **#43** — at 1M the pool admits
~1.4 full-length requests, so one 300k+ request can queue others on
`capacity` even with seq slots free (upstream says *don't* lower
`MAX_MODEL_LEN` to "free" slots — the hybrid floor shrinks the pool);
**#47** — many kits cannot reach util 0.87 (CUDA free caps ~102 GiB); ours
can; **#10** — blank tool-call args under concurrent multi-tool turns
(open); **#31** — no cache-reset endpoint. Adopted follow-up:
`MAX_NUM_BATCHED_TOKENS=2048` (upstream keep). `CG_ESTIMATE=0` is no
longer worth it — graphs now really use 1.27 GiB of the 1.46 GiB estimate.

### 2026-08-31: `493cb88` pull + `MAX_NUM_BATCHED_TOKENS=2048`

Upstream `493cb88` (numeric-knob validation before `restart`, `examples/pi/`
client configs, cold-prefill harness in `tests/`) needed no restart. The
MNBT 1024 → 2048 keep was adopted the same day (boot 6): cold-prefill ladder
(upstream harness, local copy — the shipped one crashes at the end writing to
a hardcoded `/home/mia/...` path) measured **8k 8.39 s / 953 tok/s** (was
~11.1 s / 785 at 1024, +21%), 12k 12.7 s / 944, 16k 18.1 s / 883, 100k
109.3 s / 915, 8k APC follow-up 1.23 s (7168/8004 hits). Decode unchanged
(65.5 / 25.7 tok/s), 44k needle unchanged (55.1 s cold / 2.1 s warm), image +
tools + thinking + 3x concurrency clean, 0 log errors. Cost: KV pool
1,413,612 → **1,289,855** tokens (1.29x at 1M) and head host memory back to
~1 GB available. Upstream issue #56 (independent kit): `DFLASH_DRAFT_TP=2`
costs ~18% pool but +37% per-stream decode at C4 — `DFLASH_DRAFT_TP=1`
reverses that trade if pool ever matters more. #57: the vLLM KV-offload
connector is broken on this image — never enable it.

## Upstream update 2026-09-01 (`b5ab809` → `c190db1`)

21 commits; adopted the same day. Unlike the previous update this one
**requires an image rebuild**: the E2 fat-expert direct trellis kernel
(`overlay/exl3_fat_gemm.cu`, default `EXL3_FAT_KERNEL=1`) compiles into the
extension, and the GHCR `:exl3` tag predates it — on the stock image the
flag is a silent no-op. The new `start.sh` stamps the image with the overlay
recipe hash and rebuilds once when a `git pull` changes it. Quirk: the pull
step re-fetches the GHCR tag and clobbers the stamped local image, forcing a
rebuild every unskipped restart — use the fast-restart recipe
(`SKIP_PULL=1 SKIP_DOWNLOAD=1 SKIP_SYNC=1 SKIP_SHIP=1 ./start.sh restart`)
until upstream republishes the image.

What it brought, verified live on this kit:

| Change | Result here |
|---|---|
| **E2 fat-expert kernel** (`4b8d3c7`/`86f145d`, machine-checkable diagnostics `86e09e0`) | `effective_tier=kernel tier_reason=kernel_ok`, 42/42 fat layers, `max_rows=7168`; cold prefill **1104 tok/s at ~295k depth** (was ~915 tok/s at 100k on MNBT 2048) |
| MNBT default 2048 → **7168** (E2 one-shot keep, benchmarked upstream on the same 2× GB10 kit) | adopted, but forced the 1M → **700k** context trade (below) |
| **`GLM53_INDEXER_WORKSPACE=rightsize`** (opt-in, `2022ce5`, design doc `docs/DESIGN-indexer-workspace.md`) | stock locks `max_model_len × 40` gather entries (~5 GiB at 1M); adopted, pool 1,702,898 tokens at 1M/MNBT 2048 (was 1,115,942) |
| Chat template: `Reasoning Effort` header emitted **unconditionally** (`4753ac2`) | toggling thinking no longer invalidates the prefix cache |
| `GLM53_SPINWAIT_MS` knob (`8fcc950`; upstream's frozen TP=2 sweep picked 16 ms) | left `stock` — untested here |
| `start.sh`: numeric-knob validation before the restart stops the service, `SKIP_BUILD` | validation caught nothing here; nice failure mode |

**The MNBT=7168 / context trade.** Upstream's 7168 default does not fit the
1M profile on this kit with the vision tower loaded: the profiling pass
reserves ~5 GiB more activation memory than at 2048, leaving 9.76 GiB
(util 0.86) / 11.13 GiB (0.87 + rightsize) of KV against the 14.52 GiB one
1M request needs — two refused boots. Options measured (all util 0.87 +
rightsize + vision images-only):

| Profile | KV pool | Cold prefill |
|---|---|---|
| MNBT 2048, 1M ctx (boot 10) | 1,702,898 tokens (1.70x) | ~915 tok/s class |
| **MNBT 7168, 700k ctx (boot 11, live)** | **910,000 tokens (1.30x)** | **1104 tok/s at ~295k** |

Note vLLM's refusal message underestimates what fits: it projected max
~523k at these settings, but several reservations scale down with
`MAX_MODEL_LEN`, and at 700k the sizing pass found 16.13 GiB available.
Boot 11: health at 450 s, smoke + image ("Red") + tools clean.
`.env.pre-c190db1.bak` in the repo dir holds the pre-update env (1M /
MNBT 2048 / util 0.86 / stock workspace).

## Upstream update 2026-09-07 (`c190db1` → `6599585`)

Pulled 2026-09-07 while the DeepSeek stack was live and adopted the same
afternoon with `switch-stack.sh glm` (boot 12). One functional change:
the **E3 grouped fat-expert MoE kernel** (`EXL3_FAT_GROUPED=1`, now the
launcher default; auto cap 32 vs 256 for E2), which upstream measured at
+37–45 % cold prefill over E2 on the same 2× GB10 kit (16k 1155 → 1578,
256k 1087 → 1576 tok/s), decode unchanged. It costs ~560 MiB of persistent
scratch charged to the KV budget, so upstream's defaults moved to 850k ctx /
util 0.85 / rightsize; our 700k profile fits at 0.86. The repo also
relicensed MIT → AGPL-3.0 (`cf0f430`); we run it unmodified (`.env` only), so
no source-offer obligation applies. Adoption needed the full-Dockerfile
rebuild path (recipe stamp `6a2d85df…` → `bbf0dd67`, ~25 min including the
ship to the worker); `.env` changes: `GPU_MEM_UTIL` 0.87 → **0.86**,
`EXL3_FAT_GROUPED=1` made explicit. Backup `.env.pre-6599585.bak`.

Receipts (all 2026-09-07, head):

| Receipt | Where |
|---|---|
| Launcher + engine log | `logs/switch-glm-e3-20260907-1603.log` in the repo dir; key lines mirrored in [`receipts/glm53-e3-6599585-2026-09-07/`](receipts/glm53-e3-6599585-2026-09-07/) |
| Tier diag / load | `exl3 e2 diag schema=2 configured_tier=grouped effective_tier=grouped tier_reason=grouped_ok` (15:15:46 UTC), weights 318.6 s, `Model loading took 82.05 GiB` (15:15:56), `Free memory on device (108.26/121.69 GiB) on startup … Actual usage is 85.42 GiB` — all in the key-lines mirror |
| KV pool | `GPU KV cache size: 827,142 tokens, Maximum concurrency for 700,000 tokens per request: 1.18x` (15:16:10); init engine 72.9 s; health after 490 s |
| Cold prefill | `receipts/…/coldprefill-e3.json` (8k/12k/16k/100k) and `coldprefill-e3-256k.json` (256k + warm repeat), upstream `tests/_run_cold_prefill.py` with a local output path; `mem-256k.txt` = head `free -h` sampled during the 256k run |
| Decode | `receipts/…/decode-e3-structured.json`, `decode-e3-prose.json` (3 runs each, thinking off, temperature 0) |

What it measured here:

| Metric | E3, `6599585` (MNBT 7168, util 0.86) | Baseline | Δ |
|---|---|---|---|
| Cold prefill 12k / 16k / 100k | **1517 / 1545 / 1555 tok/s** | E2 at **MNBT 2048** (`c190db1` boot 10, 2026-08-31 receipts): 944 / 883 / 915 | +61 / +75 / +70 % — but two variables changed (kernel *and* chunk size), so this is not the E3-over-E2 gain |
| Cold prefill 256k | **1223 tok/s** (209 s TTFT) | E2 at MNBT 7168 (boot 11): 1104 at ~295k — the only same-MNBT E2 receipt on this kit, at a deeper depth | ≈ +11 % at different depths; upstream's matched E3-over-E2 figure is +37–45 % |
| First 8k request | 550 tok/s | — | JIT warm-up of the grouped kernel. The 8k repeat right after ("8189 tok/s") is an 89 % prefix-cache hit (7,168 of 8,011 tokens), not a prefill rate. Ignore both for prefill rates |
| 256k warm repeat | 4.3 s (250,880 of 256,011 prefix tokens hit, 98.0 %; `results[1].metrics_delta` in the receipt) | 12.2 s at 44k on `c91754f` | prefix cache intact through the kernel change |
| Decode, structured (count 1–200) | **64.4 tok/s** median, accept 1.0, 7.0 tokens/step (3 runs × 200 tokens) | 65.7 on `c190db1` (§Measured performance, median of 5 × 400 tokens) | −2 %, inside the protocol difference (3 × 200 vs 5 × 400; no E2 arm of this script was kept) — read as unchanged |
| Decode, prose | **27.4 tok/s** median (25.4–30.1), accept 0.35, 2.5/step | 27.1 | unchanged |
| KV pool | 827,142 tokens (1.18x at 700k) from `Available KV cache memory: 14.67 GiB` (≈ 19.0 KB per token at this profile) | 910,000 at util 0.87 on E2 (boot 11) | −83k. Util and kernel moved together in this step, so the two effects are not separable from these receipts (the util step alone is ~1.2 GiB; the ~560 MiB scratch is upstream's figure — our load-time diag line in the mirror reads `grouped_scratch_bytes=0`, i.e. it is allocated at the first grouped prefill, not at load; and the grouped kernel's own activation footprint differs); the 1,115,942 "at util 0.86" number elsewhere in this file is a 1M-ctx / MNBT 2048 profile and is not on the same series |
| Head host memory | **1.8–1.9 GB available during the 256k cold-prefill test** (`receipts/…/mem-256k.txt`, `free -h` every 5 s, 42 samples 16:22–16:26 BST; `.txt` because the repo ignores `*.log`), health 200 afterwards; ≈4 GB idle before the test (observed, no receipt); ≈1 GB under VulcanBench agent load per the [benchmark report §3](../../benchmarks/tool-eval/report-2x-dgx-spark-glm-5.3-flash-exl3-6599585.md#3-serving-notes-surfaced-by-the-run) | — | the reason for 0.86, not 0.87 |
| Image test | "Red" (vision images-only unchanged) | — | |

The benchmark in
[`benchmarks/tool-eval/report-2x-dgx-spark-glm-5.3-flash-exl3-6599585.md`](../../benchmarks/tool-eval/report-2x-dgx-spark-glm-5.3-flash-exl3-6599585.md)
(2026-09-08/09) ran on exactly this boot.

## TP=3 on the 3-node ring (2026-09-15, restarts 2026-09-18 and 2026-09-21)

Since 2026-09-15 GLM serves from **all three Sparks** of the
[ring cluster](ring-cluster.md) with upstream's `./start-tp3.sh` — tensor
parallel 3 plus expert parallel, `mp` executor, `--nnodes 3`. The 2× TP=2
stack was stopped the same day and is kept as the fallback (its `.env` is
untouched; `start-tp3.sh` sources `.env` first and `.env.tp3` on top).

| Rank | Node | Address (CX7) | Container | Control-plane iface |
|---|---|---|---|---|
| 0 (API) | head `spark-head` | `10.10.0.1` | `glm53-exl3-tp3-head` | `enp1s0f0np0` |
| 1 | indie `gx10` (ring Node3) | `10.10.2.2` | `glm53-exl3-tp3-w1` | `enp1s0f0np0` |
| 2 | worker `gn100` (ring Node2) | `10.10.0.2` | `glm53-exl3-tp3-w2` | `enp1s0f1np1` |

**Rank IDs are not ring order.** The directed cable ring is head Port0 →
gn100 Port1, gn100 Port0 → gx10 Port1, gx10 Port0 → head Port1, i.e. the
next hop from the head's Port0 is gn100 — but the launcher numbers gx10 as
rank 1 and gn100 as rank 2 (the reverse). What has to match the physical
ring is the **per-rank IF/IB pin order** (`*_CX7_IB` / `*_CX7_IF`, both
ports per node — `HEAD` f0,f1; `WORKER` f0,f1; `WORKER2` f1,f0 — with
`NCCL_CROSS_NIC=1`, `NCCL_IB_SUBNET_AWARE_ROUTING=1`); those pins compensate
for the rank numbering, and a wrong order leaves one NCCL pair that never
connects.

**What makes TP=3 load at all** (upstream `overlay/tp3/`, from FlyCockpit's
3× recipe): attention/KV heads padded 64 → 66 (`TP3_HEAD_OVERRIDE=66`),
routed experts split whole (`ENABLE_EXPERT_PARALLEL=1`, 96 of 288 per
rank — `moe_intermediate_size` 2048 is *not* padded, the EXL3 trellis is
packed at that width), vision tower data-parallel (`MM_ENCODER_TP_MODE=data`),
DFlash2 drafter pinned to rank 0 (`DFLASH_DRAFT_TP=1`; 32/8 heads do not
divide by 3) with its GQA padded 36/9 at load. At TP=3 the dense-FP8 path
keeps the KDA `f_b_proj`/`g_b_proj` in BF16 (Marlin pitch at 22 local heads)
— the boot log line `[glm53-dense-fp8] TP=3 keeps KDA f_b_proj/g_b_proj in
BF16` is expected.

**Weights over NFS, not copied.** The head exports its HF cache read-only
over NFSv4.2 from the `glm53-nfs` container; each rank mounts it as the
docker volume `glm53-weights` over *its own* CX7 link to the head (rank 1
from `10.10.2.1`, rank 2 from `10.10.0.1`, `nconnect=8`). One 164 GiB copy
instead of three; with InstantTensor the ranks load the 164 GiB checkpoint
in **~45 s each** — over NFS, the same as the head from local NVMe.

**Control plane on the CX7 links.** The management LAN is down on all three
nodes, so Gloo/NCCL bootstrap uses per-rank `*_SOCKET_IFNAME` / `*_HOST_IP`
on the ring and each worker needs `/32` routes to the rank it has no direct
cable to. Those routes were added by hand on 2026-09-15 and are **persistent
in netplan since 2026-09-18** — see
[ring-cluster.md → TP=3 control-plane routes](ring-cluster.md#tp3-control-plane-routes).
The head needs none (it has a direct link to both).

### `.env.tp3` vs `.env.tp3.example` (upstream `775a58b`)

Since 2026-09-18 the file follows the upstream example except for the kit
addressing and, since 2026-09-21, one opt-in. Full copy:
[`receipts/glm53-tp3-775a58b-2026-09-21/env.tp3.txt`](receipts/glm53-tp3-775a58b-2026-09-21/env.tp3.txt).

| Key | Upstream example | Here | Why |
|---|---|---|---|
| `HEAD_IP` / `WORKER_IP` / `WORKER2_IP` | `10.0.0.1/.2/.3` | `10.10.0.1` / `10.10.2.2` / `10.10.0.2` | ring addressing; rank 1 = gx10, rank 2 = gn100 — rank IDs are not ring order, the IF/IB pin order below is |
| `*_CX7_IF` / `*_CX7_IB` | one port per node | both ports per node, order matches the ring (`HEAD` f0,f1; `WORKER` f0,f1; `WORKER2` f1,f0) | directed dual-port ring; wrong order leaves one NCCL pair that never connects |
| `*_SOCKET_IFNAME` / `*_HOST_IP` | unset (management LAN) | per-rank CX7 iface + IP (table above) | management LAN is down; needs the `/32` routes |
| `NCCL_IB_SUBNET_AWARE_ROUTING` | unset | `1` | with `NCCL_CROSS_NIC=1` (example default) |
| `NFS_SHARE` / `NFS_SERVER_IP_1` / `_2` | commented / autodetect | `1` / `10.10.2.1` / `10.10.0.1` | explicit per-rank head address on that rank's cable |
| `NFS_CLIENTS` | `10.0.0.x` list | `10.10.0.0/24,10.10.2.0/24,10.10.4.0/24` | ring subnets |
| `GLM53_KDA_BF16_LARGE_M` | commented (`0`) | **`1`** | the only deliberate opt-in: −7 % cold TTFT measured here, see the 2026-09-21 restart below |
| everything else | — | **= example** | `IMAGE=…:exl3-instanttensor`, `LOAD_FORMAT=instanttensor`, `GLM53_MIXED_PREFILL_CHUNK=fair` (share 0.30, step/interval 2000 ms, chunk 256, max 1 chunk), `GLM53_APC_RETENTION_INTERVAL_SWA=0`, `GLM53_DENSE_FP8=dense,kda`, `ABLIT=0`, `GPU_MEM_UTIL=0.80`, `MAX_MODEL_LEN=1000000`, `DFLASH_DRAFT_TP=1`, TP=3 shape knobs |

Inherited from `.env` (TP=2 file, unchanged): `MAX_NUM_SEQS=4`,
`MAX_NUM_BATCHED_TOKENS=7168`, `KV_CACHE_DTYPE=fp8`, DFlash2 k=7 at drafter
revision `dc77ff1c`, `LIMIT_MM='{"image":100,"video":0}'` (video stays 0),
`EXL3_FAT_GROUPED=1`, `GLM53_INDEXER_WORKSPACE=rightsize`. Adaptive-k is
**off** (launcher default; upstream's README decode numbers for TP=3 were
taken with `GLM53_ADAPTIVE_K=ema`, which is still an opt-in).

### First boot 2026-09-15 (`91721dd`)

Needed the 19.4 GiB `:exl3` image shipped to both workers (`docker save |
ssh docker load`), then ~10 min to healthy. KV pool **2,668,613 tokens**
(2.67× a 1M request) at util 0.80 with 1M context; host `MemAvailable`
after boot ~13 GB head / ~17 GB workers. One 2-line local fix in
`tests/test_scheduler_decode_floor.py` was required for the image build
(upstream resolved the overlay path repo-relative; fixed upstream in #192,
so the tree is clean again). Fair mixed-prefill was left **off** (the
example default at the time). Smoke: 59-token completion in 2.2 s.

### Restart 2026-09-18 (`91721dd` → `ca85576`, release 1.6.0+)

`./stop.sh tp3 && ./start-tp3.sh`, 12:05 → UP 12:17 BST (~12 min including
the image build and two ships). What changed:

| Change | Detail |
|---|---|
| Image | launcher **built `:exl3-instanttensor` locally** from the Dockerfile (stamp `b12244e3ba09`, image ID `4065c55f38f2`, 19.5 GiB) and shipped it to both ranks; `LOAD_FORMAT=instanttensor` |
| Weight load | **44.6 / 44.8 / 44.8 s** on ranks 0/1/2 (`Model loading took 54.25 GiB` each) — was ~5 min from NVMe on the TP=2 default loader |
| Scheduler | fair v5 mixed-prefill **on** (upstream default for TP=3 since #188/#194): `[glm53-decode-floor] fair v5 probe_chunk=256 ladder=128..2048 share=0.3 interval_s=2.0 max_step_s=2.0 max_chunks=1` |
| Prefix cache | #207 per-group retention patch applied on every rank, `drafter (SWA) prefix-cache retention interval: 0` — a finished long chat is no longer evicted by hashed skipped-window DFlash blocks (the `Unknown vLLM environment variable … RETENTION_INTERVAL_SWA` warning is the patch's own knob, expected) |
| Baked-in fix | `tool_choice:"none"` now masks the `<tool_call>` opener at decode time (#215; Dockerfile-only, so it reaches TP=3 through this rebuild) |
| KV pool | **2,656,934 tokens** (2.66× at 1M) from `Available KV cache memory: 33.22 GiB`; −12k vs the first boot (CUDA-graph memory profiling on this vLLM charges ~1.2 % of util) |
| Boot | health after 230 s from `docker run`; boot-shape warmup 24/24 in 64 s; head `MemAvailable` ≈ 12 GB afterwards |
| Smoke | 36-token no-think completion in 1.34 s wall |

Receipts:
[`receipts/glm53-tp3-ca85576-2026-09-18/`](receipts/glm53-tp3-ca85576-2026-09-18/)
— `boot.keylines.txt` (launcher + all three ranks' engine lines + NFS
mounts), `smoke-and-verify.txt` (request, containers, image, memory,
netplan routes), `env.tp3.txt`. Backup of the previous config:
`.env.tp3.pre-ca85576.bak` in the repo dir.

### Restart 2026-09-21 (`ca85576` → `775a58b`) and the KDA large-M A/B

`./start-tp3.sh restart` twice: once stock on the new tip, once with
`GLM53_KDA_BF16_LARGE_M=1` in `.env.tp3` after the A/B below. Backup of
the pre-pull config: `.env.tp3.pre-775a58b.bak` in the repo dir.

**What the pull brings** (`ca85576..775a58b`, 20 commits, no Dockerfile
change): the opt-in KDA large-M BF16 prefill path (#233, extended to TP=3
in #237), a TP=4-only sparse-MLA slice (#223), the TP=2-only thin-decode
kernels, and two launcher fixes — it now warns when a shell variable
overrides a `.env` value (#168) and defaults `USER` in non-login shells
(#197). Upstream defaults are unchanged, so the stock boot is
behaviourally the 2026-09-18 one.

| Change | Detail |
|---|---|
| Image | the launcher **rebuilt** `:exl3-instanttensor` (stamp `e4aa088b26ef`, image ID `ef9f5013c41a`, 19.5 GiB) and re-shipped it to both ranks even though the Dockerfile is untouched — the recipe stamp hashes the overlay directory. Cached layers, a few minutes |
| Stock boot | `Model loading took 54.25 GiB` per rank (as before), KV **2,667,153 tokens** (34.51 GiB, 2.67×); warmup 24/24 in 62 s; health 200 |
| Flag boot | `Model loading took 56.55 GiB` (**+2.30 GiB/rank** = 34 KDA layers × 68.2 MiB, matching upstream's theoretical 2.26 GiB for the TP3-local `[8726x4096]` shape), KV **2,519,708 tokens** (31.21 GiB, **2.52×**); no rebuild (stamp matched); host `MemAvailable` after boot head 13 / gx10 15 / gn100 14 GB |
| Not adopted | thin-decode `GLM53_EXL3_MOE_FAST` (TP=2 only, launcher unsets it), `VLLM_SM120_SPARSE_MLA_SLICE_TOKENS` (TP=4 only) |

**Cold-prefill A/B.** Upstream's own receipt protocol
(`tests/_run_cold_prefill.py`: temp 0, thinking off, `max_tokens` 8,
stream + usage, fresh salt per request, one at a time, TTFT = first
content token), run three times per rung on each arm from a fresh boot;
the only difference between the arms is the flag. Medians, with the
min..max spread in the receipt:

| Prompt | Stock TTFT | Flag TTFT | Δ | Prefill tok/s stock → flag |
|---|---:|---:|---:|---:|
| ~8k | 4.91 s | 4.57 s | **−6.9 %** | 1628 → 1749 |
| ~16k | 9.59 s | 8.89 s | **−7.3 %** | 1668 → 1799 |
| ~100k | 60.10 s | 55.65 s | **−7.4 %** | 1664 → 1797 |
| ~256k | 157.9 s | 146.1 s | **−7.5 %** | 1621 → 1752 |
| ~8k prefix-cache follow-up | 0.53 s | 0.51 s | −2.5 % | (cache hit, not prefill) |

Spread within an arm is under 1.5 % at every rung, every reply was the
expected `OK`, and the gain is flat across sizes (the path only changes
the KDA `in_proj` GEMM for rows with M > 512, so it scales with prefill
work). Upstream measured −11…14 % on TP=2; the smaller share here is
consistent with the TP3-local projection being a third narrower per
rank. Decode is not measured because the flag does not touch the
decode path (M ≤ 512 stays on the stock Marlin kernel).

**Decision: keep the flag on.** Cost is 2.30 GiB/rank and a 5.5 %
smaller KV pool (still 2.52× a full 1M request). Caveat carried from
upstream: their numerical study of this path is "formally inconclusive"
because its own stock control failed the comparator; no tool-eval or
VulcanBench run has been done with the flag yet (none has at TP=3 at
all, see [Caveats](#caveats--open-items)).

Receipts: [`receipts/glm53-tp3-775a58b-2026-09-21/`](receipts/glm53-tp3-775a58b-2026-09-21/) — `ab-summary.txt` (the table above with
spreads), `cold_prefill_stock.json` / `cold_prefill_kda1.json` (every
request with usage and metrics deltas), `cold_prefill_ab.py` (the runner:
upstream's script with the ladder trimmed to 8k/16k/100k/256k, three
repeats per rung; usage `cold_prefill_ab.py <arm> [reps] [out.json]`, output
defaults to `cold_prefill_<arm>.json` beside the script), `boot.keylines.txt`
(both restarts), `env.tp3.txt`.

**Not adopted from 1.5.0 / 1.6.0** (assessed 2026-09-17/18):

- *Cooperative decode MoE, TP2 (`extensions/cooperative_moe/`, 1.5.0).*
  Compile-time TP2 shapes (local intermediate 1024); TP=3/EP falls back to
  stock by design. Upstream's TP2+coop decode (structured 77–80, prose
  35–37 tok/s) is below its own stock TP=3 (87.8 / 39.6) with a third of
  the KV.
- *Cooperative decode MoE, TP3 ABI2 (`extensions/cooperative_moe/tp3/`,
  1.6.0, #212) and `examples/tp3-throughput.env`.* Outside contribution;
  not prebuilt (build the `.so` in the image, GPU-qualify nine rank ×
  geometry logs, reprofile the dispatch policy). Its +16–21 % figures are a
  six-variable bundle on the contributor's customised stack, and the
  throughput profile trades −17.5 % per-stream decode at 8 concurrent and
  −9 % short cold prefill for aggregate; upstream states full boot/GPU
  validation of the branch is pending.
- *Thin-decode fast path (`GLM53_EXL3_MOE_FAST`).* TP=2 only; the TP3
  launcher unsets it; upstream's numerical study is "formally
  inconclusive".

## Measured performance

**TP=3 (2026-09-21, upstream `775a58b`)** — cold prefill only so far, from
the [KDA large-M A/B](#restart-2026-09-21-ca85576--775a58b-and-the-kda-large-m-ab):

| Prompt | Cold TTFT (flag on, live) | Prefill tok/s | Stock 775a58b |
|---|---:|---:|---:|
| ~8k | 4.57 s | 1749 | 4.91 s |
| ~16k | 8.89 s | 1799 | 9.59 s |
| ~100k | 55.65 s | 1797 | 60.10 s |
| ~256k | 146.1 s | 1752 | 157.9 s |

Decode, tool-eval and VulcanBench at TP=3 are still open. The numbers
below are the **TP=2** stack (stopped 2026-09-15).


Head node, single stream, temp 0, thinking off, upstream's
`tests/bench_decode.py` (median of 5 x 400 tokens):

| Workload | This kit | Upstream kit (README) |
|---|---:|---:|
| Structured (count 1→200) | **65.7 tok/s** (accept 0.96, 6.7 tok/step), TTFT 0.49 s | 61.7 / 62.9 |
| Prose (hash-map explanation) | **27.1 tok/s** (accept 0.34, 2.4 tok/step), TTFT 0.58 s | 26.9 |

Other checks (all clean):

| Test | Result |
|---|---|
| 44,013-token needle retrieval | correct; cold 57.9 s (~760 tok/s prefill), warm repeat 12.2 s |
| Thinking on | reasoning emitted, arithmetic correct |
| Tool call (`glm47`) | `finish_reason=tool_calls`, arguments parsed as JSON, no marker leaks |
| 3x concurrent short prompts | all coherent, ~12 tok/s per stream on 120-token outputs (startup-dominated) |
| DFlash2 acceptance, mixed traffic | ~44% of draft tokens |

Prose decode is comparable to the DSpark stack — ~27–54 tok/s across its
published runs (26.9 / 39.6 single-stream in
[deepseek-v4-flash-server.md](deepseek-v4-flash-server.md), ~52–54 in the
[clock-cap eval](gb10-clock-cap.md)) — not faster; DFlash2's payoff is on
structured/code output.

## Switching stacks

`~/switch-stack.sh` (symlink to [`switch-stack.sh`](switch-stack.sh) in this
directory):

```bash
~/switch-stack.sh status      # what runs on head + worker, API health, served model
~/switch-stack.sh deepseek    # stop GLM on both nodes → start DSpark → wait for health (~10+ min)
~/switch-stack.sh glm         # stop DSpark on both nodes → start GLM   → wait for health (~8 min)
~/switch-stack.sh stop        # stop whatever runs, start nothing
```

It sequences each stack's own launcher and adds the cross-stack checks:
refuses to start while any container of either stack exists on either node,
aborts if the worker is unreachable (a stale rank would resurrect on reboot),
and waits for unified memory to drain on both nodes before starting (a stack
killed mid-warmup leaves GPU state that crashes the next boot with
`Triton Error [CUDA]: operation not permitted`). `GLM_FRESH=1` makes the
GLM lane pull the image, re-verify the overlay and rsync weights again.

Verified 2026-08-28 with a full round trip glm → deepseek → glm.

## Client notes

- Thinking is **on by default**. Disable per request with the top-level
  field `"chat_template_kwargs": {"enable_thinking": false}` (the OpenAI
  Python SDK's `extra_body` merges into the top level; don't nest it in raw
  HTTP).
- Streaming reasoning arrives in the delta field **`reasoning`**, not
  `reasoning_content` — same vLLM quirk as the DSpark stack.
- With DFlash2 on, SSE chunks carry several tokens; count
  `usage.completion_tokens` (`stream_options.include_usage`), not chunks.
- Hub `generation_config.json` stamps `temperature=1.0 / top_p=0.95` unless
  the request overrides.
- Model id for clients: `GLM-5.3-Flash-EXL3`.

## Pi agent config

Per the [gateway doc](../unified-model-gateway.md) rules, LAN-local vLLM
endpoints are **direct** Pi providers in `~/.pi/agent/models.json` (not
`gateway.ts`/cli-proxy), and a model is only added after a live
`chat/completions` test. GLM needs its own provider block rather than a
second model under `dgx_spark`: Pi's `compat` is per-provider, and GLM's
thinking switch is `chat_template_kwargs.enable_thinking`, which Pi emits
only with `thinkingFormat: "qwen-chat-template"` (DeepSeek's entry has no
thinking format and relies on the server-side `DEFAULT_THINKING`). Same
base URL — only one of the two stacks answers at a time.

```json
"dgx_spark_glm": {
  "baseUrl": "http://spark-head:8888/v1",
  "api": "openai-completions",
  "apiKey": "local",
  "compat": {
    "supportsDeveloperRole": false,
    "supportsReasoningEffort": false,
    "supportsUsageInStreaming": true,
    "maxTokensField": "max_tokens",
    "thinkingFormat": "qwen-chat-template"
  },
  "models": [
    {
      "id": "GLM-5.3-Flash-EXL3",
      "name": "GLM-5.3-Flash EXL3 4bpw on DGX Spark (700k, vision, DFlash2)",
      "reasoning": true,
      "input": ["text", "image"],
      "contextWindow": 700000,
      "maxTokens": 65536,
      "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0 }
    }
  ]
}
```

Field notes:

- `id` is sent verbatim as `model` — must be `GLM-5.3-Flash-EXL3`.
- `reasoning: true` + `qwen-chat-template`: Pi sends
  `chat_template_kwargs: {enable_thinking: <level != off>, preserve_thinking: true}`,
  so the Pi thinking level toggles GLM's thinking (any level = on; `off` =
  off). Levels are not passed as effort (`supportsReasoningEffort: false`)
  — GLM-5.3's template has no effort knob.
- `contextWindow` mirrors `MAX_MODEL_LEN` (700k since the 2026-09-01
  update; 1M between 2026-08-30 and 09-01);
  `input` includes `image` since the vision tower is loaded (video is not).
  `maxTokens` is the per-turn output cap including thinking tokens; 65536
  leaves headroom for long reasoning without a "conservative" 8k cap that
  truncates coding-agent output (see the `limit.output` note in
  [zcode-setup.md](../agents/zcode-setup.md)).
- `supportsUsageInStreaming: true` + `maxTokensField: max_tokens` as for the
  DeepSeek entry (vLLM).
- Streamed reasoning arrives in the `reasoning` delta field; Pi's
  openai-completions client reads it.

Verify (`~/switch-stack.sh status` must show glm healthy first):

```bash
curl -s http://spark-head:8888/v1/models | python3 -m json.tool | grep GLM-5.3-Flash-EXL3
pi -p --model dgx_spark_glm/GLM-5.3-Flash-EXL3 -na "say hi"
```

No Pi restart is needed for `models.json` edits. The same values map onto
ZCode's `config.json` by the table in [zcode-setup.md](../agents/zcode-setup.md)
(`reasoning.variants` there is cosmetic for this model).

## Caveats / open items

- **TP=3 has no tool-eval / VulcanBench / decode row yet** (only the
  2026-09-21 cold-prefill A/B; the fair mixed-prefill scheduler has been on
  since 2026-09-18 and is unmeasured here, and the KDA large-M flag is on
  since 2026-09-21 without a quality gate). Upstream's own 3× kit reads structured 87.8 / code 54.9
  / prose 39.6 tok/s vs 73.4 / 45.0 / 32.9 at TP=2 — same prompts, not
  this kit.
- **`switch-stack.sh` and `start.sh` do not manage the TP=3 containers.**
  Stop TP=3 with `./stop.sh tp3` before `switch-stack.sh deepseek|glm`;
  both stacks bind `:8888` and DSpark needs the two serving nodes' memory.
- **Upstream cooperative-MoE kernels (1.5.0 TP2, 1.6.0 TP3 ABI2) are not
  enabled.** The TP3 variant is an outside contribution whose numbers come
  from a different customised stack; the maintainer has not booted it.
  Revisit when a matched A/B on the upstream branch exists.
- **Head memory headroom:** util is back to 0.87 since 2026-09-01 (the
  rightsized indexer workspace and the 700k context return more than the
  0.86→0.87 step takes, but headroom is thinner than the 0.86 era). If the
  head container ever dies with `OOMKilled: true`, drop `GPU_MEM_UTIL` or
  log out of the GNOME session on the head (~2 GB back). Older profiles kept
  in the repo dir: `.env.pre-c190db1.bak` (1M/MNBT 2048/0.86),
  `.env.pre-b5ab809.bak`, `.env.textonly-0.89-800k.bak`.
- **Video input stays off.** Re-enabling `video:1` brings back the
  hour-long CPU warmup (it scales with `MAX_MODEL_LEN`) and the OOM; it
  would need either a much shorter context, more host memory, or an overlay
  patch that skips `_warmup_mm_processor`. Images (up to 4 per prompt) work
  through the standard `image_url` content parts.
- The recipe churns fast upstream (48 commits in its first two days);
  re-assess before each `git pull` and pin `IMAGE` by digest before relying
  on it.
- Not run: GSM8K-style accuracy check, `ABLIT=1`, `SPEC_METHOD=mtp`
  fallback, C>1 long-context benchmarks.
- DFlash2 is CC BY-NC-ND — fine for personal use; switch to MTP for
  anything commercial.

## Source / credits

Recipe, overlay and image: MiaAI-Lab (same author as the DSpark repo).
EXL3/TR3 weights: brandonmusic. EXL3 kernels: turboderp (ExLlamaV3).
DFlash2 drafter: IncoAI. KLD panel: malaiwah (Hub discussion #1 on the
brandonmusic repo).
