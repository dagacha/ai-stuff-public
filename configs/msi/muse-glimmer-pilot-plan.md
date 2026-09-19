# Muse-Glimmer-30B pilot plan (MSI / RTX 5090)

**Status:** historical

> **Outcome (2026-08-10):** pilot complete — **no promotion**. Results were
> written up as a single combined report,
> [`benchmarks/lane-assessments/report-msi-muse-glimmer-pilot-outcome.md`](../../benchmarks/lane-assessments/report-msi-muse-glimmer-pilot-outcome.md),
> not the two per-suite files named in [Reporting](#reporting). This doc is
> kept for the gate methodology.

Goal: decide whether `meta-models/Muse-Glimmer-30B` replaces the current MSI
serving — potentially consolidating both lanes (vLLM ThinkingCap for
text-agentic + llama.cpp Gemma 4 for vision) into one llama.cpp deployment
with native vision and a first-party DFlash drafter.

Launcher: [`serve-muse-glimmer.sh`](./serve-muse-glimmer.sh). Meta's claimed
wins over Gemma4-31B and Qwen3.6-27B (SWE-Bench Pro 51.2%, MCP Atlas 75.5%)
are vendor numbers — the pilot reproduces our own fleet suites instead.

## Phase 0 — Setup & smoke (half a day)

1. Pull + rebuild `~/llama.cpp` (needs upstream PR #26841 for the arch);
   same cmake flags as [gemma4-qat-llamacpp.md](./gemma4-qat-llamacpp.md).
2. Download UD-Q4_K_XL + mmproj + drafter GGUFs (commands in the script).
3. Smoke: text completion, a tool call, one image request. Verify
   `--jinja` template loads and the drafter attaches (check
   `draft acceptance` in server logs).
4. `llama-bench` baseline: `-ngl 99 -fa 1 -p 512,2048 -n 128`, with and
   without `-md` — record the real DFlash multiplier vs. Meta's claimed 3.1x.
   Fleet reference points: ThinkingCap ~90-92 t/s (MTP n=5), Gemma 4 QAT
   78.6 t/s no-MTP.

## Phase 1 — Quality (the gate)

All runs seed 42, single repeat, same as the fleet campaign. Run each suite
twice: fleet-baseline sampling (temp 0.6 / top_p 0.95, for comparability)
and model-recommended (1.0 / 0.95 / top-k 64, its best foot forward).
VulcanBench pins temp 0 regardless, so it runs once.

| Suite | Command sketch | Compare against |
|---|---|---|
| tool-eval-bench full (69) | `tool-eval-bench run --model muse-glimmer-30b --seed 42 ...` | ThinkingCap 83, base Qwen 88, DSv4-0731 88 |
| tool-eval-bench Hard Mode | `--hardmode-only` | ThinkingCap 87 (fleet best), DSv4-0731 70/83 |
| VulcanBench v1 + carbyne + v3 | `vulcanbench run --suite v3 --no-judges --max-concurrency 2` | ThinkingCap v3 7/23, base Qwen 6/23, DSv4 13-18/23 |
| Context pressure | TC-61/TC-64 sweep 0.5-1.0 @ 131072 | DSv4-0731 clean 10/10 |

Watch specifically:
- **TC-60 cross-turn sleeper injection** — both Qwen variants fail it; only
  the DSv4 line passes. A pass here is a major point in Muse's favor.
- **TC-74 stateful corrections** — only ThinkingCap passes; would be lost
  in a swap unless Muse also passes.
- VulcanBench concurrency: cap at 2 (ThinkingCap's vLLM crashed at 3; the
  llama.cpp `--parallel` cap in the launcher mirrors `MSI_MAX_NUM_SEQS`).

## Phase 2 — Vision + stability soak

The reason vision is off on the vLLM lane: vision + speculation crashes
vLLM 0.24/0.26 (see serve-thinkingcap.sh header). Muse must prove the
combination on llama.cpp:

1. Replay the crash shape: large-image requests (~12-15K prompt tokens)
   mid-decode with the drafter active, ≥20 iterations.
2. Mixed soak: alternate text-agentic and vision requests for a few hours
   under the Pi agent's real traffic pattern (single-stream).
3. Record VRAM headroom at 128K fill; if tight, the fallback is Q4 @ 64K
   or dropping KV to q8_0/q4 further — note whatever config survives.

## Phase 3 — Quant ladder (only if Phase 1 is close)

If Q4_K_XL loses narrowly to ThinkingCap, rerun tool-eval full + Hard Mode
on UD-Q6_K_XL (~25 GB, needs `-c 65536`) to check whether it's a quant
artifact before rejecting the model.

## Decision criteria

Promote to production (new `serve-*.sh` as the vllm.service replacement or
sibling unit) only if ALL hold:

1. Hard Mode ≥ ThinkingCap's 87, or ≥80 with a TC-60 pass (safety upgrade
   justifies a small quality trade).
2. tool-eval full ≥ 85.
3. Effective tok/s on code/agentic traffic ≥ ~75 with DFlash (within ~20%
   of ThinkingCap; vision consolidation covers the gap).
4. Zero engine crashes in the Phase 2 soak, including vision+draft.
5. VulcanBench v1 ≥ 0.85 (sanity floor; nobody expects DSv4-class v3).

If promoted: keep the `muse-glimmer-30b` alias, add a gateway variant
(configs/unified-model-gateway.md pattern) rather than reusing the
`qwen3.6-27b-nvfp4` id, and keep serve-thinkingcap.sh as the documented
rollback. Revisit the vLLM/NVFP4 path when Unsloth unflags it.

## Reporting

Write the results up as `benchmarks/report-msi-muse-glimmer-30b-tool-eval.md`
and `...-vulcanbench-v3.md` (planned names — never created), same structure as
the ThinkingCap reports, and add both to `benchmarks/README.md`. *(As executed: one combined report,
`report-msi-muse-glimmer-pilot-outcome.md` — see the outcome note at the top.)*
