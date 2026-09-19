# Gemma 4 31B QAT on llama.cpp (MSI / RTX 5090 box)

**Status:** active — verified 2026-09-02

Build and serving notes for running **Gemma 4 31B QAT** via `llama.cpp` on the
Windows + WSL2 box (Ubuntu-24.04, user `<user>`, single RTX 5090 / 32 GB).

This is the sibling stack to the vLLM/Qwen setup documented in
[`connection-llm-setup.md`](./connection-llm-setup.md). Both target the one GPU,
so **only one inference server runs at a time** — the vLLM systemd units are
disabled/stopped while Gemma is active.

## Build

`~/gemma-build-step1.sh` installs `cmake` + the HF CLI (`uv tool install`),
clones `github.com/ggml-org/llama.cpp`, and runs the cmake configure. Build dir
`~/llama.cpp/build`, binaries in `~/llama.cpp/build/bin/` (`llama-cli`,
`llama-server`, `llama-completion`, `llama-bench`, `llama-mtmd-cli`).

Configure flags:

```
-DGGML_CUDA=ON -DCMAKE_CUDA_ARCHITECTURES=120 -DLLAMA_CURL=OFF \
-DGGML_CUDA_FA_ALL_QUANTS=ON -G Ninja   # Release
```

- cmake auto-promotes `120` → **`120a`** (correct Blackwell sm_120a target).
  CUDA toolkit is **13.0.88** (`/usr/local/cuda`); nvcc supports sm_120a fine.
  This is a source build, so it does **not** hit the PyTorch-wheel sm_120 gap
  that affects torch on Blackwell.
- `CURL=OFF` + no OpenSSL → `llama-server` has **HTTPS disabled**; it serves
  plain HTTP only. Fine behind the `:8100` TCP forwarder over Tailscale.
- ccache + NCCL not installed (warnings only; NCCL is multi-GPU, irrelevant here).

A **second build dir `~/llama.cpp/build-mtp`** (HEAD `f7ca93d`, 2026-06-12) was
later added for MTP support — see [MTP](#mtp-multi-token-prediction). It uses the
same flags plus an explicit `-DCMAKE_CUDA_COMPILER=/usr/local/cuda/bin/nvcc`
(non-interactive shells don't have nvcc on `PATH`, so cmake otherwise fails with
`No CMAKE_CUDA_COMPILER could be found`). The original `build/` is kept as the
proven no-MTP fallback. ~~**The live server now runs `build-mtp/bin/llama-server`.**~~
**Update 2026-08-10:** the live server moved again, to `build-muse/`
(b811-4dee52f) with `--spec-draft-n-max 2` — the v72 `build-mtp/` binary
predates the vision+MTP fixes validated by the collision soak. See
[the pilot outcome report](../../benchmarks/lane-assessments/report-msi-muse-glimmer-pilot-outcome.md).
References to `build-mtp` / n-max 3 below describe the June 2026 setup.

## Model

`unsloth/gemma-4-31B-it-qat-GGUF` (31B dense), downloaded with `hf download` to
`~/models/gemma-4-31b-qat/`:

- `gemma-4-31B-it-qat-UD-Q4_K_XL.gguf` (17.3 GB) — Unsloth Dynamic Q4_K_XL, the
  upgraded QAT quant that keeps sensitive layers higher-precision (not plain Q4_0).
- `mmproj-F16.gguf` (1.2 GB) — vision projector; Gemma 4 is multimodal.

Other options considered: `gemma-4-26B-A4B-it-qat-GGUF` (MoE, 4B active, faster)
and `gemma-4-12B-it-qat-GGUF` (lightest). All fit in 32 GB.

## Performance

Smoke test passed on the 5090. `system_info` confirms the build:
`CUDA : ARCHS = 1200 | USE_GRAPHS = 1 | FA_ALL_QUANTS = 1 | BLACKWELL_NATIVE_FP4 = 1`.

`llama-bench` (`-ngl 99 -fa 1 -p 512,2048 -n 128`):

| Metric | Result |
|---|---|
| pp512 | 4364 t/s |
| pp2048 | 3496 t/s |
| tg128 | 78.6 t/s |

For comparison, Qwen3-27B-NVFP4 on vLLM does ~52 tok/s baseline. These are the
**no-MTP baseline** numbers; with MTP speculative decoding enabled (now the
default on the live server) single-stream generation runs **~2× faster** — see
[MTP](#mtp-multi-token-prediction).

## Runtime gotchas

1. **Use `llama-completion`, not `llama-cli`.** This build split them; `llama-cli`
   is chat-only and rejects `-no-cnv`, then falls through into interactive mode
   and **hangs blocked on stdin with the model loaded** — looks exactly like a
   GPU hang (18–30 GB VRAM held, 0% util, state S) but is not. Diagnose stalls
   via `/proc/PID/stat` CPU jiffies + `nvidia-smi` util; frozen + idle = waiting
   on input, not computing.
2. **Always pass `--jinja`.** Gemma 4's chat template is custom; without it the
   built-in template parser aborts (`this custom template is not supported, try
   using --jinja`, core dump in `common_chat_format_example`).
3. **Always set `-c`.** Gemma 4 31B has `n_ctx_train = 262144` (256K); with no
   `-c`, KV-cache alloc balloons VRAM to ~30 GB. `-c 4096` → ~18.7 GB.
4. **Gemma 4 is a reasoning model** — it emits a `<|channel>thought …` trace
   before the answer. Use a generous `-n`; a small budget cuts it off mid-thought.
5. Redirect `< /dev/null` for a non-interactive one-shot — `llama-completion`
   still enables conversation mode when the GGUF ships a chat template, then EOFs
   out cleanly after the first response.

Working smoke-test command:

```bash
cd ~/llama.cpp && ./build/bin/llama-completion \
  -m ~/models/gemma-4-31b-qat/gemma-4-31B-it-qat-UD-Q4_K_XL.gguf \
  -ngl 99 -c 4096 -fa on --jinja -n 64 --temp 0 -p "..." < /dev/null
```

### Mode-specific notes

- **Reasoning** (`llama-completion --jinja -c 8192 -n 768 -f promptfile`): format
  is `<|channel>thought … <channel|>` then the final answer. Pass prompts via
  `-f promptfile`, not inline `-p "...$1.10..."` — `$` gets eaten by the nested
  `wsl.exe → bash -lc '...' → -p "..."` quoting and silently corrupts the prompt.
- **`llama-server --jinja`** (OpenAI-compatible, HTTP only): `/health`,
  `/v1/models`, `/v1/chat/completions` all work, ~74–77 tok/s. `--jinja`
  auto-splits reasoning into `reasoning_content` vs final `content`; with a small
  `max_tokens` the whole budget goes to `reasoning_content` and `content` comes
  back empty (`finish_reason:"length"`) — use `max_tokens` ≥ ~500. Bind
  `--host 127.0.0.1`; the forwarder handles external exposure.

## Serving setup (systemd, Tailscale)

Gemma is the active stack (vLLM disabled; the GPU fits only one). It mirrors the
vLLM four-pillar pattern in [`connection-llm-setup.md`](./connection-llm-setup.md).

- **Public URL for the Pi:** `http://100.<tailscale-ip-1>:8100/v1` (HTTP only, fine over
  Tailscale's tunnel). Served model id `gemma-4-31B-it-qat-UD-Q4_K_XL.gguf`.
- **Context window: 108K** = `-c 110592 -np 1` (single slot, so the whole window
  goes to each request — llama-server's default `-np 4` silently quarters it).
  Fits in f16 KV thanks to Gemma's sliding-window attention. With vision + MTP
  loaded the live server sits at **~28.9 GB / 32 GB** (~3.2 GB free). For bigger
  context or more slots add `--cache-type-k q8_0 --cache-type-v q8_0`.
- **Three systemd user units** in `~/.config/systemd/user/` (enabled + active;
  the timer also pulls a `gemma-health.service` oneshot):
  - `gemma.service` → `/bin/bash /mnt/c/Users/<user>/serve-gemma.sh` (foreground
    `exec build-mtp/bin/llama-server … -c 110592 -np 1 -fa on --jinja --mmproj … -md … --spec-type draft-mtp --spec-draft-n-max 3 -cram 4096 -ctxcp 6 --host 127.0.0.1 --port 8080`;
    since 2026-08-10 the script points at `build-muse/bin/llama-server` with
    `--spec-draft-n-max 2` instead (see the update note under [Build](#build));
    `KillSignal=SIGINT`, `Restart=always`, `StartLimitIntervalSec=0`,
    `TimeoutStartSec=600`). `Restart=always` + a disabled start-limit mean it
    always comes back from a crash and never hits the rate-limit giveup.
    **Do NOT add `After=default.target` to this unit** — it is already
    `WantedBy=default.target`, and having both creates a systemd ordering cycle
    that silently deletes the `gemma-bridge` start job (bridge stays `inactive`,
    so `:8100` never listens). This bit us on 2026-06-10.
  - `gemma-bridge.service` → `python3 /mnt/c/Users/<user>/tcp-forward.py 8100 127.0.0.1 8080`
    (`After/Wants=gemma.service`, `Restart=always`). Reuses the same forwarder as
    vLLM; target is `127.0.0.1:8080` (loopback works because llama-server binds
    `127.0.0.1` explicitly). The forwarder is needed because a direct `0.0.0.0`
    bind hits the WSL2 mirrored-mode external-SYN quirk (same one vLLM had).
  - `gemma-health.timer` → `gemma-health.service` (oneshot) →
    `/bin/bash /mnt/c/Users/<user>/gemma-healthcheck.sh`. A self-healing health
    watchdog that runs every 2 min (`OnBootSec=4min`, `OnUnitActiveSec=2min`). See
    **Self-healing / stability** below.
- **Port 8100** is the proven tailnet-ACL-allowed port (8000 is silently dropped
  by the ACL). Shared with the disabled vLLM bridge — re-enabling vLLM would
  collide on 8100 **and** the GPU. To switch back:
  `systemctl --user disable --now gemma gemma-bridge && systemctl --user enable --now vllm vllm-bridge`.
- **VM keepalive:** the `WSL-Pin` Task Scheduler task (`wsl-pin.vbs` → a
  persistent `wsl.exe … exec sleep infinity`) + `loginctl enable-linger <user>`.
  Without the pin, the WSL VM is reaped ~90 s after the last `wsl.exe` connection,
  taking every systemd-user service with it. See **Self-healing / stability** for
  the hardened task config.
- Helper scripts: `~/start-gemma.sh` (manual launch, `CTX=`/`PORT=` overridable),
  `/mnt/c/Users/<user>/serve-gemma.sh` (systemd target),
  `/mnt/c/Users/<user>/gemma-healthcheck.sh` (health watchdog), `~/poll-health.sh`,
  `~/test-chat.sh`. Logs: `journalctl --user -u gemma -f` / `-u gemma-bridge -f` /
  `-u gemma-health -f`.

### Host RAM (WSL ceiling + cache caps)

`llama-server`'s **host-RAM** use — not VRAM — was OOM-killing `gemma.service`
under sustained load (journal `oom-kill`, **30.2 GB peak** on 2026-06-14). Two
unbounded host-side pools were the cause, summing past WSL's memory ceiling:

| Pool | Flag | Default | Each | Default total |
|---|---|---|---|---|
| SWA context checkpoints | `-ctxcp` / `--ctx-checkpoints` | 32 | 800 MiB | ~25.6 GB |
| Prompt cache | `-cram` / `--cache-ram` | 8192 MiB | — | 8 GB |

32 × 800 MiB + 8 GB ≈ **33.6 GB**, over the **31 GB** ceiling (WSL defaults to 50 %
of the 63 GB host, and `.wslconfig` had no `memory=`). Fixed two ways:

1. **Cap the pools** — added `-cram 4096 -ctxcp 6` to `serve-gemma.sh` (worst case
   now 4.8 + 4 ≈ **8.8 GB**). Startup log confirms `context checkpoints enabled,
   max = 6`. **No perf cost** (verified 2026-06-14): gen **182 tok/s** (≈ MTP
   baseline), draft acceptance **0.80**, prompt cache still hits (repeat-prompt
   prefill 323 vs 108 t/s cold). The flags only affect prefill latency on deep
   context-rewind / cache-miss — not tok/s, quality, VRAM, or MTP; for a single
   slot, fewer checkpoints just trims old context-restore points.
2. **Raise the ceiling** (defense-in-depth) — `memory=48GB` in
   `C:\Users\<user>\.wslconfig` (host has 63 GB → ~47 GiB seen in WSL, swap
   auto-scales to 12 GiB). A `.wslconfig` change **requires `wsl --shutdown`** to
   take effect (disruptive — kills the VM; services return via linger + WSL-Pin).
   Relaunch the pin immediately afterward so the VM stays up rather than waiting for
   the 5-min WSL-Pin trigger:
   `Start-Process wscript.exe -ArgumentList '"C:\Users\<user>\wsl-pin.vbs"' -WindowStyle Hidden`.

The cap (1) is the root-cause fix; the ceiling bump (2) is just headroom.

### Operational gotchas

- `pkill -f llama-server` **self-matches** — the pattern appears in the `bash -lc
  '...'` cmdline, so pkill SIGTERMs its own shell. Use the bracket trick:
  `pkill -f "llama-ser[v]er"`.
- Heredocs piped through `wsl.exe` get CRLF-ified — `\` line-continuations break
  and `cat -A` shows `^M`. Fix with `sed -i 's/\r$//' FILE`, then verify with
  `cat -A`.

### Self-healing / stability

Hardened 2026-06-10 so the stack recovers on its own from VM reaps, a dead pin
process, a gemma crash, **and** a gemma hang. Four independent layers:

1. **Windows pin task (`WSL-Pin`) — runs headless + self-heals.** Principal is
   **S4U** ("run whether user is logged on or not", no stored password), so the
   pin comes up after a reboot **even with no interactive login** — the old
   `Interactive`/`Limited` principal could not. Two triggers: at-logon *plus* a
   **time trigger repeating every 5 min** (for ~3650 days). With the task's
   `MultipleInstances=IgnoreNew`, the 5-min fire is a watchdog — a no-op while the
   pin lives, a relaunch if `wscript` died. Reconfigure from PowerShell:

   ```powershell
   $principal = New-ScheduledTaskPrincipal -UserId "msioffice\<user>" -LogonType S4U -RunLevel Limited
   $logon = New-ScheduledTaskTrigger -AtLogOn -User "msioffice\<user>"
   $watch = New-ScheduledTaskTrigger -Once -At (Get-Date).Date `
            -RepetitionInterval (New-TimeSpan -Minutes 5) -RepetitionDuration (New-TimeSpan -Days 3650)
   $settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -StartWhenAvailable `
            -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero)
   Set-ScheduledTask -TaskName "WSL-Pin" -Principal $principal -Trigger @($logon,$watch) -Settings $settings
   ```

   NOTE: under S4U, `Start-ScheduledTask -TaskName WSL-Pin` actually runs
   on-demand; under the old Interactive principal it silently did nothing.

2. **`gemma.service` Restart=always + StartLimitIntervalSec=0** — always restarts
   on crash, never gives up. (`systemd` `Restart=` only catches *process exit*,
   not a hung-but-alive server — hence layer 4.)

3. **`loginctl enable-linger <user>`** — the `<user>` systemd-user manager (and thus
   gemma/bridge/health) runs at WSL boot without a login session, as long as the
   VM is pinned (layer 1).

4. **In-WSL health watchdog** (`gemma-health.timer` → `gemma-healthcheck.sh`,
   every 2 min) — catches the "process alive but not serving" hang that `Restart=`
   misses. It restarts `gemma` **only if** the unit is `active` **and** has been up
   past a **240 s grace window** (uptime via `ActiveEnterTimestampMonotonic` vs
   `/proc/uptime`) **and** two `/health` probes 5 s apart both fail. The grace gate
   is essential — without it the watchdog would kill the server mid cold-load
   (~75 s) and loop forever. If the unit isn't `active` it defers to `Restart=`,
   and a deliberate `systemctl --user stop gemma` correctly stays stopped.

Not done (security tradeoff, left to operator): Windows **autologon** would also
bring the interactive desktop session up unattended after a reboot. S4U already
covers the headless service case without storing a password, so it isn't required.

### Client notes (Pi agent)

- **Pi provider:** `msioffice-gemma` (registered by the `~/.pi/agent/extensions/msioffice-gemma.ts` extension), model id `gemma-4-31B-it-qat-UD-Q4_K_XL.gguf`, pointing at `http://100.<tailscale-ip-1>:8100/v1`. This is a **direct LAN provider** that bypasses the unified gateway (see [`unified-model-gateway.md`](../unified-model-gateway.md)).
- `max_tokens` ≥ ~500 (reasoning eats the budget → empty `content` otherwise).
- Answer in `.content`, thought in `.reasoning_content` (split by `--jinja`).
- No API key needed (send any non-empty string).
- **Tool/function-calling is untested** on this llama-server build — verify before
  relying on it. The old Qwen/vLLM agent used `tool_choice:"auto"` + the
  `qwen3_xml` parser, which does not carry over.

## Vision (multimodal)

Enabled on the live server (2026-06-09) by adding the projector flag to
`serve-gemma.sh` (the systemd `ExecStart`):

```
--mmproj /home/<user>/models/gemma-4-31b-qat/mmproj-F16.gguf
```

Multimodal then rides the same OpenAI `/v1/chat/completions` endpoint on `:8100`.
It persists across restarts/VM reboots; revert by removing the flag and
`systemctl --user restart gemma`. No rebuild needed — the build (`6b80c74`) has
full `--mmproj` support.

**Empirical costs** (measured with a 28.2 MP / 9.83 MB JPEG):

| Cost | Value |
|---|---|
| VRAM added (resident F16 projector) | +1264 MiB (logged worst-case 1290 MiB; ~4 GB still free at `-c 110592`) |
| Image → context tokens | ~294 |
| Image encode time | 288 ms |
| Generation speed | ~73 tok/s (no regression) |

- **Image file size (MB) is irrelevant to VRAM.** Decode is host-RAM only; the
  `gemma4v` preprocessor downscales to a fixed 224 px-based representation
  (`image_size 224`, `patch 16`) *before* the GPU. A 28 MP image is not a large
  pan-and-scan explosion — it collapses to ~294 tokens.
- The knob that matters is `--image-max-tokens` (detail vs latency), **not** VRAM.
  The `q8_0` KV mitigation is not needed for vision at full 108K context.
- **Client:** send images as base64 data URIs (WSL has no egress to fetch image
  URLs); keep `max_tokens` ≥ ~500. Verified end-to-end — the model OCR'd text +
  code `7Q4-X91` and identified all three shapes from the test image.

Vision was also confirmed standalone via
`llama-mtmd-cli --mmproj mmproj-F16.gguf --jinja --image FILE -p "..."` (the same
`--jinja` requirement applies; the reasoning channel works in the multimodal path).

## MTP (multi-token prediction)

Enabled on the live server **2026-06-12**. MTP is Unsloth's speculative-decoding
drafter for Gemma 4: a small head predicts several next tokens and the main model
verifies them in parallel, so single-stream generation needs fewer forward passes.
This is the **ideal workload for it** here — `-np 1`, a single Pi client, so
generation is latency/bandwidth-bound (batch=1), exactly where speculative
decoding pays off. Net result: **~75 → ~150–177 tok/s (2.0–2.35×)** for **+~0.4 GB
VRAM**, with vision still working alongside it.

### Setup

1. **Drafter file** — `mtp-gemma-4-31B-it.gguf` (smart Q4_0, **only 267 MB**: it's
   just the MTP head and shares the target's KV cache, *not* a 2 GB model):

   ```bash
   hf download unsloth/gemma-4-31B-it-qat-GGUF mtp-gemma-4-31B-it.gguf \
     --local-dir ~/models/gemma-4-31b-qat/
   ```

2. **Build** — needs llama.cpp **≥ 2026-06-07** (PR ggml-org/llama.cpp#23398). The
   original `build/` (HEAD `6b80c74`, 2026-06-06) predates MTP, hence the separate
   `build-mtp/` (see [Build](#build)).

3. **Server flags** — `-md <drafter> --spec-type draft-mtp --spec-draft-n-max 3`
   (`-md` = `--spec-draft-model`/`--model-draft`). Auto-discovery only works with
   `-hf`; for a local `-m` you **must** pass `-md` explicitly. These are now in
   `serve-gemma.sh` (backup `serve-gemma.sh.pre-mtp.bak`).

### Measured (`-spec-draft-n-max` sweep, coding prompt, temp 0, `-c 8192`, `-np 1`)

| n-max | tok/s | speedup | draft acceptance |
|---|---|---|---|
| baseline (off) | 75 | 1.0× | — |
| 2 | 152 | 2.02× | 0.88 |
| **3 (chosen)** | **177** | **2.35×** | 0.78 |
| 4 | 165 | 2.19× | 0.68 |
| 6 | 177 | 2.35× | 0.57 |

`n-max=3` ties the throughput peak while wasting the least draft compute (`n-max=6`
matches the speed but burns far more on rejected drafts). Acceptance is
prompt-dependent (~0.6–0.88); short/creative prompts accept less but still hit ~2×.
Full production config (108K ctx + `--mmproj` + MTP) loads to **28.9 GB / 32 GB**
and **vision coexists** (verified: OCR'd the test image with MTP active). Confirmed
live through `:8100` at ~168 tok/s.

**Revert:** restore `serve-gemma.sh.pre-mtp.bak` (or drop the `-md`/`--spec-*`
flags and point the binary back at `./build/bin/`), then
`systemctl --user restart gemma`.

### MTP gotchas

- **MTP is a `llama-server` feature, not `llama-cli`/`llama-completion`.** The
  `--spec-type`/`--spec-draft-*` flags are registered only for the server example;
  passing them to `llama-completion` fails with a misleading
  `error: invalid argument: 99` (it desyncs the `-ngl` arg). Benchmark via the
  server — `/v1/chat/completions` returns `timings.draft_n` / `draft_n_accepted`.
- **Detached jobs over `wsl.exe`:** `setsid bash -c "..." &` launched from
  `wsl.exe … -- bash -lc` dies instantly unless the launching call stays alive
  briefly afterward (add a trailing `sleep`) — otherwise WSL session teardown kills
  the not-yet-reparented child. And inline `$(seq …)` / `$((…))` inside a
  `bash -lc '...'` string gets mangled (`syntax error near unexpected token`); put
  loops/arithmetic in a script **file** instead.

## GPU power cap (475 W)

The RTX 5090's default/max board power is **575 W** (min 400 W). It is capped to
**475 W** to cut heat and draw with negligible inference impact — generation here
is latency-bound at batch=1 (`-np 1`, single client), not power-bound:

```powershell
nvidia-smi -pl 475
```

- **Verify with `nvidia-smi --query-gpu=power.limit --format=csv`.** The
  `nvidia-smi -q -d POWER` readback is stale/cached and can still show 575 W right
  after a successful set.
- **Not persistent across a Windows reboot** on GeForce/WDDM (no persistence mode),
  and **observed to silently revert to 575 W mid-uptime** (2026-09-02: box up 21 days
  since the 2026-08-12 boot, task had logged OK at that boot, yet `power.limit` read
  575 W; the burst of 84 `nvlddmkm` event-13 errors on 2026-08-15 is the likely GPU
  reset). A boot-only task is therefore not enough. Scheduled task
  **`GPU-PowerLimit-475W`** (principal **SYSTEM**, RunLevel Highest) now has three
  triggers — **AtStartup, AtLogOn, and every 30 minutes** — and runs
  `C:\Users\<user>\set-gpu-power-limit.ps1` (vendored here as
  `set-gpu-power-limit.ps1`). The script is idempotent: it queries
  `--query-gpu=power.limit` first, only calls `nvidia-smi -pl 475` on drift, retries
  up to 12× (driver may not be ready at early boot), and logs only drift/failures to
  `C:\Users\<user>\gpu-pl.log` — a quiet log means the cap held. It runs as SYSTEM
  (not the WSL-Pin S4U pattern) because it needs no user/WSL context. The cap survives
  a `wsl --shutdown` (it's host-side). Remove with
  `Unregister-ScheduledTask -TaskName GPU-PowerLimit-475W`.

## Test assets

Generated at `~/vision-test/` (PIL: `scene.png`, `prompt.txt`, `req.json`/`req2.json`;
plus `test10mb.jpg` — 6400×4400 / 28.2 MP / 9.83 MB, the vision round-trip image
with a red square + blue circle + green triangle + text + code `7Q4-X91`).

Note: curl/wget cannot reach the internet from WSL here (DNS/egress blocked) —
generate test images locally with PIL (in `~/vllm-venv`) rather than downloading.
