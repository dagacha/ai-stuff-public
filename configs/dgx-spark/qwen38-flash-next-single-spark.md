# Qwen3.8-Flash-Next (NVFP4) inference server on a single DGX Spark

**Status:** stopped since 2026-09-15 — `spark-indie` is rank 1 of the [GLM-5.3-Flash TP=3](glm-5.3-flash-exl3.md#tp3-on-the-3-node-ring-2026-09-15-restart-2026-09-18) job, which takes the whole GB10; this stack cannot run concurrently with it. Last verified 2026-09-04; restart with `./start.sh` after `./stop.sh tp3` on the head.

Third DGX Spark serving stack, and the first on **`spark-indie`**. When it
was deployed the indie was a standalone single Spark outside the 2-node
cluster that runs the [DeepSeek V4 Flash DSpark](deepseek-v4-flash-server.md)
and [GLM-5.3-Flash EXL3](glm-5.3-flash-exl3.md) stacks, and this stack ran
concurrently with both. Since the 2026-09-11 [ring](ring-cluster.md) the indie
is Node3 of the cluster, and since 2026-09-15 it is rank 1 of GLM TP=3 — so
this stack is mutually exclusive with GLM TP=3 (same GB10) and concurrent
only with the 2-node TP=2 / DSpark fallbacks.

TP=1 on one GB10: the 99 GB NVFP4 checkpoint fits in 121 GiB of unified
memory only because the PLE table is offloaded and memory-mapped instead of
resident.

## Overview

- **Model:** served as `qwen3.8-flash-next` —
  `Mia-AiLab/Qwen3.8-Flash-Next-NVFP4` at revision
  **`925d7be6c14c6c9442ef83e8f05b5a3c39304f69`** (the Hub's `main` as of
  2026-09-04), 99 GB, 51 files, public (not gated). **Nothing pins this** —
  `download.sh` calls `snapshot_download()` with no `revision=`, and
  `start.sh:222` selects `ls snapshots/ | head -1`, i.e. the
  lexicographically first cached snapshot, not the newest. A fresh install
  after an upstream re-upload gets whatever `main` then serves, and every
  memory figure and patch assumption in this doc is against the revision
  above — validate it before trusting them (see [Verifying the
  revision](#verifying-the-revision)). Vision-language: 27-layer vision tower, images
  **and** video work out of the box.
- **Stack:** vLLM in `vllm/vllm-openai:qwen38-flash-next`, bare `docker run`,
  `mp` executor, `--tensor-parallel-size 1`. Four patch generators rewrite
  vLLM sources from pristine copies extracted from the image on **every**
  launch (PLE layer, ModelOpt MXFP8 fallback, PLE offload handshake, QSA FP8
  KV) and are bind-mounted read-only over the container's own files.
- **Speculator:** MTP k=3 (`--speculative-config '{"method":"mtp",…}'`),
  built into the checkpoint. `MTP_NUM_SPECULATIVE_TOKENS=0` disables it and
  returns ~1.5 GiB.
- **Host:** `spark-indie` / `100.<tailscale-ip-3>` (Tailscale MagicDNS; LAN
  `192.168.1.164`; `10.10.2.2` from the head over the CX7
  [ring](ring-cluster.md) since 2026-09-11), hostname `gx10-90f5`,
  container `vllm-fn-tp1`.
- **Recipe:** `~/Qwen3.8-Flash-Next-Single-DGX-Spark`
  (github.com/MiaAI-Lab/Qwen3.8-Flash-Next-Single-DGX-Spark), upstream
  **`5af8abd`** (2026-09-04). AGPL-3.0-or-later.
- **Endpoint:** `http://spark-indie:8888/v1` (OpenAI-compatible, binds
  0.0.0.0)
- **Start/stop:** `./download.sh` (once), `./start.sh`, `./stop.sh`.
  `./start.sh --no-launch` prints the derived budget and the `docker run`
  line without running it, and writes it to `.last_launch.sh`.

## Serving profile (live)

Shipped `.env.sample` defaults, copied verbatim — no deltas (see below).

| Setting | Value | Note |
|---|---|---|
| Context window | **262,144** tokens (`MAX_MODEL_LEN`, native rope) | `YARN=1` serves `YARN_MAX_MODEL_LEN=524288` instead; ceiling 524288, refused above |
| KV pool | **1,402,343 tokens** = 23.23 GiB (**5.35x** a full 262k request) | measured at launch; upstream README's 262k row predates both FP8 KV and the `MADV_RANDOM` change and is not comparable |
| KV dtype | **`fp8`** (`KV_CACHE_DTYPE`) | ~1.85x the BF16 pool; only the 12 full-attention layers shrink, QSA side/compressor caches stay BF16 |
| GPU memory utilization | **0.786** since 2026-09-06 (derived from live memory, not fixed; moves with `KV_TARGET_GIB`/`HOST_RESERVE_GIB`) — verified by `docker inspect` on 2026-09-11; 0.830 was the deployment-era value recorded in this table on the `KV_TARGET_GIB=22` profile (undated in the original entry), and the 2026-09-05 server on that same KV target measured 0.720 per the v3 override report | budget 100.93 GiB at 0.830; cgroup cap 105 GiB = budget + `HOST_SLACK_GIB=5` |
| KV target | `KV_TARGET_GIB=20` since 2026-09-06 (was 22 at deployment; 22 lost three servers on 2026-09-04) with `HOST_RESERVE_GIB=26` | the main consumer of host memory — the safety-relevant knob; the 2026-09-09 benchmark ran on this profile |
| Max concurrent sequences | 4 (`MAX_NUM_SEQS`) | |
| Prefill chunk | 2048 (`MAX_NUM_BATCHED_TOKENS`) | `--enable-chunked-prefill` |
| CUDA graphs | `FULL_DECODE_ONLY`, compilation mode 0 | |
| PLE table | 27 GB packed, `~/.cache/vllm/ple_cache/Mia-AiLab--Qwen3.8-Flash-Next-NVFP4` | built once on first launch (22 s), mmapped `MADV_RANDOM` at runtime |
| Parsers | `--reasoning-parser qwen3`, `--tool-call-parser qwen3_coder` | `--enable-auto-tool-choice` |

`docker --memory 105g --memory-swap 105g`, `--ipc host`, `--network host`,
`--gpus all`, `-e HF_HUB_OFFLINE=1`. `files/memwatch.sh` runs alongside and
kills the container if host `MemAvailable` drops below `MEMWATCH_MIN_GIB`
(default 6); its log is under `logs/`.

## `.env` deltas from upstream

**None.** `.env` is a byte copy of `.env.sample`. Every knob is
environment-overridable per launch (`MAX_MODEL_LEN=65536 ./start.sh`),
precedence **environment > `.env` > built-in default**.

## Verifying the revision

The download and launch paths are both unpinned (see Overview), so check
what is actually in the cache before relying on this doc's numbers:

```bash
ls ~/.cache/huggingface/hub/models--Mia-AiLab--Qwen3.8-Flash-Next-NVFP4/snapshots/
# expect exactly: 925d7be6c14c6c9442ef83e8f05b5a3c39304f69
```

More than one entry means `start.sh` picks by `head -1`, which is **not**
necessarily the one you want. To pin deliberately, pass `revision=` to
`snapshot_download()` in `download.sh`'s `DL_PY`, or delete the unwanted
snapshot before launching. Confirmed 2026-09-04: the cache holds that one
revision and it matches the Hub's current `main`.

## Deployment log (2026-09-04)

Host prep needed three things the recipe does not do for you:

1. **Docker group.** The `dgx` user was not in `docker`; every call failed
   with `permission denied … /var/run/docker.sock`. Fixed with
   `sudo usermod -aG docker $USER` — existing sessions reach it via
   `sg docker -c '…'` without a re-login.
2. **`huggingface_hub` absent on the host.** `download.sh` falls back to
   pulling the checkpoint *through the container image*, which means
   downloading the image before you can download the model. A throwaway venv
   (`python3 -m venv .venv-dl && .venv-dl/bin/pip install huggingface_hub`,
   then `PATH="$PWD/.venv-dl/bin:$PATH" ./download.sh`) avoids that. The venv
   is disposable — `start.sh` never uses it.
3. **`comfy-h3.service` must stay disabled** (it was already `inactive`).
   It polls `127.0.0.1:8888` and launches ComfyUI as a GPU co-tenant as soon
   as anything answers; `start.sh` refuses port 8888 while it is active.

Timings on this host:

| Step | Wall clock |
|---|---|
| `download.sh` (99 GB, 51 files, `max_workers=4`, unauthenticated) | **54 min** |
| Image pull + packed PLE table build (128 shards x 2.5M rows x 90 B = 26.82 GiB) | **22 s** for the table itself |
| `start.sh` → `/health` 200 | **~9 min** |

Disk after deployment: 99 GB checkpoint + 27 GB PLE table = ~126 GB
(690 GB still free of 916 GB). The recipe's "budget ~130 GiB" is accurate.

## Measured on this host

Only the two numbers below were measured here. **Everything else in the
upstream README — prefill/decode sweeps, needle tests, the FP8-vs-BF16
comparison — was measured by the recipe author on their own Spark at
`KV_TARGET_GIB=22` with 512k YaRN, and has not been reproduced on
`spark-indie`.**

| | Value |
|---|---|
| KV pool at the shipped default | 23.23 GiB = **1,402,343 tokens**, 5.35x concurrency at 262k |
| Sanity prompt ("In one sentence, what is a DGX Spark?", `temperature=0`) | correct answer; 63 prompt / 248 completion tokens, of which **206 reasoning** |

The upstream README is explicit that the shipped default profile (262k,
`KV_TARGET_GIB=22`, FP8) is itself unbenchmarked — its 262k row is from an
older `KV_TARGET_GIB=20` BF16 profile. Treat its throughput table as
indicative for this configuration, not as measured.

## Client notes

- **Reasoning is on by default** and arrives in a separate **`reasoning`**
  field, not inside `content` — same vLLM quirk as the DSpark and GLM
  stacks. With a small `max_tokens` the reply is still inside its reasoning
  and `content` comes back **empty on a healthy server**. Budget ~400+.
- Turn it off **per request** — no restart, so reasoning and non-reasoning
  traffic share one server:
  `"chat_template_kwargs": {"enable_thinking": false}`. Measured upstream:
  41 → 0 reasoning tokens, 47 → 12 completion tokens on `17*23`.
- **Multimodal needs no configuration.** Standard `image_url` / `video_url`
  content parts, `http(s)://` or `data:` URIs. The vision tower is already
  counted in the weights figure, so images and video cost no extra GPU
  budget.
- **MTP degrades on multimodal requests.** The draft model cannot take
  multimodal embeddings, so vLLM logs `using text-only draft inputs instead`
  and those requests decode closer to non-speculative speed. Answers stay
  correct; text-only requests are unaffected.
- Decode speed is **strongly content-dependent** — MTP accepts more drafts on
  predictable text (upstream: mean acceptance 2.1 of 4). Treat single-stream
  decode as a range.
- Model id for clients: `qwen3.8-flash-next`.

## Pi agent config

Per the [gateway doc](../unified-model-gateway.md) rules, LAN-local vLLM
endpoints are **direct** Pi providers in `~/.pi/agent/models.json` (not
`gateway.ts`/cli-proxy). Installed on **<laptop>**
(`100.<tailscale-ip-7>`), which reaches `spark-indie` over Tailscale — verified
`GET /health` → 200 on `100.<tailscale-ip-3>:8888`.

This needs its own provider key rather than a model under `dgx_spark`: that
provider points at `spark-head`, a different machine.

```json
"spark_indie": {
  "baseUrl": "http://spark-indie:8888/v1",
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
      "id": "qwen3.8-flash-next",
      "name": "Qwen3.8-Flash-Next NVFP4 on Spark Indie (262k, vision, FP8 KV)",
      "reasoning": true,
      "input": ["text", "image"],
      "contextWindow": 262144,
      "maxTokens": 65536,
      "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0 }
    }
  ]
}
```

Field notes:

- `id` is sent verbatim as `model` — must be `qwen3.8-flash-next`
  (`SERVED_MODEL_NAME` in `.env`); confirmed against `/v1/models`.
- `reasoning: true` + `thinkingFormat: "qwen-chat-template"`: the thinking
  switch is `chat_template_kwargs.enable_thinking`, which Pi emits only with
  that format — same as the GLM entry. `supportsReasoningEffort: false`
  because there is no effort knob, just on/off, so any Pi thinking level =
  on and `off` = off. No `thinkingLevelMap` (that is DeepSeek's shape, folding
  six UI levels onto three backend values; this template has nothing to fold
  onto).
- `contextWindow` mirrors the live `max_model_len` (262144). Flipping the
  server to `YARN=1` would make it 524288 — the only edit needed on either
  side.
- `maxTokens: 65536` is the per-turn output cap **including thinking
  tokens**; see the `limit.output` note in
  [zcode-setup.md](../agents/zcode-setup.md) for why a "conservative" 8k cap
  is a silent order-of-magnitude downgrade for a coding agent. This model
  reasons heavily by default (206 of 248 completion tokens on the trivial
  sanity prompt), so the headroom matters more here than on the GLM entry.
- `input` includes `image` since the vision tower is loaded. **Video also
  works** on this checkpoint (upstream verified a 4 s / 16-frame clip named
  in temporal order), but there is no precedent in this repo for a `video`
  value in Pi's `input` array, so it is left out rather than guessed at.
  Untested: whether Pi accepts it.
- `supportsUsageInStreaming: true` + `maxTokensField: max_tokens` as for the
  DeepSeek and GLM entries (vLLM).

Verify:

```bash
curl -s http://spark-indie:8888/v1/models | python3 -m json.tool | grep qwen3.8-flash-next
pi -p --model spark_indie/qwen3.8-flash-next -na "say hi"
```

## Benchmarking from the cluster (driving host)

The 2026-09-09/10 tool-eval + VulcanBench run
([report](../../benchmarks/tool-eval/report-single-dgx-spark-qwen38-flash-next-c1-thinking.md))
was driven from the cluster worker, which has no working Tailscale path to
spark-indie (packets leave, nothing returns). The head reaches it fine, so the
workaround was an ssh port-forward through the head kept alive in a retry
loop on the worker: `ssh -N -L 8889:100.<tailscale-ip-3>:8888 <head>`, with the
harnesses pointed at `http://127.0.0.1:8889`. It adds one LAN hop to every
step on a stack whose VulcanBench misses are already dominated by the wall
clock, so before the next run either fix the worker's Tailscale ACL or run the
harnesses on spark-indie itself (since 2026-09-11 it is also reachable over
the CX7 ring at `10.10.2.2`; the ring runbook lands in PR #118).

VulcanBench on this stack needs concurrency 1 and the client guard
`VULCANBENCH_OPENAI_EXTRA_PAYLOAD='{"max_tokens":16000,"temperature":0.6,"top_p":0.95}'`,
which harness `bc85af6` only honours with the provider patch in
`benchmarks/vulcanbench/patches/`. Report both the capped and any override
arm; the leaderboard takes the capped numbers.

## Caveats / open items

- **Host `MemAvailable` sat at ~9.0 GiB idle five hours after launch**,
  against the ~12.9 GiB the upstream README reports for this profile and the
  ~10 GiB floor its safety rules ask you to keep under load. The watchdog
  floor is 6 GiB, so there is margin, but this host is starting closer to it
  than the recipe expects — a 400k prefill dipped to 10.97 GiB on the
  author's machine from a higher baseline. Drop `KV_TARGET_GIB` to 20 or 16
  if anything else needs to run here. Scaling the measured pool linearly
  (1,402,343 tokens at a 22 GiB target = ~63.7k tokens per target GiB) that
  is roughly **1.27M tokens at 20 GiB and ~1.02M at 16 GiB** — extrapolated,
  not measured. The upstream README's "~590k tokens at `KV_TARGET_GIB=16`"
  is a **BF16** figure (~37k tokens/GiB) and does not apply to this FP8
  profile. **Exhausting the unified pool hangs the kernel with no OOM kill
  and no logs.**
- **Never set `PLE_OFFLOAD=false` at TP=1** — 99 GB through UVM hangs the
  host.
- **`docker --memory` does not bound GPU allocations on GB10**, only
  host-side memory. `--gpu-memory-utilization` is what bounds the GPU.
- **FP8 KV quality is not settled.** Upstream scores 11/11 on its reasoning
  suite for both dtypes, but a suite everything passes cannot rank anything;
  the reference implementation it credits measured a long-reasoning
  benchmark falling 6/6 → 2/6 with FP8 KV. This is sparse attention —
  quantised keys perturb which blocks the indexer selects — so degradation
  can look like fluent, plausible, wrong reasoning while needle tests still
  pass. `KV_CACHE_DTYPE=auto` reverts to BF16 KV at roughly half the pool.
- **Long video at 512k is untested** upstream, and 1M context has never been
  run at either dtype.
- `./stop.sh` waits up to `STOP_TIMEOUT` (30 s) so vLLM can unlink its POSIX
  shared memory; the container runs `--ipc host`, so segments it leaves
  behind leak onto the host's `/dev/shm` until reboot. `--force` skips the
  wait.
- **The Pi round trip has not been run.** The server side is verified (live
  `chat/completions` sanity prompt, and `/health` → 200 from the tailnet
  address <laptop> would use), but the provider block above has not
  been exercised with `pi -p --model spark_indie/qwen3.8-flash-next` from
  that machine — no Pi install is reachable from here. In particular the
  `thinkingFormat: "qwen-chat-template"` toggle and Pi's reading of the
  `reasoning` delta field are carried over from the GLM/DSpark precedent
  rather than observed against **this** server. Run the verify block before
  depending on it.
- Not run here: any throughput, needle, or long-context benchmark; YaRN;
  BF16 KV; multimodal requests.

## Source / credits

Recipe, patches and image: MiaAI Lab (https://x.com/MiaAI_lab), AGPL-3.0-or-later.
The FP8-KV patch is credited upstream to
[lancelind/qwen3.8-Flash-DGX](https://github.com/lancelind/qwen3.8-Flash-DGX)
(Apache-2.0), reimplemented there against this image's own sources.
vLLM is Apache-2.0 and is not redistributed by the recipe — pristine sources
are extracted from the image at runtime and patched onto the host.
Checkpoint weights are governed by their own licence.
