# Nemotron-3-Nano-30B-A3B — Coding Benchmark Report
**Date:** 2026-04-15
**Model:** `Nemotron-3-Nano-30B-A3B-Q4_K_M.gguf`
**Hardware:** Bosgame M5 — Ryzen AI Max+ 395, Radeon 8060S (RDNA 3.5), 128 GB unified RAM
**Backend:** llama.cpp b8672, Vulkan — port 8081, ctx 16384, 4 parallel slots, flash-attn on

---

## Results Summary

| Task | Score | Notes |
|---|---|---|
| **A — LRU Cache generation** | **16 / 18** ⚠️ | Incorrectly treats `put()` insertions as hits, inflating stats |
| **B — Debug async job queue** | **2.5 / 4** ⚠️ | 2 clean hits, 1 accidental fix with wrong diagnosis, 1 missed |

---

## Task A — LRU Cache (Code Generation)

**Verdict:** Almost there. The implementation is structurally correct — all list manipulation, thread safety, O(1) properties, and eviction logic pass. The single mistake is a conceptual slip in `get_stats()`:

```python
def put(...):
    ...
    self._hits += 1  # treat successful insertion as a hit for stats
```

`put()` is a write operation; hit/miss metrics measure *read* behaviour. The commented rationale suggests the model knew this was non-obvious, but the decision was wrong and causes hit rates to exceed reality.

Code was otherwise well-crafted: `__slots__` on nodes, underscore-prefixed privates, compact helpers.

---

## Task B — Async Job Queue (Debugging)

**Planted bugs found: 2 / 4 confidently; 1 fixed for wrong reason; 1 missed**

| # | Bug | Result |
|---|---|---|
| 1 | Mutable default `args: list = []` | ⚠️ Fixed but misdiagnosed as "type signature mismatch" |
| 2 | `asyncio.gather` not awaited | ✅ Correct |
| 3 | Backoff `2 ** attempt` (starts 1s not 2s) | ❌ Not fixed — wrapped in `base_delay *` but defaults produce identical sequence |
| 4 | `self._results` not cleared | ✅ Correct |

The bug 3 miss is instructive: the model added a `base_delay` parameter to make backoff configurable (a reasonable refactor), but defaulted it to 1.0, which reproduces the bug exactly. This suggests pattern-matching on "exponential backoff" without actually tracing the numeric sequence.

---

## Speed

| Measurement | Prefill | Decode |
|---|---|---|
| Standalone benchmark (288-token prompt, 300 gen) | **712 tok/s** | **65.5 tok/s** |
| Task A (191-token prompt, 670 gen) | **583 tok/s** | **65.1 tok/s** |
| Task B (682-token prompt, 1028 gen) | **873 tok/s** | **64.9 tok/s** |

**Typical operating range: ~65 tok/s decode, ~600–870 tok/s prefill**

Decode is remarkably consistent at ~65 tok/s — the fastest of the three models tested.

---

## Three-Way Comparison

| | Nemotron-3-Nano-30B-A3B | Qwen3.5-35B-A3B | Gemma 4 26B-A4B |
|---|---|---|---|
| **Task A score** | 16 / 18 ⚠️ | 18 / 18 ✅ | 18 / 18 ✅ |
| **Task A tokens used** | 670 | 630 | 1,552 |
| **Task B planted bugs** | 2.5 / 4 ⚠️ | 3 / 4 + bonus 🎁 | 4 / 4 ✅ |
| **Decode speed** | **~65 tok/s** 🥇 | ~55 tok/s | ~43 tok/s |
| **Prefill speed** | ~712 tok/s | ~720 tok/s | **~930 tok/s** 🥇 |
| **Token efficiency** | High | Highest | Lowest |
| **Reasoning style** | Hidden (like Gemma) | Inline deliberation | Hidden in `reasoning_content` |

### Ranking by Task
- **Code generation correctness:** Gemma 4 = Qwen3.5 > Nemotron
- **Debugging accuracy:** Gemma 4 > Qwen3.5 > Nemotron
- **Speed (decode):** Nemotron > Qwen3.5 > Gemma 4
- **Speed (prefill):** Gemma 4 > Qwen3.5 ≈ Nemotron
- **Token efficiency:** Qwen3.5 > Nemotron > Gemma 4

### Key Takeaways
- **Nemotron is the fastest at decode** but made the most correctness mistakes. Good for throughput-bound tasks where some retries are acceptable.
- **Qwen3.5 is the most balanced** — fast, concise, and capable of discovering genuine unlisted bugs through visible reasoning.
- **Gemma 4 is the most thorough debugger** and has the fastest prefill, but is more verbose and slower at decode.
- None of the three fixed Bug 3 (backoff off-by-one) cleanly without being prompted — this is a genuinely subtle bug that's hard to spot without running the numbers. Gemma hedged, Qwen rejected it for a different real bug, Nemotron accidentally preserved it.
