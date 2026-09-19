# Pilot Outcome: Muse-Glimmer-30B (and the Gemma 4 31B QAT surprise) — MSI RTX 5090

**Date:** 2026-08-10
**Verdict:** **No promotion.** ThinkingCap-Qwen3.6-27B-NVFP4 keeps the production
text-agentic lane. The pilot's real yield is elsewhere: Gemma 4 31B QAT + native
MTP is now the fastest model on the box (149–150 t/s) and survived a
vision+speculation soak that crashes vLLM — the Gemma vision lane gets upgraded.

**Harness:** tool-eval-bench v2.5.1.dev14, seed 42, llama.cpp b811-4dee52f
(`build-muse/`), WSL2 on RTX 5090 32 GB.
**Pilot plan:** [`configs/msi/muse-glimmer-pilot-plan.md`](../../configs/msi/muse-glimmer-pilot-plan.md) (promoted to main with this report; pilot launcher kept as `configs/msi/serve-muse-glimmer.sh`).

## Scores vs promotion gates

Gate: Hard Mode ≥87, or ≥80 + TC-60 pass; full suite ≥85; ≥75 t/s; zero-crash soak.

| Model | Full (69) | Hard Mode | t/s (code, spec) | TC-60 |
|---|---:|---:|---:|:--:|
| ThinkingCap-Qwen3.6-27B (prod) | 83 | **87** | ~90 (MTP n=5) | ✗ |
| Muse-Glimmer-30B (native sampling) | 86 | 63 | 118–133 (DFlash, 24–29% acc) | ✓ |
| Gemma 4 31B QAT (native sampling) | **91/90** | 70–77 | **149–150** (MTP, 74–76% acc) | ✓ |

- **Muse:** Hard Mode 63 is 24 points under gate — rejected outright. Its only
  edge (128K ctx in 20.5GB) doesn't justify the quality drop.
- **Gemma:** pivoted to challenger after its surprise full-suite 91. Hard Mode
  measured four times — a standalone 77 plus a 3-trial run (spread 70–77): the spread is
  server-side nondeterminism, but the *failures are stable* — TC-72 (cascading
  error recovery), TC-80 (transactional rollback), TC-83 (format-sensitive
  JSON/tool output) fail every run; TC-74/82/84 partial. These are behavioral,
  not sampling noise or budget exhaustion, so the 77→80 gap is not closable by
  config. Gate not met.
- The full gate also required VulcanBench v1 ≥ 0.85 and throughput within
  ~20% of ThinkingCap — both mooted by the Hard Mode result. (v1 was never
  run for Gemma; the harness isn't plumbed on the MSI box and would need the
  DGX Docker sandbox.)

## Vision+MTP stability soak — PASS

The shape that crashes vision+speculation on vLLM 0.24/0.26/nightly, replayed
on llama.cpp b811: a 28MP (6400×4400, 9.8MB) image request fired 2s into a
700-token speculative text decode.

- Round 1: 25 iterations, all 200s — but llama.cpp prompt caching skipped image
  re-encode after iter 1 (`cached_tokens: 279`).
- Round 2 (hardened, `cache_prompt: false` + varied prompt → full mmproj encode
  every iteration): 20/20 clean.
- **45 collision iterations total, zero crashes**, VRAM steady at
  28,964→29,010 MiB (~3.5GB headroom at 108K ctx + vision + MTP).

## Actions taken

- `serve-gemma.sh` updated: `build-mtp/` (stale June v72 build, n-max 3) →
  `build-muse/` (b811) with the validated `--spec-type draft-mtp
  --spec-draft-n-max 2`. Before-state note: the June lane was already
  MTP-enabled — `gemma4-qat-llamacpp.md` documents it at ~168–177 t/s nominal
  (78.6 is the *no-MTP* bench figure, not the lane's prior speed). The b811
  measurement of 149–150 t/s comes from pilot conditions, not the June
  `-c 8192` sweep, so the two aren't directly comparable; the swap is
  motivated by the soak-validated b811 build (the v72 binary predates the
  vision+MTP fixes), not by throughput. A like-for-like before/after on the
  box is still owed.
- Raw results: `~/runs/gemma-hm-baseline.json`, `~/runs/gemma-hm-3trials.json`,
  `~/runs/gemma-soak-*.log` (WSL), plus generated reports under `runs/2026/08/`.

## Follow-ups

- Retire branch `config/msi-muse-glimmer-pilot` — the plan doc and pilot
  launcher are promoted to main with this PR, so the branch carries nothing
  unique.
- If Gemma's Hard Mode ever matters: TC-72/80/83 are the fixed targets; a
  Phase-3-style quant check doesn't apply (QAT is already the int4-native
  artifact).
- Revisit Muse if Unsloth unflags the NVFP4 path or DFlash acceptance improves.
