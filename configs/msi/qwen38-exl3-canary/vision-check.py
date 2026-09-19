#!/usr/bin/env python3
"""End-to-end vision check against a running EXL3 canary server (OpenAI API).

Mirrors configs/msi/vision-dflash-repro.sh: the native 2.9 MP OCR image once,
then the ~28 MP upscale (the vLLM vision+MTP crash trigger) for several rounds
with a long decode, plus one streaming request. PASS = every request 200 and
the server still healthy afterwards.

  ~/qwen38-exl3-venv/bin/python vision-check.py [--base_url http://127.0.0.1:8102] [--rounds 3]
"""
import argparse, base64, io, json, sys, time, urllib.request


def post(base_url, body, stream=False, timeout=900):
    req = urllib.request.Request(base_url + "/v1/chat/completions",
                                 json.dumps(body).encode(),
                                 {"Content-Type": "application/json"})
    t0 = time.time()
    with urllib.request.urlopen(req, timeout=timeout) as r:
        if not stream:
            return json.load(r), time.time() - t0
        chunks, usage = 0, None
        for line in r:
            line = line.decode().strip()
            if not line.startswith("data: ") or line == "data: [DONE]":
                continue
            obj = json.loads(line[6:])
            chunks += 1
            usage = obj.get("usage") or usage
        return {"usage": usage, "chunks": chunks}, time.time() - t0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base_url", default="http://127.0.0.1:8102")
    ap.add_argument("--image", default="/mnt/c/Users/<user>/x-thinkingcap.jpg")
    ap.add_argument("--second_image",
                    default="/mnt/c/Users/<user>/dagacha/ai-stuff/benchmarks/vulcanbench/images/vulcanbench-v3-table.png")
    ap.add_argument("--rounds", type=int, default=3)
    ap.add_argument("--json", default=None)
    args = ap.parse_args()

    from PIL import Image
    im = Image.open(args.image).convert("RGB")
    big = im.resize((int(im.width * 3.1), int(im.height * 3.1)), Image.LANCZOS)

    def data_uri(img, q=90):
        buf = io.BytesIO()
        img.save(buf, "JPEG", quality=q)
        return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()

    model = json.load(urllib.request.urlopen(args.base_url + "/v1/models"))["data"][0]["id"]
    health = json.load(urllib.request.urlopen(args.base_url + "/health"))
    print(f"model={model} health={health}")
    if not health.get("vision"):
        print("RESULT: FAIL — server reports vision disabled")
        sys.exit(1)

    prompt = "Transcribe all text in this image exactly, then describe every visual element in detail."

    def body(uri, max_tokens, stream=False):
        return {"model": model, "max_tokens": max_tokens, "temperature": 0.0,
                "stream": stream, "enable_thinking": False,
                "messages": [{"role": "user", "content": [
                    {"type": "image_url", "image_url": {"url": uri}},
                    {"type": "text", "text": prompt}]}]}

    # Multi-image: the OCR screenshot plus the VulcanBench table; the answer
    # must draw on both (checked loosely by keyword).
    second = Image.open(args.second_image).convert("RGB")
    multi_body = {"model": model, "max_tokens": 600, "temperature": 0.0,
                  "stream": False, "enable_thinking": False,
                  "messages": [{"role": "user", "content": [
                      {"type": "text", "text": "Image 1:"},
                      {"type": "image_url", "image_url": {"url": data_uri(im)}},
                      {"type": "text", "text": "Image 2:"},
                      {"type": "image_url", "image_url": {"url": data_uri(second)}},
                      {"type": "text", "text": "In one paragraph each: what is image 1 about, "
                       "and what is image 2 about? Then state the single largest number that "
                       "appears in image 2's table."}]}]}

    results, ok = [], True
    plan = [("native-2.9MP", data_uri(im), 1024, False)]
    plan += [(f"28MP-round{i}", data_uri(big), 2048, False) for i in range(1, args.rounds + 1)]
    plan += [("28MP-stream", data_uri(big), 512, True)]
    plan += [("multi-image", None, 600, False)]
    for name, uri, max_tokens, stream in plan:
        try:
            req_body = multi_body if uri is None else body(uri, max_tokens, stream)
            data, dt = post(args.base_url, req_body, stream=stream)
            u = data["usage"]
            rec = {"name": name, "status": 200, "prompt_tokens": u["prompt_tokens"],
                   "completion_tokens": u["completion_tokens"], "seconds": round(dt, 1),
                   "tok_s_e2e": round(u["completion_tokens"] / dt, 1)}
            if not stream:
                rec["text_head"] = (data["choices"][0]["message"]["content"] or "")[:400]
            print(f"{name}: 200 prompt={u['prompt_tokens']} completion={u['completion_tokens']} "
                  f"{dt:.1f}s {rec['tok_s_e2e']} tok/s e2e")
            if name == "native-2.9MP":
                print("---- output head ----")
                print(rec["text_head"])
                print("---------------------")
            if name == "multi-image":
                text = data["choices"][0]["message"]["content"] or ""
                rec["text"] = text
                low = text.lower()
                rec["mentions_both"] = ("thinkingcap" in low or "qwen 3.6" in low) and \
                                       ("vulcan" in low or "table" in low)
                print("---- multi-image answer ----")
                print(text[:1500])
                print("----------------------------")
                print(f"multi-image mentions both images: {rec['mentions_both']}")
                if not rec["mentions_both"]:
                    ok = False
        except Exception as e:
            ok = False
            print(f"{name}: FAILED — {e!r}")
            results.append({"name": name, "error": repr(e)})
            break
        results.append(rec)
    try:
        health = json.load(urllib.request.urlopen(args.base_url + "/health", timeout=10))
        print(f"post-check health: {health}")
    except Exception as e:
        ok = False
        print(f"post-check health FAILED — {e!r}")
    if args.json:
        json.dump({"pass": ok, "model": model, "requests": results}, open(args.json, "w"), indent=2)
    print("RESULT:", "PASS" if ok else "FAIL")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
