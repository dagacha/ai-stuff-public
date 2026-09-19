# MTP (Multi-Token Prediction) status on Bosgame M5

**Status:** historical

Last updated: **2026-06-17**

This document records the speculative-decoding (MTP) status of each local model served on this machine, so future sessions don't have to re-discover the constraints.

---

## TL;DR

| Model                     | Port | MTP? | How                                          |
|---------------------------|------|------|----------------------------------------------|
| Qwen3.6-27B (dense)       | 8080 | YES  | NSSM service `llama-qwen-27b` — manual start |
| Qwen3.6-35B-A3B (MoE)     | 8081 | YES  | NSSM service `llama-qwen-35b-a3b` — auto-start (boot default) |
| Gemma 4 26B-A4B           | 8083 | NO   | NSSM service `llama-gemma-26b` — manual; MTP not viable (see below) |

Common MTP flags: `--spec-type draft-mtp --spec-draft-n-max 2` (per unsloth: `n_max=2` is the sweet spot; 4+ tanks acceptance from ~83% to ~50%).

> **2026-05-20 update:** This doc was reconciled against the live NSSM service config — all three models now run as NSSM services (the 35B-A3B "start script only" framing was stale; it was migrated to a service after 2026-05-17). Independently of MTP, all three services also had **thinking disabled** server-side via `--chat-template-kwargs "{\"enable_thinking\":false}"`; the Qwen services gained `--temp 0.7 --top-p 0.8`, Gemma got `--temp 1.0 --top-p 0.95 --top-k 64`. This doc covers MTP/speculative-decoding only — see `configs/bosgame/project_llm_setup.md` for each service's full current AppParameters.

---

## llama-server binaries on disk

Two checkouts of the AtomicBot-ai fork exist, with different build vintages:

| Path                                              | Branch                          | Commit    | Date       | Used by                                              |
|---------------------------------------------------|---------------------------------|-----------|------------|------------------------------------------------------|
| `C:\llama.cpp-mtp\build\bin\Release\`             | `feature/turboquant-kv-cache`   | `2e81dc5` | 2026-05-07 | `llama-gemma-26b` NSSM service (non-MTP)            |
| `C:\Users\<user>\llms\llama.cpp-mtp\build-vk\bin\`| `mtp-clean`                     | `e7b4848` | 2026-05-13 | `llama-qwen-27b` + `llama-qwen-35b-a3b` NSSM services|

**Important API change between the two:**
- Old build: `--spec-type mtp` + `--mtp-head <gguf>` (Gemma-style, separate assistant file)
- New build: `--spec-type draft-mtp` only (Qwen-style, bundled MTP head inside the target GGUF, auto-discovered)

The new build **dropped support for the `gemma4_assistant` GGUF architecture**. Loading the old Gemma assistant GGUF with the new build errors: `unknown model architecture: 'gemma4_assistant'`.

The old build still supports Gemma MTP at the API level but crashes (`0xc0000005` in `llama.dll`, head-dim 512 path) — pre-existing fork issue. Net: Gemma 4 MTP is currently impossible on this hardware.

---

## Qwen3.6-27B (port 8080) — live

**NSSM service:** `llama-qwen-27b` (demand-start — manual; the 35B-A3B service is the boot default). Updated 2026-05-17 to use the MTP build.

| Field          | Value                                                                |
|----------------|----------------------------------------------------------------------|
| `Application`  | `C:\Users\<user>\llms\llama.cpp-mtp\build-vk\bin\llama-server.exe`   |
| `AppDirectory` | `C:\Users\<user>\llms\llama.cpp-mtp\build-vk\bin`                    |
| `AppParameters`| `-m C:\models\Qwen3.6-27B-MTP-GGUF\Qwen3.6-27B-UD-Q4_K_XL.gguf -ngl 99 -fa on -c 65536 -np 1 --host 0.0.0.0 --port 8080 --spec-type draft-mtp --spec-draft-n-max 2 --temp 0.7 --top-p 0.8 --chat-template-kwargs "{\"enable_thinking\":false}"` |
| Logs           | `C:\llama.cpp\logs\qwen-27b\{stdout,stderr}.log`                     |

**Measured (warm decode, single chat completion):** ~14.7 tok/s, 95% draft acceptance vs ~12 tok/s non-MTP baseline = **~1.23× speedup**. Unsloth claims 1.4× for dense — we're a touch below; likely Vulkan/iGPU overhead.

**Restart commands:**
```powershell
Restart-Service llama-qwen-27b
# or
Stop-Service llama-qwen-27b; Start-Service llama-qwen-27b
```

---

## Qwen3.6-35B-A3B (port 8081) — live, NSSM service (boot default)

**NSSM service:** `llama-qwen-35b-a3b` (auto-start — the model that comes up on boot). Migrated from a start script to an NSSM service after 2026-05-17 via `fix_qwen35b_mtp.bat` / `reconfig_gemma_qwen35b.bat`.

> **2026-06-17 update — context raised to full native 256K.** `-c` changed from `110592` (108K) to `262144` (256K = `n_ctx_train`; no rope/YaRN scaling, no quality loss). KV cache (f16): target **5120 MiB** + MTP draft **512 MiB** ≈ 5.6 GB; full GPU footprint ~28–30 GB of the ~64 GB iGPU VRAM carve-out. MTP + no-think verified still active. **Gotcha:** apply via `Set-ItemProperty` on `HKLM\...\Services\llama-qwen-35b-a3b\Parameters\AppParameters` (single-quoted literal) — running `nssm set` with the `--chat-template-kwargs "{\"enable_thinking\":false}"` JSON mangles the quote-escaping and drops the service into NSSM `PAUSED` with a `json parse_error.101`.

| Field          | Value                                                              |
|----------------|--------------------------------------------------------------------|
| `Application`  | `C:\Users\<user>\llms\llama.cpp-mtp\build-vk\bin\llama-server.exe` |
| `AppDirectory` | `C:\Users\<user>\llms\llama.cpp-mtp\build-vk\bin`                  |
| `AppParameters`| `-m C:\models\Qwen3.6-35B-A3B-MTP-GGUF\Qwen3.6-35B-A3B-UD-Q4_K_XL.gguf -ngl 99 -fa on -c 262144 -np 1 --host 0.0.0.0 --port 8081 --spec-type draft-mtp --spec-draft-n-max 2 --temp 0.7 --top-p 0.8 --chat-template-kwargs "{\"enable_thinking\":false}"` |
| Logs           | `C:\llama.cpp\logs\qwen-35b-a3b\{stdout,stderr}.log`               |

**Measured:** ~49.5 tok/s, 100% acceptance on a short test. Unsloth says MoE gets a smaller ratio (~1.15–1.25×) than dense; no non-MTP baseline measured on this exact model. Sustained rate on longer outputs likely lower than the 49.5 single-shot.

**Restart commands:**
```powershell
Restart-Service llama-qwen-35b-a3b
```

A legacy ad-hoc launcher `C:\Users\<user>\llms\start_qwen36_35b_a3b.ps1` still exists for test runs but is no longer the live path. Note the two big Qwen models share the iGPU — stop one service before starting the other for heavy work.

---

## Gemma 4 26B-A4B (port 8083) — MTP not viable

**MTP tried and confirmed not working on 2026-05-17.** Gemma runs plain (no MTP) as NSSM service `llama-gemma-26b` (demand-start) on build B — `C:\llama.cpp-mtp\build\bin\Release\llama-server.exe`.

**Why it doesn't work:**
- Gemma 4 uses a Gemma-specific MTP design (separate `gemma-4-26B-A4B-it-assistant.Q4_K_M.gguf` with arch `gemma4_assistant`, not a bundled head).
- The new build (`mtp-clean`, e7b4848) supports `draft-mtp` but errors with `unknown model architecture: 'gemma4_assistant'` when loading the assistant GGUF — that arch was dropped during the API rename.
- The old build (`feature/turboquant-kv-cache`, 2e81dc5) accepts the old `--spec-type mtp` flag with the assistant GGUF but crashes with `0xc0000005` in `llama.dll` (head-dim 512 path, fork issues #5/#6).
- No `gemma-4-*-MTP-GGUF` (bundled-head variant) exists on HuggingFace from any author as of 2026-05-17.

**To revisit:** when one of the following happens:
1. A future fork commit adds Gemma 4 MTP back to the new `draft-mtp` path, OR
2. Someone publishes a `gemma-4-26B-MTP-GGUF` with a bundled head in the Qwen3.6 style, OR
3. A fork build appears with the head-dim 512 crash fix on the old `--spec-type mtp` path.

Until then, Gemma runs plain (no MTP) — see the service details above.

---

## Models on disk (relevant to MTP)

| Path                                                                            | Size    | Purpose                                |
|---------------------------------------------------------------------------------|---------|----------------------------------------|
| `C:\models\Qwen3.6-27B-MTP-GGUF\Qwen3.6-27B-UD-Q4_K_XL.gguf`                     | 16.7 GB | 27B with bundled MTP head — LIVE       |
| `C:\models\Qwen3.6-35B-A3B-MTP-GGUF\Qwen3.6-35B-A3B-UD-Q4_K_XL.gguf`             | 21.3 GB | 35B-A3B with bundled MTP head — LIVE   |
| `C:\models\Qwen3.6-27B-GGUF\Qwen3.6-27B-UD-Q4_K_XL.gguf`                         | 16.4 GB | 27B non-MTP — rollback option          |
| `C:\models\Qwen3.6-35B-A3B-GGUF\Qwen3.6-35B-A3B-UD-Q4_K_XL.gguf`                 | 20.8 GB | 35B-A3B non-MTP — rollback option      |
| `C:\models\gemma-4-26B-A4B-it-GGUF\gemma-4-26B-A4B-it-UD-Q4_K_XL.gguf`           | 15.9 GB | Gemma trunk — current production       |
| `C:\models\gemma-4-26B-A4B-it-assistant-GGUF\gemma-4-26B-A4B-it-assistant.Q4_K_M.gguf` | 310 MB | Old-style Gemma MTP head — parked, doesn't load on new build |

---

## Tooling

| Path                                            | Purpose                                                       |
|-------------------------------------------------|---------------------------------------------------------------|
| `C:\Users\<user>\llms\probe_mtp.py`             | Python script that prints `nextn_predict_layers`, MTP tensor signatures, and max layer index for any GGUF. Imports `gguf-py` from the source checkout. |
| `C:\Users\<user>\llms\build_llama_mtp.bat`      | Reconfigures + rebuilds `llama-server` from the `mtp-clean` source tree. Uses VS 2022 Build Tools + Vulkan SDK 1.4.350.0 + Ninja. Output → `build-vk\bin\llama-server.exe`. Build time ~10–15 min on Ryzen AI Max+ 395 (incremental). |
| `C:\Users\<user>\llms\test_qwen36_27b_mtp.ps1`  | Standalone interactive launcher for the 27B (test path, 127.0.0.1, with MTP flags). Useful for re-validating without touching NSSM. |
| `C:\Users\<user>\llms\test_qwen36_35b_a3b_mtp.ps1` | Same for 35B-A3B.                                          |
| `C:\Users\<user>\llms\test_gemma4_mtp.ps1`      | Failed-test recipe for Gemma 4 MTP. Kept as reference; running it currently fails with `unknown model architecture: 'gemma4_assistant'`. |

---

## Environment notes (changed during this rollout)

- **Smart App Control is now OFF** (one-way switch; user disabled in Settings on 2026-05-17 to unblock the freshly-built unsigned binary). Future builds in this tree will run without SAC interference.
- Vulkan SDK 1.4.350.0 at `C:\VulkanSDK\1.4.350.0`.
- MSVC 14.44 (VS 2022 Build Tools) at `C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\`.

---

## How to verify MTP is actually active

After a service start, look for these lines in stderr:

```
srv    load_model: creating MTP draft context against the target model '<path>'
common_speculative_init: adding speculative implementation 'draft-mtp'
srv    load_model: speculative decoding context initialized
```

Then any chat completion response carries `timings.draft_n` and `timings.draft_n_accepted` fields:

```json
"timings": {
  "predicted_n": 80,
  "predicted_per_second": 14.7,
  "draft_n": 43,
  "draft_n_accepted": 41
}
```

Acceptance rate = `draft_n_accepted / draft_n`. Below ~0.6 sustained → MTP is actively hurting (drafts wasting cycles); investigate.

---

## Unsloth reference doc

`https://unsloth.ai/docs/models/qwen3.6` — source for the `--spec-type draft-mtp` + `--spec-draft-n-max 2` recipe. Note the doc was updated on 2026-05-13 when the flag was renamed from `mtp` → `draft-mtp`; older recipes that say `--spec-type mtp` will not work on the new build.
