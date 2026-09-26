#!/bin/bash
cd ~/VulcanBench/runs
python3 - <<'PY'
import json,glob,os,time
base={x["task_id"]:x for x in json.load(open("suite-634e2572/suite.json"))["tasks"]}
t0=time.mktime(time.strptime("2026-09-24 20:47:00","%Y-%m-%d %H:%M:%S"))
print(f"{'task':40s} {'base':>5s} {'TC':>5s} {'TCdur':>6s} steps last_ctok last_has_tool")
for d in sorted(glob.glob("*/"), key=lambda d: os.path.getmtime(d+"summary.json") if os.path.exists(d+"summary.json") else 0):
    s=d+"summary.json"
    if not os.path.exists(s) or os.path.getmtime(s)<t0: continue
    sm=json.load(open(s)); tid=sm["task_id"]
    if tid not in base: continue
    ev=[json.loads(l) for l in open(d+"trace.jsonl") if l.strip()]
    resp=[e["data"] for e in ev if e["type"]=="llm_response"]
    last=resp[-1] if resp else {}
    print(f"{tid:40s} {base[tid].get('functional'):>5} {sm['scores'].get('functional'):>5} {sm.get('duration_s'):>6.0f} {len(resp):>5} {last.get('usage',{}).get('completion_tokens')} {bool(last.get('tool_calls'))}")
print("base v3 passes:", sorted(t for t,x in base.items() if x.get("functional")==1))
PY
echo "=== aiohttp last steps"; bash /mnt/c/Users/<user>/dagacha/ai-stuff/configs/msi/thinkingcap38-exl3/post/vtrace.sh $(ls -d oss-aiohttp-upgrade-deferred-*/ | tail -1 | tr -d /) 2>&1 | tail -6 | cut -c1-500
