# Qwen3.5-35B-A3B — Task B: Debug Async Job Queue

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
| 3 — Backoff off-by-one | ❌ | **Missed** — instead found a different real bug (see below) |
| 4 — Results accumulation | ✅ | Correct, confident |

**Score: 3 / 4 planted bugs found**

### The Bonus Bug
The model missed the planted backoff bug but discovered a genuine unlisted bug through careful reasoning:

> **`task_done()` called on `asyncio.TimeoutError`** — In `_worker`, the `self._queue.task_done()` is inside a `finally` block that executes even when `asyncio.wait_for` raises `TimeoutError` (i.e. the queue was empty and no item was dequeued). This is incorrect: `task_done()` must only be called after a successful `get()`. Spurious `task_done()` calls cause the internal counter to go negative, triggering `ValueError: task_done() called too many times`, and `queue.join()` may return prematurely.

This is a real, subtle async bug — and it was not planted. The model found it through visible on-page reasoning, reconsidering its "Bug 3" candidate three times before landing on this conclusion.

### Reasoning Transparency
Unlike Gemma 4 (which hid all reasoning in `reasoning_content`), Qwen with `enable_thinking=false` produced its full deliberation inline. The response visibly works through the bug list, reconsiders candidates, and self-corrects — giving a window into its reasoning process.

## Timing
| Metric | Value |
|---|---|
| Prompt tokens | 703 |
| Completion tokens | 3,393 (hit length limit) |
| Prefill speed | **825 tok/s** |
| Decode speed | **54.6 tok/s** |

Response was truncated before completing the corrected code block (finish_reason: `length`). The bug analysis was complete.
