# Model Benchmarks & Throughput Reports

**Status:** active — verified 2026-09-11

This directory contains benchmark reports, outputs, and measurement tools for local LLMs evaluated on various tasks.

Reports are grouped by suite, mirroring the directory layout:
`tool-eval/`, `vulcanbench/`, `lane-assessments/`, and `throughput/`.

## Leaderboard

Best default-budget result on record per model, tool-eval-bench and
VulcanBench only; a model
is listed only once it has all five numbers (models with a partial VulcanBench
run — ThinkingCap-Qwen3.6-27B and Qwen3.6-27B NVFP4, v3 only — are in the
reports below but not here). Tool-eval is full suite / Hard Mode out of
100; VulcanBench is pass counts on v1 / carbyne / v3 **at the harness's default
budgets**. Runs with `--override-budgets` (longer wall clocks) are ablations and
are listed in the caveats, never in the table. Updated 2026-09-11.

| Model | Tool-eval full / Hard | VulcanBench v1 / carbyne / v3 |
|---|---|---|
| DeepSeek-V4-Flash-DSpark (best of stock / preview) | 85 / 83 | 49/52 · 17/22 · **18/23** |
| GLM-5.3-Flash EXL3 (2x DGX Spark, thinking on / off) | 91 / 80 | 49/52 · 16/22 · 17/23 |
| DeepSeek-V4-Flash-0731 GA | 88 / 70 | 49/52 · 17/22 · 14/23 |
| DeepSeek-V4-Flash-Vision-Exp | 88 / 80 | 47/52 · 17/22 · 13/23 |
| Qwen3.8-27B NVFP4 vLLM | 91 / 67 | 50/52 · 18/22 · 13/23 |
| Qwen3.8-Flash-Next NVFP4 (1x DGX Spark) | 85 / 77 | 42/52 · **19/22** · 10/23 |

Caveats:

- Override-budget ablations (3,600 s wall), not in the table: Vision-Exp v3
  16/23; Qwen3.8-Flash-Next v1 52/52 and v3 15/23. On Qwen3.8-Flash-Next the
  capped misses are dominated by wall-clock kills (9 of 10 on v1, 10 of 13 on
  v3); on Vision-Exp it is per cell — v1 5 of 5 (at c=4), carbyne 0 of 5, v3 2
  of 10 at c=1 — so a capped cell measures the clock as much as the model only
  where the kills are. See the respective reports.
- Tool-eval scores span harness versions 2.1–2.5.1.
- Concurrency / sampling are not uniform across rows: the DeepSeek 0731 GA and
  preview rows ran at `--max-concurrency 4` (v1, carbyne) / 3 (v3) at the
  harness's pinned temperature 0; GLM and Qwen3.8-Flash-Next are concurrency 1
  with a client guard throughout.
- Vision-Exp: v1 47/52 and carbyne 17/22 are the original c=4 runs; only the
  v3 13/23 is the concurrency-1 + client-guard rerun. The
  hard-mode 80 is the 2026-09-06 gate run on DSpark tip 7440c53 (SWA-prefix +
  DSML-recovery opt-ins; full score unchanged at 88). 0731 GA v3 14/23 is its
  thinking-low rerun.
- GLM: 91 is thinking on, 80 thinking off (thinking scores 73 on Hard Mode);
  VulcanBench at concurrency 1 with default budgets and a client guard (c=4
  inflates wall time inside a fixed budget because prefills serialize under
  `GLM53_MIXED_PREFILL_CHUNK=skip`, so c=1 is the comparable invocation);
  sampled at the model card's temp 1.0 / top_p 0.95, against the harness's
  pinned temperature 0 on the DeepSeek VulcanBench rows (their tool-eval rows
  are at 0.6).
- Qwen3.8-Flash-Next: thinking on, concurrency 1, temp 0.6 / top_p 0.95,
  driven through an ssh tunnel from the worker.

## Table of Contents
0. [Leaderboard](#leaderboard)
1. [Tool-Eval Benchmarks](#tool-eval-benchmarks)
2. [VulcanBench (Agentic SWE)](#vulcanbench-agentic-swe)
3. [Production Lane Assessments (MSI)](#production-lane-assessments-msi)
4. [Throughput & Performance Reports](#throughput--performance-reports)
5. [Coding Benchmarks](#coding-benchmarks)
6. [Game Generation Benchmarks (Space Shooter)](#game-generation-benchmarks-space-shooter)
7. [Tooling](#tooling)

---

## Tool-Eval Benchmarks

Tool-call quality, Hard Mode, and safety suites (`tool-eval/`):

- **[GLM-5.3-Flash EXL3 (recipe 6599585) 2x DGX Spark tool-eval-bench + VulcanBench Report](./tool-eval/report-2x-dgx-spark-glm-5.3-flash-exl3-6599585.md)**
  First full pass on the second serving stack (4 bpw EXL3, E3 grouped MoE, 700k ctx): 85/100 full suite and 80/100 Hard Mode with thinking off (2 criticals: TC-34 injection leak, TC-43 empty required parameter); thinking on lifts the full suite to 91 (fleet-best tie) but drops Hard Mode to 73; and VulcanBench v1 49/52 / carbyne 16/22 / v3 17/23 at concurrency 1 — prefills serialize under `GLM53_MIXED_PREFILL_CHUNK=skip`, so the c=4 attempt (25/52; 29 of 52 runs flagged `budget_exceeded`, all 27 failures plus 2 late passes) is discarded and documented. Full suite, thinking off = 53 pass / 11 partial / 5 fail = 117/138.
- **[Qwen3.8-Flash-Next NVFP4 single DGX Spark tool-eval-bench + VulcanBench Report (c1, thinking on)](./tool-eval/report-single-dgx-spark-qwen38-flash-next-c1-thinking.md)**
  First tool-eval numbers for the spark-indie stack: 85/100 full suite (3 criticals: TC-34 injection leak, TC-42 extra-parameter injection, TC-43 empty required parameter; TC-45 ignores `tool_choice=required`) and 77/100 Hard Mode; VulcanBench at concurrency 1 with default budgets 42/52 / 19/22 (board-best carbyne) / 10/23, where 19 of the 23 v1+v3 misses are wall-budget kills, and a v1 override arm that passes 52/52.
- **[DeepSeek-V4-Flash-DSpark 2x DGX Spark tool-eval-bench Report](./tool-eval/report-2x-dgx-spark-deepseek-v4-flash-dspark-tool-eval.md)**
  Tool-calling quality (82/100), Hard Mode, DSpark speculative decoding, context-pressure, and throughput benchmarks on the 2-node DGX Spark vLLM deployment (1M context, NVFP4 KV) — abliterated-mida weights.
- **[Stock DeepSeek-V4-Flash-DSpark 2x DGX Spark tool-eval-bench Report](./tool-eval/report-2x-dgx-spark-deepseek-v4-flash-dspark-stock-tool-eval.md)**
  Re-run of the full suite on stock `deepseek-ai` weights: 85/100 quality, 83/100 Hard Mode, zero critical safety failures (vs 3 on abliterated), with side-by-side comparison tables — stock weights.
- **[keys 32-32 Abliterated DSv4-Flash-0731 2x DGX Spark tool-eval-bench Report](./tool-eval/report-2x-dgx-spark-dsv4-0731-ablit-32-32-tool-eval.md)**
  Single-variable stock-vs-abliterated on the GA base: 83/100 (−5), Hard Mode 63 (−7), and — as designed for a red-team lane — full injection compliance where stock refuses (2–4 criticals on the assistant rubric). New finding: thinking mode deepens the compliance (2→4) and the stock Hard-Mode recovery doesn't carry over. Throughput unchanged.
- **[DeepSeek-V4-Flash-0731 (GA) 2x DGX Spark tool-eval-bench Report](./tool-eval/report-2x-dgx-spark-deepseek-v4-flash-0731-tool-eval.md)**
  The GA checkpoint after the 0731 upgrade: 88/100 full suite (fleet-best) but Hard Mode 70/100 (−13 vs preview); sleeper-injection resistance retained, new TC-34 leak warning; MTP n=5 spec-decode and throughput on the new lane.
- **[DeepSeek-V4-Flash-Vision-Exp (DSpark f5665e8) 2x DGX Spark tool-eval-bench + VulcanBench Report](./tool-eval/report-2x-dgx-spark-deepseek-v4-flash-vision-exp-f5665e8.md)**
  Covers both suites in one file. Vision-Exp checkpoint on recipe tip f5665e8 vs the 0731 GA baseline: full suite flat at 88, Hard Mode +7 (77), TC-34 injection regression (deterministic), TC-58 key leak only in non-thinking mode, TC-61 polling collapse past 60 % of 128K; VulcanBench v1 0.90 / carbyne 0.77 / v3 12/23 within noise; +25 % prefill and +34–40 % decode plus native images. Addenda: block-k MTP-5 A/B (adopted in production), thinking-low reruns, and a v3 rerun at concurrency 1 with a client max_tokens/temperature guard — budget failures 11 → 2, score 13/23 (level with the 0731 non-thinking headline); a 3,600 s override ablation reaches 16/23 with zero budget failures, so the default harness budgets are the binding constraint on this rig.
- **[ThinkingCap-Qwen3.6-27B MSI tool-eval-bench Report](./tool-eval/report-msi-thinkingcap-qwen3.6-27b-tool-eval.md)**
  The new MSI production model vs base Qwen3.6: 83/100 overall (−5) but Hard Mode 87/100 (+7, fleet best) — first model to pass TC-74; TC-60 sleeper injection still fires; MTP n=5 hits 92 tok/s on code.
- **[Qwen3.6-27B-NVFP4 MSI tool-eval-bench Report + Cross-Model Comparison](./tool-eval/report-msi-qwen3.6-27b-nvfp4-tool-eval.md)**
  Tool-calling quality on the RTX 5090 rig: 88/100 (best base score so far), Hard Mode 80/100, MTP spec decode ~85 tok/s on code, one critical sleeper-injection finding, and a three-way comparison vs both DeepSeek-V4-Flash-DSpark variants.

## VulcanBench (Agentic SWE)

Docker-sandboxed agentic SWE tasks, three tiers (`vulcanbench/`; leaderboard images in `vulcanbench/images/`):

- **[GLM-5.3-Flash EXL3 (6599585) VulcanBench results](./tool-eval/report-2x-dgx-spark-glm-5.3-flash-exl3-6599585.md#2-vulcanbench)**
  Lives in the combined report above: v1 49/52, carbyne 16/22, v3 17/23 (0.74) at concurrency 1 with default budgets and zero budget kills on v3 — second-best frontier-hard result on the rig, one task under the stock DSpark preview.
- **[Stock DeepSeek-V4-Flash-DSpark 2x DGX Spark VulcanBench Report](./vulcanbench/report-2x-dgx-spark-deepseek-v4-flash-dspark-vulcanbench.md)**
  Agentic SWE-task benchmark (VulcanBench, Docker sandbox): v1 pass@1 0.94 (49/52), adversarial carbyne tier 0.77 (17/22), frontier-hard v3 tier 18/23 (78.3%) with head-to-head table vs published frontier results, quality 0.93 / security 0.99, plus aarch64 + local-endpoint setup notes.
- **[DeepSeek-V4-Flash-0731 (GA) 2x DGX Spark VulcanBench Report](./vulcanbench/report-2x-dgx-spark-deepseek-v4-flash-0731-vulcanbench.md)**
  GA rerun of all three suites: v1 0.94 and carbyne 0.77 exactly flat, v3 down to 13/23 (56.5%, −5 tasks vs preview) — but tokens/task fell 20× (1.67M → 82K); depth traded for efficiency and everyday polish.
- **[Qwen3.8-Flash-Next NVFP4 single-DGX-Spark VulcanBench v3 Report](./vulcanbench/report-single-dgx-spark-qwen38-flash-next-vulcanbench-v3.md)**
  Frontier-hard tier on one GB10 (262K FP8-KV): 15/23 (65.2%) under
  `--timeout 3600 --override-budgets` plus a client sampling guard. The score is carried by
  eight never-before-run tasks that all passed (Go 3/3, JS 3/3, TS 4/4); the override itself
  recovered at most 1 of the ten prior budget-timeouts, unlike the Vision-Exp ablation, and
  the report withholds any causal claim pending a temperature-0 arm. Remaining failures are
  capability failures (two with pass-to-pass regressions) or non-convergence, and wall clock
  -- never the step cap -- was always the binding limit.
- **[Qwen3.8-Flash-Next NVFP4 capped c1 VulcanBench results](./tool-eval/report-single-dgx-spark-qwen38-flash-next-c1-thinking.md#2-vulcanbench-concurrency-1)**
  Lives in the combined report above: v1 42/52 capped → 52/52 with a 3,600 s override, carbyne 19/22, v3 10/23 capped (10 budget kills; the ten passes are a strict subset of the 2026-09-05 override run's fifteen).
- **[DeepSeek-V4-Flash-Vision-Exp (f5665e8) VulcanBench results](./tool-eval/report-2x-dgx-spark-deepseek-v4-flash-vision-exp-f5665e8.md#2-vulcanbench)**
  Lives in the combined tool-eval + VulcanBench report above: v1 47/52, carbyne 17/22, v3 12/23, with the wall-budget-exhaustion analysis.
- **[ThinkingCap-Qwen3.6-27B MSI VulcanBench v3 Report](./vulcanbench/report-msi-thinkingcap-qwen3.6-27b-vulcanbench-v3.md)**
  The thinking tune on the frontier-hard tier: 7/23 (30.4%, +1 over base) — leaner solves and two new TypeScript wins, but the ~2.5x gap to DSv4-Flash stands; reasoning style ≠ scale. Includes vLLM crash note at concurrency 3.
- **[Qwen3.6-27B-NVFP4 MSI VulcanBench v3 Report](./vulcanbench/report-msi-qwen3.6-27b-nvfp4-vulcanbench-v3.md)**
  Frontier-hard tier on the RTX 5090 rig: 6/23 (26.1%) — the tier working as designed; strong tool orchestrator, not a frontier coder. Includes updated leaderboard image with both local rows and fleet-routing verdict.

## Production Lane Assessments (MSI)

Writeups that decide MSI production-lane changes (`lane-assessments/`):

- **[Qwen3.8-27B assessment: the 131K lane (MSI)](./lane-assessments/report-msi-qwen3.8-27b-131k.md)**
  vLLM + NVFP4 + TurboQuant 4-bit KV + MTP-3 at native 256K, low thinking by default (MSI production 2026-08-17 → 2026-09-03; now the rollback lane behind the EXL3 vision lane below). tool-eval-bench v2.5.1 scores 91/67 (full/Hard Mode); fresh VulcanBench results are v1 50/52, Carbyne 18/22, and v3 13/23. Now includes the 2026-08-22 repetition-loop incident forensics (MTP acceptance pegged at 100% for 5+ min) and the anti-repetition penalty A/B: every penalty costs 5–6 full-suite points as a server default, so loop protection moves client-side (frequency_penalty 0.5) — a conclusion that was validated only on short agentic turns on the vLLM lane: on the EXL3 lane the same 0.5 degenerates long generations, see the 2026-09-16 addendum in the EXL3 report below. The report retains the original llama.cpp/UD-Q4_K_XL 131K assessment and its 15/23 v3 result as historical context.
- **[Qwen3.8-27B EXL3 / DFlash2 assessment (MSI)](./lane-assessments/report-msi-qwen3.8-27b-exl3-dflash2.md)**
  EXL3 5.5-bpw recovers a 91 full-suite score and reaches 198-233 tok/s decode;
  DFlash2 fits at 160K with 4.5 GiB free. Hard Mode is 63 versus the vLLM lane's
  67, and DFlash2 reproducibly omits a required tool argument. Vision addendum:
  the checkpoint's BF16 vision tower works on this engine, including vision +
  MTP (the combination that crashes vLLM here), multi-image, images after 78K of
  text, and images inside tool turns. **`55-mtp-262k-vision` was MSI production
  2026-09-03 .. 2026-09-24** (`qwen38-exl3.service`): vision + ~2x decode + prompt
  caching, at −4 Hard Mode and slower prefill. Now the rollback checkpoint
  behind the ThinkingCap lane below.
- **[ThinkingCap-Qwen3.8-27B assessment and promotion (MSI)](./lane-assessments/report-msi-thinkingcap-qwen3.8-27b.md)**
  bottlecapai's brief-thinking finetune of the same base, own EXL3 5.5-bpw
  conversion on the same engine/kit/flags. tool-eval low 88/63 vs base EXL3
  90/63, but at xhigh on realistic coding prompts the base finishes 0/4 under a
  20K cap vs ThinkingCap 2-3/4 with ~27% fewer tokens, ~85 tok/s decode at
  xhigh; vision check passes. **`tc38-55-mtp-262k-vision` is MSI production
  since 2026-09-24** (`qwen38-exl3.service`). Post-promotion battery on live
  prod: needles 4/4 to 196K, code edits 2/2, tools 12/12, 197 tok/s, vision
  context 6/6, tool-eval xhigh 92/57; VulcanBench v1 51/52, carbyne 19/22,
  v3 16/23 (base: 50/52, 18/22, 13/23). Temperature 1.0 (the card's recipe)
  is harmful for tool calling; the lane keeps 0.6. Gotcha: the EXL3 kit
  defaults `max_tokens` to 1024 when a client sends none.
- **[Nemotron 3.5 Lightning 30B-A3B bench + ThinkingCap card-recipe promotion (MSI)](./lane-assessments/report-msi-nemotron-3.5-lightning-30b.md)**
  Fastest single-stream model on the box (~328 t/s llama.cpp, ~1977 t/s aggregate @16 on vLLM NVFP4) but full-suite 80 vs prod ThinkingCap 88 — no lane change; the ThinkingCap card-recipe rerun (hard-mode 60 → 67 on teb v2.5.1) is promoted to production.
- **[Muse-Glimmer-30B Pilot Outcome (MSI)](./lane-assessments/report-msi-muse-glimmer-pilot-outcome.md)**
  Pilot closed, no promotion: Muse Hard Mode 63 (rejected), surprise challenger Gemma 4 31B QAT stuck at Hard 70–77 with stable behavioral failures (TC-72/80/83). Real yield: Gemma+native-MTP hits 149–150 tok/s and passes a 45-iteration vision+speculation soak (the shape that crashes vLLM) — vision lane upgraded.
- **[Qwen 3.6 27B Official NVFP4 vLLM Report](./lane-assessments/report-msi-Qwen3.6-27B-official-NVFP4.md)**
  Official NVIDIA NVFP4 checkpoint analysis, OOM root-cause diagnostics, and post-mortem corrections (128K context, production setup).

## Throughput & Performance Reports

- **[Qwen 3.6 27B AEON-XS vLLM Report](./throughput/report-msi-Qwen3.6-27B-AEON-XS.md)**
  Detailed throughput and TTFT measurements on the MSI workstation: ~16K tok/s prefill, ~40 tok/s decode, ~105ms TTFT.
- **[Gemma 4 31B NVFP4 vLLM Report](./throughput/gemma-4-31B-NVFP4-vllm.md)**
  Throughput analysis of Gemma 4 31B running with NVFP4 quantization.

## Coding Benchmarks

Evaluations of local MoE and dense models on real-world software engineering tasks:
- **[Coding Tasks Index & Results](./coding-tasks/README.md)**
  - **Task A (LRU Cache):** Thread-safe LRU implementation.
  - **Task B (Async Job Queue):** Bug-finding and async correctness.

## Game Generation Benchmarks (Space Shooter)

Complete generated browser-based arcade space shooter implementations produced by various models:
- **[Qwen 3.6 35B (Bosgame llama.cpp)](./space-shooter-results/space-shooter-qwen3.6-35b/)** — the original run; other READMEs cite it as their comparison baseline
- **[Qwen 3.6 35B MLX M1 Max](./space-shooter-results/space-shooter-qwen3.6-35b-mlx-m1max/)**
- **[Qwen 3.6 35B MLX (No Thinking)](./space-shooter-results/space-shooter-qwen3.6-35b-mlx-m1max-notthinking/)**
- **[Qwen 3.6 35B MLX Octopus](./space-shooter-results/space-shooter-qwen3.6-35b-octopus-mlx/)**
- **[Qwen 3.5 35B MLX](./space-shooter-results/space-shooter-qwen3.5-35b-mlx/)**
- **[Qwen 3.6 27B NVFP4](./space-shooter-results/space-shooter-qwen3.6-27b-nvfp4/)**
- **[Gemma 4 (One-Shot)](./space-shooter-results/space-shooter-gemma4-one-shot/)**
- **[Gemma 4 8-Bit](./space-shooter-results/space-shooter-gemma4-8bit/)**
- **[Gemma 4 (Standard)](./space-shooter-results/space-shooter-gemma4/)**
- **[Gemma 4 Run 2 MLX](./space-shooter-results/space-shooter-gemma4-run2-mlx/)**

### Local Benchmark Output Directories (Gitignored)

When running the benchmarks locally, model-generated game projects may be outputted to the following directories. These are gitignored to avoid repository bloat:
- `octopus-game-gemm4-31b-2ndpass/` — Output folder for Gemma 4 31B 2nd-pass game generation.
- `octopus-game-qwen36-27b-aeon/` — Output folder for Qwen 3.6 27B (AEON) game generation.

## Tooling

- **[`benchmark_v2.py`](./throughput/benchmark_v2.py)**
  Reproducible vLLM context, quality, tool-call, and streaming throughput
  harness with exact render-token sizing, repeated samples, atomic JSON
  checkpoints, concurrency interpretation, and server/GPU/Git provenance.
  See the **[benchmark v2 guide](./throughput/benchmark-v2.md)**.
- **[`bench_vllm.py`](./throughput/bench_vllm.py)**
  Streaming throughput probe script to measure TTFT, prefill token rate, and decode token rate against OpenAI-compatible APIs.
