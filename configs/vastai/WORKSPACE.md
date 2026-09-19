# WORKSPACE.md

**Status:** active — verified 2026-09-02

Orientation for coding agents working in this directory. Read this first.

**Sibling docs:** [`OPENCODE.md`](OPENCODE.md) — wiring this instance's llama-server into OpenCode (provider config, thinking-disabled, transport options).

## What this machine is

A **Vast.ai GPU instance** running the **Unsloth Studio** template (Docker image). NVIDIA driver 590.48.01, CUDA available at `/usr/local/cuda`. Container is provisioned by Vast.ai's boot scripts in `/etc/vast_boot.d/` and supervised by `supervisord`.

Docs:
- Vast.ai: https://docs.vast.ai/documentation/get-started
- Vast.ai Unsloth template: https://docs.vast.ai/examples/ai-ml-frameworks/unsloth-studio
- Unsloth Studio: https://unsloth.ai/docs/new/studio

## Persistence model — read carefully

Only **`/workspace`** persists. It's the Vast.ai persistent Volume (`V.35743976`, XFS, ~64G, project quotas enabled; currently mounted from `/dev/loop20`). Survives instance destruction.

Everything else is **ephemeral** Docker overlay and is rebuilt on container start:
- `/`, `/root`, `/tmp`, `/etc` (mostly), `/venv/main`, `/opt/*`

Practical consequences:
- Installing a package with `pip` into `/venv/main` works *now* but vanishes on rebuild.
- Files in `/root/...` (including `~/.bashrc`, `~/.config`, `~/.ssh`) are ephemeral.
- HF cache and Studio data are already pointed at `/workspace` (see env vars below) — leave them alone.

### How the image rebuilds state at boot

`/etc/vast_boot.d/*.sh` runs in numeric order. Key scripts:
- `36-sync-workspace.sh` — seeds `/workspace` from `/opt/workspace-internal` on **first boot only** (skips if target exists). This is how `unsloth/`, `.hf_home/`, `.venv-backups/` got there.
- `38-unsloth-symlinks.sh` — re-creates `/workspace/unsloth/studio/unsloth_studio → /venv/main` symlink.
- `48-venv-backup.sh` — backs up `/venv/*` into `/workspace/.venv-backups/`.
- `65-supervisor-launch.sh` — starts `supervisord`, which launches Studio.

**Two opt-in syncs (currently OFF):**
- `sync_home_to_workspace=true` — moves `/root` to `/workspace/home/root` and symlinks back, so dotfiles persist. Set as a Vast.ai instance env var; requires restart.
- `sync_environment=true` — archives `/venv/*` to `/workspace/.environment_sync/<env_id>/` and symlinks back, so custom pip installs persist. Same pattern.

If either is needed, ask the user — it's an instance-config change, not a runtime tweak.

## Unsloth Studio — already installed and running

**Do not run the Unsloth installer (`https://unsloth.ai/install.sh`).** Studio is pre-installed by the template.

- Source/state: `/workspace/unsloth/studio/` (persistent — `studio.db`, `auth/`, `runs/`, `outputs/`, `exports/`, `assets/`, `cache/`)
- Runtime conda env: `/venv/main` (ephemeral, recreated on boot). Symlinked from `/workspace/unsloth/studio/unsloth_studio`.
- Two transformers-version venvs: `/workspace/unsloth/studio/.venv_t5_530`, `.venv_t5_550` (transformers 5.3.0 and 5.5.0 — partial, used by Studio internals).
- Backend process: `/venv/main/bin/python /venv/main/lib/python3.12/site-packages/studio/backend/run.py --host 127.0.0.1 --port 18888`. PID is in `/workspace/unsloth/studio/studio.pid`.
- Supervised under group `unsloth-studio` (env `SUPERVISOR_GROUP_NAME`).
- llama.cpp is built at `/workspace/unsloth/llama.cpp/` (used for GGUF export).

**The `unsloth` CLI (`/venv/main/bin/unsloth`) is NOT on PATH in fresh `bash -c` invocations** — `PATH` is set by `/root/.bashrc` and only applies to login/interactive shells. To use it from a non-interactive shell:
```bash
/venv/main/bin/unsloth --help
# or
source /venv/main/bin/activate && unsloth --help
```

## Ports and network

`PORTAL_CONFIG` defines the reverse proxy (Caddy on the public side, app on the loopback side):

| External | Internal | App |
|---|---|---|
| 1111 | 11111 | Instance Portal (FastAPI) |
| 8888 | 18888 | **Unsloth Studio** |
| 8384 | 18384 | Syncthing |
| 6006 | 16006 | Tensorboard |

Caddy listens on all interfaces; the apps bind only to `127.0.0.1`. Four `cloudflared` tunnels expose them externally — do not kill them.

SSH on `:22`. Don't bind any new service to `0.0.0.0` without checking with the user.

## Remote access (headless instance)

Four paths exist. The first three are wired up by the template; Tailscale (D) was added by hand.

### A. Cloudflare Quick Tunnels (HTTPS, easiest)

Four `cloudflared` processes (managed by `/opt/portal-aio/tunnel_manager/`) expose Caddy ports 1111/8888/8384/6006 as `*.trycloudflare.com` URLs. **The URLs are ephemeral** — they regenerate every time `cloudflared` restarts (container rebuild, supervisor restart). Don't hard-code them anywhere durable.

To list the current URLs at any time:
```bash
curl -s http://127.0.0.1:11112/get-all-quick-tunnels | python3 -m json.tool
```

Tunnel-manager API (FastAPI on `127.0.0.1:11112`) endpoints:
- `GET /get-all-quick-tunnels` — list all
- `GET /get-quick-tunnel/{target_url}` — get/create one for a target like `http://localhost:8888`
- `GET /refresh-quick-tunnel/{target_url}` — rotate
- `GET /get-direct-url/{port}` — host:port URL for the direct-forward path (see B)
- `GET /stop-quick-tunnel/{target_url}` — stop

The **Instance Portal** (port 1111 / `https://<random>.trycloudflare.com`) is the human-friendly hub: it lists all current app URLs, so bookmark only that one.

### B. Direct Vast.ai port forwards (HTTP, no TLS)

Vast.ai maps the host's public IP+random-port to the container's exposed ports. Stable for the instance lifetime on this host. Discover via:
```bash
for p in 1111 8888 8384 6006; do
  echo "$p: $(curl -s http://127.0.0.1:11112/get-direct-url/$p)"
done
```
Use only on trusted networks (no TLS). Studio still does its own auth, so it's not catastrophic.

### C. SSH local-forward (most secure)

Forward to the **loopback backends** (the `1XXXX` ports) rather than the Caddy-fronted public ports — that way you skip Caddy's basic-auth prompt for apps that already do their own auth.

Single port (Studio):
```bash
ssh -L 8888:127.0.0.1:18888 -p <vast-ssh-port> root@<vast-ssh-host>
# then http://localhost:8888 in the local browser
```

Multi-port (Studio + vLLM/llama-server inference API):
```bash
ssh -p <vast-ssh-port> \
    -L 8888:127.0.0.1:18888 \
    -L 18080:127.0.0.1:18080 \
    root@<vast-ssh-host>
```

Vast dashboard provides the SSH host/port (`<vast-ssh-host>` is `ssh<N>.vast.ai` and `<vast-ssh-port>` is the host-side port mapped to container port 22).

For a permanent setup, add this to `~/.ssh/config` on the client:
```
Host vast-unsloth
    HostName <vast-ssh-host>
    Port <vast-ssh-port>
    User root
    LocalForward 8888 127.0.0.1:18888
    LocalForward 18080 127.0.0.1:18080
    ServerAliveInterval 30
    ExitOnForwardFailure yes
```
Then just `ssh vast-unsloth`. `ExitOnForwardFailure yes` makes ssh fail loudly at connect time if a local port is already in use, instead of silently dropping the forward and emitting `channel N: open failed: connect failed: Connection refused` later when something tries to use it.

#### Diagnosing `channel N: open failed: connect failed: Connection refused`

That message is the SSH client's way of saying: *"the forwarded connection couldn't be completed."* The cause is almost always one of:

1. **Forward target isn't bound on the remote side.** Check what's listening here with `ss -tlnH 'sport = :<port>'`. The active inference port is `18080` (vLLM/llama-server); Studio is on `18888`. If you forwarded to a port that doesn't have a listener, every client request hits `Connection refused`.
2. **Wrong hostname inside the forward.** `-L 8888:localhost:8888` resolves `localhost` *on the remote*. Make sure the right side is what you actually want (`127.0.0.1:18888` for Studio, not `127.0.0.1:8888`).
3. **Service died after the SSH session started.** Re-check with `ss -tlnH` on the remote.

The error message includes only a channel number, not the port. To find the failing port, reconnect with `ssh -vvv …` and grep for `channel|forward|connect`.

### D. Tailscale (userspace mode)

This node is on the user's tailnet as `<vastai-node>` (Magic DNS: `<vastai-node>.<tailnet>.ts.net`, IP `100.<tailscale-ip-5>`).

- **Mode:** `--tun=userspace-networking` — required because the container has no `/dev/net/tun` and lacks `CAP_NET_ADMIN`.
- **Trade-off:** no exit-node use, no subnet routing, no traffic-from-this-node-via-tailnet. Inbound to this node and `tailscale serve`/`funnel` work fine.
- **Tailscale SSH** is enabled (`tailscale set --ssh`): from any tailnet device, `ssh root@<vastai-node>` — no SSH keys, ACL-gated.
- **Userspace SOCKS5/HTTP proxy** for outbound-via-tailnet from local processes: `localhost:1055` (SOCKS5), `localhost:1056` (HTTP). E.g. `ALL_PROXY=socks5://localhost:1055 curl https://...`.
- **State:** `/workspace/.tailscale/state/` (persistent — auth survives container rebuild).
- **Binaries:** `/workspace/bin/{tailscale,tailscaled}` (persistent). `bootstrap.sh` symlinks them into `/usr/local/bin/` and (re)launches `tailscaled` on container start via `/workspace/bin/tailscaled-launch.sh`.
- **Logs:** `/workspace/logs/tailscaled.log`.

If the daemon dies, restart with `/workspace/bin/tailscaled-launch.sh` (idempotent). To re-authenticate after a tailnet key wipe, run `tailscale logout && tailscale up --hostname=<vastai-node>`.

**Active `tailscale serve` proxies** (state in `/workspace/.tailscale/state/`, persistent):

| URL | Proxies to | Backend |
|---|---|---|
| `https://<vastai-node>.<tailnet>.ts.net:8443/` | `127.0.0.1:18080` | OpenAI-compatible inference server (currently llama-server/Gemma-4-31B-it-GGUF). The proxy is backend-agnostic — see [OPENCODE.md](OPENCODE.md). |

Only the inference server is currently fronted by `tailscale serve`; Unsloth Studio is reached via the Cloudflare tunnel, direct port-forward, or SSH paths above. To inspect/modify: `tailscale serve status`, `tailscale serve --https=<port> off`. To add another: `tailscale serve --bg --https=<port> http://127.0.0.1:<backend>`.

### App ↔ port reference

| App | Public Caddy port | Loopback backend |
|---|---|---|
| Instance Portal | 1111 | 11111 |
| Unsloth Studio | 8888 | 18888 |
| Syncthing | 8384 | 18384 |
| Tensorboard | 6006 | 16006 |

### Authentication (HTTP Basic Auth on Caddy)

Caddy gates **all four public ports** with HTTP Basic Auth. Browser will pop a credentials dialog. The same credentials work for every app and every access path (Cloudflare tunnel, direct port forward, SSH local-forward).

- **Username:** `vastai` (default; overridable via `WEB_USERNAME` env var)
- **Password:** value of `$OPEN_BUTTON_TOKEN` (or `$WEB_PASSWORD` if set — both are accepted)

Read the current token without echoing it to chat:
```bash
echo "$OPEN_BUTTON_TOKEN"   # only do this in a private terminal
```
The token rotates if `OPEN_BUTTON_TOKEN` isn't set as a Vast.ai instance env var (it's auto-generated with `shortuuid` on each rebuild). To pin it, set `OPEN_BUTTON_TOKEN` in the Vast dashboard.

Quick auth check from inside the container:
```bash
curl -s -o /dev/null -w "%{http_code}\n" -u "vastai:$OPEN_BUTTON_TOKEN" http://127.0.0.1:8888/
# expect 200
```

### Refreshing a stale Cloudflare Quick Tunnel

If the `*.trycloudflare.com` URL stops resolving / browser gets `ERR_CONNECTION_*`, the tunnel died. Refresh it:
```bash
curl -s -X POST "http://127.0.0.1:11112/refresh-quick-tunnel/http%3A%2F%2Flocalhost%3A8888"
```
Returns the new `tunnel_url`. Note the **POST** verb — GET returns "Method Not Allowed".

### Browser troubleshooting: `ERR_TOO_MANY_RETRIES`

If Chrome shows `ERR_TOO_MANY_RETRIES` on a known-good tunnel URL or direct port, the tunnel is fine — it's Chrome's QUIC/HTTP-3 retry loop on a network that drops UDP. Fixes (client-side):

1. Disable QUIC: `chrome://flags/#enable-quic` → **Disabled** → relaunch.
2. Try a different browser (Firefox, Safari) — they fall back to TCP cleanly.
3. Fall back to SSH local-forward (port 22 is rarely blocked):
   ```bash
   ssh -L 8888:127.0.0.1:8888 -p $VAST_TCP_PORT_22 root@$PUBLIC_IPADDR
   ```

Verify from the host side first before assuming a server problem:
```bash
curl -sI -u "vastai:$OPEN_BUTTON_TOKEN" https://<tunnel>.trycloudflare.com/
# 200 = healthy; the issue is the client browser/network
```

## Pre-set environment variables (in the Studio process)

```
WORKSPACE=/workspace
DATA_DIRECTORY=/workspace/
HF_HOME=/workspace/.hf_home          # HuggingFace cache → persistent
CONDA_PREFIX=/venv/main
CONDA_DEFAULT_ENV=/venv/main
CUDA_HOME=/usr/local/cuda
PATH=/venv/main/bin:/opt/miniforge3/condabin:/usr/local/cuda/bin:/opt/instance-tools/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
PORTAL_CONFIG=localhost:1111:11111:/:Instance Portal|localhost:8888:18888:/:Unsloth Studio|localhost:8384:18384:/:Syncthing|localhost:6006:16006:/:Tensorboard
SUPERVISOR_GROUP_NAME=unsloth-studio
PROC_NAME=unsloth-studio
```

If running a Python script that needs HF or the Studio env, prefer `source /venv/main/bin/activate` so these are inherited.

## Where to put things

User chose **option A** (minimal — no `sync_home_to_workspace`):

| Kind | Path | Notes |
|---|---|---|
| Custom configs (training YAMLs, env snippets, dataset specs) | `/workspace/configs/` | Created this session. Use absolute paths to reference. |
| Claude Code project settings | `/workspace/.claude/settings.local.json` | Already in use; permission allowlist accumulates here. |
| Claude Code project memory | `/workspace/.claude/memory/` | Symlinked from `/root/.claude/projects/-workspace/memory` so auto-memory survives rebuilds. Recreated by `bootstrap.sh`. |
| HF model cache | `/workspace/.hf_home/` | `HF_HOME` already points here. Don't override. |
| Datasets, model exports, outputs | Under `/workspace/` (e.g. `/workspace/datasets/`, `/workspace/outputs/`) | Studio's own `outputs/`, `exports/`, `runs/` live under `/workspace/unsloth/studio/`. |
| Anything that must survive a rebuild | `/workspace/...` | Otherwise it's gone. |
| Scratch / fast tmp | `/dev/shm` (62G tmpfs) or `/tmp` | Not persistent. |

Do **not** install software into `/venv/main` and rely on it persisting — either enable `sync_environment=true` or set up your own venv under `/workspace/`.

## Operational gotchas / preferences

- **Don't pipe remote scripts to a shell** (`curl ... | sh`). The harness blocks it, and the user has explicitly chosen not to grant that permission. Download first, inspect, then ask before running. For installers from external URLs, prefer the user running them via `! <command>` in their prompt.
- **Don't try to reinstall services that are already running.** Check `ps`, `ss -tlnp`, and `/etc/vast_boot.d/` first. The Vast.ai template provisions a lot.
- **Don't modify `/etc/vast_boot.d/`** scripts — they're image-managed and get overwritten on container rebuild.
- **Don't kill `cloudflared`, `caddy`, `supervisord`, or the `unsloth-studio` process** unless explicitly asked.
- The `unsloth` Python module that appears via `import unsloth` from a fresh `python3` (not in `/venv/main`) is an empty namespace package on the path — not a real install. Use `/venv/main` for any Unsloth Python work.

## Boot-time bootstrap (`/workspace/configs/bootstrap.sh`)

The symlink that makes Claude's auto-memory persistent lives on the ephemeral overlay, so it disappears on container rebuild. `bootstrap.sh` recreates it (and any future ephemeral-but-needed links). It's idempotent.

**To run it automatically on every container start**, set the Vast.ai instance "onstart" command (in the Vast.ai dashboard for the instance) to:
```
bash /workspace/configs/bootstrap.sh; entrypoint.sh
```
The `;` (not `&&`) ensures `entrypoint.sh` runs even if bootstrap fails. Bootstrap must come first because `entrypoint.sh` ends in `exec` — anything after it never runs.

What `bootstrap.sh` currently does:
- Creates the `/root/.claude/projects/-workspace/memory` → `/workspace/.claude/memory` symlink (Claude auto-memory persistence).
- Symlinks `/root/.config/opencode/opencode.json` → `/workspace/configs/opencode.json` so the OpenCode CLI picks up the persistent config.
- Symlinks `/root/.cache/flashinfer` → `/workspace/.cache/flashinfer` so vLLM's NVFP4 GEMM JIT-compile cache survives container rebuilds (otherwise every cold start re-runs nvcc for ~4–5 min).
- Touches `/root/.no_auto_tmux` to disable the template's SSH auto-tmux behavior. (`/root/.bashrc` auto-attaches an `ssh_tmux` session unless this flag exists; the flag itself lives on the ephemeral overlay so it must be recreated.)
- Symlinks `/workspace/bin/{edit,tailscale,tailscaled,opencode}` into `/usr/local/bin/` so they're on `PATH`.
- Invokes `/workspace/bin/tailscaled-launch.sh` (idempotent) to bring up `tailscaled` in userspace mode with state from `/workspace/.tailscale/state/`. Tailscale auth and `tailscale serve` config (inference server on `:8443`) reload from `tailscaled.state` automatically.
- Starts the inference server (idempotent, skipped if `:18080` is already healthy). It tries `/workspace/bin/vllm-server-launch.sh` first, but vLLM is not installed on this box, so it falls back to `/workspace/bin/llama-server-launch.sh`, which serves Gemma-4-31B-it GGUF on `127.0.0.1:18080`.

If you forget to set the onstart command, run `bash /workspace/configs/bootstrap.sh` manually after any container rebuild. Each sub-launcher is also safe to invoke directly for debugging.

## Restart recovery — what comes back automatically

Stopping and starting the instance destroys the container overlay but preserves the persistent volume `V.35743976`. With the Vast onstart command set to `bash /workspace/configs/bootstrap.sh; entrypoint.sh`, full recovery is hands-off (~2–4 min, dominated by Studio startup and the llama-server GGUF weight load).

Reading the Vast dashboard correctly — only the volume matters for state:

| Dashboard field | What it actually is | Survives restart? |
|---|---|---|
| `Vol: Local-35743976` | The persistent XFS volume at `/workspace` (= `V.35743976`) | **Yes — the only thing that does** |
| `Disk: x / 64 GB` | Ephemeral container overlay (`/`, `/root`, `/venv/main`, `/tmp`) | No — wiped on every restart |
| `RAM x / 129 GB`, `CPU x / 192` | Live runtime usage | N/A — not state |
| `VRAM x / 31.8 GB` | GPU memory in use; reloads from the model weights on restart (llama-server/GGUF Q4_K_XL ≈ 19 GB of weights plus KV cache; see [OPENCODE.md](OPENCODE.md)) | N/A — not state |

What runs at startup, in order:

1. Vast.ai re-attaches `V.35743976` → `/workspace` (untouched).
2. `/etc/vast_boot.d/*.sh` rebuild the ephemeral side: conda env, `/venv/main`, Studio symlinks, supervisord.
3. `supervisord` starts Caddy, cloudflared (×4), Instance Portal, Studio, Syncthing, Tensorboard, etc.
4. Vast onstart runs `bash /workspace/configs/bootstrap.sh`:
   - Claude-memory symlink, OpenCode config symlink, flashinfer JIT-cache symlink, and `.no_auto_tmux` flag re-created.
   - `tailscale`/`tailscaled`/`edit`/`opencode` binaries symlinked onto `PATH`.
   - `tailscaled` started in userspace mode; auth and `tailscale serve` config (inference server on `:8443`) reload from `/workspace/.tailscale/state/tailscaled.state`.
   - The inference server is started on `127.0.0.1:18080`; bootstrap waits for `/health` 200. vLLM is tried first but isn't installed, so llama-server (Gemma-4-31B-it GGUF) runs.

What changes after restart:

- **Cloudflare `*.trycloudflare.com` URLs rotate.** Bookmark only the Instance Portal (`:1111`); it lists the current URLs for everything else.
- **Vast direct port-forward `VAST_TCP_PORT_*` numbers may change** if the host changes. Tailscale Magic DNS names (`<vastai-node>.<tailnet>.ts.net{,:8443}`) and SSH local-forward target ports (loopback) stay stable.
- `/root/`, `/venv/main`, `/tmp`, `/etc` all reset — anything you `pip install`ed into `/venv/main` or wrote under `/root/` is gone unless it's under `/workspace/`.

If something doesn't come back, check in this order: `df -h /workspace` (volume mounted?), `supervisorctl status` (template services?), `bash /workspace/configs/bootstrap.sh` (re-run idempotently), then the individual launchers under `/workspace/bin/`.

## Useful one-liners

```bash
# Studio process status
ps -p $(cat /workspace/unsloth/studio/studio.pid) -o pid,etime,cmd

# What's listening
ss -tlnp

# Activate the Studio env (gets unsloth, transformers, torch, etc.)
source /venv/main/bin/activate

# Check persistent-volume free space
df -h /workspace

# See what got seeded into /workspace from the image
ls /opt/workspace-internal
```
