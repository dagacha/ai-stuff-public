# Task A — LRU Cache Generation

## Prompt
Implement a thread-safe LRU cache in Python from scratch, using a doubly-linked list + hash map.
- No `functools.lru_cache`, `OrderedDict`, or cache library
- O(1) `get` and `put`
- `get_stats()` returning `hits`, `misses`, `hit_rate`
- Thread-safe via `threading.Lock`

## Model Output
The model generated a clean implementation on the first attempt (finish_reason: `stop`):
- `Node` class for doubly-linked list nodes
- Sentinel `head`/`tail` nodes to simplify edge cases
- `_remove`, `_add`, `_move_to_front` private helpers
- `get`, `put`, `get_stats` all wrapped in `with self.lock:`

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
| Prompt tokens | 194 |
| Completion tokens | 1,552 |
| Wall clock | 36.9 s |
| Decode speed | **42.0 tok/s** |
