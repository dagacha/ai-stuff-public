#!/bin/bash
python3 - "$@" <<'PY'
import json,sys
def walk(d,path=""):
    out=[]
    if isinstance(d,dict):
        for k,v in d.items():
            if "token" in k.lower() and isinstance(v,(int,float)): out.append((path+k,v))
            out+=walk(v,path+k+".")
    elif isinstance(d,list):
        for i,v in enumerate(d[:3]): out+=walk(v,path+f"[{i}].")
    return out
for f in sys.argv[1:]:
    try: d=json.load(open(f"/home/<user>/runs/{f}.json"))
    except Exception as e: print(f,"(missing)"); continue
    print(f"{f}: final={d.get('final_score')} deploy={d.get('deployability')} resp={d.get('responsiveness')} rating={d.get('rating')} safety={d.get('safety_warnings')}")
    toks=walk(d)
    if toks: print("   token fields:", toks[:8])
PY
for f in "$@"; do
  [ -f ~/runs/$f.log ] || continue
  printf '   %s misses: ' "$f"; grep -B1 -E '"status": "(fail|partial)"' ~/runs/$f.log | grep scenario_start | grep -o 'TC-[0-9]*' | tr '\n' ' '; echo
done
