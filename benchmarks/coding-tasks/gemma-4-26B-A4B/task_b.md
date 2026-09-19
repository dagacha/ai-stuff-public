# Task B — Debug Async Job Queue

## Prompt
Find all 4 bugs in a broken `AsyncJobQueue` implementation, explain each, and provide a corrected version.

## Planted Bugs

| # | Location | Bug |
|---|---|---|
| 1 | `_process_job` signature | Mutable default argument `args: list = []` |
| 2 | `run` | `asyncio.gather(*worker_tasks)` not awaited — tasks leak |
| 3 | `_process_job` retry loop | `wait = 2 ** attempt` starts backoff at 1s; should be `2 ** (attempt + 1)` |
| 4 | `run` | `self._results` never cleared — stale results accumulate across calls |

## Model Findings

| Bug | Found? | Quality |
|---|---|---|
| 1 — Mutable default arg | ✅ | Correctly identified and fixed with `None` guard pattern |
| 2 — Unawaited gather | ✅ | Correctly identified: "Task was destroyed but it is pending" warning described |
| 3 — Backoff off-by-one | ✅ ⚠️ | Found but with hedging ("not strictly a syntax error"); fixed correctly as `2 ** (attempt + 1)` |
| 4 — Results accumulation | ✅ | Correctly identified: "results from previous batches will persist" |

**Score: 4 / 4 bugs found, all fixed correctly**

### Notes
- Bug 3 was identified with less confidence than the others — the model correctly fixed it in code but was uncertain in the prose explanation, suggesting it found it through reasoning rather than immediate pattern recognition.
- The corrected code compiles and runs cleanly.
- No extra bugs introduced in the fix (the additional `except Exception` in `_worker` is benign on Python 3.8+ where `CancelledError` is a `BaseException`).

## Timing
| Metric | Value |
|---|---|
| Prompt tokens | 778 |
| Completion tokens | 1,248 |
| Prefill speed | **1,007 tok/s** |
| Decode speed | **43.6 tok/s** |

## Note on Thinking Mode
The model defaults to internal reasoning (`reasoning_content`) which consumed the entire token budget before producing any visible output. Disabled via `chat_template_kwargs: {enable_thinking: false}` — response was then immediate and clean.
