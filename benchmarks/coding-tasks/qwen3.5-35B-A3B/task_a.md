# Qwen3.5-35B-A3B — Task A: LRU Cache Generation

## Prompt
Same as Gemma benchmark: thread-safe LRU cache, doubly-linked list + hash map, O(1), `get_stats()`, `threading.Lock`.

## Model Output Highlights
- Added input validation: `if capacity <= 0: raise ValueError(...)` — extra robustness not asked for
- Named helpers `_remove_node`, `_add_to_head`, `_evict_lru` (more descriptive than Gemma's `_remove`/`_add`)
- `_evict_lru` includes a safety guard `if lru_node == self.head: return` to handle empty cache
- Clean, idiomatic Python; shorter overall (630 tokens vs Gemma's 1552)

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
| Prompt tokens | 182 |
| Completion tokens | 630 |
| Prefill speed | **591 tok/s** |
| Decode speed | **56.0 tok/s** |

Note: used less than half the tokens Gemma used for the same task.
