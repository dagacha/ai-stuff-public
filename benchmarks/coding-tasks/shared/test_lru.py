"""
Test suite for the model-generated LRU cache.
Writes model code to lru_generated.py then imports and runs tests.
"""
import sys, importlib, threading, time, traceback

PASS = []
FAIL = []

def check(name, condition, detail=""):
    if condition:
        PASS.append(name)
        print(f"  PASS  {name}")
    else:
        FAIL.append(name)
        print(f"  FAIL  {name}" + (f" — {detail}" if detail else ""))

def run(module):
    LRU = getattr(module, "LRUCache", None)
    if LRU is None:
        print("ERROR: no LRUCache class found in generated code")
        sys.exit(1)

    # --- basic get/put ---
    c = LRU(2)
    c.put(1, 10); c.put(2, 20)
    check("get existing key",     c.get(1) == 10)
    check("get missing key",      c.get(9) == -1)

    # --- eviction ---
    c.put(3, 30)   # evicts key 2 (LRU)
    check("evict LRU on overflow", c.get(2) == -1)
    check("non-evicted key still present", c.get(1) == 10)
    check("newly inserted key present",    c.get(3) == 30)

    # --- update recency on get ---
    c2 = LRU(2)
    c2.put(1, 1); c2.put(2, 2)
    c2.get(1)       # 1 is now most recently used
    c2.put(3, 3)    # evicts 2, not 1
    check("get updates recency", c2.get(2) == -1)
    check("accessed key survives eviction", c2.get(1) == 1)

    # --- update value ---
    c3 = LRU(2)
    c3.put(1, 1); c3.put(1, 99)
    check("update existing key value", c3.get(1) == 99)

    # --- capacity 1 ---
    c4 = LRU(1)
    c4.put(1, 1); c4.put(2, 2)
    check("capacity-1 eviction", c4.get(1) == -1)
    check("capacity-1 new key",  c4.get(2) == 2)

    # --- stats ---
    c5 = LRU(3)
    c5.put(1, 1); c5.put(2, 2)
    c5.get(1); c5.get(1); c5.get(9)   # 2 hits, 1 miss
    stats = c5.get_stats()
    check("stats has 'hits'",     "hits" in stats)
    check("stats has 'misses'",   "misses" in stats)
    check("stats has 'hit_rate'", "hit_rate" in stats)
    check("stats hit count",  stats.get("hits")   == 2, f"got {stats.get('hits')}")
    check("stats miss count", stats.get("misses") == 1, f"got {stats.get('misses')}")
    check("stats hit_rate",   abs(stats.get("hit_rate", 0) - 2/3) < 0.001,
          f"got {stats.get('hit_rate')}")

    # --- thread safety ---
    c6 = LRU(100)
    errors = []
    def writer():
        for i in range(500):
            try: c6.put(i % 50, i)
            except Exception as e: errors.append(e)
    def reader():
        for i in range(500):
            try: c6.get(i % 50)
            except Exception as e: errors.append(e)
    threads = [threading.Thread(target=writer) for _ in range(4)] + \
              [threading.Thread(target=reader) for _ in range(4)]
    for t in threads: t.start()
    for t in threads: t.join()
    check("thread safety — no exceptions", len(errors) == 0,
          f"{len(errors)} errors: {errors[:2]}")

    # --- O(1) performance sanity ---
    c7 = LRU(10_000)
    for i in range(10_000): c7.put(i, i)
    t0 = time.perf_counter()
    for i in range(10_000): c7.get(i % 10_000)
    elapsed = time.perf_counter() - t0
    check("10k gets under 50ms", elapsed < 0.05, f"{elapsed*1000:.1f}ms")

    print(f"\n{'='*40}")
    print(f"  {len(PASS)} passed / {len(FAIL)} failed")
    print(f"{'='*40}")
    return len(FAIL) == 0

if __name__ == "__main__":
    try:
        mod = importlib.import_module("lru_generated")
    except ModuleNotFoundError:
        print("ERROR: lru_generated.py not found — place model output there first")
        sys.exit(1)
    except SyntaxError as e:
        print(f"SYNTAX ERROR in generated code: {e}")
        sys.exit(1)
    ok = run(mod)
    sys.exit(0 if ok else 1)
