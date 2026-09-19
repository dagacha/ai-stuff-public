# Qwen3.6-35B-A3B — Coding Benchmark Report
**Date:** 2026-04-17  
**Model:** `Qwen3.6-35B-A3B-UD-Q4_K_XL.gguf` (20.82 GB)  
**Multimodal projector:** `mmproj-F16.gguf` (858 MB) — loaded but not used in these tasks  
**Hardware:** Bosgame M5 — Ryzen AI Max+ 395, Radeon 8060S (RDNA 3.5), 128 GB unified RAM  
**Backend:** llama.cpp b8672, Vulkan — port 8080, ctx 16384, 4 parallel slots, flash-attn on

---

## Results Summary

| Task | Score | Notes |
|---|---|---|
| **A — LRU Cache generation** | **18 / 18** ✅ | Perfect; most token-efficient of all models (292 tokens) |
| **B — Debug async job queue** | **3 / 4** ⚠️ | Missed backoff off-by-one; verbose reasoning hit token limit |

---

## Task A — LRU Cache (Code Generation)

**Verdict:** Perfect score in only 292 completion tokens — the most concise solution across all four benchmarked models. Used `collections.OrderedDict` with `move_to_end()` / `popitem()` rather than a manual doubly-linked list, keeping the code idiomatic and readable. All 18 tests passed on first run.

---

## Task B — Async Job Queue (Debugging)

**Planted bugs found: 3 / 4**

| # | Bug | Found? |
|---|---|---|
| 1 | Mutable default `args: list = []` | ✅ |
| 2 | `asyncio.gather` not awaited | ✅ |
| 3 | Backoff `2 ** attempt` (starts 1s not 2s) | ❌ |
| 4 | `self._results` not cleared between runs | ✅ |

**Bug 3 analysis:** The model deliberated over the backoff formula across both runs and across many paragraphs of inline reasoning. It considered `2 ** (attempt + 1)` but ultimately concluded `2 ** attempt` was correct standard backoff. This mirrors Qwen3.5's failure on the same bug.

**Verbosity note:** Task B required two API calls. The first run (max_tokens=3000) was exhausted by inline reasoning before the analysis was complete. A second, more constrained prompt produced the final answer. Qwen3.6 is measurably more verbose in its self-explanations than Qwen3.5.

---

## Speed

| Measurement | Prefill | Decode |
|---|---|---|
| Short prompt benchmark (~20 tokens, 300 gen) | ~181 tok/s | **56.6 tok/s** |
| Long prompt benchmark (~608 tokens, 30 gen) | **995 tok/s** | ~57.7 tok/s |
| Task-sized prompt (~778 tokens, 200 gen) | **929 tok/s** | **56.4 tok/s** |
| Task A (~157 tokens, 292 gen) | ~930 tok/s (est.) | ~57 tok/s (est.) |
| Task B (~715 tokens, 1500 gen) | ~929 tok/s | ~57 tok/s (est.) |

**Typical operating range: ~56–58 tok/s decode, ~930–995 tok/s prefill (prompts >100 tokens)**

Note: short-prompt prefill (~181 tok/s) reflects per-request overhead. At realistic prompt sizes (100+ tokens) prefill reaches ~930 tok/s.

---

## Qwen3.6 vs Qwen3.5 Head-to-Head

| | Qwen3.6-35B-A3B | Qwen3.5-35B-A3B |
|---|---|---|
| **Task A score** | 18 / 18 ✅ | 18 / 18 ✅ |
| **Task A tokens used** | **292** | 630 |
| **Task B planted bugs** | 3 / 4 ⚠️ | 3 / 4 ⚠️ |
| **Task B bonus finding** | ❌ | ✅ `task_done()` on timeout |
| **Decode speed** | **~57 tok/s** | ~55 tok/s |
| **Prefill speed** | **~930 tok/s** | ~720 tok/s |
| **Reasoning verbosity** | Higher (hit token limits) | Lower (completed cleanly) |
| **Model file size** | 20.82 GB | 22.2 GB |

### Key Takeaways
- Qwen3.6 is **faster in both prefill (~29% faster) and decode (~4% faster)** than Qwen3.5.
- Qwen3.6 is **smaller on disk** (20.82 GB vs 22.2 GB) for similar capability.
- Qwen3.6 is **dramatically more token-efficient** on code generation (292 vs 630 tokens for Task A).
- Qwen3.6 is **more verbose in reasoning** — Task B required two API calls due to token exhaustion.
- Both models missed the same backoff bug (Bug 3) and scored identically on debugging (3/4).
- Qwen3.5 found a real bonus bug that Qwen3.6 dismissed.
