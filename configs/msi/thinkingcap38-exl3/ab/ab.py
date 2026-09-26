#!/usr/bin/env python3
"""Realistic A/B: run a prompt set against one served model; record tokens, time, MTP acceptance."""
import json, sys, time, urllib.request, re
url, model, label, out = sys.argv[1:5]
seeds = [42]
ROOT = "/mnt/c/Users/<user>/dagacha/ai-stuff"

def rd(p):
    return open(p, encoding="utf-8", errors="replace").read()

prompts = {
 "diagnose-crashloop": (
  "Our production model service crash-loops right after a restart. systemd log:\n\n```\n"
  "Sep 24 00:22:42 msioffice systemd[301]: qwen38-exl3.service: Scheduled restart job, restart counter is at 22.\n"
  "Sep 24 00:22:42 msioffice systemd[301]: Started qwen38-exl3.service\n"
  "Sep 24 00:22:42 msioffice bash[54513]: error: missing /home/<user>/qwen38-exl3-venv/bin/python (run prepare-kit.sh 55-mtp-262k-vision)\n"
  "Sep 24 00:22:42 msioffice systemd[301]: qwen38-exl3.service: Main process exited, code=exited, status=1/FAILURE\n```\n\n"
  "But `test -x /home/<user>/qwen38-exl3-venv/bin/python` succeeds and `/home/<user>/qwen38-exl3-venv/bin/python -c 'print(1)'` prints 1. "
  "The launcher is:\n\n```bash\n" + rd(ROOT + "/configs/msi/serve-qwen38-exl3.sh") + "\n```\n\n"
  "The repo lives on /mnt/c (Windows NTFS) and is also edited from a Mac. It worked on Sep 3 and nothing in the launcher changed. "
  "Diagnose the root cause, show how to confirm it in one command, and give the fix plus a prevention."),
 "switch-lane-dryrun": (
  "Here is a bash script that switches which model lane holds the GPU:\n\n```bash\n" + rd(ROOT + "/configs/msi/switch-lane.sh") + "\n```\n\n"
  "Add: (1) a `--dry-run` flag that prints what would be stopped/started without doing it; (2) `status --json` that emits {lane: state} plus the bridge health code; "
  "(3) refuse to switch if the target unit file doesn't exist. Keep `set -euo pipefail` semantics correct. Return the complete updated script."),
 "bridge-proxy": (
  "Write a single-file Python 3.12 stdlib-only HTTP reverse proxy to replace this raw TCP forwarder:\n\n```python\n" + rd(ROOT + "/configs/msi/tcp-forward.py") + "\n```\n\n"
  "Requirements: listen on 0.0.0.0:8100, forward to an upstream host:port given on the command line; for POST /v1/chat/completions parse the JSON body and, "
  "if `frequency_penalty` is absent, inject `presence_penalty: 1.0` (do NOT inject frequency_penalty, it breaks long generations on exllamav3); "
  "cap `max_tokens` at 32768 if absent or larger; stream SSE responses through unbuffered; pass all other paths through untouched; "
  "log one line per request with path, status, and upstream latency; handle upstream connection refused with a 502 JSON error. "
  "Use ThreadingHTTPServer. Include a short test plan."),
 "sweep-analysis": (
  "We benchmarked a reasoning-length finetune (ThinkingCap) of a 27B model against its base on an agentic tool-calling suite "
  "(full = 69 scenarios, hm = hard-mode 3 trials). Same GPU, same quantization, same engine.\n\n```\n"
  "run                              final hm/dep resp compl_tok per_scn  sec\n"
  "base 0.6 low  full                 91     84   66     16142     234  410\n"
  "base 0.6 low  hm3                  67     66   65      5019     335  100\n"
  "base 0.6 xhigh full                91     83   64     24199     351  575\n"
  "TC   0.6 low  full                 87     79   60     14280     207  484\n"
  "TC   0.6 low  hm3                  67     64   58      4556     304  121\n"
  "TC   1.0 xhigh full (card recipe)  86     76   52     22174     321  669\n"
  "TC   1.0 xhigh hm3                 63     61   55      7176     478  185\n"
  "TC   1.0 low  full                 84     76   59     15851     230  504\n"
  "TC   1.0 low  hm3                  70     67   60      4429     295  117\n"
  "TC   0.6 xhigh full                91     81   59     18736     272  552\n"
  "TC   0.6 xhigh hm3                 63     60   53      6020     401  159\n```\n\n"
  "The model card claims 37% fewer reasoning tokens at xhigh with <1pp accuracy loss. The user runs xhigh in production. 'resp' is a responsiveness sub-score. "
  "Explain what the data does and does not support, identify the most important anomaly (hint: tokens vs seconds), propose the single cheapest experiment "
  "that would resolve whether to deploy it, and state a decision rule."),
}

def metrics():
    try:
        t = urllib.request.urlopen(url.replace("/v1", "") + "/metrics", timeout=5).read().decode()
    except Exception:
        return {}
    d = {}
    for line in t.splitlines():
        if line.startswith("vllm:spec_decode") or line.startswith("vllm:generation_tokens_total"):
            m = re.match(r"(\S+?)(\{.*\})?\s+([0-9.e+]+)", line)
            if m:
                d[m.group(1)] = d.get(m.group(1), 0) + float(m.group(3))
    return d

def call(body, timeout):
    req = urllib.request.Request(url + "/chat/completions", data=json.dumps(body).encode(), headers={"content-type": "application/json"})
    return json.loads(urllib.request.urlopen(req, timeout=timeout).read())

call({"model": model, "messages": [{"role": "user", "content": "Say hi."}], "max_tokens": 50}, 120)  # warmup
res = []
for name, content in prompts.items():
    for seed in seeds:
        body = {"model": model, "messages": [{"role": "user", "content": content}], "max_tokens": 20480,
                "temperature": 0.6, "top_p": 0.95, "top_k": 20, "min_p": 0.0, "seed": seed,
                "chat_template_kwargs": {"enable_thinking": True, "reasoning_effort": "xhigh"}}
        m0 = metrics(); t0 = time.time()
        try:
            r = call(body, 1800)
        except Exception as e:
            print(name, seed, "ERROR", e, flush=True); res.append({"prompt": name, "seed": seed, "error": str(e)}); continue
        wall = time.time() - t0; m1 = metrics()
        msg = r["choices"][0]["message"]; u = r["usage"]
        def dm(k): return m1.get(k, 0) - m0.get(k, 0)
        acc, drafts, dtoks = dm("vllm:spec_decode_num_accepted_tokens_total"), dm("vllm:spec_decode_num_drafts_total"), dm("vllm:spec_decode_num_draft_tokens_total")
        row = {"label": label, "prompt": name, "seed": seed, "prompt_tokens": u["prompt_tokens"], "completion_tokens": u["completion_tokens"],
               "reasoning_chars": len((msg.get("reasoning") or msg.get("reasoning_content") or "")), "answer_chars": len(msg.get("content") or ""),
               "finish": r["choices"][0]["finish_reason"], "wall_s": round(wall, 1), "tok_s": round(u["completion_tokens"] / wall, 1),
               "mtp_accept_len": round(1 + acc / drafts, 2) if drafts else None, "mtp_accept_rate": round(acc / dtoks, 3) if dtoks else None}
        res.append(row); print(json.dumps(row), flush=True)
        with open(out + ".samples.jsonl", "a") as f:
            f.write(json.dumps({"label": label, "prompt": name, "seed": seed, "reasoning": msg.get("reasoning") or msg.get("reasoning_content"), "answer": msg.get("content")}) + "\n")
json.dump(res, open(out, "w"), indent=1)
