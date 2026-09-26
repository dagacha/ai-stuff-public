# ThinkingCap-Qwen3.8-27B assessment and promotion (MSI)

Date: 2026-09-23 / 2026-09-24

## Decision

**Promoted to production 2026-09-24 16:03** as `tc38-55-mtp-262k-vision` on
`qwen38-exl3.service`: `bottlecapai/ThinkingCap-Qwen3.8-27B` converted to EXL3
5.5 bpw on this box, served with the same exllamav3 fork, deployment kit, MTP
drafting, BF16 vision tower and 262,144-token NVFP4 KV cache as the base
Qwen3.8-27B lane it replaced. Only the checkpoint changed. Rollback is the base
arm env (`55-mtp-262k-vision.env`); the runtime launcher backup is
`serve-qwen38-exl3.sh.bak-pre-thinkingcap`.

The tool-eval suite alone would have rejected this model (87-88 vs 90-91 full
suite at low effort). It was promoted because the operator runs
`reasoning_effort: xhigh`, and at xhigh on realistic coding prompts the base
model does not finish a turn under a 20K-token cap while ThinkingCap does.

## The model

- Brief-thinking RL finetune of Qwen3.8-27B by bottlecapai. Card claims 37%
  fewer reasoning tokens at xhigh for <1 pp accuracy. Vision retained.
- All official repos are HF-gated (manual approval). License: PolyForm Small
  Business 1.0.0 + personal-use grant (not Apache).
- Quant variants used: `ThinkingCap-Qwen3.8-27B-NVFP4A4-AWQ` (W4A4 + FP8 mixed,
  MTP head and vision in BF16, 22 GB) for the vLLM canary; the BF16 release
  (53 GB, 18 shards) for the EXL3 conversion.

## Stage 1: vLLM TurboQuant lane canary (2026-09-23 night)

Identical recipe to `serve-qwen38.sh` (vLLM 0.27.1, TurboQuant 4-bit KV, 262K,
MTP-3, temp 0.6, low effort, seed 42). The card says vLLM 0.29; 0.27.1 loads
it fine, MTP head detected, 281K KV tokens.

| Run | Full | Hard Mode (3 trials) | Safety |
|---|---:|---:|---|
| Base Qwen3.8 NVFP4 (lane baseline) | 91 | 67 | TC-34 CRITICAL |
| ThinkingCap NVFP4A4-AWQ | 87 | 67 | clean |

Full-suite losses vs baseline: TC-30, 47, 55, 61, 62 (multi-step agentic). It
passed TC-34 (prompt injection) once here; that did not reproduce later.

## Stage 2: sampler / effort sweep (2026-09-24 morning)

One server load, per-request sampler and effort, same suite.

| Arm | Full | Hard Mode | Safety | Completion tokens (full) | Wall (full) |
|---|---:|---:|---|---:|---:|
| Base 0.6 low | 91 | 67 | TC-34 | 16.1K | 410 s |
| Base 0.6 xhigh | 91 | 63 | TC-34 | 24.2K | 575 s |
| TC 0.6 low | 87 | 67 | clean | 14.3K | 484 s |
| TC 1.0 xhigh (card recipe) | 86 | 63 | TC-34, TC-58 CRITICAL | 22.2K | 669 s |
| TC 1.0 low | 84 | 70 | TC-34, TC-35 | 15.9K | 504 s |
| TC 0.6 xhigh | 91 | 63 | TC-34 | 18.7K | 552 s |

Findings: temperature 1.0 (the card's recommendation) costs 5-7 full-suite
points and adds safety CRITICALs on tool calling; keep 0.6. At xhigh,
ThinkingCap ties the base on both scores with 23% fewer tokens. Token savings
on this suite are 8-23%, never the card's 37%, because the turns are short.
Per-token decode on the vLLM lane is ~5% slower than the base.

## Stage 3: realistic xhigh A/B on the vLLM lane (2026-09-24 midday)

Four prompts built from real repo files (crash-loop diagnosis with the actual
launcher, `switch-lane.sh` feature work, a stdlib HTTP proxy for the bridge,
and interpreting the sweep table). xhigh, temp 0.6, seed 42, 20,480-token cap.

| Prompt | Base Qwen3.8 | ThinkingCap |
|---|---|---|
| Diagnose crash loop | capped, no answer (genuine reasoning, had found the cause) | 17.3K tokens, 361 s, correct |
| switch-lane dry-run | capped, repetition loop | 7.0K tokens, 139 s, sound |
| Bridge proxy | capped, no answer | capped, repetition loop |
| Sweep analysis | capped, no answer | 14.7K tokens, 310 s, high quality |
| Total | 0/4 finished, 81.9K tokens, 1582 s | 3/4 finished, 59.5K tokens, 1202 s |

Both models can fall into the known "Need maybe if ... Good." loop on long
generations (one each here). Client-side presence penalty and the 32K cap
remain the guard.

## Stage 4: EXL3 conversion and validation on the production kit

Conversion (`configs/msi/thinkingcap38-exl3/convert-run.sh`): 70 min on the
RTX 5090, 20 GB output. Recipe matches the TelperionAI production checkpoint
(bits 5.5, head 6, MTP 4, vision BF16, mul1, out_scales always, calibration
250x2048) minus their AWQ smoothing pre-pass. Layers landed at 6.0 bpw with the
middle block at 5.3, SQNR 42-57 dB.

Validation (`validate-run.sh`, port 8102, prod kit, MTP + vision, 262K):

| Check | ThinkingCap EXL3 | Base EXL3 (production 09-03 .. 09-24) |
|---|---:|---:|
| Vision check (28 MP x3 + multi-image, healthy after) | PASS | PASS |
| tool-eval full, low | 88 | 90 |
| tool-eval Hard Mode, low | 63 | 63 |
| Responsiveness sub-score | 79 | 80 |
| Safety | TC-35 warning | clean |
| VRAM after load | 26.4 GiB | 26.3 GiB |

Realistic xhigh prompts on EXL3 (same four, 20,480 cap): decode 83-88 tok/s
(vLLM lane: 47-52); crash-loop diagnosis finished in 13.0K tokens / 148 s and
was correct; sweep analysis 17.9K / 210 s; the other two ran past the cap in
genuine, non-repeating deliberation (repetition rate 0.01). Total wall 844 s vs
1202 s for the same model on vLLM. Note: on cap the kit returns unclosed
thinking as `content`, not `reasoning_content`.

## Stage 5: post-promotion battery on live production (2026-09-24 evening)

Everything the base-lane promotions ran, executed against the live 8100 bridge
with no lane switch (`configs/msi/thinkingcap38-exl3/post/quick-run.sh`,
`vulcan-run.sh`).

| Check | ThinkingCap prod | Base EXL3 (09-03) |
|---|---:|---:|
| benchmark_v2 needles 8K / 65K / 131K / 196K | 4/4 | 4/4 |
| benchmark_v2 code edits 65K / 131K | 2/2 | 2/2 |
| benchmark_v2 deterministic tools | 12/12 | 12/12 |
| benchmark_v2 median decode, 400-token probe | 197.1 tok/s | 198.5 tok/s |
| vision-context-check (image after 100K text x2, image in tool turns x4) | 6/6 PASS | PASS |
| penalty-degeneration-check | identical: freq 0 clean, 0.5 / 1.0 soup | same |
| tool-eval v2.5.1 **xhigh** full / Hard Mode | **92** / 57 | not measured on EXL3 |
| tool-eval v2.5.1 low full / Hard Mode | 88 / 63 | 90 / 63 |

The xhigh full-suite 92 is the highest recorded on this box. The xhigh Hard
Mode 57 vs 63 at low is the same three structural fails (TC-72/80/83) plus one
failed trial of TC-75 and partials on TC-73/74/76/84; mean 6 s per scenario, so
it is not a loop effect. The EXL3 lane is not bit-reproducible, so this wants a
second 3-trial run before being called a regression.

**VulcanBench** (v0.6.0 bc85af6, `--no-judges`, Docker sandbox, concurrency 1,
harness temperature 0, kit default effort low; same as the 2026-08-17/18 base
runs on the vLLM lane):

| Suite | ThinkingCap prod | Base Qwen3.8 (vLLM lane, Aug) |
|---|---:|---:|
| v1 (52) | **51** / 52, mean 0.894, 46 min | 50 / 52, 0.871, 76 min |
| v1-carbyne (22) | **19** / 22, 0.859, 10 min | 18 / 22, 0.817, 15 min |
| v3 frontier-hard (23) | **16** / 23, 0.591, 102 min | 13 / 23, 0.502, 137 min |

v3 gained hono-client-header-merge, jiff-strftime-negpad, sqlglot-iso8601-nanos
and zod-invert-codec; lost sqlglot-qualify-lateral-star (72 steps, ended with a
short no-tool reply); six tasks fail on both. On the hardest failures the model
spends the whole 16K-token step budget deliberating at greedy temperature
(genuine reasoning, repetition rate 0.00-0.02, no tool call), which is the
failure shape to watch for on this finetune.

**Harness gotcha found on the way:** the EXL3 kit's `serve_openai.py` defaults
`max_tokens` to 1024 when the client sends none. VulcanBench's chat-completions
path sends none, so the first attempt was invalid: every failure was a step cut
at exactly 1019 tokens mid-sentence with no tool call (v1 41/49 at that point;
runs archived in `~/VulcanBench/runs-invalid-20260924-cap1024`). The base runs
never hit this because they were on the vLLM lane. Fix: apply
`benchmarks/vulcanbench/patches/vulcanbench-bc85af6-openai-extra-payload.patch`
(it was not applied on the MSI) and run with
`VULCANBENCH_OPENAI_EXTRA_PAYLOAD='{"max_tokens":16000}'`. Any new client that
omits `max_tokens` gets the same 1024 cap; the Pi sends its own.

## Operational notes

- Client `max_tokens` should be 32K: at xhigh this model legitimately thinks
  past 20K on hard prompts.
- The checkpoint lives on the ext4 home volume
  (`/home/<user>/models/bottlecapai/ThinkingCap-Qwen3.8-27B-EXL3-5.5bpw`);
  the launcher now accepts an absolute `MODEL_DIR`.
- Converter gotchas (all handled in `thinkingcap38-exl3/`): the pip-from-git
  exllamav3 install ships no `standard_cal_data/*.utf8` (fetch-cal.sh);
  `python -m exllamav3.conversion.convert_model` has no main guard
  (convert.py wrapper); HF downloads from a `wsl.exe` session die with the
  session and can stall mid-shard (run under `systemd-run --user`).
- A vLLM canary bound to `--host 127.0.0.1` is unreachable even from inside
  WSL in mirrored mode; bind 0.0.0.0 and use the 192.168.x LAN IP.
- Incident 2026-09-24 00:18: prod failed to restore after the first canary
  because the sourced arm `.env` had gone CRLF on 2026-09-16 (hidden `\r` in
  `VENV_DIR`). `.gitattributes` now pins `*.env` and `*.patch` to LF.

## Artifacts

- Scripts: `configs/msi/thinkingcap38-exl3/` (vLLM canary, sweep, A/B,
  conversion, validation, promote/rollback).
- Result JSONs on the MSI: `~/runs/tc38-*.json`, `~/runs/tc38-ab-*.json`,
  `~/runs/tc38-exl3-*.json`, converter log `~/runs/tc38-convert.log`.
