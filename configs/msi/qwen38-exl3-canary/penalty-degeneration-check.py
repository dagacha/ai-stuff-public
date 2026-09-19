#!/usr/bin/env python3
"""Reproduce the frequency-penalty degeneration on the EXL3 lane.

Sends the same long prompt (text-only, then with a synthetic "Add DNS record"
image) at several penalty settings and prints finish reason, usage and the
tail of each answer. On exllamav3 `freq_p` is cumulative, so 0.5 already
strips punctuation by ~600 tokens and 1.0 turns into word salad.

    python3 penalty-degeneration-check.py [http://127.0.0.1:8100] [model]

Needs Pillow only for the image half; the text half runs without it.
"""
import base64, io, json, sys, time, urllib.request

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8100"
MODEL = sys.argv[2] if len(sys.argv) > 2 else "qwen3.8-27b-exl3-5.5bpw"
SAMPLING = {"enable_thinking": False, "temperature": 0.7, "top_p": 0.8, "top_k": 20}
TEXT_PROMPT = ("Write a detailed 900-word essay on how wildcard DNS records work, "
               "their history, common uses, TTL considerations, CDN proxying, and pitfalls.")
IMAGE_PROMPT = ("What does this dialog do? Transcribe every field, then explain in "
                "detail what happens after Save, with several example hostnames.")
SETTINGS = [(0.0, 1.0), (0.5, 1.0), (1.0, 1.15)]


def call(messages, freq, rep, max_tokens):
    body = {"model": MODEL, "messages": messages, "max_tokens": max_tokens,
            "frequency_penalty": freq, "repetition_penalty": rep, **SAMPLING}
    req = urllib.request.Request(BASE + "/v1/chat/completions",
                                 data=json.dumps(body).encode(),
                                 headers={"Content-Type": "application/json"})
    t0 = time.time()
    with urllib.request.urlopen(req, timeout=600) as r:
        d = json.loads(r.read())
    c = d["choices"][0]
    text = c["message"].get("content") or ""
    print(f"  freq={freq} rep={rep}: finish={c.get('finish_reason')} "
          f"usage={d.get('usage')} {time.time() - t0:.1f}s")
    print("    tail:", text[-300:].replace("\n", " "))


def synthetic_dialog():
    from PIL import Image, ImageDraw, ImageFont
    img = Image.new("RGB", (900, 520), "white")
    d = ImageDraw.Draw(img)
    try:
        f = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 22)
    except Exception:
        f = ImageFont.load_default()
    rows = [("Add DNS record", 20), ("Type: A", 80), ("Name (required): *.mech", 130),
            ("IPv4 address: 203.0.113.42", 180), ("Proxy status: DNS only", 230),
            ("TTL: 5 min", 280), ("Preview: *.mech.<olas>.xyz  IN  A  203.0.113.42", 340),
            ("[ Cancel ]      [ Save ]", 420)]
    for s, y in rows:
        d.text((30, y), s, fill="black", font=f)
    buf = io.BytesIO()
    img.save(buf, "PNG")
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()


print("== text only, 1300 tokens ==")
for freq, rep in SETTINGS:
    call([{"role": "user", "content": TEXT_PROMPT}], freq, rep, 1300)

try:
    uri = synthetic_dialog()
except ImportError:
    print("== image half skipped (Pillow not installed) ==")
    sys.exit(0)
print("== synthetic dialog image, 1500 tokens ==")
msgs = [{"role": "user", "content": [{"type": "text", "text": IMAGE_PROMPT},
                                     {"type": "image_url", "image_url": {"url": uri}}]}]
for freq, rep in SETTINGS[:2]:
    call(msgs, freq, rep, 1500)
