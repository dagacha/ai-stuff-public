# Nemotron-3-Nano-30B-A3B — Task A: LRU Cache Generation

## Prompt
Same as Gemma/Qwen benchmarks: thread-safe LRU cache, doubly-linked list + hash map, O(1), `get_stats()`, `threading.Lock`.

## Model Output Highlights
- Used `__slots__` on the `_Node` class — memory-efficient touch
- Underscore-prefixed private attributes (`_capacity`, `_cache`, etc.) — more idiomatic "private" style
- Well-named helpers: `_add_node`, `_remove_node`, `_move_to_head`, `_pop_tail`
- Compact (670 completion tokens)

## Test Results (16/18 passed — **2 FAILURES**)

| Test | Result |
|---|---|
| get existing key | ✅ |
| get missing key (returns -1) | ✅ |
| evict LRU on overflow | ✅ |
| non-evicted key still present | ✅ |
| newly inserted key present | ✅ |
| get updates recency | ✅ |
| accessed key survives eviction | ✅ |
| update existing key value | ✅ |
| capacity-1 eviction | ✅ |
| capacity-1 new key | ✅ |
| stats has 'hits' / 'misses' / 'hit_rate' | ✅ (×3) |
| **stats hit count correct** | ❌ got 4, expected 2 |
| stats miss count correct | ✅ |
| **stats hit_rate correct** | ❌ got 0.8, expected 0.667 |
| thread safety — no exceptions | ✅ |
| 10k gets under 50ms | ✅ |

**Score: 16 / 18**

### Bug Diagnosis
In `put()`, the model added this line on successful insertion:
```python
self._hits += 1  # treat successful insertion as a hit for stats
```
**This is incorrect.** `put()` is not a cache lookup, so it has no notion of "hit" or "miss" — it stores data. Only `get()` should contribute to hit/miss counters. The commented rationale suggests the model knew it was making a judgment call, but the judgment was wrong: cache-hit ratios are a metric for *read* operations, not writes.

This inflated the hit count (2 real gets + 2 puts = 4) and hit rate (0.8 instead of 0.667).

## Timing
| Metric | Value |
|---|---|
| Prompt tokens | 191 |
| Completion tokens | 670 |
| Prefill speed | **583 tok/s** |
| Decode speed | **65.1 tok/s** |
