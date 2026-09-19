# Nemotron 3.5 Lightning 30B-A3B bench + ThinkingCap card-recipe promotion — MSI RTX 5090

**Date:** 2026-08-12/13
**Verdict:** **No lane change for Nemotron** — it wins raw speed and batch
throughput but loses full-suite quality to production ThinkingCap (80 vs 88).
The investigation's real yield: rerunning ThinkingCap with the updated
morosystems model-card recipe lifts its hard-mode score 60 → 67, and that
recipe (with an n=5 spec ablation win) is **promoted to production**
`serve-thinkingcap.sh` as of 2026-08-13.

**Harness:** tool-eval-bench v2.5.1 (69 scenarios, seed 42, temp 0.6 unless
noted); hard mode = `--hardmode-only`, 15 P-scenarios × 3 trials.
**Comparability note:** hard-mode scores in this report are on v2.5.1 final
and are NOT directly comparable to earlier reports: the ThinkingCap 87
("fleet best") in the July tool-eval report was scored on v2.1.0, and the
2026-08-10 pilot-outcome baseline cite on v2.5.1.dev14. The v2.5.1 rescoring
is the only changed variable behind the same old-prod config appearing here
as 60 (same model, weights, and serve flags) — not a model regression. The 60 → 67 card-recipe lift is a within-harness A/B (both sides
on v2.5.1). Likewise "first-ever teb run" below means first on v2.5.1.
WSL2 on RTX 5090 32 GB. Rerun scripts in WSL `~/runs/` (`nemo-*.sh`,
`tc-vllm-*.sh`), result JSONs `~/runs/{nemotron,qwen36}-teb*.json`.

## Model: nvidia/NVIDIA-Nemotron-3.5-Lightning-30B-A3B

Hybrid Mamba-2 + MoE + attention, 3.5B active params. Run straight from HF
sources (skipped the MiaAI-Lab SGLang/Docker route — needs Docker + an
80 GiB RAM gate; unnecessary). Launcher: `configs/msi/serve-nemotron-lightning.sh`
(NVFP4, vLLM 0.27.1, port 8102, qwen3_xml tool parser — Nemotron 3.5 speaks
Qwen3's tool/reasoning format; vLLM's internal `nemotron_v3` parser is not a
valid CLI name. Without the parser flags the eval collapses to ~11 — every
tool call 400s. Always check server flags before trusting a score.)

## Throughput (single stream, 512-tok gens)

| Backend | tok/s | Notes |
|---|---:|---|
| llama.cpp b84e908c, Q4_K_M (23.7 GiB), `-ngl 99 -fa 1` | **~328** | pp512 ≈ 10,650 t/s; arch `nemotron_h_moe` |
| vLLM 0.27.1 NVFP4 + fp8 KV, 131K ctx | ~273 | weights 18.6 GiB, ~8.8 GiB KV |
| vLLM + MTP spec (`{"method":"mtp","num_speculative_tokens":3}`) | ~114 | loads fine, no crash — but ~2.4× SLOWER (poor acceptance). Don't use. |
| ThinkingCap-Qwen3.6-27B (prod baseline) | ~90 | dense-ish 27B, not directly comparable |

Concurrency sweep (aggregate tok/s, 8 varied prompts):

| Streams | vLLM NVFP4 | llama.cpp (`-np 16 -c 65536`) |
|---:|---:|---:|
| 1 | 262 | 289 |
| 4 | 712 | **65** (!) |
| 8 | 1155 | 169 |
| 16 | **1977** | 782 |

llama.cpp multi-stream batching of the Mamba hybrid is pathological at low
concurrency — llama.cpp is single-stream-only for this model (though it did
survive a 512-concurrent storm at ~548 t/s aggregate). vLLM scales cleanly;
MoE backend is MARLIN by default (`VLLM_USE_FLASHINFER_MOE_FP4=1` did not
change backend or perf).

Quality spot-check (6 prompts, temp 0): NVFP4 6/6; Q4_K_M 5/6 (failed string
reversal) — NVFP4 quality ≥ Q4_K_M.

**Chosen default for this model:** vLLM NVFP4, no speculative decoding
(`serve-nemotron-lightning.sh` + tool/reasoning parser flags).

## tool-eval-bench, full suite (69 scenarios)

| Model | Final | Deploy | Resp | Safety |
|---|---:|---:|---:|---|
| ThinkingCap-Qwen3.6-27B (prod, first-ever teb run 2026-08-13) | **88** | 82 | 68 | 1 warning; fails TC-60 |
| Nemotron 3.5 Lightning | 80 ★★★★ | 83 | **91** | 5 warnings incl. **CRITICAL TC-60** cross-turn sleeper injection (attacker BCC added from injected turn-1 data), plus ambiguity, hallucination, extra-param injection, empty required param |
| Muse-Glimmer-30B (prior pilot) | 79 | 75 | 66 | — |
| Gemma 4 31B QAT (prior pilot) | 70 | 64 | 49 | — |

Qwen3.6 stays quality king; Nemotron wins responsiveness. **Both fail TC-60
sleeper injection (CRITICAL)** — still an unmitigated fleet-wide gap.

## Hard mode (15 P-scenarios, 3 trials)

| Run | Final | Deploy | Resp | Median turn | pass@3 | Notes |
|---|---:|---:|---:|---:|---:|---|
| Nemotron 3.5 | **63** | 71 | 90 | 670 ms | 60 | reliability gap 13.3 |
| Qwen3.6 (old prod config: 0.24 venv, mtp n=5, temp 0.6) | 60 | 59 | 56 | 2571 ms | — | stddev 0 (deterministic) |

Nemotron edges ahead: wins TC-73/74/75/83, loses TC-71 (ambiguous recipient)
and TC-76 (missing capability). Both fail TC-72 (cascading error recovery)
and TC-80 (transactional rollback). No safety warnings in the hard-mode set.

## ThinkingCap card-recipe reruns → promotion

The ThinkingCap NVFP4 repo shipped a 2026-07-31 card fix removing the
uncalibrated fp8 `kv_cache_scheme` (card now: KV=bf16, `qwen3_next_mtp` n=3,
`VLLM_ENFORCE_STRICT_TOOL_CALLING=0` for spec+tools; temp 1.0 for agentic).
Reran Qwen hard-mode on vLLM 0.27.1. Gotchas: bf16 KV forces max-model-len
≤61K (used 57344); hybrid layers need explicit `--max-num-seqs 16` or vLLM
fails startup with a "Mamba cache blocks" error; bare
`--speculative-config {"num_speculative_tokens":N}` fails 0.27.1 validation
(needs `"method"`).

| Config | Hard-mode | Deploy | Resp | Median turn | Ctx |
|---|---:|---:|---:|---:|---:|
| Old prod (0.24, mtp n=5, temp 0.6) | 60 | 59 | 56 | 2571 ms | 131K |
| Card recipe, bf16 KV | **70** | 68 | 64 | 2064 ms | ~57K max |
| Card recipe, fp8 KV @131K (KV ablation) | 67 | 62 | 51 | 2944 ms | 131K |
| Card recipe, fp8 KV @131K, n=5 (spec ablation) | 67 | 65 | 61 | 2202 ms | 131K |

All runs deterministic (stddev 0 across trials). Reading:

- Most of the +10 comes from temp 1.0 + `qwen3_next_mtp` + strict-off, not
  KV dtype. TC-72 error recovery and TC-75 missing-param flip to pass.
- bf16 KV adds the last +3 by flipping TC-74 (stateful corrections, the
  long-context scenario — consistent with the uncalibrated-fp8-KV warning)
  but caps context at ~57K. Not promoted.
- n=5 vs card's n=3 (fp8 KV @131K): identical final and per-scenario
  results but ~24% faster (median 2.2 s vs 2.9 s). n=5 wins.

**PROMOTED 2026-08-13** (`configs/msi/serve-thinkingcap.sh`, this PR):
vLLM 0.27.1 venv, `qwen3_next_mtp` n=5, `VLLM_ENFORCE_STRICT_TOOL_CALLING=0`,
temp override 1.0, fp8 KV kept for 131K ctx, 0.24-era `--kernel-config`
autotune flag dropped. Hard-mode 67 vs the old config's 60. Runtime backup:
`~/serve-thinkingcap.sh.pre-cardrecipe.bak`.

## Side thread: vision + speculative decoding experiments

Vision+MTP crashes (CUDA illegal memory access) reproduce on vLLM 0.24, 0.26
**and nightly** (confirmed 2026-08-04) — not fixed upstream. Vision + DFlash
(z-lab/Qwen3.6-27B-DFlash draft, 10 spec tokens) is stable but roughly half
production speed. Experiment launchers + repro driver committed with this PR:
`configs/msi/serve-thinkingcap-dflash-test.sh`,
`configs/msi/serve-thinkingcap-vision-mtp-nightly-test.sh`,
`configs/msi/vision-dflash-repro.sh`. Production stays text-only + MTP;
the vision lane remains Gemma/llama.cpp (see the Muse-Glimmer pilot report).
