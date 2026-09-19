# Gemma 4 26B-A4B — Local Endpoint Test Report

**Date:** 2026-04-19  
**Model:** `unsloth/gemma-4-26b-a4b-it-UD-MLX-4bit` (MLX 4-bit)  
**Endpoint:** http://100.<tailscale-ip-2>:8080/v1  
**Hardware:** Mac (MLX backend)  

---

## Results Summary

| Task | Score | Notes |
|---|---|---|
| **A — LRU Cache generation** | **18 / 18** ✅ | All correctness, eviction, thread-safety, O(1) tests passed |
| **B — Debug async job queue** | **4 / 4** ✅ | All 4 planted bugs found and fixed |

---

## Task A — LRU Cache (Code Generation)

**Prompt:** implement a thread-safe LRU cache (doubly-linked list + hash map, O(1), `get_stats()`, `threading.Lock`)

**Generated code stats:**
- Output tokens: 624
- Generation speed: 48.7 tok/s
- Finish reason: stop

**Test Results:**
```
18 passed / 0 failed
```

All tests passed:
- Basic get/put operations
- LRU eviction on overflow
- Recency update on get
- Value updates
- Capacity-1 edge case
- Stats tracking (hits, misses, hit_rate)
- Thread safety (4 writers + 4 readers, 500 ops each)
- O(1) performance (10k gets under 50ms)

---

## Task B — Async Job Queue (Debugging)

**Prompt:** find 4 planted bugs in async job queue code and provide corrected version

**Analysis stats:**
- Input tokens: 833
- Output tokens: 2,122
- Generation speed: 47.5 tok/s
- Finish reason: stop

**Bugs Found:**

| Bug | Line | Issue | Status |
|-----|------|-------|--------|
| 1 | 16 | Mutable default argument `args: list = []` | ✅ Found |
| 2 | 67 | `asyncio.gather()` not awaited | ✅ Found |
| 3 | 25 | Backoff `2**0=1` (off-by-one, should start at 2s) | ✅ Found |
| 4 | 60 | `_results` never cleared between `run()` calls | ✅ Found |

**Verdict:** All 4 bugs correctly identified with accurate explanations and fixes.

---

## Speed Comparison

| Metric | This Run (MLX) | Reported (Vulkan) |
|---|---|---|
| Decode (tok/s) | ~48 | ~43-47 |
| Prefill (tok/s) | ~370 | ~930 |
| Task A tokens | 624 | 1,552 |

Note: MLX backend shows different performance characteristics vs Vulkan on RDNA 3.5.

---

## Conclusion

**Gemma 4 26B-A4B passes both coding tasks with perfect scores.**

The model demonstrates:
- Correct implementation of thread-safe data structures
- Accurate bug detection in async Python code
- Clean, idiomatic Python output

---

## Files

- `lru_generated.py` — Generated cache implementation (18/18 tests pass)
- `task_b_full_output.md` — Complete bug analysis with corrected code
