# Throughput — `gemma-4-31B-it-NVFP4` on vLLM, RTX PRO 5000 Blackwell

Single-GPU throughput probe of `RedHatAI/gemma-4-31B-it-NVFP4` served via vLLM with 128K context.

## Setup

| | |
|---|---|
| GPU | NVIDIA RTX PRO 5000 Blackwell, 48 GB, SM 12.0 |
| Model | `RedHatAI/gemma-4-31B-it-NVFP4` (NVFP4 weights, ~22 GB on disk) |
| Runtime | vLLM 0.20.1, PyTorch 2.11.0+cu130, FlashInfer 0.6.8.post1 |
| Attention backend | TRITON_ATTN (forced — Gemma 4 has heterogeneous head dims) |
| KV cache | fp16, 20.46 GiB allocated |
| `--max-model-len` | 131072 (128K) |
| `--max-num-batched-tokens` | 8192 |
| `--gpu-memory-utilization` | 0.90 |
| Measurement | OpenAI-compatible `/v1/completions` streaming, `temperature=0`, `max_tokens=64` |

The model has 60 transformer layers — 50 sliding-window (1024-token) and 10 full-attention. Full-attention layers use 4 KV heads × 512 head_dim; sliding layers use 16 KV heads × 256 head_dim. The full-attention layers dominate cost at long contexts.

## Single-stream results

| Input tokens | TTFT (s) | **Prefill t/s** | **Decode t/s** | Total (s) |
|---:|---:|---:|---:|---:|
| 329 | 0.10 | 3,183 | 45.0 | 1.52 |
| 2,569 | 0.39 | 6,674 | 43.9 | 1.84 |
| 20,489 | 5.26 | 3,894 | 39.5 | 6.88 |
| 81,929 | 48.68 | 1,683 | 53.4¹ | 48.85 |

¹ Higher decode rate at 80K is an artifact of only 9 output tokens before EOS.

### Server-side cumulative metrics

Pulled from `/metrics` (Prometheus) across the probe runs:

```
prompt_tokens_total      = 307,771
prefill_time_total (s)   = 145.6
=> aggregate prefill t/s = 2,113
generation_tokens_total  = 590
```

Aggregate prefill t/s is dominated by the 80K-input request, which is why it tracks the long-context number rather than the peak.

## Interpretation

### Prefill peaks at ~6.7K t/s around 2K context

Below ~2K tokens, fixed per-request overhead (request parsing, scheduling, CUDA graph capture lookup) dilutes throughput. Between ~2K and ~16K, dense GEMMs in the linear layers dominate and we run near-roofline. Above ~16K the 10 full-attention layers do `O(N²)` work for prefill and become the bottleneck — by 80K, prefill has dropped to ~1.7K t/s.

### Decode is flat ~40–45 t/s and memory-bandwidth-bound

A 31B-parameter model in NVFP4 weights is ~22 GB. Single-stream decode reads all weights to produce one token, so the ceiling is roughly `mem_bandwidth / weight_bytes`. The Blackwell HBM lands the roofline in the 40–50 t/s range — we are essentially saturating it.

**Implication:** there is no headroom to make a single request decode faster. Concurrent requests will scale near-linearly until you hit prefill compute or KV-cache budget; we have ~20 GiB of KV which is plenty for many concurrent shorter-context streams.

### TTFT is dominated by prefill at long contexts

| Input | TTFT |
|---:|---:|
| 256 | ~100 ms |
| 2K | ~400 ms |
| 20K | ~5 s |
| 80K | ~49 s |

If interactive long-context use matters, options are: rely on chunked prefill (already on by virtue of `max_num_batched_tokens=8192` < input length), shrink context, or bigger GPU.

## Practical envelope

| Workload | TTFT | Decode wall (200 tok) | End-to-end |
|---|---|---|---|
| Short chat (≤2K in) | 0.1–0.4 s | ~5 s | ~5 s |
| RAG @ 16K context | ~5 s | ~5 s | ~10 s |
| Long-context @ 64K+ | 30–50 s | ~5 s | dominated by prefill |

## Reproducer

The probe script used to gather the numbers is checked in alongside this report at `benchmarks/throughput/bench_vllm.py`. It hits a vLLM-style streaming completions endpoint and reports TTFT, prefill t/s, and decode t/s. To re-run:

```bash
python3 benchmarks/throughput/bench_vllm.py 256 2048 16384 65536
```

Default endpoint is `http://127.0.0.1:18080/v1/completions` and model `gemma-4-31b` — change at the top of the file if your launch differs.
