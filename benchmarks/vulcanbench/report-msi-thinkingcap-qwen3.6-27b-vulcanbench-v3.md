# Benchmark Report: ThinkingCap-Qwen3.6-27B-NVFP4 on VulcanBench v3

**Model:** `morosystems/ThinkingCap-Qwen3.6-27B-NVFP4` (served as `qwen3.6-27b-nvfp4`)
**Server:** vLLM 0.24.0 in WSL2, RTX 5090 32 GB, MTP n=5, 131K context
**Endpoint:** `http://100.<tailscale-ip-1>:8100/v1` (Tailscale + TCP forwarder)
**Benchmark:** [VulcanBench](https://github.com/morganlinton/VulcanBench) v0.6.0, v3 suite (23 frontier-hard tasks), `--no-judges`, Docker sandbox on the DGX, `--max-concurrency 2`
**Date:** 2026-07-22
**Baseline:** [base Qwen3.6 v3 report (6/23)](./report-msi-qwen3.6-27b-nvfp4-vulcanbench-v3.md) · [DSv4-Flash v3 (18/23)](./report-2x-dgx-spark-deepseek-v4-flash-dspark-vulcanbench.md)

---

## TL;DR

**7/23 (30.4% pass@1), avg_total 0.28** — one task better than base Qwen's
6/23. The thinking tune helps at the margins (leaner solves, two new
TypeScript wins against one Rust regression) but does not move the model's
class: the gap to
DSv4-Flash-DSpark (18/23) remains ~2.5x. Reasoning style is not a
substitute for model scale on frontier-hard coding.

| Model | v3 | pass@1 | tool-eval hard mode |
|---|---|---|---|
| DSv4-Flash-DSpark (2x DGX Spark) | 18/23 | 78.3% | 83/100 |
| **ThinkingCap-Qwen3.6-27B (RTX 5090)** | **7/23** | **30.4%** | **87/100** |
| base Qwen3.6-27B (RTX 5090) | 6/23 | 26.1% | 80/100 |

The inversion is stark: ThinkingCap has the **best** hard-mode
orchestration score in the fleet and one of the **worst** frontier-coding
scores — the cleanest evidence yet that the two benchmarks measure
different capabilities.

## Per-task results

| Task | Result | Steps | Tokens | Time | vs base |
|---|---|---|---|---|---|
| oss-chi-readfrom-tee-doublecount | ✅ | 70 | 108K | 8.4min | = |
| oss-cobra-noduplicateargs | ✅ | 36 | 48K | 3.2min | = (2.9x leaner) |
| oss-pflag-uintslice-hex | ✅ | 62 | 112K | 6.8min | = |
| oss-jiff-signdur-panic | ✅ | 110 | 293K | 13.2min | = |
| oss-more-itertools-interleave-empty | ✅ | 22 | 9K | 1.3min | = (4.7x leaner) |
| oss-hono-client-header-merge | ✅ | 94 | 349K | 29.7min | **new solve** |
| oss-zod-proto-catchall | ✅ | 82 | 183K | 20.1min | **new solve** |
| oss-jiff-date-day-lt1 | ❌ | 100 | 232K | 30.1min | **regression** |
| oss-aiohttp-upgrade-deferred | ❌ | 26 | 27K | 0.9min | fail (fast concede) |
| oss-semver-xrange-order | ❌ | 50 | 107K | 8.1min | fail |
| oss-itertools-strip-prefix | ❌ | 114 | 352K | 18.2min | fail |
| oss-flask-teardown-robust | ❌ | 74 | 153K | 20.1min | fail |
| oss-packaging-range-prerelease-policy | ❌ | 48 | 68K | 20.1min | fail |
| oss-semver-inc-dotted-prerelease | ❌ | 84 | 265K | 20.1min | fail |
| oss-semver-truncate | ❌ | 74 | 171K | 20.1min | fail |
| oss-hono-request-bytes | ❌ | 82 | 281K | 30.1min | fail |
| oss-jiff-strftime-negpad | ❌ | 98 | 408K | 30.1min | fail |
| oss-networkx-leiden-communities | ❌ | 176 | 232K | 30.1min | fail |
| oss-pennylane-trotter-fragmented | ❌ | 86 | 86K | 30.1min | fail |
| oss-sqlglot-canonicalize-internal-names | ❌ | 114 | 464K | 30.1min | fail |
| oss-sqlglot-iso8601-nanos | ❌ | 156 | 578K | 30.1min | fail |
| oss-sqlglot-qualify-lateral-star | ❌ | 66 | 238K | 30.1min | fail |
| oss-zod-invert-codec | ❌ | 126 | 396K | 30.1min | fail |

Avg 225K tokens/task (base: 339K), 20.1 min/task.

## Reading the result

- **Net +1 over base: 2 new solves, 1 regression.** The new solves are both
  TypeScript (`hono-client-header-merge`, `zod-proto-catchall`) — a lane
  where base went 0-for-4. The regression (`jiff-date-day-lt1`) is a Rust
  task base solved in 23 min; ThinkingCap ran out the clock.
- **Solves got much leaner** — cobra in 48K tokens (base: 250K), interleave
  in 9K (base: 42K). When the model can solve a task, thinking reduces
  wasted exploration.
- **Failures unchanged in kind:** all 4 sqlglot, the semver family,
  networkx/pennylane anchors. Of the 16 failures, 9 hit the 30-min hard
  cap, 4 stopped at the ~20-min soft budget, and 3 ended earlier (18.2,
  8.1, 0.9 min). One notable new behavior: `aiohttp-upgrade-deferred` was
  conceded in 0.9 min — the model recognized it couldn't do it, which base
  never did.
- **The scale conclusion stands.** Thinking-style tuning moved 26%→30%;
  the 671B-class MoE sits at 78% on the same suite from the same $0 local
  economics. Orchestration polish (fleet-best 87/100 hard mode) bought
  ~zero frontier-coding depth.

## Operational note

The first attempt at this run **crashed the vLLM server**: at 3-way
concurrency every request returned HTTP 500 (`EngineCore encountered an
issue`) ~90 s into the suite and the WSL2 endpoint went down entirely until
manually restarted. The successful run used `--max-concurrency 2` with no
errors. Suspect the MTP n=5 + NVFP4 path under concurrent agentic load;
worth capturing `journalctl --user -u vllm` if it recurs.

## Caveats

Single repeat; `--no-judges`; 30-min cap (9 hard-cap failures plus 4 at the
~20-min soft budget — a longer budget might convert 1–2 but not the
headline); cutoff relation of v3 tasks to the tune's training data
unverified.

## Reproduction

```bash
cd ~/VulcanBench && source .venv/bin/activate
export OPENAI_BASE_URL=http://100.<tailscale-ip-1>:8100/v1 OPENAI_API_KEY=local-dummy
vulcanbench run --suite v3 --model openai:qwen3.6-27b-nvfp4 --no-judges --max-concurrency 2
```

Raw runs (traces, patches, replay HTML) on the DGX at `~/VulcanBench/runs/`
(suite of 2026-07-22T19:xx).
