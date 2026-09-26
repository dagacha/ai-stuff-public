#!/bin/bash
cd ~/VulcanBench/runs
python3 - <<'PY'
import json,glob,os,time
base={x["task_id"]:x for x in json.load(open("suite-634e2572/suite.json"))["tasks"]}
t0=time.mktime(time.strptime("2026-09-24 20:47:00","%Y-%m-%d %H:%M:%S"))
for d in sorted(glob.glob("oss-*/"), key=lambda d: os.path.getmtime(d+"summary.json") if os.path.exists(d+"summary.json") else 0):
    s=d+"summary.json"
    if not os.path.exists(s) or os.path.getmtime(s)<t0: continue
    sm=json.load(open(s)); tid=sm["task_id"]
    if tid not in base or sm["scores"].get("functional")==1: continue
    ev=[json.loads(l) for l in open(d+"trace.jsonl") if l.strip()]
    resp=[e["data"] for e in ev if e["type"]=="llm_response"]
    last=resp[-1] if resp else {}
    empties=sum(1 for r in resp if not r.get("content") and not r.get("tool_calls"))
    big=sum(1 for r in resp if (r.get("usage",{}).get("completion_tokens") or 0)>=15000)
    diff=[e["data"] for e in ev if e["type"]=="diff"]
    patched=bool(diff and diff[-1].get("patch"))
    end="empty-reply" if (not last.get("content") and not last.get("tool_calls")) else ("text-no-tool" if not last.get("tool_calls") else "tool")
    print(f"{tid:44s} base={base[tid].get('functional')} dur={sm.get('duration_s'):>5.0f} steps={len(resp):>3} end={end:12s} last_ctok={last.get('usage',{}).get('completion_tokens')} empties={empties} 16Kcap={big} patched={patched}")
PY
