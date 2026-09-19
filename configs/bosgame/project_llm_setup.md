---
name: Local LLM inference setup
description: Bosgame M5 running Qwen3.6 and Gemma 4 via llama.cpp Vulkan as NSSM Windows services, per-port per-model, accessible over LAN and Tailscale
type: project
originSessionId: 0b474313-d1be-49c1-8873-de20191bc74f
---

Local inference server running on the Bosgame M5 machine. Three OpenAI-compatible llama.cpp endpoints, each on its own port, each managed as a Windows service via NSSM.

**Why:** User runs their own LLM backend for AI app development, accessible from remote machines.

**How to apply:** When building apps that call an LLM, suggest using a Tailscale-addressed OpenAI-compatible base URL. Each model lives on its own port so misconfigured clients get a clear `ECONNREFUSED` rather than silently routing to the wrong model. API key is unused — any non-empty string works.

## Hardware

- Machine: Bosgame M5, Ryzen AI Max+ 395, 128 GB unified RAM
- GPU: Radeon 8060S (RDNA 3.5, gfx1150) — use **Vulkan**, NOT ROCm
- IPs: LAN `192.168.1.161`, Tailscale `100.<tailscale-ip-4>`

## Software stack

- llama.cpp **b8672** mainline at `C:\llama.cpp\` (no MTP — used as fallback only)
- **MTP fork build A** at `C:\Users\<user>\llms\llama.cpp-mtp\build-vk\bin\llama-server.exe` — `am17an/llama.cpp mtp-clean` branch, supports hybrid SSM models, flag dialect `--spec-type draft-mtp` + `--spec-draft-n-max N`. **Use this binary** for Qwen3.6 MTP models.
- **MTP fork build B** at `C:\llama.cpp-mtp\build\bin\Release\llama-server.exe` — different fork, dialect `--spec-type mtp` + `--draft-max N`. Cannot load Qwen3.6 hybrid SSM models (errors on `blk.N.ssm_conv1d.weight`). Currently used only for the Gemma 4 service. Should eventually be standardized away.
- Vulkan SDK **1.4.350.0** at `C:\VulkanSDK\1.4.350.0` (`VULKAN_SDK` machine env). Older 1.4.341.1 also installed for compatibility, harmless.
- Visual Studio Build Tools 2022 (MSVC 14.44, CMake 3.31, Ninja) at `C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\` if you need to build anything.
- **Smart App Control (SAC) is OFF** — disabled in Settings on 2026-05-17 (a one-way switch) to unblock the freshly-built unsigned MTP binary. Freshly compiled binaries now run without SAC interference. Some WDAC code-integrity policies may still apply; if a new binary is unexpectedly blocked, check those. (Verified `VerifiedAndReputablePolicyState = 0` on 2026-05-20.)

## Deployed models (NSSM Windows services)

Each is a separate service. State and start type can be inspected with `sc query <svc-name>`. AppParameters are stored in `HKLM\SYSTEM\CurrentControlSet\Services\<svc-name>\Parameters\AppParameters` — edit via `reg add` from an admin shell.

### Port 8080 — `llama-qwen-27b`
- Display name: `llama.cpp Server (Qwen3.6-27B)`
- Model: `C:\models\Qwen3.6-27B-MTP-GGUF\Qwen3.6-27B-UD-Q4_K_XL.gguf` (dense 27B with MTP head)
- Binary: `C:\Users\<user>\llms\llama.cpp-mtp\build-vk\bin\llama-server.exe`
- AppParameters: `-m <model> -ngl 99 -fa on -c 65536 -np 1 --host 0.0.0.0 --port 8080 --spec-type draft-mtp --spec-draft-n-max 2 --temp 0.7 --top-p 0.8 --chat-template-kwargs "{\"enable_thinking\":false}"`
- Context: **65,536** (KV f16 default — no `-ctk/-ctv` quantization configured)
- Served model id (from `/v1/models`): `Qwen3.6-27B-UD-Q4_K_XL.gguf` (filename — no `--alias` set)
- Sampling defaults: `--temp 0.7 --top-p 0.8` set server-side (Qwen non-thinking recommendation)
- Thinking: **disabled** server-side via `--chat-template-kwargs "{\"enable_thinking\":false}"` (set 2026-05-20)
- Performance baseline (dense 27B, bandwidth-bound): ~7-15 tok/s decode without MTP; expect modest MTP speedup

### Port 8081 — `llama-qwen-35b-a3b`
- Display name: `llama.cpp Server (Qwen3.6-35B-A3B)`
- Model: `C:\models\Qwen3.6-35B-A3B-MTP-GGUF\Qwen3.6-35B-A3B-UD-Q4_K_XL.gguf` (MoE 3B active + MTP head; hybrid SSM)
- Binary: `C:\Users\<user>\llms\llama.cpp-mtp\build-vk\bin\llama-server.exe` (same as 27B; the other build can't load hybrid SSM tensors)
- AppParameters: `-m <model> -ngl 99 -fa on -c 262144 -np 1 --host 0.0.0.0 --port 8081 --spec-type draft-mtp --spec-draft-n-max 2 --temp 0.7 --top-p 0.8 --chat-template-kwargs "{\"enable_thinking\":false}"`
- Context: **262,144** (256K — full native `n_ctx_train`; raised from 108K on 2026-06-17, no rope/YaRN scaling needed). KV (f16) ≈ 5.6 GB (target 5120 MiB + MTP draft 512 MiB); full GPU footprint ~28–30 GB.
- Served model id: `Qwen3.6-35B-A3B-UD-Q4_K_XL.gguf` (filename — no `--alias`)
- Sampling defaults: `--temp 0.7 --top-p 0.8` set server-side (Qwen non-thinking recommendation)
- Thinking: **disabled** server-side via `--chat-template-kwargs "{\"enable_thinking\":false}"` (set 2026-05-20)
- Performance baseline: ~50 tok/s decode without MTP; MTP active

### Port 8083 — `llama-gemma-26b`
- Display name: `llama.cpp Server (Gemma 4 26B)`
- Model: `C:\models\gemma-4-26B-A4B-it-GGUF\gemma-4-26B-A4B-it-UD-Q4_K_XL.gguf` (MoE 4B active)
- Binary: `C:\llama.cpp-mtp\build\bin\Release\llama-server.exe` (build B; works for Gemma)
- AppParameters: `-m <model> -ngl 99 -fa on -c 110592 -np 1 --host 0.0.0.0 --port 8083 --temp 1.0 --top-p 0.95 --top-k 64 --chat-template-kwargs "{\"enable_thinking\":false}"`
- Context: **110,592** (108K)
- Served model id: `gemma-4-26B-A4B-it-UD-Q4_K_XL.gguf` (filename — no `--alias`)
- No MTP (Gemma 4 MTP requires a separate `gemma4_assistant` draft head GGUF that we don't have)
- Sampling defaults: `--temp 1.0 --top-p 0.95 --top-k 64` set server-side — Unsloth's recommended Gemma 4 values. Gemma 4 wants a *high* temperature (per Unsloth, lowering it degrades quality even on coding tasks) — deliberately distinct from the Qwen services' no-think `0.7 / 0.8`.
- Thinking: **disabled** server-side via `--chat-template-kwargs "{\"enable_thinking\":false}"` (set 2026-05-20). Gemma 4's template *does* support thinking — it injects a `<|think|>` token gated on `enable_thinking`.
- Performance baseline: ~40 tok/s decode

## Common server flag conventions

- `-ngl 99` — offload all layers to Vulkan0
- `-fa on` — flash-attention enabled
- `-c <n>` — total context (also per-slot context because `-np 1`)
- `-np 1` — single slot (no parallel request slicing)
- KV cache is **f16 default** in all three services. If memory pressure ever matters, add `-ctk q8_0 -ctv q8_0` to AppParameters (halves KV size at tiny quality cost).
- No model alias is set on any service, so the OpenAI `/v1/models` id is always the raw GGUF filename.

## Default model selection / switching

The OpenCode (or any OpenAI-compatible) config should have **one provider per port**, single-model each. Switching active model = stop the current service, start the desired one, and update the client's `"model"` field. Bat helpers in `C:\Users\<user>\`:

- `switch_to_gemma.bat` — stops Qwen services, starts Gemma. Right-click → Run as administrator.
- `reconfig_gemma_qwen35b.bat` — rewrites AppParameters for Gemma + Qwen-35B-A3B (used for the ctx 110592 + MTP migration; keep as a template).
- `fix_qwen35b_mtp.bat` — emergency fix script for the 35B-A3B service. Currently encodes the working "build-vk fork + draft-mtp dialect" combination.
- `stop_llama_service.bat` — uninstalls the old single-service NSSM setup (kept for reference).

No-think helper scripts (PowerShell; launch elevated via `Start-Process -Verb RunAs`):

- `disable_qwen_thinking.ps1` — **35B-A3B** service: sets thinking-off + `--temp 0.7 --top-p 0.8`, `-c 110592` (108K); stops, rewrites AppParameters, restarts, polls `/health`, verifies. `... REVERT` re-enables thinking.
- `qwen27b_nothink.ps1` — **27B** service: sets thinking-off + `--temp 0.7 --top-p 0.8` (registry only — no stop/start, applies on next service start). `... REVERT` undoes it.
- `gemma_nothink.ps1` — **Gemma** service: sets thinking-off only, samplers untouched (registry only — applies on next service start). `... REVERT` undoes it.
- Superseded: `disable_qwen_thinking.bat` used `--reasoning-budget 0`, which does not actually disable thinking — kept only as a cautionary reference; use the `.ps1` instead.

Symmetric `switch_to_qwen_27b.bat` and `switch_to_qwen_35b_a3b.bat` would be nice to add if not yet present.

## Models on disk (`C:\models\`)

| Folder | File | Size | Notes |
|---|---|---|---|
| `Qwen3.6-27B-GGUF\` | `Qwen3.6-27B-UD-Q4_K_XL.gguf` | 16.8 GB | dense 27B, no MTP head |
| `Qwen3.6-27B-MTP-GGUF\` | `Qwen3.6-27B-UD-Q4_K_XL.gguf` | ~17 GB | **currently used** by 8080 service |
| `Qwen3.6-35B-A3B-GGUF\` | `Qwen3.6-35B-A3B-UD-Q4_K_XL.gguf` | 20.8 GB | MoE 3B active, no MTP head |
| `Qwen3.6-35B-A3B-MTP-GGUF\` | `Qwen3.6-35B-A3B-UD-Q4_K_XL.gguf` | ~23 GB | **currently used** by 8081 service |
| `gemma-4-26B-A4B-it-GGUF\` | `gemma-4-26B-A4B-it-UD-Q4_K_XL.gguf` | ~17 GB | **currently used** by 8083 service |

## Known gotchas

- **Reasoning models default to thinking mode — disabled server-side as of 2026-05-20.** All three (Qwen3.6 27B, Qwen3.6 35B-A3B, Gemma 4) have thinking-capable chat templates and, on llama-server, default to thinking ON (llama.cpp passes `enable_thinking=true` unless told otherwise). All three services now have thinking **disabled** server-side via `--chat-template-kwargs "{\"enable_thinking\":false}"` in AppParameters. To re-enable per service, drop that flag — or run the `*_nothink.ps1` / `disable_qwen_thinking.ps1` helpers with the `REVERT` argument (see helper scripts below).
- **Symptom when thinking is ON:** the model spends the whole `max_tokens` budget inside its think block, so the OpenAI `content` field comes back **empty** (`finish_reason: length`) and the reasoning ends up in the non-standard `reasoning_content` field. A simple prompt cost ~1000 tokens. Clients that read only `choices[0].message.content` see blank output. The Hermes agent timed out at ~91s for this reason.
- **`--reasoning-budget 0` does NOT disable thinking** on the build-vk MTP binary (build A) — the flag is parsed without error but the Qwen3.6 template still emits a full think block. Likewise the `reasoning_budget` request param. Only the `enable_thinking=false` template kwarg works. Use `--chat-template-kwargs`, never `--reasoning-budget`, to turn thinking off here.
- **Two different MTP fork builds with different flag dialects** — see Software Stack section. When changing AppParameters always match the dialect to the binary path.
- **SAC blocks fresh local builds.** Avoid rebuilding llama.cpp from source on this machine when possible. Use upstream release binaries or pre-built artifacts. The two MTP builds we have were both pulled through some workaround already.
- **NSSM PAUSED state ≠ paused** — when llama-server exits abnormally (bad flag, missing tensor, etc), NSSM enters PAUSED. The fix is to read `C:\llama.cpp\logs\<svc>\stderr.log`, correct AppParameters, then `sc stop` + `sc start`.
- **`sc start` / `sc stop` / `reg add HKLM\...\Services\...` all require admin.** Wrap any change in a `.bat` and launch via `Start-Process -Verb RunAs` (UAC prompt) or right-click → Run as administrator.
- **Never set AppParameters via `nssm set` when the value contains `--chat-template-kwargs "{\"...\":...}"`.** Passing that string as a native-command argument strips the quote-escaping, so the registry ends up with `{"enable_thinking":false}` (no backslashes); llama-server then dies with `json.exception.parse_error.101 ... '{e'` and NSSM goes to `PAUSED`. Write AppParameters with `Set-ItemProperty -Path HKLM:\...\Parameters -Name AppParameters -Value '<single-quoted literal with \" intact>'` instead — single quotes preserve the backslashes verbatim. Verified working for the 256K change on 2026-06-17.
- **Memory budget if all three run concurrently:** model footprints ~17 + 23 + 17 = 57 GB plus KV (f16) at 108K for the two big ones (~7-10 GB each) plus compute buffers — ~80-90 GB total comfortably inside 128 GB unified. Triple-concurrent inference will share GPU compute time; fine for occasional parallel use, not for sustained heavy load.

## OpenCode client template

```json
{
  "$schema": "https://opencode.ai/config.json",
  "provider": {
    "bosgame-qwen-27b": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "Bosgame Qwen3.6-27B",
      "options": { "baseURL": "http://100.<tailscale-ip-4>:8080/v1", "apiKey": "unused" },
      "models": {
        "Qwen3.6-27B-UD-Q4_K_XL.gguf": {
          "name": "Qwen3.6-27B (Q4_K_XL, 64K, dense, MTP, no-think)",
          "limit": { "context": 65536, "output": 8192 }
        }
      }
    },
    "bosgame-qwen-35b-a3b": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "Bosgame Qwen3.6-35B-A3B",
      "options": { "baseURL": "http://100.<tailscale-ip-4>:8081/v1", "apiKey": "unused" },
      "models": {
        "Qwen3.6-35B-A3B-UD-Q4_K_XL.gguf": {
          "name": "Qwen3.6-35B-A3B (Q4_K_XL, 256K, MoE 3B active, MTP, no-think)",
          "limit": { "context": 262144, "output": 8192 }
        }
      }
    },
    "bosgame-gemma-4": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "Bosgame Gemma 4 26B",
      "options": { "baseURL": "http://100.<tailscale-ip-4>:8083/v1", "apiKey": "unused" },
      "models": {
        "gemma-4-26B-A4B-it-UD-Q4_K_XL.gguf": {
          "name": "Gemma-4-26B-A4B (Q4_K_XL, 108K, MoE 4B active, no-think)",
          "limit": { "context": 110592, "output": 8192 }
        }
      }
    }
  },
  "model": "bosgame-gemma-4/gemma-4-26B-A4B-it-UD-Q4_K_XL.gguf"
}
```
