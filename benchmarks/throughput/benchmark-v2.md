# Benchmark v2

benchmark_v2.py is the recommended harness for new MSI vLLM measurements.
The smaller bench_vllm.py probe remains useful for quick throughput checks,
while v2 is intended for reproducible context, quality, tool, and speed runs.

## What v2 fixes

- Prompt sizes come from vLLM's /v1/chat/completions/render token IDs and are
  checked again against usage.prompt_tokens.
- Context filler is deterministic, unique, and generated in linear time.
- Needle and code-edit scoring uses final content only. Reasoning is never a
  fallback and a truncated answer such as NEED fails.
- A recorded speed sample sends exactly one request.
- Streaming measurements report TTFT, decode-window tokens/s, and end-to-end
  tokens/s separately.
- Speed results contain repeated samples plus median/range summaries.
- Concurrent results record the declared max_num_seqs and warn when queuing
  cannot be distinguished from simultaneous scheduling.
- Result JSON includes the model listing, vLLM version endpoint, GPU/driver,
  Git state, requested server configuration, and actual token counts.

The render endpoint is vLLM-specific. That is intentional: exact chat-template
token counts cannot be obtained from the standard OpenAI API without loading a
matching tokenizer locally.

## Examples

Full quality and speed suite against MSI production defaults:

    python3 benchmarks/throughput/benchmark_v2.py all \
      --label mtp-mnbt1024 \
      --mtp on --mnbt 1024 --server-max-num-seqs 4 \
      --kv-cache-bytes 5800000000 \
      --concurrency 1,4 \
      --out /tmp/benchmark-v2-mtp1024.json

Include the 196K needle and 131K code-edit cases:

    python3 benchmarks/throughput/benchmark_v2.py quality --full \
      --out /tmp/benchmark-v2-full.json

Sizing the 196K prompt takes roughly 15-20 calls to the vLLM `/render`
endpoint. These calls measure prompt length only; they do not run generation.

Short live smoke test:

    python3 benchmarks/throughput/benchmark_v2.py quality \
      --needle-lengths 1024 --code-lengths 1024 --skip-tools \
      --out /tmp/benchmark-v2-smoke.json

The defaults target the MSI bridge at 127.0.1.1:8100. The default served name,
qwen3.6-27b-nvfp4, is a compatibility alias retained for existing clients; the
canonical current production name is qwen3.8-27b-nvfp4. Environment variables
BENCH_URL, BENCH_MODEL, and BENCH_OUT remain supported. CLI options override
their defaults.

## Tests

    cd benchmarks/throughput
    python3 -m unittest -v test_benchmark_v2.py

The tests guard against the earlier quadratic filler, reasoning-based false
positives, truncated-answer false positives, duplicate speed requests, and
single-sample throughput reporting.
