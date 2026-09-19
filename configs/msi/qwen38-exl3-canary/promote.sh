#!/usr/bin/env bash
# Promote the EXL3 vision lane to the production 8101 slot:
# install launcher + unit, flip the enabled lane, verify through the 8100
# bridge (models, chat + tool call, streaming, vision). Idempotent.
#   bash configs/msi/qwen38-exl3-canary/promote.sh
set -uo pipefail
ROOT=/mnt/c/Users/<user>/dagacha/ai-stuff
PY=/home/<user>/qwen38-exl3-venv/bin/python
BRIDGE=http://100.<tailscale-ip-1>:8100

echo "== install launcher + unit"
cp "$ROOT/configs/msi/serve-qwen38-exl3.sh" /mnt/c/Users/<user>/serve-qwen38-exl3.sh
cp "$ROOT/configs/msi/qwen38-exl3.service" ~/.config/systemd/user/qwen38-exl3.service
systemctl --user daemon-reload

echo "== flip enabled lane: qwen38 -> qwen38-exl3"
systemctl --user disable qwen38.service 2>/dev/null || true
systemctl --user enable qwen38-exl3.service
bash "$ROOT/configs/msi/switch-lane.sh" qwen38-exl3 || { journalctl --user -u qwen38-exl3 -n 40 --no-pager; exit 1; }
systemctl --user is-enabled qwen38.service qwen38-exl3.service vllm.service 2>&1 | paste -sd' '
nvidia-smi --query-gpu=memory.used --format=csv,noheader

echo "== verify via bridge: /v1/models"
curl -s "$BRIDGE/v1/models" | $PY -c 'import json,sys; print([m["id"] for m in json.load(sys.stdin)["data"]])'

echo "== verify: chat with alias name + tool call (non-stream)"
$PY - "$BRIDGE" <<'EOF'
import json, sys, urllib.request, time
base = sys.argv[1]
def post(body, stream=False):
    req = urllib.request.Request(base + "/v1/chat/completions", json.dumps(body).encode(), {"Content-Type": "application/json"})
    t0 = time.time()
    with urllib.request.urlopen(req, timeout=300) as r:
        if not stream: return json.load(r), time.time() - t0
        n = 0; last = None
        for line in r:
            s = line.decode().strip()
            if s.startswith("data: ") and s != "data: [DONE]":
                n += 1; last = json.loads(s[6:])
        return {"chunks": n, "last": last}, time.time() - t0
tools = [{"type": "function", "function": {"name": "get_weather", "description": "Weather for a city",
          "parameters": {"type": "object", "properties": {"city": {"type": "string"}}, "required": ["city"]}}}]
d, dt = post({"model": "qwen3.8-27b-nvfp4", "messages": [{"role": "user", "content": "What's the weather in Madrid right now? Use the tool."}],
              "tools": tools, "tool_choice": "auto", "max_tokens": 400, "frequency_penalty": 0.2})
m = d["choices"][0]["message"]
print("alias model echoed:", d["model"], "| finish:", d["choices"][0]["finish_reason"], "| tool_calls:", [c["function"] for c in m.get("tool_calls") or []], f"| {dt:.1f}s")
assert d["choices"][0]["finish_reason"] == "tool_calls", "expected a tool call"
d, dt = post({"model": "qwen3.6-27b-nvfp4", "messages": [{"role": "user", "content": "Reply with the single word OK."}], "max_tokens": 200, "stream": True, "stream_options": {"include_usage": True}}, stream=True)
print("stream chunks:", d["chunks"], "| usage:", (d["last"] or {}).get("usage"), f"| {dt:.1f}s")
print("chat/tool/stream verify OK")
EOF
[ $? = 0 ] || exit 1

echo "== verify: vision via bridge (native image + 1x 28MP + stream + multi-image)"
$PY -u "$ROOT/configs/msi/qwen38-exl3-canary/vision-check.py" --base_url "$BRIDGE" --rounds 1 --json ~/runs/qwen38-exl3-prod-vision-check.json | grep -E '^(native|28MP|multi-image|RESULT|post-check)'
rc=${PIPESTATUS[0]}
if [ "$rc" != 0 ]; then
  echo "== FAILED: vision verification rc=$rc — lane is flipped but NOT verified;" \
       "roll back with: bash $ROOT/configs/msi/switch-lane.sh qwen38" >&2
  exit "$rc"
fi
echo "== done"
