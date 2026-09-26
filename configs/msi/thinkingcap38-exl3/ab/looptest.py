#!/usr/bin/env python3
"""Loop check: for each sample, n-gram repetition rate in the last 20% of reasoning vs first 20%, plus tails."""
import json, sys, collections
for path in sys.argv[1:]:
    for r in map(json.loads, open(path)):
        t = r.get("reasoning") or ""
        if not t: continue
        w = t.split(); n = len(w)
        def rep(seg):
            g = collections.Counter(tuple(seg[i:i+8]) for i in range(max(0, len(seg)-8)))
            return 1 - len(g) / max(1, sum(g.values()))
        head, tail = w[: n//5], w[-n//5:]
        print(f"{r['label']} {r['prompt']} words={n} rep8_head={rep(head):.2f} rep8_tail={rep(tail):.2f} answer={len(r.get('answer') or '')}")
        print("   TAIL:", " ".join(w[-60:]).replace("\n"," ")[:400])
