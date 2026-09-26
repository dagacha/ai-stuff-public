#!/bin/bash
python3 - "$@" <<'PY'
import json,sys
print(f"{'run':42s} {'final':>5s} {'hm/dep':>6s} {'resp':>4s} {'compl_tok':>9s} {'per_scn':>7s} {'sec':>6s}")
for f in sys.argv[1:]:
    try: d=json.load(open(f"/home/<user>/runs/{f}.json"))
    except Exception: print(f"{f:42s} (missing)"); continue
    rs=d["scores"]["scenario_results"]; ct=sum(r.get("completion_tokens") or 0 for r in rs); sec=sum(r.get("duration_seconds") or 0 for r in rs)
    print(f"{f:42s} {d.get('final_score'):>5} {d.get('deployability'):>6} {d.get('responsiveness'):>4} {ct:>9} {ct/len(rs):>7.0f} {sec:>6.0f}")
PY
