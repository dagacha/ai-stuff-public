# Qwen3.6-35B-A3B — Task A: LRU Cache Generation

## Prompt
Same as prior benchmarks: thread-safe LRU cache, O(1) get/put, `get_stats()`, `threading.Lock`.

## Model Output Highlights
- Used `collections.OrderedDict` instead of a manual doubly-linked list — cleaner and idiomatic
- `move_to_end()` for O(1) recency updates, `popitem(last=False)` for O(1) eviction
- Lock wraps all public methods individually (fine-grained)
- Very concise: 292 completion tokens — less than half of Qwen3.5 (630) and ~19% of Gemma 4 (1552)

## Test Results (18/18 passed)

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
| stats has 'hits' | ✅ |
| stats has 'misses' | ✅ |
| stats has 'hit_rate' | ✅ |
| stats hit count correct | ✅ |
| stats miss count correct | ✅ |
| stats hit_rate correct | ✅ |
| thread safety — no exceptions (8 threads, 500 ops each) | ✅ |
| 10k gets under 50ms (O(1) check) | ✅ |

**Score: 18 / 18**

## Timing
| Metric | Value |
|---|---|
| Prompt tokens | 157 |
| Completion tokens | 292 |
| Decode speed | **~57 tok/s** |
| Prefill speed | **~930 tok/s** (large prompts) |

Most token-efficient of all four models tested.
