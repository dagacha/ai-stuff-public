#!/bin/bash
# Repro driver for the vision + DFlash experiment (see
# serve-thinkingcap-dflash-test.sh). Replays the exact crash pattern that
# killed vision + MTP on 0.24/0.26: a ~28MP image (~16K prompt tokens after
# Qwen's resolution-scaled vision tokenizer) + a long decode, several times.
#
# Run INSIDE WSL as <user>, with the test server already up on :8102:
#   bash /mnt/c/Users/<user>/dagacha/ai-stuff/configs/msi/vision-dflash-repro.sh
#
# PASS = all rounds return HTTP 200 and the server survives.
# FAIL = any non-200 / connection drop; check vllm-dflash-test.log for the
#        CUDA "illegal memory access" signature.
set -euo pipefail

BASE_URL="${BASE_URL:-http://100.<tailscale-ip-1>:8102}"   # loopback is dead in mirrored mode
ROUNDS="${ROUNDS:-3}"
PY=/home/<user>/vllm-0.26-venv/bin/python
WORK=/home/<user>/dflash-vision-test
mkdir -p "$WORK"

# Build the ~28MP repro image once: upscale the 2.9MP OCR test image 3.1x
# (token cost tracks resolution, not file content).
if [ ! -f "$WORK/repro-28mp.jpg" ]; then
  "$PY" - <<'EOF'
from PIL import Image
im = Image.open('/mnt/c/Users/<user>/x-thinkingcap.jpg')
big = im.resize((int(im.width*3.1), int(im.height*3.1)), Image.LANCZOS)
big.save('/home/<user>/dflash-vision-test/repro-28mp.jpg', quality=90)
print('repro image:', big.size, round(big.width*big.height/1e6,1), 'MP')
EOF
fi

"$PY" - "$BASE_URL" "$ROUNDS" <<'EOF'
import base64, json, sys, time, urllib.request

base_url, rounds = sys.argv[1], int(sys.argv[2])
b64 = base64.b64encode(open('/home/<user>/dflash-vision-test/repro-28mp.jpg','rb').read()).decode()

body = {
    "model": "qwen3.6-27b-nvfp4",
    "max_tokens": 2048,   # long decode is part of the crash trigger
    "messages": [{"role": "user", "content": [
        {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{b64}"}},
        {"type": "text", "text": "Transcribe all text in this image exactly, then describe every visual element in detail."},
    ]}],
}

ok = True
for i in range(1, rounds + 1):
    t0 = time.time()
    req = urllib.request.Request(base_url + "/v1/chat/completions",
                                 json.dumps(body).encode(),
                                 {"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=600) as r:
            data = json.load(r)
        u = data["usage"]
        dt = time.time() - t0
        print(f"round {i}: 200 OK  prompt={u['prompt_tokens']} completion={u['completion_tokens']} "
              f"tokens  {u['completion_tokens']/dt:.1f} tok/s e2e  {dt:.1f}s")
    except Exception as e:
        print(f"round {i}: FAILED — {e}")
        ok = False
        break

print("RESULT:", "PASS — vision + DFlash survived" if ok else
      "FAIL — check /home/<user>/vllm-dflash-test.log for the CUDA crash signature")
sys.exit(0 if ok else 1)
EOF
