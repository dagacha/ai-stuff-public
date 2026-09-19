# Benchmark Report: DeepSeek-V4-Flash-0731 (GA) on 2x DGX Spark — VulcanBench (v1 + carbyne + v3)

**Model:** `deepseek-ai/DeepSeek-V4-Flash-0731` @ `9e165c30` (GA, served as `deepseek-v4-flash-dspark`)
**Server:** vLLM 0.25.2.dev0 (Anemll image), TP=2 across 2 nodes, NVFP4, MTP n=5, port 8888
**Hardware:** 2x DGX Spark (GB10, ~120 GB unified each)
**Benchmark:** [VulcanBench](https://github.com/morganlinton/VulcanBench) `v0.6.0-16-gbc85af6`, suites v1 / v1-carbyne / v3, `--no-judges`
**Sampling:** client-side temp 0.6 / top_p 0.95 not applicable — the VulcanBench
OpenAI provider pins `temperature=0` for tool-loop determinism, same as all
previous fleet runs (sampling identical to baselines by construction)
**Date:** 2026-08-02
**Baseline:** [preview checkpoint report (2026-07-20/21)](./report-2x-dgx-spark-deepseek-v4-flash-dspark-vulcanbench.md)

---

## TL;DR

| Suite | Tasks | 0731 GA pass@1 | Preview pass@1 | Δ |
|---|---|---|---|---|
| v1 (full: Python/Go/TS/Rust) | 52 | **0.94 ± 0.03** (49/52) | 0.94 ± 0.03 (49/52) | = |
| v1-carbyne (adversarial) | 22 | **0.77 ± 0.09** (17/22) | 0.77 ± 0.09 (17/22) | = |
| **v3 (frontier-hard)** | 23 | **0.57 ± 0.11 (13/23)** | 0.78 ± 0.09 (18/23) | **−5 tasks** |

The easy and adversarial tiers are **exactly flat** — same counts, and on
carbyne the same 5 tasks minus/plus one swap. The frontier-hard tier lost
**5 tasks**: every one of the preview's 5 failures still fails, and 5 tasks
the preview solved now also fail. Combined with tool-eval Hard Mode dropping
83→70 [the same day](../tool-eval/report-2x-dgx-spark-deepseek-v4-flash-0731-tool-eval.md)
(PR [#77](https://github.com/dagacha/ai-stuff/pull/77)),
the pattern is consistent: **0731 trades top-end depth for everyday
polish** on this serving stack.

## v3 frontier-hard — 13/23 (56.5%)

Where this lands on the published leaderboard (frontier rows are upstream's
published results, not reproduced here):

| Model [effort] | Score | pass@1 | Cost | Tokens/task | Time/task |
|---|---|---|---|---|---|
| Grok 4.5 (medium/high) | 21/23 | 91.3% | $6.67–8.76 | 106–141K | 3.9–4.9 min |
| Claude Fable 5 (low/high)† | 20/23 | 87.0% | $12.18–20.82 | 28–44K | 3.4–4.3 min |
| GPT-5.6 Sol (high) | 20/23 | 87.0% | $15.90 | 85K | 4.2 min |
| *DSv4-Flash preview (this rig, 07-21)* | *18/23* | *78.3%* | *$0* | *1,672K* | *13.0 min* |
| GPT-5.6 Sol (low) | 18/23 | 78.3% | $3.85 | 23K | 1.5 min |
| Kimi K3 (max, 30-min) | 17/23 | 73.9% | $16.84 | 134K | 18.1 min |
| **DSv4-Flash-0731 (this rig)** | **13/23** | **56.5%** | **$0** | **82K** | **14.7 min** |

† Fable published runs used an Opus 4.8 refusal fallback for 6/69 runs.

Note the token column: the preview burned **1.67M tokens/task** (ruminating
to the 30-min cap on its failures); 0731 used **82K/task — a 20× drop** and
now in the same band as the frontier models. The GA checkpoint converges or
concedes quickly instead of grinding. That efficiency is real — but it
converts fewer of the hard tasks.

### Failure breakdown (10 of 23)

**Same 5 as the preview** (the tasks upstream's charter flags as hardest —
volatile anchors, discriminators, convention-dense outputs):

- `oss-aiohttp-upgrade-deferred`, `oss-sqlglot-qualify-lateral-star`,
  `oss-sqlglot-canonicalize-internal-names`,
  `oss-networkx-leiden-communities`, `oss-pennylane-trotter-fragmented`

**5 newly failing** (preview solved these):

| Task | Steps | Note |
|---|---|---|
| `oss-itertools-strip-prefix` | 226 | Ran long, never converged |
| `oss-zod-invert-codec` | 198 | Ran long, never converged |
| `oss-semver-xrange-order` | 114 | Wrong ordering semantics |
| `oss-flask-teardown-robust` | 54 | Conceded early (total 0.09) |
| `oss-hono-client-header-merge` | 48 | Conceded early (total 0.08) |

Two textures: half the new failures still grind to high step counts, the
other half **give up early** with near-zero partial credit — the preview's
signature failure mode (4.7M-token rumination) is gone, replaced partly by
under-persistence.

## v1 — 49/52 (0.94), flat

Failures: `oss-click-choice-brackets` (flaky on the preview too, documented
as within-noise), `oss-py-ledger-rounding`, `rs-borrow-split`. Notably
`py-bytecode-vm` — the preview's hardest v1 miss — **now passes**. Net count
identical; individual flips are within single-repeat noise. 602K total
tokens, 128 min wall (concurrency 4).

## v1-carbyne — 17/22 (0.77), flat

Same 4 core failures as the preview (`idempotent-charge`, `lru-touch`,
`publish-lock`, `atomic-transfer` partial at 0.6); `total-order-sort` now
passes, `batch-fetch` now fails — a one-for-one swap, within noise. The
adversarial "naive solution is subtly wrong" trap resistance is unchanged.
105K tokens, 18 min (concurrency 4).

## Addendum (2026-08-03): thinking-mode sweep on v3

0731 has a thinking mode + reasoning-effort system the preview lacked (see
the [tool-eval addendum](../tool-eval/report-2x-dgx-spark-deepseek-v4-flash-0731-tool-eval.md)
(PR [#77](https://github.com/dagacha/ai-stuff/pull/77))
for details). Reran v3 with thinking enabled via a small local harness mod
(`VULCANBENCH_OPENAI_EXTRA_PAYLOAD` env var → merged into the chat-completions
payload, carrying `chat_template_kwargs`):

| Config | pass@1 | Tokens/task | Time/task |
|---|---|---|---|
| Preview (non-thinking era) | **18/23 (78.3%)** | 1,672K | 13.0 min |
| 0731 thinking @ low | 14/23 (60.9%) | 97K | — |
| 0731 non-thinking (headline above) | 13/23 (56.5%) | 82K | 14.7 min |
| 0731 thinking @ high | 11/23 (47.8%) | 204K | 16.9 min |

- **Thinking @ low is 0731's best v3 config** (+1 task over non-thinking;
  recovered `zod-invert-codec` and `sqlglot-qualify-lateral-star`, lost two
  others) — but it does **not** close the gap to the preview.
- **Effort high is the worst configuration measured** — monotonic harm
  (low 14 > none 13 > high 11) at 2.5× the token cost. Tasks solved at low
  (`sqlglot-qualify-lateral-star` @ 495K tokens, `packaging-range-prerelease-policy`)
  fail at high; `itertools-strip-prefix` ground to 1.19M tokens without
  converging. The "exhaustive, relentless" effort prompt induces
  hypothesis-churning that displaces convergence.
- **Conclusion sharpened:** the preview's v3 edge was its willingness to
  grind (17× thinking-low's token budget for +4 tasks). No 0731 mode
  reproduces that behavior; the depth gap belongs to the checkpoint, and
  the same-direction tool-eval Hard Mode regression is (unlike this one)
  fully explained by non-thinking mode.

Single repeat per config, as elsewhere. Runs dated 2026-08-03 in
`runs/*/summary.json`.

## Caveats

- **Single repeat** — error bars are cross-task. The v1/carbyne flats and
  1-task swaps are noise-level; the v3 −5 with zero recovered tasks, agreeing
  in direction with tool-eval Hard Mode −13, is beyond what single-repeat
  noise typically produces, but a repeat run would firm this up.
- **Checkpoint vs. config confounded:** MTP 3→5 and GPU util 0.85→0.80
  changed with the 0731 lane (required by the checkpoint). At temperature 0,
  spec decode should be output-invariant in theory; vLLM batching
  nondeterminism means it isn't guaranteed.
- Frontier comparison caveats carry over from the preview report: published
  rows not reproduced here, possible task-revision skew, $0 is marginal cost
  ignoring hardware/power, v3 decontamination vs. DeepSeek's training data
  unverified.
- 8 TS tasks remain unscoreable for quality/security by design (`npm audit`
  offline); functional scoring unaffected.

## Reproduction

```bash
cd ~/VulcanBench && source .venv/bin/activate
export OPENAI_BASE_URL=http://172.31.100.1:8888/v1 OPENAI_API_KEY=local-dummy
vulcanbench run --suite v1        --model openai:deepseek-v4-flash-dspark --no-judges --max-concurrency 4
vulcanbench run --suite v1-carbyne --model openai:deepseek-v4-flash-dspark --no-judges --max-concurrency 4
vulcanbench run --suite v3        --model openai:deepseek-v4-flash-dspark --no-judges --max-concurrency 3
```

Harness commit `bc85af6`; task hashes per run in `runs/*/summary.json` on the
DGX (runs dated 2026-08-02).
