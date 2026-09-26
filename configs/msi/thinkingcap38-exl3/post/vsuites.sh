#!/bin/bash
cd ~/VulcanBench/runs
python3 - <<'PY'
import json,glob,os,time
t0=time.mktime(time.strptime("2026-09-24 19:46:00","%Y-%m-%d %H:%M:%S"))
base={"v1":"suite-9caa1256","v1-carbyne":"suite-d3c067ab","v3":"suite-634e2572"}
def summ(p):
    d=json.load(open(p)); t=d["tasks"]
    return d["suite"], d["model"], d["n_tasks"], sum(1 for x in t if x.get("functional")==1), sum(x.get("total") or 0 for x in t)/max(1,len(t)), sum(x.get("duration_s") or 0 for x in t)/60, d.get("finished_at")
print(f"{'suite':11s} {'model':42s} {'n':>3s} {'func=1':>6s} {'mean_total':>10s} {'min':>5s} finished")
for p in sorted(glob.glob("suite-*/suite.json"), key=os.path.getmtime):
    if os.path.getmtime(p)<t0 and os.path.dirname(p) not in base.values(): continue
    s=summ(p); print(f"{s[0]:11s} {s[1]:42s} {s[2]:>3} {s[3]:>6} {s[4]:>10.3f} {s[5]:>5.0f} {str(s[6])[:16]}")
PY
