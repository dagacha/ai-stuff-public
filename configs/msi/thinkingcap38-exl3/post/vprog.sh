#!/bin/bash
sleep ${1:-0}
date +%H:%M; systemctl --user is-active tc38-vulcan.service
grep -E '^===' ~/runs/tc38-vulcan.log | tail -3 | cut -c1-160
cd ~/VulcanBench/runs
python3 - <<'PY'
import json,os,glob,time
t0=time.mktime(time.strptime("2026-09-24 19:46:00","%Y-%m-%d %H:%M:%S"))
rows=[]
for d in glob.glob("*/"):
    if d.startswith("suite-"): continue
    p=os.path.join(d,"result.json")
    if not os.path.exists(p):
        for alt in ("run.json","trace.json","summary.json"):
            if os.path.exists(os.path.join(d,alt)): p=os.path.join(d,alt); break
        else: continue
    if os.path.getmtime(p)<t0: continue
    try: r=json.load(open(p))
    except Exception: continue
    f=r.get("functional", r.get("scores",{}).get("functional") if isinstance(r.get("scores"),dict) else None)
    tot=r.get("total", r.get("scores",{}).get("total") if isinstance(r.get("scores"),dict) else None)
    rows.append((os.path.getmtime(p), d.rstrip("/"), f, tot, r.get("duration_s") or r.get("duration")))
rows.sort()
for m,d,f,tot,dur in rows: print(f"{time.strftime('%H:%M',time.localtime(m))} {d:42s} functional={f} total={tot} dur={dur}")
fs=[f for _,_,f,_,_ in rows if f is not None]
print(f"done={len(rows)} functional==1: {sum(1 for f in fs if f==1)}  mean_total={sum(t for *_,t,_ in [(0,0,0,r[3],0) for r in rows if r[3] is not None])/max(1,len([r for r in rows if r[3] is not None])):.3f}")
PY
for s in v1 v1-carbyne v3; do [ -f ~/runs/tc38-vulcan-$s.log ] && printf '%s: ' $s && grep -E 'Suite|passed|Results|leaderboard|score' ~/runs/tc38-vulcan-$s.log | tail -2 | cut -c1-160; done
