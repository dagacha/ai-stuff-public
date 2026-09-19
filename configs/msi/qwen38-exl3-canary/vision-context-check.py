#!/usr/bin/env python3
"""Vision under long context and inside tool-calling turns (OpenAI API).

A. Long context: the OCR test image with ~40K and ~100K tokens of filler
   text around it, text-then-image and image-then-text. The filler carries a
   planted fact so the answer has to prove both the text and the image were
   read. PASS = 200, headline transcribed, planted fact recalled.
B. Tool turns: tools get_screenshot(name) and send_email(to, subject, body).
   Turn 1 must call get_screenshot; the screenshot is then delivered either
   inside the `tool` message (image_url part in tool content) or in a
   follow-up user message; turn 2 must call send_email with the headline
   claim in the body. PASS = the right tool at each step and the body
   mentions the 5-7x claim.

  ~/qwen38-exl3-venv/bin/python vision-context-check.py [--base_url ...] [--json ...]
"""
import argparse, base64, io, json, sys, time, urllib.request

HEADLINE_KEYS = ("5-7", "5–7", "5-7x", "5–7×", "five to seven")
NEEDLE = "The archive key for the Vega dataset is TANGERINE-4471."


def post(base_url, body, timeout=1800):
    req = urllib.request.Request(base_url + "/v1/chat/completions",
                                 json.dumps(body).encode(),
                                 {"Content-Type": "application/json"})
    t0 = time.time()
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.load(r), time.time() - t0


def filler(n_tokens, needle_at=0.5):
    """~n_tokens of varied prose (≈4 chars/token) with NEEDLE at needle_at depth."""
    base = ("Section {i}. The quarterly logistics review covered inventory turnover, "
            "carrier reliability, and the phased rollout of the new routing engine across "
            "the northern depots. Analysts noted that median dwell time fell by {d} percent "
            "while exception handling costs rose modestly in the same period. ")
    out, i, chars = [], 0, 0
    target = n_tokens * 4
    planted = False
    while chars < target:
        if not planted and chars >= target * needle_at:
            out.append(NEEDLE + " ")
            planted = True
        s = base.format(i=i, d=(i * 7) % 23)
        out.append(s)
        chars += len(s)
        i += 1
    return "".join(out)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base_url", default="http://127.0.0.1:8102")
    ap.add_argument("--image", default="/mnt/c/Users/<user>/x-thinkingcap.jpg")
    ap.add_argument("--lengths", default="40000,100000")
    ap.add_argument("--skip_long", action="store_true", help="only run the tool-turn flows")
    ap.add_argument("--json", default=None)
    args = ap.parse_args()

    from PIL import Image
    im = Image.open(args.image).convert("RGB")
    buf = io.BytesIO(); im.save(buf, "JPEG", quality=90)
    uri = "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()
    img_part = {"type": "image_url", "image_url": {"url": uri}}

    model = json.load(urllib.request.urlopen(args.base_url + "/v1/models"))["data"][0]["id"]
    health = json.load(urllib.request.urlopen(args.base_url + "/health"))
    print(f"model={model} vision={health.get('vision')} ctx={health.get('context_length')}")
    if not health.get("vision"):
        print("RESULT: FAIL — vision disabled"); sys.exit(1)

    results, ok = [], True

    def record(name, data, dt, checks):
        u = data["usage"]
        msg = data["choices"][0]["message"]
        text = msg.get("content") or ""
        rec = {"name": name, "prompt_tokens": u["prompt_tokens"],
               "completion_tokens": u["completion_tokens"], "seconds": round(dt, 1),
               "finish": data["choices"][0]["finish_reason"],
               "tool_calls": [c["function"] for c in msg.get("tool_calls") or []],
               "text_head": text[:600], "checks": checks, "pass": all(checks.values())}
        results.append(rec)
        flag = "PASS" if rec["pass"] else "FAIL"
        print(f"{name}: 200 prompt={u['prompt_tokens']} completion={u['completion_tokens']} "
              f"{dt:.1f}s finish={rec['finish']} checks={checks} -> {flag}")
        return rec["pass"]

    # ---- A. long context -------------------------------------------------
    question = ("Two tasks. (1) Quote the first sentence of the main post in the image "
                "exactly. (2) What is the archive key for the Vega dataset mentioned in "
                "the document?")
    for n in ([] if args.skip_long else [int(x) for x in args.lengths.split(",")]):
        doc = filler(n)
        for order in ("text-then-image", "image-then-text"):
            if order == "text-then-image":
                content = [{"type": "text", "text": "Document:\n" + doc},
                           {"type": "text", "text": "Image:"}, img_part,
                           {"type": "text", "text": question}]
            else:
                content = [{"type": "text", "text": "Image:"}, img_part,
                           {"type": "text", "text": "Document:\n" + doc},
                           {"type": "text", "text": question}]
            body = {"model": model, "max_tokens": 400, "temperature": 0.0,
                    "enable_thinking": False,
                    "messages": [{"role": "user", "content": content}]}
            name = f"A-{n//1000}K-{order}"
            try:
                data, dt = post(args.base_url, body)
                text = (data["choices"][0]["message"].get("content") or "")
                low = text.lower()
                checks = {"headline": any(k in low for k in HEADLINE_KEYS) and "thinkingcap" in low,
                          "needle": "tangerine-4471" in low}
                ok &= record(name, data, dt, checks)
            except Exception as e:
                ok = False; results.append({"name": name, "error": repr(e)})
                print(f"{name}: FAILED — {e!r}")

    # ---- B. tool-calling turns ------------------------------------------
    tools = [
        {"type": "function", "function": {
            "name": "get_screenshot",
            "description": "Fetch a stored screenshot by name. The image is returned as the tool result.",
            "parameters": {"type": "object", "properties": {"name": {"type": "string"}},
                           "required": ["name"]}}},
        {"type": "function", "function": {
            "name": "send_email",
            "description": "Send an email.",
            "parameters": {"type": "object", "properties": {
                "to": {"type": "string"}, "subject": {"type": "string"}, "body": {"type": "string"}},
                "required": ["to", "subject", "body"]}}},
    ]
    sys_msg = {"role": "system", "content": "You are an assistant with tools. Use them when needed."}
    user1 = {"role": "user", "content": "Fetch the screenshot named 'thinkingcap', then email its "
             "main post's first sentence, quoted exactly, to team@example.com with subject "
             "'Headline'. Do not ask questions."}

    def turn(messages, name, expect_tool, body_keys=None):
        body = {"model": model, "max_tokens": 1500, "temperature": 0.0,
                "tools": tools, "tool_choice": "auto",
                "messages": messages}
        data, dt = post(args.base_url, body)
        calls = data["choices"][0]["message"].get("tool_calls") or []
        names = [c["function"]["name"] for c in calls]
        checks = {"called_" + expect_tool: expect_tool in names}
        if body_keys and calls:
            # `arguments` arrives as a JSON string (the server emits it
            # ASCII-escaped, so the en-dash is literally "–" in it):
            # decode before matching.
            vals = []
            for c in calls:
                a = c["function"].get("arguments")
                if isinstance(a, str):
                    try:
                        a = json.loads(a)
                    except ValueError:
                        pass
                vals.append(a)
            argstr = json.dumps(vals, ensure_ascii=False).lower()
            checks["body_has_headline"] = any(k in argstr for k in body_keys) and "thinkingcap" in argstr
        elif body_keys:
            checks["body_has_headline"] = False
        return record(name, data, dt, checks), data

    for variant in ("image-in-tool-message", "image-in-followup-user"):
        try:
            p1, d1 = turn([sys_msg, user1], f"B-{variant}-turn1", "get_screenshot")
            ok &= p1
            calls = d1["choices"][0]["message"].get("tool_calls") or []
            call = calls[0] if calls else {"id": "call_1", "type": "function",
                                            "function": {"name": "get_screenshot",
                                                         "arguments": "{\"name\": \"thinkingcap\"}"}}
            call_id = call.get("id") or "call_1"
            assistant = {"role": "assistant", "content": None,
                         "tool_calls": [{"id": call_id, "type": "function",
                                         "function": {"name": call["function"]["name"],
                                                      "arguments": call["function"]["arguments"]
                                                      if isinstance(call["function"]["arguments"], str)
                                                      else json.dumps(call["function"]["arguments"])}}]}
            if variant == "image-in-tool-message":
                tool_msg = {"role": "tool", "tool_call_id": call_id,
                            "content": [{"type": "text", "text": "Screenshot 'thinkingcap':"}, img_part]}
                msgs = [sys_msg, user1, assistant, tool_msg]
            else:
                tool_msg = {"role": "tool", "tool_call_id": call_id,
                            "content": "Screenshot 'thinkingcap' retrieved; it is attached in the next message."}
                user2 = {"role": "user", "content": [{"type": "text", "text": "Here is the screenshot:"}, img_part,
                                                     {"type": "text", "text": "Now send the email."}]}
                msgs = [sys_msg, user1, assistant, tool_msg, user2]
            p2, _ = turn(msgs, f"B-{variant}-turn2", "send_email", HEADLINE_KEYS)
            ok &= p2
        except Exception as e:
            ok = False; results.append({"name": f"B-{variant}", "error": repr(e)})
            print(f"B-{variant}: FAILED — {e!r}")

    try:
        health = json.load(urllib.request.urlopen(args.base_url + "/health", timeout=10))
        print(f"post-check health: {health}")
    except Exception as e:
        ok = False; print(f"post-check health FAILED — {e!r}")
    if args.json:
        json.dump({"pass": ok, "model": model, "requests": results}, open(args.json, "w"), indent=2)
    print("RESULT:", "PASS" if ok else "FAIL")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
