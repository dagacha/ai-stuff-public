# Benchmark Report: Qwen3.8-Flash-Next on VulcanBench v3 (frontier-hard tier)

**Model:** `Mia-AiLab/Qwen3.8-Flash-Next-NVFP4` (served as `qwen3.8-flash-next`)
**Server:** vLLM (`vllm/vllm-openai:qwen38-flash-next`) on a single DGX Spark (GB10), 262K context, FP8 KV, `KV_TARGET_GIB=22` (gpu-memory-utilization 0.720), `MAX_NUM_SEQS=4`, `MAX_NUM_BATCHED_TOKENS=2048`, MTP n=3, float32 GDN recurrent state, no V2 model runner. Server launched 2026-09-05 17:36 and unchanged for the whole run.
**Config note:** this is *not* the recipe's shipped profile. The host `.env` predates the 2026-09-06 recipe update ([Qwen3.8-Flash-Next-Single-DGX-Spark](https://github.com/MiaAI-Lab/Qwen3.8-Flash-Next-Single-DGX-Spark) `ef1af5f`), which ships `KV_TARGET_GIB=20`, `MAMBA_SSM_CACHE_DTYPE=bfloat16` (+8.5% decode at 8 streams, +6.8% at 1) and `VLLM_USE_V2_MODEL_RUNNER=1`. Decode here was therefore several percent slower than the current recipe delivers — which matters, because every truncated task in this run was wall-clock bound.
**Endpoint:** `http://localhost:8888/v1`
**Benchmark:** [VulcanBench](https://github.com/morganlinton/VulcanBench) commit `bc85af61` (`v0.6.0-16-gbc85af6`), v3 suite (23 frontier-hard tasks), Docker sandbox, judges on
**Suite ID:** `suite-c20278b5` · **Date:** 2026-09-05/06 (11h57m wall)
**Status:** active — verified 2026-09-06

---

## TL;DR

**15/23 (65.2% pass@1 ±10.2%), avg_total 0.5476, 34.6M tokens, 11.95 h of task
time.** This is an **`--override-budgets` ablation run** (60-minute wall budget
per task, `--max-steps 400`) plus a client-side sampling guard. It is **not
comparable to the capped rows** on the v3 leaderboard.

The headline number is real but the story behind it is not the one we set out
to test. **The budget increase bought at most one solve.** The score is what it
is because eight tasks that had never been run on this stack all passed.

| Group | Tasks | Result |
|---|---|---|
| Never measured before | 8 | **8/8** ✅ |
| Passing under the previous capped run | 5 | **5/5** preserved |
| Retried former budget-timeouts | 10 | **2/10** |

## Why this run exists

An earlier v3 attempt on this stack (2026-09-05, capped budgets) was
interrupted after 15 of 23 tasks. Of those 15, **10 failures were pinned
exactly at the 1205 s / 1805 s wall ceilings** with `budget_exceeded: true` and
zero organic-duration failures — the signature that the harness budget, not the
model, was the binding constraint. That is the same diagnosis
[PR #112](https://github.com/dagacha/ai-stuff/pull/112) reached for
DeepSeek-V4-Flash-Vision-Exp, where `--timeout 3600 --override-budgets` moved
the score **13/23 → 16/23** with zero budget failures. The comparator is that
report's c1+guard arm (13/23), which shares the override arm's concurrency and
sampling; its 12/23 is the earlier c3 run and differs by concurrency too, so
quoting 12 → 16 would credit the override with a gain that is partly the
concurrency fix.

The hypothesis was that the same lever would convert most of the ten. **It did
not.**

## Invocation

```
VULCANBENCH_OPENAI_EXTRA_PAYLOAD='{"max_tokens":12000,"temperature":0.6}' \
vulcanbench run --suite v3 --model openai:qwen3.8-flash-next \
  --timeout 3600 --max-steps 400 --override-budgets --max-concurrency 1
```

**Harness patch required.** This checkout of VulcanBench has no
`VULCANBENCH_OPENAI_EXTRA_PAYLOAD` support — `_chat_completions_complete()`
already accepts an `extra_payload` argument, but the OpenAI provider never
populates it and hardcodes `temperature=0`. A local patch to
`harness/agent/providers.py` reads the env var as JSON, lifts `temperature` out
so it overrides the hardcoded value, and passes the rest through. Uncommitted.

**Reconciled with [#112](https://github.com/dagacha/ai-stuff/pull/112).** That
report's §3 invokes the same env var at the same harness commit (`bc85af6`),
where upstream has no such support — so the question was whether its guard
actually applied. It did. The rig that ran it is the **worker**
(`gn100-worker:~/VulcanBench`, `172.31.100.2`), not this host, and that checkout
carries its own uncommitted `providers.py` patch implementing
`VULCANBENCH_OPENAI_EXTRA_PAYLOAD`, with an mtime of **2026-08-03** — a month
before #112's runs (its `deepseek-v4-flash-dspark` v3 suites are dated
2026-09-05). **#112's guard was live, not inert; its reproduce block is
incomplete without that patch.**

The two rigs patch the same seam slightly differently and converge on the same
behaviour: the worker passes `extra_payload` straight through and lets
`payload.update()` overwrite the hardcoded `temperature=0` (the update runs
after the temperature assignment); this host lifts `temperature` out of the
payload explicitly. Both end up sending `temperature: 0.6`. So the sampling
configuration of the two runs is comparable, and #112's multi-variable caveat
stands as written.

Neither patch is committed on either rig — the same uncommitted change now
exists in two places, which is how this ambiguity arose. Worth upstreaming.

## Per-task results

`#` = **execution order** (by `finished_at`); rows are grouped by language, so
the table order is not the run order — sum by `#` when checking wall-time
claims. `new` = this run · `old` = the interrupted capped run (– = never
reached) · `BE` = `budget_exceeded`

| # | Task | Lang | new | old | Tokens | Time | |
|---|---|---|---|---|---|---|---|
| 6 | oss-more-itertools-interleave-empty | Py | ✅ | ✅ | 45K | 2.4min | |
| 5 | oss-packaging-range-prerelease-policy | Py | ✅ | ❌ | 864K | 18.3min | |
| 3 | oss-sqlglot-qualify-lateral-star | Py | ✅ | ❌ | 3280K | 60.0min | BE |
| 1 | oss-flask-teardown-robust | Py | ❌ | ❌ | 1196K | 52.2min | |
| 2 | oss-aiohttp-upgrade-deferred | Py | ❌ | ❌ | 2036K | 60.1min | BE |
| 4 | oss-sqlglot-iso8601-nanos | Py | ❌ | ❌ | 1982K | 60.1min | BE |
| 8 | oss-sqlglot-canonicalize-internal-names | Py | ❌ | ❌ | 654K | 20.3min | |
| 7 | oss-networkx-leiden-communities | Py | ❌ | ❌ | 1560K | 58.1min | |
| 9 | oss-pennylane-trotter-fragmented | Py | ❌ | ❌ | 396K | 25.2min | |
| 11 | oss-jiff-signdur-panic | Rs | ✅ | ✅ | 551K | 6.6min | |
| 12 | oss-jiff-date-day-lt1 | Rs | ✅ | ✅ | 528K | 6.1min | |
| 13 | oss-jiff-strftime-negpad | Rs | ❌ | ❌ | 5442K | 60.1min | BE |
| 10 | oss-itertools-strip-prefix | Rs | ❌ | ❌ | 3174K | 60.1min | BE |
| 14 | oss-zod-invert-codec | TS | ✅ | ✅ | 7256K | 57.0min | |
| 15 | oss-zod-proto-catchall | TS | ✅ | ✅ | 371K | 6.7min | |
| 16 | oss-hono-request-bytes | TS | ✅ | – | 450K | 27.7min | |
| 17 | oss-hono-client-header-merge | TS | ✅ | – | 1468K | 42.9min | |
| 18 | oss-semver-truncate | JS | ✅ | – | 1060K | 14.6min | |
| 19 | oss-semver-inc-dotted-prerelease | JS | ✅ | – | 503K | 28.5min | |
| 20 | oss-semver-xrange-order | JS | ✅ | – | 1221K | 32.9min | |
| 21 | oss-chi-readfrom-tee-doublecount | Go | ✅ | – | 143K | 7.9min | |
| 22 | oss-cobra-noduplicateargs | Go | ✅ | – | 187K | 4.6min | |
| 23 | oss-pflag-uintslice-hex | Go | ✅ | – | 275K | 4.4min | |

**By language: Go 3/3, JS 3/3, TS 4/4, Rust 2/4, Python 3/9.** Every failure is
Python or Rust; the entire Go/JS/TS half of the suite passed.

## The budget lever did almost nothing

Of the ten tasks that were budget-timeouts under the cap, **two came back
green.** Neither can be attributed to the timeout on this evidence: the arm
changed the budget *and* the sampling (`temperature` 0 → 0.6, plus
`max_tokens: 12000`), so what follows describes the two outcomes without
assigning a cause.

- **`sqlglot-qualify-lateral-star`.** Cut off at 1805 s before; passed here at
  3600 s, still flagged `BE` — it was working when the clock ran out, but the
  patch on disk already satisfied the hidden tests. 3.28M tokens. It used time
  the capped arm did not have, which is *consistent with* a budget effect but
  does not isolate one, since sampling also changed.
- **`packaging-range-prerelease-policy`.** Finished in **1100 s, inside its old
  1205 s ceiling** — the extra budget was demonstrably never used, so the
  timeout cannot be what flipped it. This one is controlled, and it points at
  the sampling change (see the caveat below).

The disciplined reading is that the override is worth **somewhere between 0 and
1** of these two, and the temperature-0 arm is what would settle it.

The other eight did not convert, and they split into two distinct failure
modes that the budget cannot address:

**Ran the clock out unchanged (4):** `aiohttp-upgrade-deferred`,
`sqlglot-iso8601-nanos`, `itertools-strip-prefix`, `jiff-strftime-negpad`. All
hit 3600 s with `functional 0.0` and no partial credit. `jiff-strftime-negpad`
burned **5.44M tokens** — the most of any task in the run — for nothing.

**Stopped early of their own accord (4):** `flask-teardown-robust` (3133 s),
`networkx-leiden-communities` (3485 s), `pennylane-trotter-fragmented`
(1512 s), `sqlglot-canonicalize-internal-names` (1219 s). These ended with
budget to spare and produced confidently wrong patches. The verifier detail is
instructive:

- `flask-teardown-robust`: `fail_to_pass 0/3`, 124-line patch. The model's own
  judge personas diagnosed it correctly — *"only addresses request teardown,
  leaves app-context teardown unchanged, and still uses blinker.Signal.send so
  a raising receiver can skip later receivers."*
- `networkx-leiden-communities`: `fail_to_pass 3/6` **but broke a pass-to-pass
  test** (`modularity_unaffected`) — a regression, not just an incomplete fix.
- `pennylane-trotter-fragmented`: `fail_to_pass 0/5`, also regressed
  `core_unaffected`.
- `sqlglot-canonicalize-internal-names`: `fail_to_pass 0/6`, and it **quit at
  1219 s of its 3600 s** where the *shorter* capped run had ground on to the
  wall. More budget produced less work.

**Wall clock, never steps, was the binding limit.** All five `BE` tasks hit the
3600 s ceiling; none came near exhausting `--max-steps 400`. A larger
`--timeout` would buy more of the same: step rate decays through a run
(observed 6 → 2.7 → 1.6 trace-entries/min on `aiohttp`) as the growing
transcript is re-sent each turn. On this stack the practical constraint on
long agentic tasks is **decode throughput against a growing context**, not the
number of turns allowed.

## Caveat: this is not a clean single-variable ablation

Two things changed at once relative to the capped run — the budgets **and** the
sampling guard (`temperature: 0.6`, `max_tokens: 12000`, versus the harness
default `temperature=0`). Two tasks show guard-shaped behavior rather than
budget-shaped:

- `packaging-range-prerelease-policy` flipped to a pass **inside** the old
  ceiling.
- `sqlglot-canonicalize-internal-names` gave up at a third of its budget where
  the deterministic run had persisted to the wall.

Both are consistent with higher-temperature sampling changing when the agent
decides it is finished. **To isolate the timeout you need a third arm:
`--override-budgets` at `temperature: 0` with no `max_tokens` guard.** Until
that runs, "the override budgets are worth +N tasks" is not a supportable
claim from this data.

No regressions, at least: all five tasks that passed under the cap passed
again, including `zod-invert-codec`, which took 3419 s here against 1656 s
before and still converged.

## Harness environment gap

`ruff` and `bandit` are not on PATH inside the sandbox image, so **`quality`
and `security` score `null` for every Python task** (the run logs
`WARNING: quality score is None ...` per task). This does not affect
`functional` or pass@1 — the leaderboard metric — but it depresses the
composite `avg_total` (0.5476), which is therefore **not comparable** to
reports where those scanners ran. Worth fixing in the sandbox image before the
next run.

A second axis breaks `avg_total` comparability the same way: **this run had the
judge ensemble on** (harness default), while the Qwen3.6-27B and 0731 v3 reports
ran `--no-judges`. `human_like` therefore contributes here and is absent there.
pass@1 is unaffected on both counts.

## Provenance

Both runs are on this host, VulcanBench `bc85af61`, tasks root `tasks/v3`,
`--max-concurrency 1`, Docker sandbox.

| | capped attempt | this run |
|---|---|---|
| Suite ID | `suite-4a1712ab` (**no `suite.json`** — interrupted at task 16 of 23) | `suite-c20278b5` |
| When | 2026-09-05 14:35 → 20:44 | 2026-09-05 23:05 → 2026-09-06 11:02 |
| Budgets | task defaults (1205 s / 1805 s) | `--timeout 3600 --max-steps 400 --override-budgets` |
| Sampling | harness default (`temperature=0`) | `max_tokens: 12000`, `temperature: 0.6` |
| Coverage | 15/23 scored, 8 never reached | 23/23 |

The capped attempt has **no suite aggregate** — the driving session was killed
mid-task, leaving `oss-hono-request-bytes` with a truncated `trace.jsonl`, no
`summary.json`, and an orphaned sandbox container. Its per-task evidence is the
15 surviving `runs/<task>-<id>/summary.json` files (each carrying
`suite_id: suite-4a1712ab`); the group table in this report is derived from
those. Run artifacts — `trace.jsonl`, `final.patch`, `replay.html`,
`summary.json` per task — live in the harness `runs/` directory on this host
and are not committed here.

## Reproduce

```
# needs the providers.py extra-payload patch described above
VULCANBENCH_OPENAI_EXTRA_PAYLOAD='{"max_tokens":12000,"temperature":0.6}' \
OPENAI_BASE_URL=http://localhost:8888/v1 OPENAI_API_KEY=dummy \
vulcanbench run --suite v3 --model openai:qwen3.8-flash-next \
  --timeout 3600 --max-steps 400 --override-budgets --max-concurrency 1
```

## Verdict

**15/23 under override budgets** puts Qwen3.8-Flash-Next comfortably ahead of
Qwen3.6-27B-NVFP4 (6/23 capped) and its 27B sibling Qwen3.8-27B (13/23
capped), on a single DGX Spark rather than a 2-node deployment — a genuinely
strong showing for the lane. But the number carries three asterisks: override
budgets, a confounded sampling change, and eight of the fifteen solves coming
from tasks with no prior baseline.

The actionable findings are not the score:

1. **The budget hypothesis is largely wrong for this stack.** Vision-Exp's
   override arm cleared its budget failures outright; here **at most 1 of the
   10** former timeouts is attributable to it, and possibly none — the two that
   recovered are confounded with the sampling change, and one of them finished
   inside its old ceiling. The remaining failures are capability failures
   (wrong patches, two with pass-to-pass regressions) or non-convergence.
2. **Decode throughput under context growth is the real ceiling** on the hard
   Python/Rust tasks — step rate decays roughly 4× over a long run.
3. **The suite's task ordering is front-loaded with the hardest work.** In
   execution order — column `#` in the per-task table, not the printed row
   order — the first ten tasks (`#1`–`#10`) took **6.95 h of the 11.95 h** and
   the last eight (`#16`–`#23`) took **2.73 h**, leaving 2.27 h for the middle
   five; more directly, the **eight tasks that ran ≥52 min
   account for 7.79 h — 65% of all task time** — and seven of those eight are
   Python or Rust, all clustered in the first fourteen. Any future interrupted
   run will look far worse than the model deserves.
