# Qwen3.8-27B EXL3 / DFlash2 assessment (MSI)

Date: 2026-09-01

## Decision

**Superseded 2026-09-03: `55-mtp-262k-vision` is production** (see "Promotion"
at the end). The original 2026-09-01 decision, kept for the record:

Do not replace the current Qwen3.8-27B production lane. Keep the 5.5-bpw EXL3
checkpoint available as a switchable canary:

- `55-mtp-262k` when full 256K-class context matters.
- `55-dflash2-160k` when faster decode matters and 160K context is enough.

The 5.5-bpw checkpoint recovers the full-suite tool score and offers roughly
double production's short-prompt decode rate, but its Hard Mode score is four
points below production. DFlash2 also has a reproducible required-argument
failure. Those results fail the predeclared promotion gates, so VulcanBench was
not run.

## Results

| Lane | Context | KV cache | Tool eval full / hard | Deterministic tools | Median decode | GPU used |
|---|---:|---|---:|---:|---:|---:|
| Qwen3.8-27B NVFP4 weights (vLLM, production MTP-3) | 256K | TurboQuant 4-bit KV | 91 / 67 | baseline pass | 107.3 tok/s | production |
| EXL3 3.5-bpw + built-in MTP (4 draft tokens) | 262K | NVFP4 KV | 90 / 60 | 12 / 12 | 219.0 tok/s | not recorded here |
| EXL3 3.5-bpw + DFlash2 5.0-bpw (7 draft tokens) | 262K | NVFP4 KV | 88 / 63 | 12 / 12 | 252.1 tok/s | not recorded here |
| EXL3 5.5-bpw + built-in MTP (4 draft tokens) | 262K | NVFP4 KV | 91 / 63 | 12 / 12 | 198.5 tok/s | 25.4 GiB |
| EXL3 5.5-bpw + DFlash2 5.0-bpw (7 draft tokens) | 131K | NVFP4 KV | 91 / 63 | 10 / 12 | 232.6 tok/s | 26.4 GiB |
| EXL3 5.5-bpw + DFlash2 5.0-bpw (7 draft tokens) | 160K | NVFP4 KV | same weights/config | 10 / 12 | 223.1 tok/s | 27.6 GiB |

The 5.5-bpw MTP lane passed exact needles at 8K, 65K, 131K, and 196K, plus
code edits at 65K and 131K. The 160K DFlash2 lane passed needles at 8K, 65K,
131K, and 150K, plus both code edits. Its 4.5 GiB of remaining VRAM makes 160K
a credible stable residency rather than a knife-edge load.

The DFlash2 131K lane is 17.2% faster than 5.5-bpw MTP; the more useful 160K
lane is 12.4% faster. Against production, 160K DFlash2 is 2.08x faster on the
short decode probe. This is not an end-to-end latency win for every workload:
production prefilled the comparable 65K and 131K needles in about 16.0 and
43.9 seconds, versus roughly 37 and 96-98 seconds for EXL3.

## Quality finding

Both 5.5-bpw drafters scored 91/63 on tool-eval-bench v2.5.1, so DFlash2 did
not cause the four-point Hard Mode gap. It did expose a narrower integration
failure: in the deterministic OpenAI-compatible tool test it repeatedly called
`send_email` with `to` but omitted the schema-required `body`. Three focused
retests reproduced the failure. A server-side corrective retry did not repair
it and was removed rather than retained as benchmark-specific behavior.

## Scope limitation

This assessment covers text, long-context retrieval, streaming, and tool use.
At the time of the 2026-09-01 runs the EXL3 compatibility server did not load
an image processor and no vision requests were tested. Vision was added and
validated the next day (addendum below); the tool-eval scores above were not
re-run with the vision tower loaded.

## Addendum 2026-09-02: vision

Both EXL3 checkpoints carry the checkpoint's BF16 vision tower (0.86 GiB on
disk, ~1.2 GiB loaded), and the pinned engine implements the Qwen3.5-VL
vision path. The compatibility patch now exposes it behind `--vision`
(OpenAI `image_url` content parts), and a sixth arm, `55-mtp-262k-vision`,
serves 5.5-bpw + MTP + vision with the 262144-token NVFP4 cache.

| Request (OpenAI API, `:8102`) | Prompt tokens | Completion | End to end |
|---|---:|---:|---:|
| native 2.9 MP OCR image | 2,854 | 1,019 | 16.4 s (62 tok/s) |
| 28 MP upscale, round 1 | 16,232 | 1,660 | 29.2 s |
| 28 MP upscale, round 2 | 16,232 | 1,685 | 14.6 s |
| 28 MP upscale, round 3 | 16,232 | 1,617 | 17.4 s |
| 28 MP upscale, streaming | 16,232 | 507 | 4.4 s |

Server loaded in ~85 s at 26.3 GiB, stayed healthy at 29.0 GiB after the
run, and production was restored. Image token counts match vLLM's Qwen
tokenizer (2,822 / 16,200 image tokens), so client-side image sizing rules
carry over unchanged. Direct-engine measurements on the 28 MP prompt: 93–113
tok/s decode with MTP, 53 tok/s without drafting, 5.4 s to embed, 6.5–9.8 s
to first token. Transcription of the test image is exact, including the
small panel subtitles at 28 MP.

The 28 MP image with a long decode is the exact pattern that crashes vLLM
0.24, 0.26, and nightly with MTP on this box (CUDA illegal memory access),
which is why production has run text-only since July. Three consecutive
rounds passed here, so the EXL3 lane is the only one on the MSI that serves
vision and speculative decoding together. This does not change the
promotion verdict above (Hard Mode remains −4 and prefill ~2.2× slower);
it makes `55-mtp-262k-vision` a candidate for a switchable image lane if an
image workload appears.

### Vision: full measurement (later on 2026-09-02)

The three open questions were closed with `vision-full-run.sh` on both
vision arms (same teb invocation as the text-only arms: seed 42, temp 0.6,
`reasoning_effort` low, full suite + Hard Mode ×3):

| Arm | teb full / hard | Deterministic tools | Median decode | GPU after teb |
|---|---:|---:|---:|---:|
| `55-mtp-262k` (text-only) | 91 / 63 | 12 / 12 | 198.5 tok/s | 25.4 GiB |
| `55-mtp-262k-vision` | 90 / 63 | 12 / 12 | 198.4 tok/s | 29.1 GiB |
| `55-dflash2-160k` (text-only) | 91 / 63 | 10 / 12 | 223.1 tok/s | 27.6 GiB |
| `55-dflash2-160k-vision` | 91 / 63 | 10 / 12 | 241.8 tok/s | 31.4 GiB |

- Tool-eval with the vision tower loaded is unchanged: Hard Mode identical,
  the MTP arm's 91→90 is two multi-turn planning scenarios (TC-50/TC-51)
  moving pass→partial, which is run-to-run noise on this lane (the tower is
  not on the text path). Decode is unchanged.
- Vision + DFlash2 passes the same five vision requests (2.9 MP 12.8 s; 28 MP
  30.2 / 19.1 / 18.0 s; streaming 5.3 s) and the multi-image request; the
  DFlash2 `send_email` required-argument miss persists unchanged (10/12).
- Multi-image prompts work on both arms: two images in one turn (4,899
  prompt tokens), both described correctly, the largest table value read
  correctly.
- VRAM: DFlash2 + vision at 160K settled at 31.4 GiB of 32 after the teb
  suites — it held, but 160K is the ceiling for that combination; 131K is
  the comfortable residency. MTP + vision keeps ~3 GiB free at 262K.

### Vision under long context and in tool turns (2026-09-03, `55-mtp-262k-vision`)

`vision-context-check.py` closes the last two questions:

- **Long context.** The OCR image with ~31–78K tokens of filler around it,
  text-then-image and image-then-text, with a planted key at 50% depth:
  all four pass (33,898 and 80,766 prompt tokens; 17–21 s and 58–59 s end
  to end, prefill-bound). Headline transcribed and key recalled every time,
  including the image buried under ~78K tokens of text.
- **Tool turns.** With `get_screenshot` + `send_email` tools, turn 1 calls
  `get_screenshot`; the image then arrives either inside the `tool` message
  (as an `image_url` part) or in a follow-up user message; turn 2 calls
  `send_email` with the headline quoted verbatim in `body` in both variants.
  Content-part flattening works for `role: tool` messages, and vision does
  not disturb tool selection or argument construction.

Run artifacts: `~/runs/qwen38-exl3-55-*-vision-*`,
`~/runs/qwen38-exl3-55-mtp-262k-vision-vision-context-check.*` and
`~/runs/qwen38-exl3-vision-*` on the MSI.

## Promotion (2026-09-03)

`55-mtp-262k-vision` now holds the production 8101 slot as
`qwen38-exl3.service` (launcher `configs/msi/serve-qwen38-exl3.sh`, unit
`configs/msi/qwen38-exl3.service`, lane `switch-lane.sh qwen38-exl3`). The
vLLM Qwen3.8 lane (`qwen38.service`) is disabled and kept as the rollback,
ThinkingCap (`vllm.service`) behind it. The 8100 bridge and clients are
unchanged: the server advertises `qwen3.8-27b-exl3-5.5bpw` plus the aliases
`qwen3.8-27b-nvfp4`, `qwen3.8-27b`, `qwen3.6-27b-nvfp4`.

What was traded: −4 Hard Mode (63 vs 67), ~2.2× slower long-prompt prefill,
and the `send_email`-style tool-argument miss is *not* part of this lane (that
was DFlash2; this lane drafts with MTP, 12/12 deterministic tools). What was
gained: vision (the vLLM lane has been text-only since July), ~2× decode
(198 vs 107 tok/s), and prompt caching (the TurboQuant KV lane re-prefilled
every turn). Serving contract preserved: thinking at `reasoning_effort` low,
temp 0.6 / top_p 0.95 / top_k 20 / min_p 0, Qwen3 XML tool calling, no
server-side penalties (client-side `frequency_penalty` 0.5 still applies and
was verified end to end through the bridge).

> **Superseded 2026-09-16.** The client-side `frequency_penalty` 0.5 in
> this section and in "Operational differences" below degenerates long
> generations on this engine. Clients now send 0 (at most 0.2); see the
> 2026-09-16 addendum at the end of this report.

Post-flip verification through `:8100` (`promote.sh`): four model ids listed;
chat under an alias name returns a correct `get_weather` tool call; streaming
carries usage; vision-check (native, 28 MP, streaming, multi-image) PASS;
26.3 GiB at load.

Operational differences from the vLLM lane worth knowing: no MTP acceptance
metrics in the log (the loop alarm from the 2026-08-21 incident does not
exist here — the client-side penalty and the 32K `max_tokens` cap are the
protections); requests are serialized (batch 1, same as before); the engine
and kit are pinned (`prepare-kit.sh`), not pip-upgradable in place.

## Operational state

The checkpoint is downloaded under the deployment kit's `models` directory,
and the five canary arms are reproducible from
`configs/msi/qwen38-exl3-canary`. That directory pins deployment-kit commit
`81ba06e`, carries the exact compatibility patch used for the measurements,
and provides `prepare-kit.sh` to apply it and download an arm without loading
the GPU. Production was restored after testing.
At handoff, `qwen38.service` is active, `vllm.service` is inactive, and both
the backend on port 8101 and bridge on port 8100 return HTTP 200.

## Addendum 2026-09-16: vision "loop then soup" degeneration is the frequency penalty

Symptom reported from ZCode and Pi against the production EXL3 lane: image
requests started with a correct description (Cloudflare "Add DNS record"
dialog, `*.mech`, Cancel/Save), then repeated a phrase with progressively
mangled words (`<olas> xyz` -> `val xyz` -> `mechanical value x.y.z` ->
single letters) and finally collapsed into emoji/unicode soup until the
client cancelled at 30-70 s.

Two separate problems were involved.

1. **ZCode never sent the image at first.** Its live gate is
   `properties.inputFormat.supportsImage` in `~/.zcode/v2/provider_config.json`,
   not `modalities.input` in `config.json`. With it unset, ZCode replaces the
   attachment with "[Media omitted ...]" and the model only sees a caption.
   Pi similarly sends nothing when given a filesystem path. This was fixed on
   the client and is not a server issue.
2. **Once pixels landed, the degeneration was the sampler, not vision.**
   exllamav3's `ComboSampler` `freq_p` is cumulative (penalty x occurrence
   count subtracted from the logit), so any long answer that legitimately
   reuses tokens gets pushed off common words and then off punctuation. The
   pattern is modality-independent and reproduced on the live server with
   text-only prompts (thinking off, temp 0.7 / top_p 0.8 / top_k 20):

   | frequency / repetition | outcome |
   |---|---|
   | 0.0 / 1.0 | clean prose to the 1300-token limit |
   | 0.5 / 1.0 | punctuation gone by ~600 tokens ("SPF DKIM DMARC policies although these do not directly utilize") |
   | 1.0 / 1.15 | acronym word salad by ~1000 tokens |

   With a synthetic "Add DNS record" image and 1500 `max_tokens`: defaults
   give a correct field table plus explanation and stop on their own at
   ~1000 tokens; the same request with client `frequency_penalty: 0.5`
   degrades into word salad after ~1000 tokens.

A first response to the incident (2026-09-16, from a Mac-side session) had
patched the running `serve_openai.py` with server defaults `frequency 1.0`
/ `repetition 1.15`, a 512-token cap plus `temperature <= 0.25` / `top_k 10`
clamp on image jobs, and an n-gram "degeneration tripwire". That made things
worse: the stronger penalty produced the unicode soup, and the tripwire
(any 8-char substring six times in the last 1800 chars) cut every ordinary
long answer mid-sentence with `finish_reason: stop`. All of it was reverted
the same day (backup `serve_openai.py.bak-degen-20260916` next to the live
file); the kit patch in this directory never carried those edits.

Consequence for the August 2026-08-22 A/B conclusion: `frequency_penalty 0.5`
was "free" on the teb hard-mode suite under the vLLM lane, whose turns are
short. On the EXL3 lane it wrecks any single generation past roughly 600 to
1000 tokens (essays, image descriptions, long code explanations). The
client-side 0.5 deployed in omp on 2026-08-22 and copied into ZCode/Pi is
therefore harmful on the current production lane.

Serving contract from now on (supersedes the client-side 0.5 stated in the
2026-09-03 Promotion section; `promote.sh` now smokes with 0.2):

- Server defaults stay `repetition 1.0 / frequency 0.0 / presence 0.0`
  (unchanged in `deployment-kit-81ba06e.patch`).
- Clients send `frequency_penalty` 0 (at most 0.2). If a loop guard is
  wanted, `presence_penalty` <= 1.0 is the safe kind: one-time per seen
  token, does not compound with length.
- The 32K client `max_tokens` cap remains the bound on runaway generations.
- `penalty-degeneration-check.py` in `configs/msi/qwen38-exl3-canary`
  reproduces the table above against any endpoint.
