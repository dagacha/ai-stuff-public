# Qwen3.6-35B-A3B — Task B: Debug Async Job Queue

## Planted Bugs
| # | Bug |
|---|---|
| 1 | Mutable default argument `args: list = []` |
| 2 | `asyncio.gather(*worker_tasks)` not awaited |
| 3 | Backoff `wait = 2 ** attempt` starts at 1s instead of 2s |
| 4 | `self._results` never cleared between `run()` calls |

## Model Findings

| Bug | Found? | Notes |
|---|---|---|
| 1 — Mutable default arg | ✅ | Correct, confident, fixed with None guard |
| 2 — Unawaited gather | ✅ | Correct, confident |
| 3 — Backoff off-by-one | ❌ | **Missed** — deliberated at length but concluded it was correct |
| 4 — Results accumulation | ✅ | Correct, confident |

**Score: 3 / 4 planted bugs found**

### Reasoning Behaviour
The model externalised its reasoning inline (with `enable_thinking=false`). It re-examined Bug 3 (`wait = 2 ** attempt`) multiple times across both attempts but concluded it was standard exponential backoff. It also noticed `task_done()` inside the `finally` block but dismissed it as correct — unlike Qwen3.5 which flagged it as a real bonus bug.

The response hit the token limit (3000 tokens) on the first attempt before completing the full analysis, requiring a second shorter run with a more concise prompt format. This suggests Qwen3.6 is notably more verbose in its reasoning output than Qwen3.5.

## Timing
| Metric | Value |
|---|---|
| Prompt tokens | ~715 |
| Completion tokens | 1500 (capped) |
| Decode speed | **~57 tok/s** |
| Prefill speed | **~929 tok/s** |
