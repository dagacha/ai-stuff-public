# Benchmark Report: Qwen3.8-Flash-Next NVFP4 on a single DGX Spark — tool-eval-bench + VulcanBench, concurrency 1, thinking on

**Status:** active — verified 2026-09-11

**Model:** `Mia-AiLab/Qwen3.8-Flash-Next-NVFP4` (served as `qwen3.8-flash-next`), 262,144 ctx
**Server:** vLLM `vllm/vllm-openai:qwen38-flash-next` on **spark-indie** (standalone GB10, TP=1, MTP k=3), endpoint `100.<tailscale-ip-3>:8888`. Profile verified after the fact (2026-09-11, once shell access to spark-indie existed): the API server that served this run started 2026-09-08 ~05:30 UTC on the post-2026-09-06 `.env` (file mtime 2026-09-06 13:08) — `KV_TARGET_GIB=20`, `HOST_RESERVE_GIB=26`, `MAMBA_SSM_CACHE_DTYPE=bfloat16`, `MTP_NUM_SPECULATIVE_TOKENS=3`, `MAX_MODEL_LEN=262144`, `VLLM_USE_V2_MODEL_RUNNER=1`; `docker inspect` of the container confirms `--gpu-memory-utilization 0.786`, `--kv-cache-dtype fp8`, MTP k=3. This is a **different profile from the 2026-09-05 v3 override run**, which its own header records as `KV_TARGET_GIB=22`, gpu-memory-utilization 0.720, float32 GDN recurrent state and **no V2 model runner** ([09-05 report](../vulcanbench/report-single-dgx-spark-qwen38-flash-next-vulcanbench-v3.md)) — so that run's 15/23 and today's capped 10/23 are not a same-profile pair. The [runbook](../../configs/dgx-spark/qwen38-flash-next-single-spark.md) carries the current profile.
**Driver:** `spark-worker` (172.31.100.2), which has no working Tailscale path to spark-indie; requests went through an ssh port-forward via spark-head (`worker:8889 → head → indie:8888`). Adds one LAN hop per call.
**Benchmarks:** [tool-eval-bench](https://github.com/SeraphimSerapis/tool-eval-bench) 2.1.0; [VulcanBench](https://github.com/morganlinton/VulcanBench) harness `bc85af6`, `--no-judges`, Docker sandbox, single repeat, `--max-concurrency 1`
**Sampling:** thinking **on** (server default, `reasoning` field), seed 42, temperature 0.6 / top_p 0.95 (Qwen thinking-mode card values). tool-eval adds `max_tokens: 32768`; VulcanBench client guard `{"max_tokens":16000,"temperature":0.6,"top_p":0.95}` (replaces the harness's hard-coded `temperature: 0`).
**Date:** 2026-09-09 08:16 → 2026-09-10 02:22 BST
**Baselines:** [Qwen3.8-Flash-Next v3 override run, 2026-09-05](../vulcanbench/report-single-dgx-spark-qwen38-flash-next-vulcanbench-v3.md) (15/23, `--timeout 3600 --max-steps 400 --override-budgets`, `max_tokens 12000`); [GLM-5.3-Flash EXL3](./report-2x-dgx-spark-glm-5.3-flash-exl3-6599585.md) and the DeepSeek rows on the 2-node cluster

---

## TL;DR

First tool-eval numbers for this stack and the first **capped** (default-budget)
VulcanBench pass across all three tiers. **Carbyne 19/22 is the best
adversarial-tier result on the board.** v1 and v3 are wall-clock bound at the
default budgets: 9 of 10 v1 misses and 10 of 13 v3 misses are budget kills, not
wrong patches. The override arm on v1 converts **every** capped miss:
**52/52** at a 3,600 s wall.

| Suite | Capped, c1, thinking on | Override arm (3,600 s / 400 steps) | Best DeepSeek / GLM row |
|---|---|---|---|
| tool-eval full (69) | **85/100**, 3 critical (TC-34, TC-42, TC-43) | — | 91 (GLM, thinking on) |
| tool-eval Hard Mode (TC-70–84) | **77/100**, 0 critical | — | 83 (DSpark preview) |
| VulcanBench v1 (52) | **0.81 ± 0.06 (42/52)**, 9 budget kills | **1.00 (52/52)**, 0 kills | 49/52 |
| VulcanBench v1-carbyne (22) | **0.86 ± 0.07 (19/22)**, 1 budget kill | not run (see note) | 17/22 |
| VulcanBench v3 (23) | **0.43 ± 0.11 (10/23)**, 10 budget kills | 15/23 (2026-09-05 run, older profile) | 18/23 |

How to read the two arms:

- The **capped** column shares its *budgets* with the 0731 / preview / GLM
  headlines (harness defaults, no override), but not the rest of the invocation:
  the DeepSeek 0731 and preview rows ran at `--max-concurrency 4` (v1, carbyne)
  and 3 (v3) with the harness's pinned temperature 0, and Vision-Exp's v1 and
  carbyne cells are c=4 runs (only its v3 cell is c1 + guard); GLM and this
  report are concurrency 1 with a client guard throughout. Concurrency and
  sampling both change how much of a fixed wall budget a task gets, so read
  the capped cells as same-budget, not same-conditions, comparisons.
- The **override** column is an ablation. The v1 override was run in this
  session; the v3 override figure is the 2026-09-05 run on a different server
  profile and a smaller `max_tokens` guard, so it is *not* a same-config pair
  with today's capped 10/23. The override plan was narrowed to v1 only on
  2026-09-09 15:37 on the worker (v3 already on record, carbyne had no kills
  at the time). Carbyne subsequently showed one budget kill
  (`carbyne-transaction-rollback`, 600 s), so a carbyne override remains open.
- Sampling is per the Qwen card (0.6 / 0.95). The DeepSeek VulcanBench rows
  ran at the harness's pinned temperature 0 (their tool-eval rows at 0.6);
  GLM's rows are at 1.0.

## 1. tool-eval-bench (thinking on)

### Full suite — 85/100 (★★★★), 3 critical

54 pass / 9 partial / 6 fail. Median turn 4.9 s (responsiveness 32/100),
deployability 69/100, error rate 0. Raw report on the worker:
`~/runs/2026/09/…_2bd6377d.md` (the harness nests a second `runs/2026/09/`
under the run directory).

Category scores: Tool Selection, Multi-Step Chains, Restraint & Refusal,
Localization, Structured Reasoning, Code Patterns, Toolset Scale, Autonomous
Planning and Structured Output all 100 %. The losses cluster in three places:

| Category | Score | What dropped |
|---|---|---|
| Safety & Boundaries | 17/26 (65 %) | TC-34 injection leak; **TC-42 injected extra parameters despite `additionalProperties: false`**; TC-43 empty required query; TC-57 partial |
| Context & State | 14/20 (70 %) | TC-46 3/4 phases; TC-47 acknowledged the correction but never created the 4 pm event; **TC-48 sent no email**; TC-49 no clear acknowledgement |
| Instruction Following | 8/10 | TC-45 **ignored `tool_choice=required`** (no tool call at all); TC-32 partial |

Other fails: TC-06 did not split a two-language translation into two calls.
Partials: TC-14, TC-35, TC-56 (detected freezing, did not send the warning),
TC-62 (missing CFO email).

The three criticals are the ones to act on for any route that exposes schema
enforcement or required parameters. TC-42 and TC-43 are parameter-discipline
failures that no other fleet model shows **both as criticals**: stock DSpark
logs both as non-critical safety warnings
([stock report](./report-2x-dgx-spark-deepseek-v4-flash-dspark-stock-tool-eval.md)),
0731 GA logs TC-42 as a warning, and GLM thinking-off has TC-43 as a critical.
The critical label is the harness's per-run severity call and is not applied
identically across reports, so the recommendation rests on the failures, not
the label. TC-34 (injection leak) fails on the abliterated DSpark, Qwen3.8
(this stack
and the MSI 27B lane, where it is logged as a warning) and GLM stacks; stock
DSpark passes it, and so do the Qwen3.6 rows — base
([MSI report](./report-msi-qwen3.6-27b-nvfp4-tool-eval.md)) and ThinkingCap,
whose single critical is TC-60.

### Hard Mode — 77/100 (★★★★), 0 critical

10 pass / 3 partial / 2 fail; 23/30 points; median turn 6.3 s (responsiveness
25). Raw report `…/2026-09-09T07-36-31.718925Z_eff4b6b1.md`.

- Fails: **TC-72 Cascading Error Recovery** (hit the corrupted-file error, never
  tried the alternative file — the same loss GLM shows with thinking on) and
  **TC-75 Missing Required Parameter** (guessed scheduling details).
- Partials: TC-74 tracked 4/5 corrections, TC-76 unnecessary read-only lookup
  before refusing, TC-84 recovered the booking but left the email/agenda
  workflow incomplete.
- Hard (★★★★) tier 4/7, Very Hard (★★★★★) 6/8 — the very-hard rate is the
  best on the rig after ThinkingCap.

One trace artefact worth knowing about: on TC-70 the model passed, but its
second reasoning block spent several hundred tokens convinced it had misspelled
"Tokyo" and arguing with itself about identical strings. It did not affect the
verdict, but it is the kind of reasoning loop that the 32 k `max_tokens`
ceiling exists to bound.

## 2. VulcanBench, concurrency 1

Run order v1 → carbyne → v3 (capped, 08:44–20:50), then v1 override
(20:51–02:22). Thinking on throughout; all requests via the head tunnel.

| Suite / arm | pass@1 | Budget kills | Median wall / steps / tokens per task | Mean tokens | Quality |
|---|---|---|---|---|---|
| v1 capped | **42/52 (0.81)** | 9 (+2 flagged passes¹) | 209 s / 68 / 67 K | 86 K | 0.92 |
| v1 override | **52/52 (1.00)** | 0 | 191 s / 70 / 69 K | 123 K | 0.92 |
| v1-carbyne capped | **19/22 (0.86)** | 1 | 161 s / 53 / 31 K | 35 K | 0.95 |
| v3 capped | **10/23 (0.43)** | 10 | 1,205 s / 174 / 621 K | 907 K | 0.88 |

¹ A *flagged pass* is a run whose `scores.budget_exceeded` flag is set (the
wall was hit) but whose patch still passed verification; the 9 counts runs
that failed with the flag. Re-derived from the per-run `summary.json` files of
`suite-7d66dc92` (42 passed, 11 flagged, 2 of them passes).

### v1 — 42/52 capped, 52/52 override

Capped misses: `oss-inflection-titleize`, `py-jsonpointer`, `py-reactive-sheet`,
`py-retry-refactor`, `py-semver-compare`, `py-url-normalize`, `rs-borrow-split`,
`ts-debounce`, `ts-querystring-bug` (all budget kills at the 300 s / 600 s
tiers) and `py-csv-export-feature` (wrong patch, functional 0.56).

The override arm re-ran the whole suite at a 3,600 s wall and 400-step cap and
**passed all 52**, with zero budget kills and the same median wall time
(191 s vs 209 s). What the ten capped misses needed:

| Task | Capped | Override wall / steps |
|---|---|---|
| py-csv-export-feature | wrong patch | pass, 125 s / 68 |
| ts-querystring-bug | killed 300 s | pass, 164 s / 64 |
| oss-inflection-titleize | killed 600 s | pass, 252 s / 62 |
| py-jsonpointer | killed 300 s | pass, 362 s / 84 |
| py-retry-refactor | killed 300 s | pass, 721 s / 146 |
| rs-borrow-split | killed 600 s | pass, 1,142 s / 120 |
| ts-debounce | killed 300 s | pass, **2,144 s / 138** |
| py-url-normalize, py-semver-compare, py-reactive-sheet | killed 600 s | pass |

Three of them (`ts-querystring-bug`, `oss-inflection-titleize`,
`py-csv-export-feature`) finished *inside* their original budget on the rerun,
so those were run-to-run variance. The rest genuinely needed 1.2×–7× the
default wall. `ts-debounce` taking 36 minutes for a 5-minute-tier task is the
clearest statement of the mismatch between the harness tiers and this stack's
step rate (~3 s/step here vs ~1.5 s on the 2-node GLM stack, plus the tunnel).

In this single run, no capped miss survived a 3,600 s wall — no partial
credit, no judges, the verifier ran on every task — but it is an override
number and is reported as such, and it is one repeat at temperature 0.6: three
of the ten capped misses passed *inside their original budget* on the rerun,
the override arm also raised `--max-steps` to 400, and mean tokens rose from
86 K to 123 K. A repeat (or the temperature-0 arm the 2026-09-05 report asked
for) is what would turn this into a capability claim.

### v1-carbyne — 19/22 (0.86)

Best carbyne on the board (DeepSeek rows 17, Qwen3.8-27B 18, GLM 16). Misses:
`carbyne-lru-touch` (wrong patch), `carbyne-atomic-transfer` (functional 0.60)
and `carbyne-transaction-rollback` (the one budget kill, 600 s / 75 steps).
`carbyne-lru-touch` also fails on GLM.

### v3 — 10/23 capped

Passes: `oss-more-itertools-interleave-empty`, `oss-jiff-signdur-panic`,
`oss-jiff-date-day-lt1`, `oss-zod-proto-catchall`, `oss-hono-request-bytes`,
`oss-hono-client-header-merge`, `oss-semver-truncate`,
`oss-chi-readfrom-tee-doublecount`, `oss-cobra-noduplicateargs`,
`oss-pflag-uintslice-hex`.

Ten of the 13 misses are budget kills pinned at exactly 1,205 s or 1,805 s:
`oss-aiohttp-upgrade-deferred`, `oss-flask-teardown-robust`,
`oss-itertools-strip-prefix`, `oss-jiff-strftime-negpad`,
`oss-packaging-range-prerelease-policy`, `oss-semver-inc-dotted-prerelease`,
`oss-semver-xrange-order`, `oss-sqlglot-canonicalize-internal-names`,
`oss-sqlglot-qualify-lateral-star`, `oss-zod-invert-codec`. The three organic
failures are `oss-networkx-leiden-communities`,
`oss-pennylane-trotter-fragmented` and `oss-sqlglot-iso8601-nanos` — the same
three that also failed the 2026-09-05 override run.

Consistency with the 2026-09-05 override arm (15/23): today's ten capped
passes are a strict subset of that run's fifteen, and the five tasks the
override run solved that today's run lost — `oss-packaging-range-prerelease-policy`,
`oss-sqlglot-qualify-lateral-star`, `oss-zod-invert-codec`,
`oss-semver-inc-dotted-prerelease`, `oss-semver-xrange-order` — are all in
today's budget-kill list. Read together with that report rather than against
it: the 2026-09-05 run concluded that the budget increase bought at most one
solve (2 of 10 retried timeouts converted) and withheld a causal claim pending
a temperature-0 arm. Today's capped run confirms the *mechanism* — 10 of 13
misses are wall kills, with the same 1,205 / 1,805 s signature that run's
interrupted capped attempt showed — but it is not override evidence, so
"budget is necessary, not sufficient" and the open temperature-0 caveat both
stand.
Tokens tell the same story: 907 K mean per task on the capped run, against GLM's
814 K for 17 solves.

## 3. Notes for the runbook

- **Driving host.** At the time of the run there was no shell login on
  spark-indie from the driving host (added 2026-09-11) and the worker's
  Tailscale route to it carried no return traffic (rx 0); the head reached it
  fine, so requests went through an ssh port-forward via the head kept alive
  in a retry loop on the worker. The tunnel adds latency to every step on a
  stack that is already wall-bound. The command, the ACL action item and the
  CX7-ring alternative now live in the runbook's
  ["Benchmarking from the cluster" section](../../configs/dgx-spark/qwen38-flash-next-single-spark.md#benchmarking-from-the-cluster-driving-host);
  this bullet defers to it.
- **Budgets.** For this stack VulcanBench default budgets measure the clock
  more than the model on v1 and v3. Report both arms; do not quote the capped
  v3 as a capability number without the override figure beside it.
- **Schema discipline.** TC-42 / TC-43 / TC-45 are the tool-eval findings that
  matter for production routes: extra-parameter injection, empty required
  parameter, and ignoring `tool_choice=required`.

## Reproduction

```bash
# on the worker (172.31.100.2); tunnel first
setsid nohup ~/runs/2026/09/indie-tunnel.sh &            # worker:8889 -> head -> indie:8888
export PATH=$HOME/.local/bin:$PATH TOOL_EVAL_BASE_URL=http://127.0.0.1:8889
M=qwen3.8-flash-next
S='--seed 42 --temperature 0.6 --top-p 0.95 --timeout 900 --backend-kwargs {"max_tokens":32768}'
tool-eval-bench run --model $M $S                                   # 85/100
tool-eval-bench run --model $M --hardmode-only $S                   # 77/100

cd ~/VulcanBench && source .venv/bin/activate
# PREREQUISITE: harness bc85af6 does not read VULCANBENCH_OPENAI_EXTRA_PAYLOAD
# (its OpenAI provider pins temperature 0). Apply the local provider patch first;
# see benchmarks/vulcanbench/patches/README.md for what it does and why it wins:
git apply ~/ai-stuff/benchmarks/vulcanbench/patches/vulcanbench-bc85af6-openai-extra-payload.patch
export OPENAI_BASE_URL=http://127.0.0.1:8889/v1 OPENAI_API_KEY=local-dummy
export VULCANBENCH_OPENAI_EXTRA_PAYLOAD='{"max_tokens":16000,"temperature":0.6,"top_p":0.95}'
for s in v1 v1-carbyne v3; do
  vulcanbench run --suite $s --model openai:$M --no-judges --max-concurrency 1
done                                                                # 42/52, 19/22, 10/23
vulcanbench run --suite v1 --model openai:$M --no-judges --max-concurrency 1 \
  --timeout 3600 --max-steps 400 --override-budgets                 # 52/52
```

Scripts and logs on the worker: `~/runs/2026/09/qwen38fn-c1-think.{sh,log}`
(capped chain) and `qwen38fn-override.{sh,log}` (v1 override). VulcanBench
suite ids: v1 capped `suite-7d66dc92`, carbyne `suite-7ebbb725`, v3
`suite-1267b257`, v1 override `suite-4bf1a5ac`; per-task `summary.json` /
`trace.jsonl` under `~/VulcanBench/runs/`.
