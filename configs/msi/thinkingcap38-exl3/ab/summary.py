#!/usr/bin/env python3
import json
rows = []
for l in ["base", "tc"]:
    try:
        rows += json.load(open(f"/home/<user>/runs/tc38-ab-{l}.json"))
    except Exception as e:
        print(l, "missing", e)
ok = [r for r in rows if "error" not in r]
print(f"{'label':5s} {'prompt':22s} {'seed':>4s} {'ctok':>6s} {'rchars':>7s} {'achars':>6s} {'wall':>6s} {'tok/s':>6s} {'acc':>5s} {'fin':>6s}")
for r in ok:
    print(f"{r['label']:5s} {r['prompt']:22s} {r['seed']:>4} {r['completion_tokens']:>6} {r['reasoning_chars']:>7} {r['answer_chars']:>6} {r['wall_s']:>6} {r['tok_s']:>6} {str(r['mtp_accept_len']):>5} {r['finish']:>6s}")
tot = {}
for l in ["base", "tc"]:
    s = [r for r in ok if r["label"] == l]
    if s:
        tot[l] = (sum(r['completion_tokens'] for r in s), sum(r['reasoning_chars'] for r in s), sum(r['wall_s'] for r in s))
        print(f"TOTAL {l}: ctok={tot[l][0]} rchars={tot[l][1]} wall={tot[l][2]:.0f}s mean_tok/s={sum(r['tok_s'] for r in s)/len(s):.1f} n={len(s)}")
if "base" in tot and "tc" in tot:
    b, t = tot["base"], tot["tc"]
    print(f"DELTA tc vs base: completion tokens {100*(t[0]-b[0])/b[0]:+.0f}%  reasoning chars {100*(t[1]-b[1])/b[1]:+.0f}%  wall {100*(t[2]-b[2])/b[2]:+.0f}%")
