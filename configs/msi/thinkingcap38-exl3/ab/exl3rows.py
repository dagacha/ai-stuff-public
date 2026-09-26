#!/usr/bin/env python3
import json
rows = []
for l in ["tc", "exl3"]:
    rows += json.load(open(f"/home/<user>/runs/tc38-ab-{l}.json"))
print(f"{'label':5s} {'prompt':22s} {'ctok':>6s} {'rchars':>7s} {'achars':>6s} {'wall':>6s} {'tok/s':>6s} {'fin':>7s}")
for r in rows:
    if "error" in r: print(r["label"], r["prompt"], "ERROR", r["error"][:80]); continue
    print(f"{r['label']:5s} {r['prompt']:22s} {r['completion_tokens']:>6} {r['reasoning_chars']:>7} {r['answer_chars']:>6} {r['wall_s']:>6} {r['tok_s']:>6} {r['finish']:>7s}")
for l in ["tc", "exl3"]:
    s = [r for r in rows if r["label"] == l and "error" not in r]
    print(f"TOTAL {l}: n={len(s)} ctok={sum(r['completion_tokens'] for r in s)} wall={sum(r['wall_s'] for r in s):.0f}s finished={sum(r['finish']=='stop' for r in s)}")
