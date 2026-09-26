#!/bin/bash
R=/home/<user>/runs
for f in tc38-prod-teb-xhigh-hm3 tc38-exl3-teb-low-hm3 qwen38-exl3-55-mtp-262k-vision-teb-v251-low-hm3; do
  echo "=== $f"
  python3 - "$R/$f.log" <<'PY'
import json,sys,collections
st=collections.defaultdict(list); dur=collections.defaultdict(list); toks=collections.defaultdict(list)
for line in open(sys.argv[1]):
    try: e=json.loads(line)
    except Exception: continue
    if e.get("event")=="scenario_result":
        st[e["scenario_id"]].append(e["status"][0]); dur[e["scenario_id"]].append(e.get("duration_seconds",0))
bad={k:"".join(v) for k,v in st.items() if set(v)!={"p"}}
print("non-pass:", " ".join(f"{k}:{v}" for k,v in sorted(bad.items())))
print("mean s/scenario: %.0f  max: %.0f" % (sum(sum(v) for v in dur.values())/max(1,sum(len(v) for v in dur.values())), max(max(v) for v in dur.values())))
PY
done
echo "=== xhigh hm3 completion tokens per scenario (top 8)"
python3 - <<'PY'
import json
d=json.load(open("/home/<user>/runs/tc38-prod-teb-xhigh-hm3.json"))
rs=d["scores"]["scenario_results"]
rs=sorted(rs,key=lambda r:-(r.get("completion_tokens") or 0))
for r in rs[:8]: print(r.get("scenario_id"), r.get("status"), "ctok", r.get("completion_tokens"), "dur", round(r.get("duration_seconds") or 0), (r.get("failure_reason") or r.get("notes") or "")[:120])
print("total ctok", sum(r.get("completion_tokens") or 0 for r in rs))
PY
