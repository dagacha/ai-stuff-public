# Local LLM connection setup (Windows + WSL2 + Tailscale)

Local vLLM server in WSL2 on this Windows box, served to a Raspberry Pi (and other tailnet devices) over Tailscale. As of 2026-05-23 the end-to-end path is verified working from Mac and Pi.

## Hardware

Host: Windows 11 desktop with **NVIDIA GeForce RTX 5090 (32 GB VRAM)**, driver 581.57. The numbers and sizing claims throughout this doc assume that GPU; anything smaller (4090/24 GB, 3090/24 GB, etc.) needs `--gpu-memory-utilization` lowered and likely a smaller/more-aggressively-quantized model.

## Security & exposure

The vLLM endpoint has **no authentication** — anyone on this tailnet (including any device a tailnet member adds) can hit `http://100.<tailscale-ip-1>:8100/v1` and run inference. Tailnet membership is the only gate. The Tailscale CGNAT-range firewall rules block off-tailnet traffic; do not loosen those (e.g. binding the public port to the LAN IP) without adding an auth layer in front. Fine for a single-user home lab; not appropriate for shared/business tailnets.

## Repo ↔ deployment layout

Canonical copies of every file referenced below live in this repo under `configs/msi/`. They get deployed to the runtime locations in the table at the bottom (most to `C:\Users\<user>\`, the systemd units to `~/.config/systemd/user/` inside WSL). When making changes, edit the repo copy and run:
```
wsl -d Ubuntu-24.04 -u <user> -- bash /mnt/c/Users/<user>/dagacha/ai-stuff/configs/msi/sync-to-runtime.sh
```
That script (`configs/msi/sync-to-runtime.sh`) compares each repo file to its deployed counterpart with `cmp -s`, copies only the ones that differ, and restarts exactly the systemd services whose backing files changed (`daemon-reload` if a `.service` itself changed). It's idempotent — safe to run as often as you like; a no-op when nothing has drifted.

## Architecture

```
  Pi / Mac (tailnet peer)
       │  HTTP to 100.<tailscale-ip-1>:8100
       ▼
  Tailscale tunnel (UDP)
       │
       ▼
  Windows: tailscaled  ──►  Tailscale wintun adapter (100.<tailscale-ip-1>)
                                 │  (mirrored networking)
                                 ▼
  WSL2 (Ubuntu-24.04) eth2 (mirrored, same 100.<tailscale-ip-1>)
       │
       ▼
  Python TCP forwarder    ── LISTEN 0.0.0.0:8100
       │  forwards to 100.<tailscale-ip-1>:8101 (Tailscale upstream)
       ▼
  vLLM (uvicorn)          ── LISTEN 0.0.0.0:8101
       │
       ▼
  Qwen3.6-27B (NVFP4)  +  qwen3_xml tool parser
```

**Public endpoint:** `http://100.<tailscale-ip-1>:8100/v1`
**Served model id:** `qwen3.6-27b-nvfp4`

## Why the forwarder is in the picture

vLLM's own uvicorn listener does **not** receive external SYNs over WSL2 mirrored networking on this box. Swap the listener for `nc -l -p PORT -k` or `python3 -m http.server PORT --bind 0.0.0.0` and external traffic immediately reaches it on the same port with the same firewall rules. Identical socket bindings according to `ss`, `lsof`, `/proc/net/tcp` — root cause unknown.

Workaround: vLLM listens on a port the outside world doesn't reach, and a standard-Python TCP forwarder (which binds in a way mirrored mode accepts) exposes the public port.

## Why port 8100 (not 8000)

External Tailscale peers' TCP to `100.<tailscale-ip-1>:8000` silently times out before SYN-ACK. Other ports (9999, 8100, 8200) all work from the same peers with identical firewall rules. Almost certainly a tailnet ACL excluding `*:8000`, configured at <https://login.tailscale.com/admin/acls>. Couldn't be verified directly — Tailscale CLI on this host is locked to user `<user>` (401 Unauthorized for `<user>`).

## Running it — set-and-forget via systemd (current setup)

As of 2026-05-23 both processes run as **WSL user-systemd services** under user `<user>`, with linger enabled. They survive ssh/RDP disconnect, terminal close, and WSL VM restarts. Auto-restart on failure.

Service files (in `~/.config/systemd/user/`):
- `vllm.service` — runs `serve-thinkingcap.sh` (`morosystems/ThinkingCap-Qwen3.6-27B-NVFP4`, 128K ctx, MTP n=5 — production since 2026-07-22; previously `serve-official.sh`/nvidia official, before that `serve-vllm.sh`/AEON), restarts on failure with 10s backoff, 10 min start timeout, `MemoryHigh=34G`/`MemoryMax=38G` to contain JIT compile spikes
- `vllm-bridge.service` — runs the Python TCP forwarder, restarts always with 5s backoff

Day-to-day commands:
```
# Status
wsl -d Ubuntu-24.04 -u <user> -- systemctl --user list-units 'vllm*'

# Logs (follow)
wsl -d Ubuntu-24.04 -u <user> -- journalctl --user -u vllm -f
wsl -d Ubuntu-24.04 -u <user> -- journalctl --user -u vllm-bridge -f

# Restart (e.g. after editing serve-thinkingcap.sh)
wsl -d Ubuntu-24.04 -u <user> -- systemctl --user restart vllm

# Stop / start
wsl -d Ubuntu-24.04 -u <user> -- systemctl --user stop vllm vllm-bridge
wsl -d Ubuntu-24.04 -u <user> -- systemctl --user start vllm vllm-bridge

# Disable autostart (services won't run on next WSL boot)
wsl -d Ubuntu-24.04 -u <user> -- systemctl --user disable vllm vllm-bridge
```

After editing a `.service` file in `~/.config/systemd/user/`, run `systemctl --user daemon-reload` before restart.

**To switch models** under systemd: edit `vllm.service`'s `ExecStart=` line to point at the launcher for the model you want — `serve-thinkingcap.sh` (production), `serve-official.sh` (official checkpoint), or `serve-vllm.sh` (AEON / positional-args) — then `daemon-reload && restart`. Note the production and official launchers hardcode their model (extra args are forwarded to `vllm serve` but do not replace it); only `serve-vllm.sh` accepts positional `MODEL SERVED_NAME PARSER` args.

Verify externally:
```
wsl -d Ubuntu-24.04 -u <user> -- bash -lc "curl -s http://100.<tailscale-ip-1>:8100/v1/models"
```

The services are **enabled** and will auto-start when WSL boots. Linger is enabled for `<user>` so the user manager runs without anyone logged in. **Critically, `vmIdleTimeout=-1` must be set in `%USERPROFILE%\.wslconfig`** under `[wsl2]` — without it WSL's default 60s idle timer reaps the VM (and everything inside it including the user manager) whenever no foreground session is attached. Linger alone does *not* prevent this; verified 2026-05-23 that with the default 60s timer the entire systemd user instance restarts each idle cycle, causing repeated vLLM reloads. With `vmIdleTimeout=-1` confirmed: PIDs stable across 2+ minute idle periods with no WSL interaction.

Three settings combined make it "set and forget":
1. `vmIdleTimeout=-1` in `.wslconfig` (keeps the VM alive)
2. `loginctl enable-linger <user>` (keeps the user manager alive without login)
3. `systemctl --user enable vllm vllm-bridge` (auto-start at user manager boot)

## Manual launch — two one-liners, two PowerShell windows

Use this if you've stopped the systemd services and want to run interactively (e.g. for debugging):

The vLLM server and the networking bridge are independent. Each runs in its own foreground PowerShell window:

**Window 1 — vLLM (networking-agnostic):**
```
wsl -d Ubuntu-24.04 -u <user> -- bash /mnt/c/Users/<user>/serve-vllm.sh
```
No args → relaunches the currently configured model (Qwen3.6-27B + qwen3_xml parser) on internal port 8101. Watch for `Application startup complete` (~75s warm, 3-5 min cold).

To run a different model without editing files, pass positional args:
```
wsl -d Ubuntu-24.04 -u <user> -- bash /mnt/c/Users/<user>/serve-vllm.sh Qwen/Qwen3-32B-Instruct qwen3-32b qwen3_xml
```
Order is `MODEL_REPO SERVED_NAME PARSER`. Anything after the third arg is passed through to `vllm serve` verbatim, e.g. `... --max-model-len 32768`.

**Window 2 — the networking bridge:**
```
wsl -d Ubuntu-24.04 -u <user> -- python3 /mnt/c/Users/<user>/tcp-forward.py 8100 100.<tailscale-ip-1> 8101
```
Listens on `0.0.0.0:8100` (the public Tailscale-reachable port) and forwards to vLLM at `100.<tailscale-ip-1>:8101`.

You can start the bridge before or after vLLM — until vLLM is up it'll just fail upstream connects and clients will see brief errors; that's fine.

**Keep both windows open.** Closing either lets WSL2 idle-timeout (60s) reap the VM and kill the other. To make vLLM survive terminal close, add `vmIdleTimeout=-1` to `%USERPROFILE%\.wslconfig` under `[wsl2]` and run `wsl --shutdown` once to apply.

**Verify** from any PowerShell:
```
wsl -d Ubuntu-24.04 -u <user> -- bash -lc "curl -s http://100.<tailscale-ip-1>:8100/v1/models"
```
Should return JSON listing the served model.

**Stop:** Ctrl-C in each window.

**All-in-one alternative:** `start-vllm.sh` does both in a single window (forwarder in bg with a cleanup trap, vLLM in fg). Use it when you don't want to manage two windows.

## Remote operation

Already covered by systemd + linger (above). Both services run independent of any login session, so RDP/SSH disconnect doesn't matter — `journalctl --user -u vllm -f` over ssh to tail logs, then disconnect freely.

For ad-hoc debugging without touching the systemd services, the manual two-window flow above still works once you `systemctl --user stop vllm vllm-bridge` first.

## Switching to a different model

For ad-hoc tests pass the model as args to `serve-vllm.sh`:
```
wsl -d Ubuntu-24.04 -u <user> -- bash /mnt/c/Users/<user>/serve-vllm.sh \
  Qwen/Qwen3-32B-Instruct qwen3-32b qwen3_xml
```
That's the whole switch — the bridge in Window 2 doesn't need to change (it's port-only).

Picking the args:

1. **Model repo** — the HuggingFace path. Check it fits in the RTX 5090's 32 GB VRAM at 93% utilization (≈30 GB usable). 27B at NVFP4 fits with room for KV cache at 131k context; 32B at FP8/NVFP4 fits with smaller context; 70B doesn't fit at any usable quant. Multimodal models with vision towers eat additional headroom — drop `--gpu-memory-utilization` to ~0.85 first.

2. **Served name** — anything you like. This is the `model:` value the Pi/Mac agent must send. Keep it short and stable.

3. **Tool-call parser** — pick by model family:
   | Model family | Parser |
   |---|---|
   | Qwen3 Text/Instruct | `qwen3_xml` |
   | Qwen3 Coder | `qwen3_coder` |
   | Qwen2.5, Hermes-style finetunes | `hermes` |
   | Llama 3 instruct | `llama3_json` |
   | Mistral instruct | `mistral` |
   | DeepSeek V3 | `deepseek_v3` |

   Full list lives in `\\wsl.localhost\Ubuntu-24.04\home\<user>\vllm-venv\lib\python3.12\site-packages\vllm\tool_parsers\__init__.py`. If the model doesn't do tool calls, you'd want to drop `--enable-auto-tool-choice` and `--tool-call-parser` from the script — but `serve-vllm.sh` always passes them, so for non-tool-calling models edit the script directly.

4. **Extra flags** — append after the three positional args. Common tweaks:
   - `--max-model-len 32768` — smaller context window if the model can't do 131072 (check HF config).
   - `--gpu-memory-utilization 0.85` — lower if you OOM during model load.
   - drop `--kv-cache-dtype fp8` if model docs warn against KV quant.
   - drop `--language-model-only` for multimodal use — but see the vision section: on this stack (vLLM 0.24) vision + MTP spec decode crashes the engine; drop MTP too if enabling vision.

5. **First launch is slow** (3-5+ min) — weights download + AOT compile for the new architecture. The compile cache is per-model, so the second launch of that same model is ~75s.

6. **Update the Pi/Mac client config** to use the new `SERVED_NAME` value.

7. **If you also need a different public port,** edit `tcp-forward.py`'s second arg in Window 2 and add new firewall rules (next section). Verify the new port isn't blocked at the tailnet ACL layer before committing — see "Verifying a new port".

**Making the change permanent:** edit the defaults at the top of `serve-vllm.sh` so future no-arg invocations use the new model.

### Model availability / fallbacks

**Production since 2026-07-22 is `morosystems/ThinkingCap-Qwen3.6-27B-NVFP4`** via [`serve-thinkingcap.sh`](serve-thinkingcap.sh) — a community NVFP4 W4A4 requant of bottlecapai's ThinkingCap, an online-RL finetune of Qwen3.6-27B that emits **~50% fewer thinking tokens** at near-identical quality (card: out-of-domain 81.5% → 80.7%). MTP head preserved; `num_speculative_tokens=5` chosen by on-box sweep (see flags section). Measured through the bridge: **~92 tok/s median decode** (vs ~70.6 on the official checkpoint), plus the halved reasoning length — net ~2–3× lower wall-clock per response. Since the 2026-08-13 card-recipe promotion it runs on the vLLM 0.27.1 venv (`/home/<user>/vllm-0.27-venv`) with `qwen3_next_mtp` spec decode and temp 1.0 (see flags section); 128K ctx; tool calling (`qwen3_xml`) and reasoning split verified end-to-end.

**Vision DISABLED as of 2026-07-26** (`--language-model-only` is back in the launcher): vision + MTP spec decode in vLLM 0.24 caused three CUDA illegal-memory-access engine crashes, all mid-decode on large vision requests (~12–15K prompt tokens); the third happened with `--async-scheduling` already removed, isolating the vision+MTP combination as the trigger. MTP (~92 tok/s) was kept over vision. Mitigations that stayed: `Restart=always` in `vllm.service` (vLLM exits 0 after EngineCore/worker crashes, so `on-failure` never fired) and `--async-scheduling` removed. **To re-try vision:** drop `--language-model-only` AND the `--speculative-config` line — upgrading vLLM does not help: the vision+MTP crash reproduced on 0.26.0 (2026-07-26, first request) and again on nightly >0.27 (2026-08-13, see `benchmarks/lane-assessments/report-msi-nemotron-3.5-lightning-30b.md`) — the bug is NOT fixed upstream. Pi clients must not declare image capability for this endpoint while vision is off.

Historical notes from the 2026-07-23→26 vision window (valid if re-enabled):
- **Clients must send base64 data URIs** — WSL has no internet egress to fetch image URLs.
- **Images are token-expensive with this model:** the 28 MP test image cost **~16.3K prompt tokens** (Qwen's vision tokenizer scales with resolution — unlike Gemma's fixed ~294 tokens/image). Downscale client-side (~1–2 MP is plenty for most tasks) to keep prompts cheap and prefill fast.
- **VRAM cost:** GPU sits at ~32.0 GB during/after vision use (vs ~30.1 GB text-only) — at the card's ceiling but stable; KV cache shrank 237K → **199K tokens**. Text decode unaffected (~90 tok/s). If load-time OOM ever appears, drop `MSI_GPU_MEMORY_UTILIZATION` toward 0.85.

Fallback/rollback options:

- **Official-checkpoint rollback:** point `vllm.service`'s `ExecStart=` back to `serve-official.sh` (official `nvidia/Qwen3.6-27B-NVFP4`, production 2026-07-02 → 2026-07-22, 70.6 tok/s, permanent HF availability), `daemon-reload && restart`. See [`benchmarks/lane-assessments/report-msi-Qwen3.6-27B-official-NVFP4.md`](../../benchmarks/lane-assessments/report-msi-Qwen3.6-27B-official-NVFP4.md). Note ThinkingCap, like AEON, is a community quant that could vanish from HF — the cached snapshot keeps working.
- **AEON rollback (known-good, instant):** point `vllm.service`'s `ExecStart=` back to `serve-vllm.sh` (defaults to `AEON-7/Qwen3.6-27B-AEON-Ultimate-Uncensored-Text-NVFP4-MTP-XS` on the 0.21 venv), `daemon-reload && restart`. Caveat: AEON is a community quant that could disappear from HF (uploader removal, DMCA) — the weights snapshot in `~/.cache/huggingface/hub/` keeps working regardless.
- Same architecture, different quant: search HF for other `Qwen3.6` / `Qwen3-27B` / `Qwen3-32B` NVFP4 or FP8 quants (e.g. `RedHatAI/`, `nvidia/`, `Qwen/` official org).
- Stock Qwen3 from the official `Qwen/` org — bigger memory footprint, you'll likely need to drop `--max-model-len` to ~32k.
- Any model in the [parser table above](#switching-to-a-different-model) — just match `--tool-call-parser` to the family.

Worth keeping a working snapshot of the model weights at `~/.cache/huggingface/hub/` (already there from first use) — those persist even if the HF repo vanishes, so existing installs keep working.

## Verifying a new port isn't blocked by tailnet ACL

If you ever pick a port other than 8100, sanity-check that the tailnet allows it before debugging deeper. Inside WSL:

```
nc -l -p NEW_PORT -k &
```

Add matching Hyper-V + WDF Allow rules for `NEW_PORT` (elevated PowerShell):

```
New-NetFirewallHyperVRule -DisplayName "test-NEW_PORT" -Direction Inbound -Action Allow `
  -Protocol TCP -LocalPorts NEW_PORT -RemoteAddresses '100.64.0.0/10' `
  -VMCreatorId '{40E0AC32-46A5-438A-A0B2-2B479E8F2E90}'
New-NetFirewallRule -DisplayName "test-NEW_PORT" -Direction Inbound -Action Allow `
  -Protocol TCP -LocalPort NEW_PORT -RemoteAddress '100.64.0.0/10' -Profile Any
```

From a tailnet peer:

```
curl -m 5 -v http://100.<tailscale-ip-1>:NEW_PORT/
```

If the `* Connected to ...` line appears, the port traverses tailnet+firewall fine and you can use it. If it times out before connecting (no `Connected` line), the tailnet ACL blocks that port — pick another one or edit the ACL at <https://login.tailscale.com/admin/acls>.

## Verifying

From inside WSL:

```
ss -tln | grep -E ':8100|:8101'                    # both should LISTEN
curl http://100.<tailscale-ip-1>:8100/v1/models          # should return JSON
```

From a tailnet peer (Mac, Pi):

```
curl -m 10 http://100.<tailscale-ip-1>:8100/v1/models    # should return JSON
```

Quick tool-call sanity check (full request body in `tool-test.json`):

```
curl -X POST http://100.<tailscale-ip-1>:8100/v1/chat/completions \
  -H 'Content-Type: application/json' \
  --data @/mnt/c/Users/<user>/tool-test.json
```

Should return HTTP 200 with a `chat.completion` body — `tool_choice: "auto"` is the trigger that exposed the missing `--enable-auto-tool-choice` flag earlier.

## Files

| File | Purpose |
|---|---|
| `~/.config/systemd/user/vllm.service` (WSL) | Systemd unit for vLLM — auto-start, restart on failure, journalctl logs |
| `~/.config/systemd/user/vllm-bridge.service` (WSL) | Systemd unit for the TCP forwarder |
| `C:\Users\<user>\serve-thinkingcap.sh` | Production launcher invoked by `vllm.service` (`morosystems/ThinkingCap-Qwen3.6-27B-NVFP4`) |
| `C:\Users\<user>\serve-official.sh` | Rollback launcher (official `nvidia/Qwen3.6-27B-NVFP4`) |
| `C:\Users\<user>\serve-vllm.sh` | Rollback / AEON launcher retained for manual overrides and service rollback |
| `C:\Users\<user>\vllm-bridge.sh` | Wrapper that sources `common.sh` and launches the TCP forwarder |
| `C:\Users\<user>\common.sh` | Shared MSI launch constants (ports, models, upstream IP) |
| `C:\Users\<user>\start-vllm.sh` | All-in-one manual launcher (forwarder in bg, vLLM in fg). Use only when systemd services are stopped, for interactive debugging |
| `C:\Users\<user>\tool-test.json` | Sample request body for the tool-call sanity check |
| `~/.cache/huggingface` (WSL) | Model weights |
| `~/.cache/vllm/torch_compile_cache` (WSL) | AOT compile cache — keep around for fast boots |

## Firewall state

Both Windows Defender Firewall and Hyper-V VM Firewall have **Allow Inbound TCP/8100 from `100.64.0.0/10`** (Tailscale CGNAT range) for the WSL VM. The rule is misnamed `temp-test-8100` because the rename cmdlets return "Access is denied" on this box (same ACL quirk that affects `Set-NetFirewallHyperVRule` for some rules).

The old `vLLM-API-Tailscale` Allow rules for port 8000 remain in place but are inert.

## Pi-side agent config

The Pi provider `msioffice` (defined in `~/.pi/agent/models.json`) points at `http://100.<tailscale-ip-1>:8100/v1` with model id `qwen3.6-27b-nvfp4`. Like its sibling `msioffice-gemma` (Gemma llama.cpp, registered via the `msioffice-gemma.ts` extension), it is a **direct LAN provider** that bypasses the unified gateway (see [`unified-model-gateway.md`](../unified-model-gateway.md)).

## Things not to do

- **Don't point vLLM directly at the public port.** It "works" locally (200 from `curl` inside WSL) but external SYNs die. Always route through the forwarder.
- **Don't connect to vLLM via `127.0.0.1` from inside WSL** when vLLM binds `0.0.0.0`. In mirrored mode this returns `Connection refused`. Use the Tailscale IP (`100.<tailscale-ip-1>`) or the forwarder — the forwarder already does this.
- **Don't `Restart-Service hns -Force`** when WSL2 traffic is healthy. It can leave HNS in STOP_PENDING and break mirrored forwarding until `wsl --shutdown`.
- **Don't run vLLM as root** (older `/root/vllm-venv` setup). It can zombie out — engine alive holding GPU memory, API server dead. The `<user>`-user install at `~/vllm-venv` is the supported path.

## Open questions / known weirdness

1. **Why uvicorn's listener doesn't traverse mirrored networking** — root cause unknown after socket-level inspection. Workaround is the forwarder. Worth a fresh look on a future vLLM upgrade.
2. **`.wslconfig`'s `firewall=false` doesn't disable the Hyper-V VM firewall** on this box (`Get-NetFirewallHyperVVMSetting` still shows `Enabled=True`). The Allow rules cover us, so it doesn't matter functionally — but don't assume the setting did anything.
3. **Some Hyper-V firewall rule operations return "Access is denied"** (`Set-`/`Disable-`/`Remove-NetFirewallHyperVRule`, `Rename-NetFirewallHyperVRule`) even from elevated PowerShell, for rules created by SYSTEM context. Workaround: `New-NetFirewallHyperVRule` to overlay; older rule sticks around but the new one takes effect.
4. **vLLM crashed under 3-way concurrent agentic load** (2026-07-22, ThinkingCap + MTP n=5 + NVFP4): every request began returning HTTP 500 `EngineCore encountered an issue` ~90 s into a VulcanBench v3 run at `--max-concurrency 3`, then the endpoint went down until manually restarted. The same suite completed cleanly at concurrency 2. Not root-caused (suspect MTP n=5 + NVFP4 kernels under concurrent load). **Mitigation (2026-07-23): `MSI_MAX_NUM_SEQS` capped at 2 in `common.sh`** — vLLM admission-queues requests above the cap instead of scheduling them concurrently, so extra clients wait rather than crash the engine. Deploy via `sync-to-runtime.sh`. Rollback: restore `MSI_MAX_NUM_SEQS=16` once root-caused, revalidating with a concurrency-3 suite run. If the crash recurs even at 2, capture `journalctl --user -u vllm -n 200` inside WSL before restarting.

## vLLM launch flags (for reference)

Production flags live in `configs/msi/serve-thinkingcap.sh` (which `vllm.service` invokes). To change a flag permanently: edit the repo copy, run `sync-to-runtime.sh` (deploys + restarts). Extra flags passed to the script go through to `vllm serve` verbatim; for duplicated flags the last occurrence wins.

```
/home/<user>/vllm-0.27-venv/bin/vllm serve morosystems/ThinkingCap-Qwen3.6-27B-NVFP4 \
  --host 0.0.0.0 --port 8101 \
  --served-model-name qwen3.6-27b-nvfp4 \
  --language-model-only \
  --quantization modelopt \
  --kv-cache-dtype fp8 \
  --max-model-len 131072 \
  --gpu-memory-utilization 0.93 \
  --max-num-seqs 2 \
  --max-num-batched-tokens 8192 \
  --enable-auto-tool-choice \
  --tool-call-parser qwen3_xml \
  --speculative-config '{"method":"qwen3_next_mtp","num_speculative_tokens":5}' \
  --reasoning-parser qwen3 \
  --override-generation-config '{"temperature":1.0,"top_p":0.95,"top_k":20,"min_p":0.0}'
```

(`MAX_JOBS=4 CUDA_NVCC_THREADS=2` are exported by the script to bound FlashInfer JIT RAM, plus `VLLM_ENFORCE_STRICT_TOOL_CALLING=0`, required for spec decode + tool calling on 0.27. The 0.24-era `--kernel-config` flashinfer-autotune flag was dropped in the 2026-08-13 card-recipe promotion as untested on 0.27.)

**MTP `num_speculative_tokens=5` chosen by on-box sweep** (2026-07-22, quicksort prompt, 512 tokens, temp 0, warm server): n=2 → 70.4, n=3 → 80.5, n=4 → 83.4, **n=5 → 95.2**, n=6 → 88.5, n=7 → 96.4 tok/s. n=5 ties the peak within noise with less wasted draft compute. (The model card recommends n=3 — measurably slower on this card.) Run-to-run variance is real: most runs land 89–96 tok/s with occasional ~60 tok/s dips (no GPU throttling; likely MTP acceptance variance).

The official launcher `serve-official.sh` (vLLM 0.24 venv, `~/vllm-official-venv`) and the AEON launcher `serve-vllm.sh` (0.21 venv, positional `MODEL SERVED_NAME PARSER` args) are retained unchanged as rollback paths — see "Model availability / fallbacks" above.
