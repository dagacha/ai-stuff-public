# DeepSeek V4 Flash (DSpark) inference server on 2x DGX Spark

**Status: active — verified 2026-09-06.**

How the local LLM server is deployed and configured, plus the client-side
requirements that tripped up opencode and droid (leaked `DSML` tool-call
markers). Written 2026-07-13; updated 2026-07-16 for the migration to the
prebuilt Anemll image with speculation re-enabled; updated 2026-08-02 for the
upgrade to the DeepSeek-V4-Flash **0731 GA** checkpoint (see
[0731 upgrade](#0731-upgrade-2026-08-02)); updated 2026-08-20 for the
then-current production recipe and scheduler/JIT hardening (see
[08-20 refresh](#production-recipe-refresh-2026-08-20)); updated 2026-08-26
for the tip `70a7cc4` deployment (corruption-implicated #50004 backport
removed, JIT-cache persistence + boot warmup — see
[08-26 refresh](#production-recipe-refresh-2026-08-26)); updated 2026-09-06
for the cutover to the **Vision-Exp** checkpoint (2026-09-03) and the
**full-stock policy** on upstream tip `957890a` (see
[Full-stock policy](#full-stock-policy-2026-09-06)).

## Overview

- **Model:** served as `deepseek-v4-flash-dspark`; **currently
  `deepseek-ai/DeepSeek-V4-Flash-Vision-Exp` @ `86f746b3` (native image
  input, since 2026-09-03).** Previous lanes: `DeepSeek-V4-Flash-0731` GA
  (2026-08-02 → 09-03), stock preview `deepseek-ai/DeepSeek-V4-Flash-DSpark`
  (2026-07-20 → 08-02) and the drowzeys abliterated v1.1-alpha build
  (2026-07-14 → 07-20) — see [Model switching](#model-switching-stock--abliterated).
- **Stack:** vLLM via the prebuilt Anemll image
  `ghcr.io/anemll/dspark-vllm-gx10:0.1.1` (since 2026-07-16; previously the
  locally-built `vllm-dspark-runtime:dspark-nvfp4-stage-c`), docker compose,
  TP=2 across two DGX Sparks
  - head `spark-head` / 10.10.0.1 (runs the API server)
  - worker 10.10.0.2 (`--headless`) — ring addressing since 2026-09-11, see
    [`ring-cluster.md`](ring-cluster.md); previously 172.31.100.1/.2
- **Repo:** `~/DeepSeek-v4-Flash-DSpark-2x-DGX-Spark`
  (github.com/MiaAI-Lab/DeepSeek-v4-Flash-DSpark-2x-DGX-Spark), currently at
  upstream `957890a` (deployed 2026-09-06) running **fully stock** — pristine
  compose, no opt-ins (see [Full-stock policy](#full-stock-policy-2026-09-06))
- **Endpoint:** `http://spark-head:8888/v1` (OpenAI-compatible; vLLM binds
  0.0.0.0, reachable over Tailscale)
- **Start/stop:** `./start-deepseek-v4-flash-dspark.sh` /
  `./stop-deepseek-v4-flash-dspark.sh`; also `status-`, `logs-`, `smoke-`
  scripts

## Serving profile

| Setting | Value |
|---|---|
| Context window | 1,048,576 tokens |
| Max concurrent seqs | 6 |
| Speculative decoding | **ON**; `MTP_NUM_TOKENS=6` (recipe default for Vision-Exp: `num_nextn_predict_layers=3`, so k must be ≥ `dspark_block_size` 5 **and** divisible by 3). Probabilistic draft. Ran k=5 via the block-k opt-in 2026-09-05 → 09-06 (see the [former-values table](#values-we-ran-before-going-stock-kept-for-reference)); 0731 ran k=5, the preview lane k=3. See [MTP corruption](#troubleshooting-corrupted-output-with-mtp-speculative-decoding) for history; `MTP_NUM_TOKENS=0` does **not** disable speculation on the current compose |
| KV cache | `nvfp4_ds_mla`, block size 256, prefix caching on |
| KV pool observed | **2,107,767 tokens** on the 2026-09-06 stock boot (k=6, capture size 48). Earlier on this checkpoint: 2,154,505 on the 2026-09-04 `f5665e8` boot (also k=6). Historical: 2,250,929 on 0731 (k=5, capture 36, 2026-08-26; 2.18–2.29M across the 08-11 → 08-26 boots at util 0.835); preview era ~2.46M (k=3, util 0.80); ~2.78M with speculation off (2026-07-16) |
| Scheduling | async + chunked prefill, 8192 batched tokens, 1024-token long-prefill chunks, `DSPARK_MAX_INFLIGHT_PREFILLS=1` (recipe default since upstream `f5665e8`, 2026-09-04; the default was 2 from the 08-20 refresh until then — we followed the default at each point, never a local deviation) |
| GPU memory util | 0.835 (`GPU_MEMORY_UTILIZATION_TEXT`, recipe default). Native Vision-Exp image input (`LIMIT_MM_PER_PROMPT` → `{"image":8}`) runs at the same utilisation; the Qwen VL sidecar and its 0.80 vision profile are gone since the 2026-09-03 cutover |
| Sampler | FlashInfer |
| Quantization | deepseek_v4_fp8 + GB10 hybrid NVFP4 patch |

Tool calling and reasoning are handled server-side:

```
--tokenizer-mode deepseek_v4
--tool-call-parser deepseek_v4
--enable-auto-tool-choice
--reasoning-parser deepseek_v4
--default-chat-template-kwargs '{"thinking":true,"reasoning_effort":"low"}'   # DEFAULT_THINKING=low
```

## Full-stock policy (2026-09-06)

**Policy:** the stack runs the official values of the upstream recipe
(`.env.dspark.example` + compose defaults) — no local opt-ins, no compose
edits. Site-specific values (RoCE IPs, NIC names — head `enp1s0f0np0` /
`rocep1s0f0`, worker `enp1s0f1np1` / `rocep1s0f1` via the `WORKER_*` keys
since the 2026-09-11 ring cutover — HF cache paths,
`SERVED_MODEL_NAME=deepseek-v4-flash-dspark`) are the only differences from
the example. After every pull run

```bash
diff <(grep -oE '^[A-Z0-9_]+=.*' .env.dspark.example | sort) \
     <(grep -oE '^[A-Z0-9_]+=.*' .env.dspark | sort) \
  | grep -vE '^[<>] (WORKER_HOST|MASTER_ADDR|VLLM_HOST_IP|WORKER_VLLM_HOST_IP|WORKER_SCRIPT_DIR|NCCL_IB_HCA|NCCL_SOCKET_IFNAME|GLOO_SOCKET_IFNAME|TP_SOCKET_IFNAME|WORKER_NCCL_IB_HCA|WORKER_NCCL_SOCKET_IFNAME|WORKER_TP_SOCKET_IFNAME|WORKER_GLOO_SOCKET_IFNAME|HF_CACHE|WORKER_HF_CACHE|SERVED_MODEL_NAME)='
```

The exclusion list is the complete site-value allowlist; anything else that
prints is a deviation and gets reverted (keys that exist only in the example
are fine — the compose default applies). `HF_HUB_OFFLINE=1` /
`TRANSFORMERS_OFFLINE=1` are in the example with the same values, so they do
not show up. A deviation is only re-introduced with a measured reason
recorded here.

Lane switches under stock: `switch-dspark-model.sh` (both copies) now reads
the `MTP_NUM_TOKENS` default from the compose and accepts unset / the default
(6) / 5-with-block-k, rejecting 0 and anything else — the earlier
hard-coded "must be 5" preflight would have aborted every switch on a stock
env.

Applied on upstream tip `957890a` (env backup
`.env.dspark.pre-fullstock-20260906.bak`; the pre-cleanup env with the inert
Stage-C keys is `.env.dspark.pre-recipe-align-20260906.bak`).

### Values we ran before going stock (kept for reference)

| Knob | Ours (until 2026-09-06) | Stock | Why we had it |
|---|---|---|---|
| compose `--override-generation-config '{"temperature":0.6,"top_p":0.95}'` | present (after `--generation-config vllm`) | absent (vLLM/model default temp 1.0, top_p 1.0) | Clients omitting sampling params (opencode, droid) degenerated at temp 1.0 and leaked malformed DSML tool-call markers; bisected 2026-07-13. Upstream dropped the line repeatedly (aa6f8e6, and again on the 2026-09-06 pull). If leaks return with stock, this is the first thing to re-add — or have clients send `temperature` explicitly. |
| `MTP_NUM_TOKENS` + `DSPARK_ENABLE_DSPARK_BLOCK_K` | `5` + `1` | `6` + `0` | Vision-Exp has `num_nextn_predict_layers=3`, so stock k must be divisible by 3 (6). Block-k hotfix lets k follow the trained `dspark_block_size=5`; adopted 2026-09-05 after spec-bench (code workload, `f5665e8`, k=6) showed the k=6 window wasting ~63% of draft tokens (α≈37%, τ 2.2/6). Upstream measured +3–8% single-stream decode **for k=5 + block-k over stock k=6**. |
| `DSPARK_ENABLE_DSPARK_SWA_PREFIX` | `1` | `0` | Fixes truncated answers on repeated identical prompts (prefix-cache hit skips the draft's 128-token sliding window). The 2026-09-06 tool-eval gate ran with it on: full suite 88/100, hard mode 80/100. |
| `DSPARK_ENABLE_DSML_RECOVERY` | `1` | `0` | Rolls back / repairs malformed DSML tool-call markers against the live tool list. Upstream wants a tool-call parity gate before defaulting on; the same 2026-09-06 gate (full 88/100, hard mode 80/100) ran with it on. |
| `NCCL_GIN_ENABLE` | `0` | unset (GIN on) | Bootstrap-only knob: NCCL comm-init ~2 min → ~13 s at ~97% GPU memory pressure, bandwidth unchanged. Costs only startup time when stock. |
| Stage-C `VLLM_DSPARK_*`, `VLLM_USE_B12X_WO_PROJECTION`, `VLLM_DSV4_*DEFER*`, `VLLM_TRITON_MLA_SPARSE`, `VLLM_SKIP_INIT_MEMORY_CHECK`, `DSPARK_SLOT_CLAMP`, `NCCL_IB_GID_INDEX=0` | set | absent | Leftovers from the 2026-07 Stage-C era. Verified inert on Anemll 0.1.1: compose whitelists env, none reached the container. Removed with no behaviour change. |

Boot outcome on stock (2026-09-06 13:13): healthy, boot-shape warmup 47/47,
smoke 6/6, KV pool 2,107,767 tokens (2,154,505 on the 2026-09-04 `f5665e8`
boot, also k=6; no k=5 figure was recorded on this checkpoint),
`num_speculative_tokens=6`. Speculation on the boot's own traffic (warmup +
smoke + the tool calls below, 4,860 drafted tokens — short synthetic
requests, not comparable to the spec-bench code workload above): per-token
acceptance α=0.55, mean acceptance length 4.3 of 6. Three tool calls with no
sampling params parsed cleanly — the DSML-leak scenario the temp override guarded
against did not reproduce on this checkpoint/image; keep watching agent
sessions.

`DSPARK_MAX_INFLIGHT_PREFILLS` was never a local deviation: production ran
the recipe default at each point — 2 from the 08-20 refresh (the Serving
profile and 08-20 sections used to describe that as current) and 1 since
upstream `f5665e8` (2026-09-04, post-#211 exact gate), which is also today's
stock value.

Left at stock both before and after (never enabled here): `ROPE_SWA_FIX`,
`MXFP4_INDEXER_CACHE`, `ISSUE144_EFFORT_ALIGN`, `C128A_PREFILL_CACHE`,
`ISSUE191_TOOLCALL_FAILCLOSED`.

## Local (uncommitted) changes to `docker-compose.dspark.yml`

> **2026-09-06: none.** Compose is pristine upstream under the [full-stock policy](#full-stock-policy-2026-09-06). Items below are history.

Upstream touches this file — expect merge conflicts on pulls.
**Status as of the 2026-08-02 0731 upgrade: items 2 and 3 below are BOTH
stashed ("pre-0731 local state"), not applied** — the cluster runs the
pristine upstream compose (`914c35b` at the 0731 upgrade; `70a7cc4` on
2026-08-26; `957890a` today — status unchanged across every pull since, and
now policy). They were previously live on `5c7644c`
(the 2026-07-16 Anemll migration; that era's Stage-C compose + env are backed
up in `~/dspark-backup-pre-anemll/` and the "stage-c customizations
pre-anemll" stash).

1. ~~**RoCE multi-node startup fix**~~ — `GLOO_SOCKET_IFNAME` /
   `TP_SOCKET_IFNAME` defaulting to `${NCCL_SOCKET_IFNAME}` was upstreamed;
   no longer a local change as of `5c7644c`.

2. **Default sampling override (2026-07-13; STASHED since the 0731
   upgrade — see the [watch item](#0731-upgrade-2026-08-02)):** added after
   `--generation-config vllm`:

   ```
   --override-generation-config '{"temperature":${DEFAULT_TEMPERATURE:-0.6},"top_p":${DEFAULT_TOP_P:-0.95}}'
   ```

   Why: since upstream `bb75f33` the server no longer forces sampling
   defaults, and both vLLM and the model's own `generation_config.json`
   default to `temperature=1.0, top_p=1.0`. Clients that send no sampling
   params (opencode, Factory droid) then degenerate on long agentic prompts:
   repetitive garbage and *malformed* DSML tool-call markers (e.g.
   `</｜DSML｜tool_calls>`) that the exact-token parser can't intercept, so
   they leak into visible output. Clients that pass temperature explicitly
   (pi) were unaffected. The override sets sane defaults server-side;
   client-supplied params still win. Tunable via `DEFAULT_TEMPERATURE` /
   `DEFAULT_TOP_P` in `.env.dspark`.

   Only the head node's API server uses this flag (worker is headless), but
   keep both nodes' repos in sync anyway.

3. **MTP escape hatch (2026-07-14; STASHED since the 0731 upgrade):**
   replaced the `SPECULATIVE_CONFIG` line with a conditional that omits
   `--speculative-config` entirely when `MTP_NUM_TOKENS=0`, and
   parameterized the draft sample method as `DRAFT_SAMPLE_METHOD`.
   **On every upstream compose since (`70a7cc4` … `957890a`) this mod is
   not applied** (re-verified 2026-08-31 and 2026-09-06: the compose renders
   `SPECULATIVE_CONFIG` unconditionally): `MTP_NUM_TOKENS=0` would render
   `"num_speculative_tokens":0` rather than disabling speculation — the
   escape hatch as described does not work until the mod is re-applied
   from the stash. Speculation is **on**
   (`MTP_NUM_TOKENS=5` since 0731; was 3 on the preview lane since
   2026-07-16) — the corruption that originally forced it off did not
   reproduce on the Anemll image (see the MTP corruption section).
   (Proposed upstream as
   [MiaAI-Lab PR #3](https://github.com/MiaAI-Lab/DeepSeek-v4-Flash-DSpark-2x-DGX-Spark/pull/3),
   still open.)

Other migration deltas in `.env.dspark`: `DSPARK_VLLM_IMAGE` now the Anemll
image, and `DG_JIT_NVCC_COMPILER=/usr/local/cuda/bin/nvcc` (the Anemll image
layout; the Stage-C image used `/opt/env/bin/nvcc`).

## Production recipe refresh (2026-08-26)

Updated both nodes to upstream tip `70a7cc4` (full stop on both nodes, then
`./start-…`). Checkpoint, image, and profile unchanged (0731 @ `9e165c30`,
digest-pinned Anemll `0.1.1`, MTP=5 probabilistic, 6 seqs, 1M context,
thinking `low`). The interim tree `6d00e4a` had been serving since 2026-08-22.

**The decisive change — silent-corruption fix.** Upstream vLLM root-caused
two of this recipe's perf backports as sources of intermittent silent output
corruption under **MTP + prefix caching + CUDA graphs on 2× DGX Spark** —
exactly this deployment's configuration and the same symptom family chased
here in July/August (foreign-character bursts, token salad, corrupted tool
calls after hours of healthy serving). Timeline note: the removal was
**preventive**, not incident-driven — no corruption on this deployment was
ever attributed to #50004 in its 2026-08-12 → 08-26 window, and the backport
did not yet exist during the July incidents (Stage-C proposer era — see
[the MTP corruption section](#troubleshooting-corrupted-output-with-mtp-speculative-decoding))
or the mid-August one (the #26 prefix-cache patch, bisected 2026-08-13),
which had their own confirmed triggers:

- the **#50004 adaptive-topk backport is removed** ([vLLM
  #51318](https://github.com/vllm-project/vllm/pull/51318) reverted it: the
  C128A metadata builder writes packed rows at the live batch's stride while
  FULL-graph consumers retain the capture-time stride, so rows ≥ 1 read stale
  slot ids and attention lands on the wrong context slices). Cost: the
  claimed ~1.0% E2E TTFT.
- the **#49486 short-context-topk backport gains the
  [#52492](https://github.com/vllm-project/vllm/pull/52492) CUDA-graph
  capture guard** (a graph captured with the shortcut baked in replayed it
  against longer cached prefixes and returned candidates unscored).

Verified post-restart on **both** containers: the #50004 script is out of the
hotfix chain and `sparse_mla.py` has zero patch residue; `#49486 --status`
reports every hunk plus the `[PORT #52492] capture guard` APPLIED. Gotcha:
the worker's `patches/` dir kept a stale `hotfix-dsv4-adaptive-topk-50004.sh`
file — the start script's worker sync copies files but does not prune
deletions. It was inert (not in the entrypoint's hotfix list) and was deleted
by hand; check for stale patch files after updates that remove one.

**Also new in this delta** (issue #117 family and friends):

- all three JIT caches now persist on the HF volume (`TRITON_CACHE_DIR`,
  `TILELANG_CACHE_DIR`, `B12X_CUTE_COMPILE_CACHE_DIR`), plus a boot-time
  shape-warmup sweep — together they attack the mid-serve-JIT → TP-pair-loss
  chain (a compiling rank stalling its peer past torch's 600 s NCCL
  watchdog) and make restarts warm. First boot on tip: warmup 47/47 requests
  in 32 s; the JIT monitor (mode=warn) still logged one first-traffic compile
  each for three kernels — expected with cold caches, later restarts should
  reuse them;
- issue #133 bounds a topk Triton kernel to two deterministic compile
  variants; issue #109 stops phantom token-ID-0 emission from encoder-only
  steps;
- hotfix boot is now **fail-closed** (a patch that fails to apply aborts the
  boot instead of silently serving unpatched — issue #107 family);
- PyTorch NCCL flight recorder wired for TP-hang forensics (`TORCH_FR_*`;
  dumps persist on the HF volume), worker-safe compose healthcheck, config
  knob validation.

Compose ships defaults for every new env key and `.env.dspark` already
carried the cache/flight-recorder keys, so no env edits were needed;
`validate-dspark-config.sh` passed unchanged. Opt-ins stay off:
`DSPARK_ENABLE_ASSISTANT_FINAL_HOTFIX=0`, `DSPARK_ENABLE_ISSUE31_GPU_HOTFIX=0`,
API keys empty (the recipe now supports multi-key auth via
`DSPARK_API_KEYS`).

Validation after restart: both ranks healthy, KV pool 2,250,929 tokens,
smoke 6/6, and a 39k-token needle retrieval answered exactly in 24.4 s.

Parked for later: upstream measured **+7.6% end-to-end prefill** from listing
both of the GB10 QSFP port's virtual NICs in `NCCL_IB_HCA` (the port
enumerates as two ~100G PCIe controllers; one HCA runs the link at half
width) plus MTU 9000 on both controller interfaces at both endpoints —
opt-in config, needs the PR #95 multi-HCA GID resolver that is in this tip.
Also relevant to the planned third-Spark ring topology.

## Production recipe refresh (2026-08-20)

Updated both nodes to upstream `58c84eb` and recreated the service after
confirming there were no running or queued requests. (`58c84eb` served until
2026-08-22, when the container moved to the interim tree `6d00e4a` — see the
[08-26 refresh](#production-recipe-refresh-2026-08-26).) The checkpoint and image
did not change: production remains on official 0731 revision `9e165c30` and
the digest-pinned Anemll `0.1.1` image. The effective profile remains
text-only (`ENABLE_VL_SIDECAR=0`), MTP=5, six sequences, and a 1M context.

The changes worth taking into production were:

- the issue #27 scheduler hotfix now permits two overlapping chunked prefills
  (`DSPARK_MAX_INFLIGHT_PREFILLS=2`), avoiding serialization of concurrent
  long-prefill workloads while preserving the decode-fairness safeguards;
- `VLLM_EXECUTE_MODEL_TIMEOUT_SECONDS=1800` and a persistent
  `TILELANG_CACHE_DIR` let the engine survive and reuse mid-serve TileLang JIT
  work instead of timing out at the old 300-second limit;
- the current startup hotfix set includes long-context KV/prefix-cache,
  tool-call truncation, reasoning-stop, grammar-boundary, GB10 spin-wait, and
  vLLM 0.27 performance backports;
- start/stop handling is hardened for `restart: unless-stopped`, stale remote
  ranks, and unreachable workers;
- model preparation now uses longer Hugging Face download/etag timeouts.

The optional assistant-final continuation patch remains deliberately off
(`DSPARK_ENABLE_ASSISTANT_FINAL_HOTFIX=0`), and the experimental VL sidecar
was not enabled. Validation before restart: upstream `scripts/ci-validate.sh`
and `validate-dspark-config.sh`. Validation after restart: both ranks healthy,
API ready, and the launcher's minimal thinking-budget chat smoke request
passed.

## Interim history (2026-08-11 → 08-14)

Events between the 0731 upgrade and the 08-20 refresh that later sections
lean on. Compressed record; full detail lives in the session notes.

- **2026-08-11 — profile switch (`3ff61cf`):** GPU util became
  profile-driven — text-only `GPU_MEMORY_UTILIZATION_TEXT=0.835` (KV pool
  2,270,391 tokens / 15.29 GiB, up from the 0731-era flat 0.80), vision
  coexist lane staying at 0.80. Same update restructured model selection
  around an `ABLITERATED` flag with pinned revisions (see
  [Model switching](#model-switching-stock--abliterated)) and added the
  issue #22 nvfp4 KV-dispatch hotfix.
- **2026-08-12 — v0.27 perf-backport window opens (`c9a84e1`):** six vLLM
  0.27 backports joined the hotfix chain, including #50298 (FlashMLA
  workspace reuse — the pool dips to 2,184,435), #49486 (short-context
  topk skip) and **#50004 (adaptive topk)** — the backport later removed
  preventively in the [08-26 refresh](#production-recipe-refresh-2026-08-26).
- **2026-08-13 — #26 prefix-cache incident and bisection:** the `018c6bc`
  deploy added the issue #26 hybrid-coordinator prefix-cache patch (warm
  repeats finally beat cold: ratio 0.01). The same day, a real agent
  session reproduced the old corruption symptom family (garbage tokens,
  prompt regurgitation). Bisect on `524054d` with the #26 patch disabled
  ran clean → **#26 v1 confirmed as the trigger** (reported upstream; the
  independent reports were issues #36/#39).
- **2026-08-13 evening → 08-14 — resolution (`5cdb9aa`):** upstream
  shipped #26 v2 and fully reverted the thinking-budget hook (a 4.7x
  decode regression at 32k). Deployed same evening; a fresh-session agent
  retest on 08-14 ran clean, closing the incident (upstream PR #41 closed
  without merge). Pool 2,258,301 tokens.

## 0731 upgrade (2026-08-02)

Upgraded to `deepseek-ai/DeepSeek-V4-Flash-0731` @
`9e165c30e2704aec5d9d593cce3eebd58bbef1cb`, following the upstream 0731 GA
recipe (upstream `914c35b`).

**What changed:**

- Repos on both nodes pulled to `914c35b`; pre-existing local mods stashed
  (head: "pre-0731 local state"; worker likewise — see caveat below).
- `.env.dspark` (head; backup `.env.dspark.pre-0731.bak`):
  - `DSPARK_MODEL=deepseek-ai/DeepSeek-V4-Flash-0731`
  - `MTP_NUM_TOKENS=3 → 5` (**required**: 0731 `dspark_block_size=5`)
  - `GPU_MEMORY_UTILIZATION=0.85 → 0.80` (cudagraph capture headroom)
  - `VLLM_USE_BREAKABLE_CUDAGRAPH=0` added (Anemll auto-enables the slower
    breakable path when unset)
- Weights (~156 GB) downloaded to the HF cache on **both** nodes at the
  pinned revision. Old preview weights retained for rollback.
- Image unchanged: `ghcr.io/anemll/dspark-vllm-gx10:0.1.1`.

**Gotchas hit:**

- **`refs/main` must exist when downloading by commit hash.**
  `hf download --revision <sha>` populates only `snapshots/<sha>/`; with
  `HF_HUB_OFFLINE=1` vLLM then fails with `LocalEntryNotFoundError` because
  there is no `refs/main` to resolve. Fix on both nodes:
  `echo -n <sha> > .../models--deepseek-ai--DeepSeek-V4-Flash-0731/refs/main`.
- **`~/.cache/huggingface/hub` (and `hub/.locks`) were root-owned** from an
  old root download — `chown` needed before `hf download` as dgx works.

**Verification:** engine init 90.8 s, API up ~6 min after start; smoke test
6/6; tool-calling verified through the `deepseek_v4` parser; clean code
generation (no garble/DSML leak) on direct API. Throughput/acceptance not yet
re-measured on 0731 (MTP 3→5 and util 0.85→0.80 both changed) — the Anemll
throughput numbers elsewhere in this doc are preview-lane figures; treat as
TBD until the benchmark rerun.

**Switch script updated:** `switch-dspark-model.sh` gained a `ga` lane for
0731 and now recognizes it in `status` (previously it reported the GA model
as `custom` / "model not recognized"). The script also **enforces each
lane's `MTP_NUM_TOKENS` invariant atomically with the model switch** (at the
time: 5 for `ga`, 3 for `stock`/`ablit`; since 2026-09-06 the preflight is
policy-aware — compose default, or 5 with block-k, see
[Full-stock policy](#full-stock-policy-2026-09-06)), fixing a wrong nonzero
value and pinning an unset one. `MTP_NUM_TOKENS=0` is **rejected in preflight** (before any env
edit): the escape-hatch compose mod that makes 0 mean "speculation off" is
currently stashed, so on upstream `914c35b` a 0 would boot with
`num_speculative_tokens: 0`, not disabled speculation — the script refuses
rather than restarting into a misconfig with a reassuring message. Re-apply
the stash to use the escape hatch again.

**Watch item:** the 0731 recipe launches with `--generation-config vllm` and
**no sampling override** — the local "default sampling override" compose
customization (item 2 above) is currently **stashed, not re-applied**. Direct
API output is clean, but if no-sampling-param clients (opencode, droid)
degenerate on long agentic prompts again, re-apply the override from the
stash and restart.

**Rollback:** restore `.env.dspark.pre-0731.bak`, `git stash pop` the
pre-0731 state on both repos, restart. Old weights and image are still in
place.

## Model switching (stock ↔ abliterated)

`./switch-dspark-model.sh {ga|stock|ablit|status}` (run from the head node, in
the deployment repo root; versioned copy in this repo at
[`configs/dgx-spark/switch-dspark-model.sh`](./switch-dspark-model.sh) — it is
untracked in the deployment repo to avoid conflicts with upstream pulls)
toggles `DSPARK_MODEL` in `.env.dspark` and restarts the stack:

- **ga** — `deepseek-ai/DeepSeek-V4-Flash-0731` (HF hub; **current
  production lane**, added 2026-08-02)
- **stock** — `deepseek-ai/DeepSeek-V4-Flash-DSpark` (HF hub; the old
  preview checkpoint — note `stock` returns to the *preview*, not to
  production)
- **ablit** — drowzeys abliterated (uncensored) v1.1-alpha Mida/Brikie build at
  `~/.cache/huggingface/models/dsv4-flash-dspark-abliterated-mida` (~156 GB,
  present on **both** nodes; fp8 `DeepseekV4ForCausalLM`)

`SERVED_MODEL_NAME` stays `deepseek-v4-flash-dspark` in both cases, so clients
need no reconfiguration. `.env.dspark.stock-v4flash` is the stock env backup.

Two gotchas hit while switching back to stock (2026-07-20):

- **`HF_HUB_OFFLINE=1` / `TRANSFORMERS_OFFLINE=1` are required** in
  `.env.dspark` when serving the stock model by hub id: with `OFFLINE=0`,
  transformers tries to resolve the repo online during startup
  (`get_image_processor_config`) and the container exits with
  `OSError: ... is not a valid model identifier`. Weights are fully cached
  on both nodes, so offline mode is correct — leave these set to 1.
  (The ablit build was immune because it's referenced by local path.)
- **Don't kill a hung start mid-warmup without a full teardown:** after one
  such kill, the next boot crashed on the worker with
  `RuntimeError: Triton Error [CUDA]: operation not permitted` (JIT
  `load_binary` in the rejection-sampler warmup). Recovery: remove the
  DSpark containers on **both** nodes, then start fresh.

**Both-node semantics.** The script edits only the head node's `.env.dspark`,
and that is sufficient: `start-deepseek-v4-flash-dspark.sh` copies the head's
`.env.dspark` and `docker-compose.dspark.yml` to the worker via `scp` on every
start, then starts both containers — the head env is the single source of
truth and a switch always applies to both nodes in one restart cycle. Before
switching to `ablit`, the script validates the weights on **both** nodes:
`config.json`, `model.safetensors.index.json`, and every shard the index
references must exist with **exactly the size its own safetensors header
declares** (8-byte length prefix + JSON header + data section to the max
tensor end-offset — checked without reading the ~156 GB of data). It aborts
*before* stopping the running stack, so missing or truncated shards from a
partial/interrupted copy can't take the service down. (Bit-level corruption
in a shard that kept its correct size is not detectable this way — that would
need full checksums of ~156 GB per node per switch.) `status` reports the
configured model plus the running container's model on **both** head and
worker (worker checked over SSH). Rollback is `./switch-dspark-model.sh
stock` — same mechanism in reverse; the stack is down for the duration of one
restart (~minutes of weight loading), there is no partial state to unwind.
Deployment-specific values (`WORKER_HOST`, `HF_CACHE`, `WORKER_HF_CACHE`) are
resolved by sourcing the same `.env.dspark` the launcher uses (in a subshell,
so `${HOME}`-style values expand identically), with head and worker weight
directories derived independently. Process-environment overrides are
deliberately **not** honored: the launcher sources `.env.dspark`
unconditionally (its assignments overwrite inherited variables), so honoring
overrides in the switch script would let preflight/`status` inspect a
different host/cache than the restart actually uses. To change these values,
edit `.env.dspark`.

Notes on the abliterated build:

- Per its `ABLIT_META.json`: abliteration on layers 10–42, λ=3.5, 33 tensors
  modified, MTP heads left stock (`edit_mtp=false`). Abliteration was verified
  at the weight level via this metadata, not behaviorally.
- Since 2026-07-16 it runs on the prebuilt Anemll image. (Historical note
  from the Stage-C era: do **not** pull drowzeys' ghcr image — it shares the
  `vllm-dspark-runtime:dspark-nvfp4-stage-c` tag and would clobber the local
  build; backup tag `vllm-dspark-runtime:dspark-nvfp4-stage-c-backup-20260714`.)
- Validated live 2026-07-14: coherence, forced tool call (no DSML marker
  leak), 4x concurrency clean, benign refusal probe answered.
- Validated on the Anemll image with MTP=3 on 2026-07-16: 18 rounds of the
  corruption repro harness at 4x–6x concurrency, all clean (details below).

## Networking

RoCE between the Sparks over the head↔worker link of the
[3-node ring](ring-cluster.md) (10.10.0.1 ↔ 10.10.0.2 since the 2026-09-11
cutover; 172.31.100.1/.2 point-to-point before). The two nodes sit on
different CX7 ports, so the env is per node, using the launcher's own
convention (`.env.dspark.example`: "On a QSFP ring this node is a different
CX /24 than WORKER_HOST — set WORKER_NCCL_* below; start-*.sh passes them
remotely"):

- head: `NCCL_IB_HCA=rocep1s0f0`, `NCCL_SOCKET_IFNAME` / `TP_SOCKET_IFNAME` /
  `GLOO_SOCKET_IFNAME=enp1s0f0np0`;
- worker: `WORKER_NCCL_IB_HCA=rocep1s0f1`, `WORKER_NCCL_SOCKET_IFNAME` /
  `WORKER_TP_SOCKET_IFNAME` / `WORKER_GLOO_SOCKET_IFNAME=enp1s0f1np1` (each
  defaults to the head value when unset; `start-deepseek-v4-flash-dspark.sh`
  passes them into the worker's compose environment);
- `NCCL_NET=IB`, `NCCL_CROSS_NIC=1`, master at 10.10.0.1:25000.

The launcher runs `resolve_nccl_gid_indexes` unconditionally at startup: it
validates the HCA selector on each node and derives the RoCEv2 GID index
from that node's own socket-interface IPv4, so a wrong pin exits `FATAL`
at boot instead of hanging in `ncclCommInitRank` — check the startup log
before hunting for a hang. `VLLM_SOCKET_IFNAME`, carried in the env since
the 0731 upgrade, is read by nothing in the launcher or compose and was
removed on 2026-09-12. The env was repointed by `ring-cluster/apply-env.sh`
on 2026-09-11; the stack has not been booted on the ring addressing yet
(GLM has been the live stack since 2026-09-07), so the first DeepSeek boot
on the ring is the remaining verification.

## Client configuration requirements

Any OpenAI-compatible client works, with these gotchas:

- **Use chat completions** (`/v1/chat/completions`) and pass tools via the
  native `tools` array. The DSML parser only runs there; the legacy
  completions endpoint returns raw markers.
- **Sampling: clients SHOULD send explicit `temperature`/`top_p`.** Under
  the [full-stock policy](#full-stock-policy-2026-09-06) there is no
  server-side sampling override; the server uses the model/vLLM defaults of
  `temperature=1.0, top_p=1.0` for clients that send none — the condition
  that caused DSML-marker degeneration in opencode/droid in July 2026. On
  the Vision-Exp checkpoint the leak did not reproduce at stock (2026-09-06
  boot check), but if it returns, the temp 0.6 / top_p 0.95 override is the
  first thing to re-add, with the evidence, per the
  [former-values table](#values-we-ran-before-going-stock-kept-for-reference).
  Pi sends explicit params and is unaffected.
- **Streaming reasoning arrives in the nonstandard `reasoning` delta field**,
  not OpenAI's `reasoning_content` (and non-streaming responses put it in
  `message.reasoning`). With thinking enabled (`DEFAULT_THINKING=low`), a
  client or harness that only watches `delta.content`/`delta.reasoning_content`
  sees *nothing* until visible output starts — short-`max_tokens` requests can
  appear to return no tokens at all, and TTFT/decode timers keyed to the first
  recognized delta produce garbage numbers. This broke the gb10-clock-cap
  bench scripts (see
  [gb10-clock-cap.md](gb10-clock-cap.md)); check all three fields.
- Example (pi) provider entry:

  ```json
  "dgx_spark": {
    "baseUrl": "http://spark-head:8888/v1",
    "api": "openai-completions",
    "apiKey": "local",
    "models": [{ "id": "deepseek-v4-flash-dspark", "contextWindow": 1000000 }]
  }
  ```

  ZCode keeps the same endpoint in its own config (`~/.zcode/v2/config.json`),
  translated to its provider shape — see
  [`configs/agents/zcode-setup.md`](../agents/zcode-setup.md) for the Pi → ZCode mapping and
  a worked example.

## Troubleshooting: `DSML` markers in output

Symptom: literal `<｜DSML｜...>` / `</｜DSML｜tool_calls>` text in the agent's
responses instead of tool execution.

1. Check the client sends a `tools` array to `/v1/chat/completions` (not
   text-completions, not prompt-embedded tool descriptions).
2. Check sampling: markers that are *slightly wrong* token sequences mean
   the model is sampling too hot — the parser only matches exact tokens.
   Under the full-stock policy there is no server-side override: make the
   client send `temperature`/`top_p` explicitly, and if leaks persist across
   fresh sessions re-add the override per the
   [former-values table](#values-we-ran-before-going-stock-kept-for-reference)
   (then `docker logs deepseek-v4-flash-vllm-dspark-1 | grep override_generation`
   confirms it is live).
3. Sanity-check the server directly — this should return structured
   `tool_calls`, not text:

   ```bash
   curl -s http://spark-head:8888/v1/chat/completions -H 'Content-Type: application/json' -d '{
     "model":"deepseek-v4-flash-dspark",
     "messages":[{"role":"user","content":"Weather in Madrid? Use the tool."}],
     "tools":[{"type":"function","function":{"name":"get_weather","parameters":{"type":"object","properties":{"city":{"type":"string"}},"required":["city"]}}}],
     "tool_choice":{"type":"function","function":{"name":"get_weather"}}}'
   ```

   `tool_choice` forces the call — without it a healthy server may
   legitimately answer in plain text, which would look like a parser
   failure when it isn't one.

## Troubleshooting: corrupted output with MTP speculative decoding

Symptoms observed in long agentic sessions (opencode) whenever more than one
request was being decoded concurrently, with MTP enabled:

- single garbage tokens dropped into otherwise coherent text
  ("semτιατική semaphore", "How放入", random CJK/Greek/brand tokens);
- `<｜begin▁of▁sentence｜>` emitted as literal text, after which the model
  replays stale earlier answers and ignores new user turns (poisoned prefix
  cache keeps the session broken);
- output jumping mid-sentence into verbatim copies of file content from
  earlier in the context;
- well-formed DSML tool-call markup emitted as plain text.

What the evidence establishes: corruption appears only with MTP speculation
enabled and more than one concurrent decode, and disabling speculation
removes it completely (bisection below). Working hypothesis — not confirmed
against the proposer code or upstream — is hidden-state/position misalignment
in the DSpark proposer under concurrent batches: its own guard logs
`dspark_proposer.py:798 ... non-uniform flattened batch ... skipping
speculation` (seen at batch_size 2 and 3 on separate boots, and it only logs
the first occurrence), which would be consistent with cases the guard misses
drafting from the wrong request's hidden states. Bisection: temp
override didn't fix it, `draft_sample_method=greedy` didn't fix it, disabling
speculation (`MTP_NUM_TOKENS=0`) fixed it completely. Cost: lose the ~2.5-3.5x
decode acceptance speedup. Not fixed upstream as of `bb75f33` (2026-07-14);
reported upstream as
[MiaAI-Lab/DeepSeek-v4-Flash-DSpark-2x-DGX-Spark#3](https://github.com/MiaAI-Lab/DeepSeek-v4-Flash-DSpark-2x-DGX-Spark/pull/3)
(escape hatch + known-issue docs).

Gotcha when verifying any fix: a client session whose history already
contains leaked markers keeps leaking — the model imitates its own context.
Always test with a fresh session.

### Resolution (2026-07-16): not reproducible on the Anemll image

Upstream `5c7644c` switched the default runtime to the prebuilt
`ghcr.io/anemll/dspark-vllm-gx10:0.1.1` image (patched `dspark_proposer.py`
ships inside it — no bind-mount) with `--moe-backend flashinfer_b12x`. Tested
with the exact previously-corrupting config (MTP=3, probabilistic draft,
concurrent decode), both stock and abliterated weights:

- stock: 18 rounds / 88 requests at 4x and 6x concurrency (short, 60k-token
  context, tool-call, streaming; fresh session each) — zero corruption;
- ablit: 8 rounds @4x + 10 rounds @6x — zero corruption;
- **zero** `non-uniform flattened batch` proposer warnings in either run
  (the Stage-C image fired them within minutes);
- spec-decode health normal on both: ~2.5 mean acceptance length, ~50%
  draft acceptance.

Promoted to production the same day. Measured decode throughput
(streaming, server-reported `usage.completion_tokens` — note that with
speculation on, vLLM streams multi-token SSE chunks, so counting chunks
undercounts tokens), ablit weights, C12 1M profile:

| Concurrency | Stage-C, spec off | Anemll, MTP=3 |
|---:|---:|---:|
| 1 | 26.9 tok/s | 39.6 tok/s |
| 6 | ~53 agg / 8.9 per-stream | 106.8 agg / 18.7 per-stream |

Caveat: the repro harness is synthetic and the original bug once passed
smoke tests — the remaining gate is a real long agentic session.

**Rollback procedure if corruption resurfaces** (updated 2026-08-31, still
true on `957890a` — on the current compose, setting `MTP_NUM_TOKENS=0` alone does NOT
disable speculation; it renders `"num_speculative_tokens":0`, and
`switch-dspark-model.sh` rejects 0 in preflight for exactly this reason):

1. re-apply the stashed compose conditional that omits
   `--speculative-config` at 0 (item 3 of
   [the local-changes section](#local-uncommitted-changes-to-docker-composedsparkyml);
   stash "pre-0731 local state", both nodes);
2. set `MTP_NUM_TOKENS=0` in `.env.dspark`, full stop on both nodes,
   restart, and verify `speculative_config=None` in the startup log.

Full Stage-C config also backed up in `~/dspark-backup-pre-anemll/`.

Postscript (2026-08-26): upstream vLLM
[#51318](https://github.com/vllm-project/vllm/pull/51318) later root-caused
a *different* corruption source in this symptom class — the #50004
adaptive-topk backport (present here only 2026-08-12 → 08-26, removed
preventively, never observed corrupting this deployment; see
[08-26 refresh](#production-recipe-refresh-2026-08-26)). That stride-mismatch
mechanism does not explain the July Stage-C incidents above (the backport
did not exist then); the proposer-misalignment working hypothesis remains
unconfirmed — and moot since the Anemll image.

## Backups

`~/dspark-backup-pre-update/`: pre-update `.env.dspark`, plus `RESULTS.md`,
`benchmarks/`, `scripts/` (local validation tooling upstream deleted).

`~/dspark-backup-pre-anemll/`: the Stage-C-era `.env.dspark` and
`docker-compose.dspark.yml` as they ran in production until 2026-07-16
(also preserved as git stash "stage-c customizations pre-anemll" in the
deployment repo). The test worktree, env, and `repro_corruption.py` harness
live in `~/dspark-anemll-test`.
