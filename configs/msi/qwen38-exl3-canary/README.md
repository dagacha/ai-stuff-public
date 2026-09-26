# Qwen3.8 EXL3 canary

**Status:** `tc38-55-mtp-262k-vision` (ThinkingCap-Qwen3.8-27B, own EXL3 5.5bpw
conversion) PROMOTED to production 2026-09-24, replacing `55-mtp-262k-vision`
(base Qwen3.8-27B, production 2026-09-03 .. 2026-09-24). Same unit, kit, engine
and flags; only the checkpoint differs (`../serve-qwen38-exl3.sh`,
`../thinkingcap38-exl3/promote.sh` for flip/rollback of the runtime copy,
`benchmarks/lane-assessments/report-msi-thinkingcap-qwen3.8-27b.md`). The base
arm stays installed as the rollback. All other arms remain canaries on port
8102 — never run one while the production unit holds the GPU
(`systemctl --user stop qwen38-exl3.service` first).

This is an isolated port-8102 comparison of Qwen3.8-27B EXL3 targets with their
built-in MTP head or the 5.0-bpw DFlash2 companion drafter. It does not alter
the production 8100 bridge, `qwen38.service`, or `vllm.service`.

The engine is pinned to MiaAI-Lab/exllamav3 commit
`63b32f001d7b2cfed3b3e3aaf25f534ba53cc7ed`. The original 3.5-bpw arms use a
262144-token cache. The 5.5-bpw arms cover MTP at 262144 and DFlash2 at 131072
and 160000 tokens. All use NVFP4 KV, the same sampling, endpoint, and benchmark.

The launcher requires the deployment kit at
`C:/Users/<user>/dagacha/Qwen3.8-27B-DFlash2-EXL3-5.0bpw`. The checked-in patch
pins its expected base commit (`81ba06e`) and adds the request-level thinking
controls, penalties, streamed usage, served-model identity, and render/version
endpoints consumed by `benchmark_v2.py`. `prepare-kit.sh` applies that patch
idempotently. For a clean checkout at a newer revision, it fetches and checks
out the pinned commit in detached-HEAD mode before patching; it refuses to
change revisions when the kit has local changes. It then creates the native-WSL
venv and downloads the selected arm's checkpoints with `PREPARE_ONLY=1`; it
exits before loading the GPU.

Prepare each arm once while production remains live:

```bash
bash configs/msi/qwen38-exl3-canary/prepare-kit.sh 55-dflash2-160k
```

`run-arm.sh` then invokes the verified server directly so selecting an arm
cannot be overridden by the kit's `.env`. Both scripts honor
`QWEN38_EXL3_KIT` when the checkout is not at the default path.

## Manual operation

```bash
# stop whatever production unit holds the GPU (qwen38-exl3.service since
# 2026-09-03; the list lives in production-units.sh, do not hand-copy it)
source configs/msi/qwen38-exl3-canary/production-units.sh
ACTIVE=$(active_production_units); echo "stopping: $ACTIVE"
systemctl --user stop $ACTIVE
bash configs/msi/qwen38-exl3-canary/run-arm.sh 55-dflash2-160k
# in another shell:
bash configs/msi/qwen38-exl3-canary/benchmark-arm.sh 55-dflash2-160k
```

Stop the foreground server, repeat with another configured arm, then restore
the previously-active production service (`systemctl --user start $ACTIVE`).
Never run a canary concurrently with a production GPU service; the
`vision-*-run.sh` orchestrators do this stop/restore automatically.

Available arms are `mtp`, `dflash2`, `55-mtp-262k`,
`55-dflash2-131k`, `55-dflash2-160k`, `55-mtp-262k-vision`, and
`55-dflash2-160k-vision`.

## Vision

The EXL3 checkpoints ship the checkpoint's BF16 vision tower (333
`model.visual.*` tensors, 0.86 GiB on disk, ~1.2 GiB loaded). The patched
server exposes it behind `--vision` (`VISION=1` in an arm's `.env`): OpenAI
`image_url` content parts (base64 data URIs; http(s) URLs only when the
server is started with `--allow_image_urls`, which refuses loopback/private/
link-local destinations after DNS resolution and on redirects, and caps
downloads at `--max_image_mb` / `--max_image_mp`) are embedded by
the tower, the embedding alias is placed in the message text, and the
embeddings ride along with the generation job. Image tokens count toward
`prompt_tokens` (the 2.9 MP OCR image is 2,822 tokens, the 28 MP upscale
16,200 — the same counts vLLM's Qwen tokenizer produces). A server started
without `--vision` answers image requests with 400.

```bash
# stops production, serves the arm on 8102, runs the OpenAI-API checks,
# restores production
bash configs/msi/qwen38-exl3-canary/vision-arm-run.sh 55-mtp-262k-vision
```

`vision-check.py` is the API driver (native 2.9 MP, three 28 MP rounds with a
2K decode — the vLLM vision+MTP crash trigger — one streaming request, and a
two-image request). `vision-full-run.sh <arm>...` chains vision-check,
`benchmark-arm.sh`, and both tool-eval-bench suites per arm with production
stopped, restoring it on exit.
`vision-smoke.py` drives the engine directly without the server; it is how the
combination was first validated and is useful when bisecting engine issues.
Engine gotcha captured there: `Cache(...)` must use `max_batch_size=1` (the
kit's autosplit default). With the default 16 slots the recurrent-layer
states are allocated per slot × (draft history + 1), and the MTP history
alone pushed the load past the VRAM split.

The exact direct-launch path used by `run-arm.sh` was exercised for both MTP
and DFlash2 during the MSI benchmark. The launcher also checks that the patched
server exposes `--served_model_name` before attempting to load a model.

## Promotion gates

- Full and hard tool-eval scores regress by no more than two points.
- Existing tool calls, no-thinking, low-effort thinking, streaming usage, and
  client-supplied penalties remain observable end to end. Server defaults
  are no penalties; `frequency_penalty` above ~0.2 degenerates long
  generations on this engine (see the 2026-09-16 addendum in the lane report
  and `penalty-degeneration-check.py`).
- 131K and 196K needles pass; 262144 cache loads without CPU spill.
- Median decode improves at least 15%, and representative long multi-turn
  agent wall time does not regress.
- No engine crash, stuck generation, malformed SSE, or ignored cancellation.

Passing these gates justifies a switchable third lane. Production replacement
still requires the full tool-eval and VulcanBench promotion runs.

## 2026-09-01 outcome

The 5.5-bpw checkpoint is the useful option, but it does not pass the promotion
gate. MTP at 262K scored 91/63 full/Hard Mode at 198.5 decode tok/s. DFlash2 at
131K scored 91/63 at 232.6 tok/s; the 160K residency reached 223.1 tok/s with
4.5 GiB free. All measured long-context needles and code edits passed.

DFlash2 consistently omitted the required `body` argument from the deterministic
`send_email` call (10/12), including after a focused three-repetition retest.
Production remains 91/67 and has much faster long-prompt prefill. Do not replace
production or run VulcanBench from these results. Retain 5.5-bpw MTP as the
full-context canary and 5.5-bpw DFlash2 160K as the optional fast canary.

The 2026-09-01 assessment was text/tool-only; vision was added and validated
on 2026-09-02, see below.

## 2026-09-02 vision outcome

`55-mtp-262k-vision` (5.5-bpw + MTP + BF16 vision tower, 262144 NVFP4 cache)
loads in ~85 s at 26.3 GiB and passes the full OpenAI-API check: native
2.9 MP (2,854 prompt tokens, 1,019 out, 62 tok/s end to end), three 28 MP
rounds (16,232 prompt tokens, ~1.65K out each, 29.2 / 14.6 / 17.4 s end to
end — the first pays the embed + prefill, later rounds hit the embedding and
prompt caches), and a 28 MP streaming request; server healthy afterwards at
29.0 GiB. The transcription matches the source image, including the small
panel subtitles at 28 MP. Direct-engine runs measured 93–113 tok/s decode
with MTP on the 28 MP prompt and 53 tok/s without drafting.

That is the vision + speculative-decoding combination vLLM 0.24/0.26/nightly
crash on for this box (`serve-thinkingcap.sh` header), so this arm is the
only lane here that offers vision without giving up drafting.

### Full measurement (`vision-full-run.sh`, later on 2026-09-02)

Both vision arms through vision-check (now including a two-image request),
`benchmark-arm.sh`, and the same tool-eval-bench invocation as the text-only
arms (seed 42, temp 0.6, `reasoning_effort` low; full suite + Hard Mode ×3):

| Arm | Load | teb full / hard | Deterministic tools | Median decode | GPU after teb |
|---|---:|---:|---:|---:|---:|
| `55-mtp-262k` (text-only, 09-01) | — | 91 / 63 | 12 / 12 | 198.5 tok/s | 25.4 GiB |
| `55-mtp-262k-vision` | 80 s, 26.3 GiB | **90 / 63** | 12 / 12 | 198.4 tok/s | 29.1 GiB |
| `55-dflash2-160k` (text-only, 09-01) | — | 91 / 63 | 10 / 12 | 223.1 tok/s | 27.6 GiB |
| `55-dflash2-160k-vision` | 95 s, 28.5 GiB | **91 / 63** | 10 / 12 | 241.8 tok/s | **31.4 GiB** |

- **Tool-eval with the tower loaded is unchanged.** The MTP arm's 91→90 is
  two multi-turn planning scenarios (TC-50, TC-51) moving pass→partial; the
  tower is not on the text path, and the EXL3 lane is not bit-reproducible
  across runs, so this is run-to-run noise. Hard Mode is identical on both
  arms. Decode throughput is identical to text-only.
- **Vision + DFlash2 works**: same five vision requests pass (2.9 MP 12.8 s;
  28 MP 30.2 / 19.1 / 18.0 s; streaming 5.3 s) and the multi-image answer is
  correct. The known DFlash2 `send_email` required-argument miss (10/12)
  persists — it is a DFlash2 property, not a vision one.
- **Multi-image prompts work**: two images in one user turn (the OCR
  screenshot + `benchmarks/vulcanbench/images/vulcanbench-v3-table.png`, 4,899 prompt
  tokens) — both described correctly and the largest table value (1,672K)
  read correctly, on both arms.
- **VRAM caution for DFlash2 + vision at 160K:** after the teb suites the
  process sat at 31.4 GiB of 32 — the tower (+1.2 GiB) consumed most of the
  headroom the text-only 160K arm had. It did not fail, but treat 160K as
  the ceiling; 131K is the comfortable vision + DFlash2 residency. The MTP
  arm keeps ~3 GiB free at 262K.

### Long context and tool turns (`vision-context-check.py`, 2026-09-03, `55-mtp-262k-vision`)

`CHECK_SCRIPT=vision-context-check.py bash vision-arm-run.sh 55-mtp-262k-vision`

| Request | Prompt tokens | End to end | Headline read | Planted fact recalled |
|---|---:|---:|---|---|
| ~34K text, then image | 33,898 | 21.1 s | yes | yes |
| image, then ~31K text | 33,898 | 16.9 s | yes | yes |
| ~78K text, then image | 80,766 | 58.1 s | yes | yes |
| image, then ~78K text | 80,766 | 59.0 s | yes | yes |

The image is the 2.9 MP OCR screenshot (2,822 tokens); the filler carries a
planted key at 50% depth and the question asks for both the post's first
sentence and the key, so each pass proves text and image were both read.
Both orderings work, including the image buried under ~78K tokens of text.
End-to-end time is prefill-bound (~1.4K tok/s on this lane).

Tool turns, tools `get_screenshot(name)` + `send_email(to, subject, body)`:
turn 1 calls `get_screenshot` (both variants); the screenshot then arrives
either as an `image_url` part inside the `tool` message (3,304 prompt
tokens) or in a follow-up user message (3,330). In both variants turn 2
calls `send_email` with the headline quoted verbatim in `body`
("ThinkingCap + FP8 quantization + MTP decoding runs 5–7× faster than the
original Qwen 3.6 27B on the same tasks!"), en-dash and × included. So the
server's content-part flattening also works for `role: tool` messages, and
vision does not disturb tool selection or argument construction.
