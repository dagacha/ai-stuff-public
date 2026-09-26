#!/bin/bash
R=/home/<user>/runs
echo "=== benchmark_v2"; grep -E '\[(needle|code|tool|speed)\]' $R/tc38-prod-benchmark-v2.log | grep -vE 'tool\].*PASS' | cut -c1-140
echo "tools: $(grep -c '\[tool\].*PASS' $R/tc38-prod-benchmark-v2.log) pass / $(grep -c '^\[tool\]' $R/tc38-prod-benchmark-v2.log) total"
python3 - <<'PY'
import json
for f,lab in [("tc38-prod-benchmark-v2","TC prod"),("qwen38-exl3-55-mtp-262k-vision-benchmark-v2","base EXL3 canary")]:
    try: d=json.load(open(f"/home/<user>/runs/{f}.json"))
    except Exception as e: print(f,"missing"); continue
    sp=d.get("speed",{}); q=d.get("quality",{})
    def g(o,*ks):
        for k in ks:
            o=o.get(k,{}) if isinstance(o,dict) else {}
        return o if o!={} else None
    print(lab, "speed keys:", list(sp.keys())[:8])
    for k,v in sp.items():
        if isinstance(v,(int,float)): print(f"   {k}: {v}")
        elif isinstance(v,dict):
            flat={kk:vv for kk,vv in v.items() if isinstance(vv,(int,float))}
            if flat: print(f"   {k}: {flat}")
    print("   quality summary:", {k:(v if isinstance(v,(int,float,str)) else (v.get('passed') if isinstance(v,dict) else len(v))) for k,v in q.items()} if isinstance(q,dict) else q)
PY
echo "=== vision-context"; grep -E 'PASS|FAIL|RESULT|tokens|ok' $R/tc38-prod-vision-context.log | tail -8 | cut -c1-160
echo "=== penalty"; grep -nE 'freq|rep|finish|tokens|===|---' $R/tc38-prod-penalty.log | head -30 | cut -c1-200
