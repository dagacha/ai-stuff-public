# Coding Task Benchmarks — Local llama.cpp Models

**Status:** active — verified 2026-09-02

Benchmarks of local MoE GGUF models on two real-world coding tasks:
- **Task A** — generate a thread-safe LRU cache from scratch (18 automated tests in `shared/test_lru.py`)
- **Task B** — identify 4 planted bugs in an async job queue (`shared/buggy_queue.py`)

**Hardware:** Bosgame M5 — Ryzen AI Max+ 395, Radeon 8060S (RDNA 3.5), 128 GB unified RAM  
**Backend:** llama.cpp b8672, Vulkan — flash-attn on, 4 parallel slots

---

## Results at a Glance

| Model | Task A | Task B | Decode | Prefill | Report |
|---|---|---|---|---|---|
| **Gemma 4 26B-A4B** (Q4_K_XL) | 18/18 ✅ | **4/4** ✅ | ~43 tok/s | ~930 tok/s | [↗](./gemma-4-26B-A4B/report.md) |
| **Qwen3.5-35B-A3B** (Q4_K_XL) | 18/18 ✅ | 3/4 + 1 bonus 🎁 | ~55 tok/s | ~720 tok/s | [↗](./qwen3.5-35B-A3B/report.md) |
| **Qwen3.6-35B-A3B** (Q4_K_XL) | 18/18 ✅ | 3/4 ⚠️ | ~57 tok/s | **~930 tok/s** 🥇 | [↗](./qwen3.6-35B-A3B/report.md) |
| **Nemotron-3-Nano-30B-A3B** (Q4_K_M) | 16/18 ⚠️ | 2.5/4 ⚠️ | **~65 tok/s** 🥇 | ~712 tok/s | [↗](./nemotron-3-nano-30B-A3B/report.md) |

> **Additional run (different hardware):** Gemma 4 26B-A4B was also evaluated as
> `unsloth/gemma-4-26b-a4b-it-UD-MLX-4bit` (MLX 4-bit) served from a Mac over a
> LAN endpoint (`http://100.<tailscale-ip-2>:8080/v1`), scoring **18/18** on Task A and
> **4/4** on Task B (2026-04-19) — see
> [`gemma-4-26B-A4B-local-endpoint/report-local-endpoint.md`](./gemma-4-26B-A4B-local-endpoint/report-local-endpoint.md).
> It is not part of the table above, which is a single-hardware (Bosgame M5 /
> llama.cpp) comparison.

---

## Head-to-Head

### Correctness

| Dimension | Gemma 4 | Qwen3.5 | Qwen3.6 | Nemotron |
|---|---|---|---|---|
| Task A — LRU correctness | **18/18** | **18/18** | **18/18** | 16/18 |
| Task A — completion tokens | 1,552 | 630 | **292** 🥇 | 670 |
| Task B — planted bugs found | **4/4** | 3/4 | 3/4 | 2/4 |
| Task B — bonus bugs found[^bonus] | — | ✅ real bug | ❌ dismissed | — |
| Backoff off-by-one detection | ⚠️ hedged | ❌ missed | ❌ missed | ❌ not fixed |

### Speed

| Dimension | Gemma 4 | Qwen3.5 | Qwen3.6 | Nemotron |
|---|---|---|---|---|
| Decode (tok/s) | ~43 | ~55 | ~57 | **~65** 🥇 |
| Prefill (tok/s) | ~930 | ~720 | **~930** 🥇 | ~712 |
| Model size on disk | 15.92 GB | 22.2 GB | **20.82 GB** | — |

### Qwen3.5 vs Qwen3.6 (direct comparison)

| | Qwen3.5 | Qwen3.6 | Delta |
|---|---|---|---|
| Task A tokens | 630 | **292** | **−54%** |
| Decode | ~55 tok/s | ~57 tok/s | +4% |
| Prefill | ~720 tok/s | **~930 tok/s** | **+29%** |
| File size | 22.2 GB | **20.82 GB** | −6% |
| Task B bonus bug | ✅ found | ❌ dismissed | regression |
| Verbosity | Low | Higher | regression |

---

## Rankings

| Category | 🥇 | 🥈 | 🥉 | 4th |
|---|---|---|---|---|
| Code generation correctness | Gemma 4 = Qwen3.5 = Qwen3.6 | — | — | Nemotron |
| Debugging accuracy | Gemma 4 | Qwen3.5 ≈ Qwen3.6 | — | Nemotron |
| Decode throughput | Nemotron | Qwen3.6 | Qwen3.5 | Gemma 4 |
| Prefill throughput | Gemma 4 ≈ Qwen3.6 | — | Qwen3.5 ≈ Nemotron | — |
| Token efficiency (Task A) | Qwen3.6 | Qwen3.5 | Nemotron | Gemma 4 |

---

## Recommendations by Use Case

- **Interactive coding assistant** — **Qwen3.6**. Best overall balance: correct code in fewest tokens, fast decode (~57 tok/s), and excellent prefill. Upgrade from Qwen3.5 with smaller file size.
- **Long-prompt / RAG** — **Gemma 4 or Qwen3.6** (tied on prefill ~930 tok/s). Gemma wins on debugging thoroughness; Qwen3.6 wins on token efficiency.
- **High-throughput batch generation** — **Nemotron**. Fastest decode at ~65 tok/s, but verify output: most error-prone of the four.
- **Deepest debugging** — **Gemma 4**. Only model to catch all 4 planted bugs.
- **Pair any with a second pass** for debugging tasks involving subtle numeric off-by-ones — none of the four models reliably caught the backoff bug on first try.

---

## Notes on Reproducing

All models default to thinking-token mode (`reasoning_content`). Without disabling, the full `max_tokens` budget can be consumed by silent reasoning before any visible output. Pass in the request body:

```json
{ "chat_template_kwargs": { "enable_thinking": false } }
```

Qwen3.6 is a vision model (requires `--mmproj mmproj-F16.gguf`) but vision features were not used in these tasks.

Also: llama.cpp's `--flash-attn` flag needs a value (`on`/`off`/`auto`) in recent builds.

[^bonus]: The bonus bug was an unplanted `task_done()` called on `asyncio.TimeoutError` in the worker loop — a genuine async bug where `task_done()` fires in a `finally` block even when no item was dequeued, causing the internal counter to go negative. See [qwen3.5-35B-A3B/task_b.md](./qwen3.5-35B-A3B/task_b.md#the-bonus-bug) for details.

---

## Layout

```
benchmarks/coding-tasks/
├── README.md                              (this file)
├── task_b_analysis.md                     (Task B model output + analysis, Gemma 4)
├── task_b_output.md                       (Task B bug-analysis output)
├── task_b_full_output.md                  (Task B full model output)
├── shared/
│   ├── test_lru.py                        (18-test harness for Task A)
│   ├── buggy_queue.py                     (Task B input with planted bugs)
│   └── lru_generated.py                   (generated artifact test_lru.py imports)
├── gemma-4-26B-A4B/
│   ├── task_a.md, task_b.md, report.md
├── gemma-4-26B-A4B-local-endpoint/
│   └── report-local-endpoint.md           (MLX 4-bit run via LAN endpoint)
├── qwen3.5-35B-A3B/
│   ├── task_a.md, task_b.md, report.md
├── qwen3.6-35B-A3B/
│   ├── task_a.md, task_b.md, report.md
└── nemotron-3-nano-30B-A3B/
    ├── task_a.md, task_b.md, report.md
```
