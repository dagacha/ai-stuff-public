"""Streaming throughput probe for vLLM. Measures:
- prefill: prompt_tokens / time-to-first-token
- decode:  output_tokens / (total_time - ttft)
"""
import json, time, sys, urllib.request

ENDPOINT = "http://127.0.0.1:18080/v1/completions"
MODEL = "gemma-4-31b"


def filler_prompt(target_tokens: int) -> str:
    # Gemma BPE tokenizes most short English words to 1 token. The string
    # "hello world " ~= 3 tokens. Use a long repeating pad and trust the
    # server to report exact prompt_tokens in usage.
    base = "The quick brown fox jumps over the lazy dog. "
    # ~10 tokens per repetition; over-shoot then trim by tokens.
    repeats = max(1, target_tokens // 8)
    return ("Summarize this in five words.\n\n" + base * repeats)[:target_tokens * 8]


def run_one(prompt: str, max_tokens: int = 64):
    body = {
        "model": MODEL,
        "prompt": prompt,
        "max_tokens": max_tokens,
        "temperature": 0.0,
        "stream": True,
        "stream_options": {"include_usage": True},
    }
    req = urllib.request.Request(
        ENDPOINT,
        data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json"},
    )
    t0 = time.perf_counter()
    ttft = None
    n_chunks = 0
    last_t = None
    usage = None
    with urllib.request.urlopen(req, timeout=600) as resp:
        for raw in resp:
            line = raw.decode().strip()
            if not line.startswith("data: "):
                continue
            data = line[len("data: "):]
            if data == "[DONE]":
                break
            obj = json.loads(data)
            if obj.get("usage"):
                usage = obj["usage"]
            choices = obj.get("choices") or []
            if choices and choices[0].get("text"):
                if ttft is None:
                    ttft = time.perf_counter() - t0
                n_chunks += 1
                last_t = time.perf_counter()
    total = time.perf_counter() - t0
    return ttft, total, last_t, n_chunks, usage


def main():
    sizes = [int(x) for x in sys.argv[1:]] or [256, 2048, 16384, 65536]
    print(f"{'in_tok':>8} {'out_tok':>8} {'chunks':>7} {'ttft_s':>8} {'prefill_t/s':>14} {'decode_t/s':>12} {'total_s':>8}")
    print("-" * 80)
    for s in sizes:
        prompt = filler_prompt(s)
        ttft, total, last_t, n_chunks, usage = run_one(prompt, max_tokens=64)
        if not usage:
            print(f"Error: No usage metrics returned by the server for prompt size {s}. "
                  "Ensure the server supports OpenAI stream_options and returns usage statistics.",
                  file=sys.stderr)
            continue
        in_tok = usage["prompt_tokens"]
        out_tok = usage["completion_tokens"]
        prefill_tps = in_tok / ttft if ttft else float("inf")
        # Use total_time - ttft as decode wall time. More accurate than last_chunk
        # delta because chunks may batch tokens.
        decode_t = total - ttft if ttft else 0
        decode_tps = out_tok / decode_t if decode_t > 0 else float("inf")
        print(f"{in_tok:>8} {out_tok:>8} {n_chunks:>7} {ttft:>8.3f} {prefill_tps:>14.1f} {decode_tps:>12.1f} {total:>8.3f}")


if __name__ == "__main__":
    main()
