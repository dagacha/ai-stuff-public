# GLM-5.2 on a DGX Spark cluster (2–3 boxes)

> **Update 2026-08-28:** GLM-5.3-Flash now actually runs on the 2-Spark rig
> at 4 bpw EXL3 under vLLM (27 tok/s prose / 66 tok/s structured, 800k ctx) —
> see [`glm-5.3-flash-exl3.md`](glm-5.3-flash-exl3.md). The analysis below
> (GLM-5.2, llama.cpp GGUF, 1–3 bit) is kept for the sizing method only.

Feasibility notes for running **GLM-5.2** (Z.ai, 744B params / 40B active MoE,
1M context) on linked **DGX Spark** boxes. The current rig is **2 Sparks**;
this doc also covers what a **3rd Spark** would change (short version: unlocks a
higher quality tier, does **not** add speed). Conclusion up front, then the
memory math, run recipe, and honest caveats. This is a desk-analysis from the
Unsloth docs page (`https://unsloth.ai/docs/models/glm-5.2`) — nothing here has
been measured on the Sparks yet.

## TL;DR

- A **single** Spark (128 GB unified) **cannot** fit GLM-5.2 at any quant.
- **2 Sparks (256 GB pool):** fits **1-bit** comfortably and **2-bit** only
  barely. Nothing higher. **Recommended: `UD-IQ1_S` (1-bit, 217 GB).**
- **3 Sparks (384 GB pool):** unlocks **3-bit** with comfortable headroom, and
  the low end of **4-bit** barely. **Recommended: 3-bit.** This is the main
  payoff of adding a 3rd box — you jump from *"usable but visibly degraded"* to
  *"approaching full quality."*
- **Adding a 3rd Spark does NOT improve speed** — the workload is
  memory-bandwidth-bound (~273 GB/s per node, unchanged), and a 3rd node adds an
  RPC hop + cross-node expert fetches. Expect the same single-digit tok/s,
  possibly marginally lower, but at much higher quality per token.
- Either way expect **memory-bandwidth-bound single-digit tok/s** — fine for
  agentic / coding / reasoning, not for bulk generation. Only the 40B active set
  moves per token, which is the saving grace.

## Hardware context

| | per Spark | 2-Spark cluster | 3-Spark cluster |
|---|---|---|---|
| SoC | NVIDIA GB10 Grace Blackwell | — | — |
| Unified memory | 128 GB LPDDR5x | **256 GB** (linked via ConnectX) | **384 GB** |
| Mem bandwidth | ~273 GB/s | still ~273 GB/s *per node* | still ~273 GB/s *per node* |
| GPU compute | Blackwell, CUDA-capable | 2× | 3× |

There is **no unified memory fabric across nodes** — each Spark is its own 128 GB
pool at ~273 GB/s; linking only lets the model *span* them (over ConnectX /
llama.cpp RPC), it does not pool their bandwidth. This matters a lot for
latency (see [Expected performance](#expected-performance-estimate-not-measured)).

The "link two Sparks for up to 240B-param models" marketing line is a rough
guide at full-ish precision. GLM-5.2 only fits because Unsloth's extreme dynamic
GGUFs shrink a 744B model into a 217–360 GB footprint. On 2 Sparks the 1–2-bit
quants land inside 256 GB; on 3 Sparks the 1–3-bit quants (and the low end of
4-bit) land inside 384 GB. At 5-bit+ the model outgrows both.

## Memory math

Unsloth's stated total-memory requirements (RAM + VRAM / unified) vs. the
cluster's 256 GB ceiling:

| Quant | File size | Memory needed | 1 Spark (128 GB) | 2 Sparks (256 GB) | 3 Sparks (384 GB) |
|---|---|---|---|---|---|
| **1-bit `UD-IQ1_S`** | 217 GB | 223 GB | ❌ | ✅ comfortable (~33 GB) | ✅ huge (~161 GB) |
| **2-bit `UD-IQ2_M`** | 239 GB | 245 GB | ❌ | ⚠️ tight (~11 GB) | ✅ comfortable (~139 GB) |
| **3-bit** | — | 290–360 GB | ❌ | ❌ | ✅ fits (~24–94 GB) |
| 4-bit | — | 372–475 GB | ❌ | ❌ | ⚠️ borderline (low end only, ~12 GB) |
| 5-bit | — | 570 GB | ❌ | ❌ | ❌ |
| 8-bit | — | 810 GB | ❌ | ❌ | ❌ |

### Recommended quant by cluster size

| Cluster | Recommended quant | File | Headroom | Why |
|---|---|---|---|---|
| 1 Spark (128 GB) | — (none fit) | — | — | GLM-5.2 is unreachable on a single box |
| 2 Sparks (256 GB) | **1-bit `UD-IQ1_S`** | 217 GB | ~33 GB | 2-bit also fits but only ~11 GB free → starved context |
| 3 Sparks (384 GB) | **3-bit** | — | ~24–94 GB | Interpolating Unsloth's trend, the start of the good-quality region; big jump over 1-bit |

**On 2 Sparks, pick 1-bit.** 2-bit (UD-IQ2_M) technically fits but leaves almost
no room for KV cache + activations, forcing you to a tiny context. 1-bit keeps
~33 GB free, enough to run a real context window once you add KV-cache
quantization (see below).

**On 3 Sparks, pick 3-bit.** This is the start of the good-quality region in
Unsloth's KLD analysis (the "larger uplift from 4-bit onward" — 3-bit is its
leading edge). You also get ample headroom, so you can relax KV-cache
quantization to `q8_0`/`f16` for higher-quality attention and still hold a large
context. 4-bit is reachable but only at its low end (~12 GB free — tighter than
2-bit was on 2 Sparks), so treat 3-bit as the practical ceiling, the same way
1-bit was on 2 Sparks.

### Accuracy at extreme quant (Unsloth's own numbers)

| Quant | Approx top-1 accuracy | Size reduction |
|---|---|---|
| 1-bit | ~76% | −86% |
| 2-bit | ~82% | −84% |
| 4-bit (UD-Q4_K_XL) | "generally lossless" | smaller |

Unsloth's qualitative claim: even at 1-bit the model "works well" on the mean
KLD trend, with a larger uplift from 4-bit onward for out-of-distribution tasks.

## 2-Spark vs 3-Spark: what a 3rd box actually changes

The short version: a 3rd Spark **unlocks a higher quality tier (1-bit → 3-bit)**
and removes the memory-pressure caveats — but it does **not** make generation
faster, and may even be slightly slower per token.

1. **Quality tier jump — this is the headline reason to add a 3rd box.** Moving
   from 1-bit (~76% top-1) to 3-bit (leading edge of the lossless-ish region) is
   the single biggest change. You go from "usable but visibly degraded" to
   "approaching full quality." If 1-bit output quality is what's bugging you, the
   3rd box is exactly the fix.

2. **KV cache / context gets cheap.** On 2 Sparks at 1-bit you're forced into
   `q4_1` KV quant just to have a context window. On 3 Sparks at 3-bit you have
   24–94 GB free — you can run `f16` or `q8_0` KV (higher-quality attention) and
   still hold a large context, and you can raise `-np` for real concurrency.

3. **Latency does NOT improve — and may get slightly worse.** This is the
   non-obvious part. The workload is **memory-bandwidth-bound**, and each Spark
   is still ~273 GB/s. Adding a 3rd node:
   - does not increase per-node bandwidth,
   - adds a 3rd RPC hop in the llama.cpp RPC topology (driver + 2 workers), and
   - for MoE, the 40B active experts route dynamically per token, so they won't
     all sit locally on any one node — you still pay cross-node fetches.

   Expect **the same single-digit tok/s, possibly marginally lower**, but at
   much higher quality per token. If the pain point is "too slow," a 3rd Spark
   is **not** the fix — renting a B200 / DGX-Station-class box is. If the pain
   point is "1-bit quality isn't good enough," the 3rd Spark is exactly the fix.

4. **4-bit becomes technically reachable but not advisable.** Only the low end
   (~372 GB) squeaks into 384 GB with ~12 GB left — less headroom than 2-bit had
   on 2 Sparks. Treat 3-bit as the practical ceiling on 3 Sparks.

### The actual decision

A 3rd Spark is real money (≈$4K). The question is: **is moving from 1-bit to
3-bit quality worth it to you, given you won't get more speed?**

- If GLM-5.2 is your daily-driver local model and 1-bit output quality bugs you
  → **yes, worth it.**
- If you only occasionally need top quality → **no**; stay on 2 Sparks at 1/2-bit
  for everyday agentic + coding work, and rent a big box for the rare 4-bit+ job.

## How to run it

### Option A — Unsloth Studio (easiest, recommended first)

Auto-detects multi-GPU / multi-node and offloads to RAM. Search "GLM-5.2",
pick the quant for your cluster size — `UD-IQ1_S` on 2 Sparks, 3-bit on 3 Sparks
(see [Recommended quant by cluster size](#recommended-quant-by-cluster-size)).

```bash
# install
curl -fsSL https://unsloth.ai/install.sh | sh

# launch
unsloth studio -H 0.0.0.0 -p 8888
# secure variant over HTTPS via Cloudflare tunnel:
unsloth studio --secure
```

Then open `http://127.0.0.1:8888`, search GLM-5.2, pick the quant, run. Inference
params (temp / top-p / thinking mode) are auto-set but editable.

### Option B — llama.cpp over RPC (span both nodes)

llama.cpp spans the two Sparks with its **RPC backend**: run
`llama-rpc-server` on the second box and point `llama-cli`/`llama-server` on the
first at it.

```bash
# 1. build on each Spark (GB10 is Blackwell, CUDA-capable — set arch to match,
#    confirm with nvidia-smi; cmake auto-promotes 120 -> 120a for Blackwell)
git clone https://github.com/ggml-org/llama.cpp
cmake llama.cpp -B llama.cpp/build \
  -DBUILD_SHARED_LIBS=OFF -DGGML_CUDA=ON -DCMAKE_CUDA_ARCHITECTURES=120
cmake --build llama.cpp/build --config Release -j --clean-first \
  --target llama-cli llama-server llama-rpc-server llama-gguf-split
cp llama.cpp/build/bin/llama-* llama.cpp

# 2. download the 1-bit quant (manual download is much faster than llama -hf)
hf download unsloth/GLM-5.2-GGUF \
  --local-dir unsloth/GLM-5.2-GGUF \
  --include "*UD-IQ1_S*"
# (use "*UD-IQ2_M*" for 2-bit, "*UD-Q8_K_XL*" for near full precision)

# 3. on Spark #2 — start the RPC worker (holds its share of the weights)
./llama.cpp/llama-rpc-server --host 0.0.0.0 --port 50052 \
  --memory 110000   # MiB reserved on this node; tune to leave OS headroom

# 4. on Spark #1 — drive the model, offloading the rest here + via RPC
./llama.cpp/llama-server \
  --model unsloth/GLM-5.2-GGUF/UD-IQ1_S/GLM-5.2-UD-IQ1_S-00001-of-00006.gguf \
  --rpc 100.x.y.z:50052 \
  -ngl 99 -c 16384 -fa on --host 127.0.0.1 --port 8080 \
  --temp 1.0 --top-p 0.95 --min-p 0.01 \
  --cache-type-k q4_1 --cache-type-v q4_1
```

> ⚠️ The exact `--rpc` split, per-node `-ngl`/`--memory`, and whether `-ngl 99`
> should be set on the driver vs. worker **has not been validated here** —
> llama.cpp RPC layer-splitting across two memory-pooled nodes needs a real test
> before this is treated as a working recipe. Treat the snippet above as a
> starting point, not a proven config.
>
> **Scaling to 3 Sparks:** a 3rd node is just another `llama-rpc-server` worker;
> the driver's `--rpc` flag takes a comma-separated host:port list (e.g.
> `--rpc 100.x.y.z:50052,100.x.y.w:50053`). Per-worker `--memory` must be
> retuned so the three shares cover the (larger, e.g. 3-bit) model with
> headroom.

## Recommended inference settings

- **Sampling:** `--temp 1.0 --top-p 0.95 --min-p 0.01` (Unsloth default for most
  tasks). For SWE-Bench-style coding they suggest `temp 1.0 / top_p 1.0`.
- **Thinking mode:** GLM-5.2 has 3 modes — non-thinking, High, Max. Use **Max**
  for hard tasks. Toggle off with `--reasoning off` or
  `--chat-template-kwargs '{"enable_thinking":false}'`.
- **KV-cache quantization (important here on 2 Sparks):** with memory nearly
  full at 1-bit, use `--cache-type-k q4_1 --cache-type-v q4_1` (~5 bits/weight,
  ~3.2× longer context vs `f16`). `q4_0` is ~4.5 bits → ~3.5×. This is the single
  biggest lever for getting usable context out of a 1-bit load. **On 3 Sparks at
  3-bit you have enough headroom to relax this to `q8_0` or even `f16`** for
  higher-quality attention.
- **Max context:** 1,048,576 tokens native — but you will be memory-limited long
  before that.

## Expected performance (estimate, not measured)

- **Bottleneck = memory bandwidth**, not compute. The cluster moves a 217 GB
  1-bit model over ~273 GB/s per node. Even with only 40B active params per
  token, the active expert weights still have to be fetched from where they sit
  in the pool.
- Realistic ballpark: **low single digits tok/s**. Possibly a few tok/s with a
  lucky expert-locality + KV-cache fit. **Not measured** — log the actual
  `predicted_per_second` from `/v1/chat/completions` timings and update this doc.
- **Adding a 3rd Spark does not raise this number** (see
  [2-Spark vs 3-Spark](#2-spark-vs-3-spark-what-a-3rd-box-actually-changes)) —
  it's bandwidth-bound, plus an extra RPC hop. It buys quality, not speed.
- This is the right workload class (agentic / coding / reasoning, where latency
  per *decision* matters more than tokens/sec) and the wrong one for bulk
  throughput. For long unsupervised generation, rent a bigger box.

## Caveats & unknowns

- **"Fits in memory" ≠ "fast."** Correctness at 1-bit is well-supported by
  Unsloth's demo + KLD analysis; latency on a 128 GB/node box is the real
  question and is unmeasured here.
- **Multi-node RPC is fiddly.** llama.cpp's RPC backend works, but the layer /
  memory split across two separately-addressed nodes (vs. one big unified pool
  like a Mac) needs validation before relying on it. Unsloth Studio's
  auto-offload may paper over this more cleanly.
- **GB10 CUDA arch:** confirmed Blackwell / CUDA-capable, but confirm the exact
  `-DCMAKE_CUDA_ARCHITECTURES` value via `nvcc`/`nvidia-smi` before the first
  build (the MSI box needed `120`, auto-promoted to `120a`).
- **Higher quants need a bigger box.** On 2 Sparks the ceiling is 2-bit; on 3
  Sparks it's 3-bit (4-bit only at its low end, not advisable). 5-bit+ is out of
  reach of any Spark cluster and requires a DGX Station / B200-class rig. If max
  quality matters beyond 3-bit, the Sparks are the wrong target.

## Provenance of the "1-bit works" claim

Unsloth's page ships a live demo: step 5 of the llama.cpp tutorial prompts GLM-5.2
to build a Flappy-Bird game and embeds the full output ("Full game in HTML",
"Full conversation"). The caption under it reads *"Reminder this was a 1-bit
quantization and it worked well!"* — which is the basis for the 1-bit-usability
claim above.

Note the page is internally inconsistent about which quant that demo used: the
section intro and the `llama-cli` command both point at the **2-bit UD-IQ2_M**
run, while the author caption says **1-bit**. Most likely the demo was captured
at 1-bit and the generic 2-bit command template was pasted around it. Either
way, the takeaway (an extreme 1–2-bit load of this 744B MoE produced a complete,
working, sound-enabled game) holds.

## Source

- Primary: `https://unsloth.ai/docs/models/glm-5.2` (GLM-5.2 — How to Run
  Locally; memory table, quant analysis, demo, llama.cpp recipe).
- Model weights: `unsloth/GLM-5.2-GGUF` on HuggingFace (quants `UD-IQ1_S`,
  `UD-IQ2_M`, …).
