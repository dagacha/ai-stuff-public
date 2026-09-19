# Benchmark Report: Qwen3.6-27B AEON XS (NVFP4)

**Model:** `qwen3.6-27b-nvfp4`  
**Quantization:** NVFP4  
**Context Window:** 128K  
**Server:** `http://100.<tailscale-ip-1>:8100/v1`  
**Date:** 2026-05-23  

---

## Summary

| Metric | Value |
|--------|-------|
| **Prefill Peak** | ~16,000 tok/s (at 4K context) |
| **Decode Throughput** | ~40 tok/s (memory-bandwidth limited) |
| **Min TTFT** | ~105 ms |
| **TTFT @ 4K tokens** | ~257 ms |

---

## Test 1: Prefill Scaling

Prefill throughput scales linearly with prompt length, as expected for compute-bound parallel processing.

| Prompt Size | TTFT (ms) | Prefill Throughput (tok/s) |
|-------------|-----------|---------------------------|
| 509 tokens | 196 | 2,593 |
| 1,021 tokens | 204 | 5,022 |
| 2,045 tokens | 208 | 9,870 |
| 4,093 tokens | 257 | 15,936 |

**Observation:** Near-linear scaling confirms efficient parallel prefill on the server. The ~100ms fixed overhead accounts for request parsing and KV cache initialization.

---

## Test 2: Decode Scaling

Decode throughput remains constant regardless of output length, characteristic of memory-bandwidth-limited autoregressive generation.

| Output Length | Decode Throughput (tok/s) |
|---------------|---------------------------|
| 50 tokens | 42 |
| 100 tokens | 45 |
| 200 tokens | 39 |
| 400 tokens | 39 |
| 800 tokens | 40 |

**Observation:** Consistent ~40 tok/s across all output lengths. Decode is memory-bandwidth bound — each token requires loading the full model weights, so throughput is independent of sequence length.

---

## Test 3: Time to First Token (TTFT)

| Prompt Size | TTFT (ms) | Min | Max |
|-------------|-----------|-----|-----|
| 4 tokens (minimal) | 105 | 103 | 107 |
| 53 tokens | 193 | 192 | 195 |
| 509 tokens | 196 | 191 | 205 |
| 4,093 tokens | 257 | 254 | 259 |

**Observation:** TTFT = fixed_overhead + (prompt_tokens / prefill_throughput). The ~100ms floor represents server-side overhead (request handling, tokenization, scheduler).

---

## Configuration

```json
{
  "baseUrl": "http://100.<tailscale-ip-1>:8100/v1",
  "api": "openai-completions",
  "compat": {
    "supportsDeveloperRole": false,
    "supportsReasoningEffort": false,
    "thinkingFormat": "qwen-chat-template"
  },
  "contextWindow": 131072,
  "maxTokens": 8192
}
```

---

## Methodology

- **Streaming API** used to measure precise time-to-first-token (TTFT)
- **Temperature:** 0.0 (deterministic)
- **Runs per test:** 2–5 (averaged)
- **Token counting:** Approximate (characters ÷ 4)
- **Network:** Local network (latency minimal)
