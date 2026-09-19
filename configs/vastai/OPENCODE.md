# OPENCODE.md

**Status:** active — verified 2026-09-02

How to use this Vast.ai instance's local LLM backend (currently **llama-server hosting Gemma-4-31B-it in GGUF**, UD-Q4_K_XL quant, 131K context) as a model in [OpenCode](https://opencode.ai/).

> **History note:** This backend has changed shape a few times — llama-server/Qwen3.6-27B-GGUF (262K) → vLLM/Gemma-4-31B-NVFP4 (32K, for a Blackwell-native FP4 fast path) → the current llama-server/Gemma-4-31B-it-GGUF (131K). vLLM has since been removed (its venv at `/workspace/venvs/vllm` is gone); see the vLLM section below.

## Config file location

- Global: `~/.config/opencode/opencode.json`
- Per-project: `./opencode.json`

## Config — Gemma-4-31B-it (GGUF)

```json
{
  "$schema": "https://opencode.ai/config.json",
  "provider": {
    "vast-llama": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "Vast llama-server",
      "options": {
        "baseURL": "https://<vastai-node>.<tailnet>.ts.net:8443/v1",
        "apiKey": "unused"
      },
      "models": {
        "gemma-4-31b": {
          "name": "Gemma-4-31B (GGUF Q4_K_XL, 131K)"
        }
      }
    }
  },
  "model": "vast-llama/gemma-4-31b"
}
```

`apiKey` is required by the AI SDK's `openai-compatible` adapter even though llama-server doesn't validate it — any non-empty string works.

The model id under `models` (`gemma-4-31b`) is what OpenCode sends as the request `model` field. llama-server ignores that field and serves whatever GGUF is loaded, so any id works; `/v1/models` reports the GGUF filename (`gemma-4-31B-it-UD-Q4_K_XL.gguf`) because the launcher passes no `--alias`. Check what the server reports with:
```bash
curl -s http://127.0.0.1:18080/v1/models | python3 -m json.tool
```

Gemma-4 *does* have a reasoning mode, but it is **off by default** — the GGUF's bundled chat template defaults `enable_thinking` to false and emits an empty `<|channel>thought<channel|>` block. So no `/no_think`-style instruction is needed for OpenCode (unlike the older Qwen3.6-27B config, which used `"instructions": ["/no_think"]`). To turn reasoning *on*, pass `chat_template_kwargs` — per request (`{"enable_thinking": true}` in the request body) or server-wide via `--chat-template-kwargs '{"enable_thinking":true}'`. If you enable it, also set llama-server's `--reasoning-format` so clients receive clean `content` instead of raw `<|channel>thought` markers.

## Choosing the `baseURL`

Four transports, ranked by stability:

| Transport | URL pattern | Stable? | Notes |
|---|---|---|---|
| **Tailscale Serve (HTTPS)** | `https://<vastai-node>.<tailnet>.ts.net:8443/v1` | ✅ stable across container rebuilds | **Recommended.** Tailnet-only, TLS via tailnet CA, no extra auth. Requires the client to be on the user's tailnet. |
| SSH local-forward | `http://127.0.0.1:18080/v1` | ✅ stable as long as SSH session is up | Reliable but requires keeping an SSH session open. |
| Cloudflare quick tunnel | `https://<random>.trycloudflare.com/v1` | ❌ rotates on cloudflared restart | Easy, public over HTTPS, unauthenticated (URL is unguessable but anyone with it can use the model). |
| Vast direct port-forward | `http://<PUBLIC_IP>:<VAST_TCP_PORT>/v1` | ✅ stable for the instance lifetime | HTTP only, no TLS. Often blocked by client networks (non-standard port + residential ISP). |

### Tailscale Serve (recommended for OpenCode)

This instance exposes the inference server (port 18080) via `tailscale serve` on port **8443** of the node's MagicDNS name. Set up by `bootstrap.sh`; survives container rebuilds because the auth state lives in `/workspace/.tailscale/state/`. The serve config is backend-agnostic — it works whether port 18080 is llama-server, vLLM, or anything else.

```json
"options": {
  "baseURL": "https://<vastai-node>.<tailnet>.ts.net:8443/v1",
  "apiKey": "unused"
}
```

No client-side `apiKey` is needed (any non-empty string works — the AI SDK requires it). Tailscale ACLs gate access, and the cert is signed by the tailnet's CA, so `https://` works without warnings on tailnet-attached clients.

To verify from a tailnet client: `curl -s https://<vastai-node>.<tailnet>.ts.net:8443/v1/models | python3 -m json.tool`.

If the URL stops responding: check that `tailscaled` is up on the Vast node (`pgrep -x tailscaled`), that `tailscale serve status` shows the proxy, and that the inference server is listening on `127.0.0.1:18080` (`ss -ltn 'sport = :18080'`).

### SSH local-forward (fallback for OpenCode)

Run on the **client** machine (the one running OpenCode):
```bash
ssh -L 18080:127.0.0.1:18080 -p $VAST_SSH_PORT root@$VAST_SSH_HOST
```
Get `$VAST_SSH_PORT` (mapped from container port 22) and `$VAST_SSH_HOST` (= `$PUBLIC_IPADDR`) from the Vast.ai dashboard or:
```bash
echo "ssh -p $VAST_TCP_PORT_22 root@$PUBLIC_IPADDR -L 18080:127.0.0.1:18080"
```
inside the container.

Then `"baseURL": "http://127.0.0.1:18080/v1"` in `opencode.json`. No auth needed (loopback only on both sides of the tunnel).

### Cloudflare tunnel (for browser use, not great for OpenCode)

The trycloudflare URL changes whenever the cloudflared process restarts (container rebuild or supervisor restart). Look up the current one with:
```bash
curl -s http://127.0.0.1:11112/get-all-quick-tunnels | python3 -m json.tool
```
or refresh:
```bash
curl -s -X POST "http://127.0.0.1:11112/get-quick-tunnel/http%3A%2F%2Flocalhost%3A18080"
```

If you do use this for OpenCode, expect to update `baseURL` after every container rebuild.

## Starting the inference server

`bootstrap.sh` runs `/workspace/bin/vllm-server-launch.sh` first and falls back to `/workspace/bin/llama-server-launch.sh`. vLLM is **not currently installed** on this box, so the launcher always falls through to llama-server — that is the backend in use.

### llama-server (current backend — Gemma-4-31B-it-GGUF @ 131K)

Idempotent launcher: `/workspace/bin/llama-server-launch.sh` (returns 0 if already healthy).

Manual invocation, for reference:
```bash
nohup /workspace/unsloth/llama.cpp/build/bin/llama-server \
  -m /workspace/models/gemma-4-31B-it-GGUF/gemma-4-31B-it-UD-Q4_K_XL.gguf \
  --host 127.0.0.1 --port 18080 \
  --ctx-size 131072 --n-gpu-layers 99 \
  --flash-attn on \
  --cache-type-k q8_0 --cache-type-v q8_0 \
  --no-mmap \
  --temp 1.0 --top-p 0.95 --top-k 64 \
  >> /workspace/logs/llama-server-31b.log 2>&1 &
```
Readiness: `curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:18080/health` returns `200`. Stop with `pkill -f llama-server`.

Why each non-obvious flag:
- `--ctx-size 131072` — 131K context. The model trained at 262K; 131K is the configured cap (see the VRAM note below).
- `--cache-type-k q8_0 --cache-type-v q8_0` — 8-bit KV cache; roughly halves KV-cache VRAM vs f16, which is what makes 131K fit.
- `--n-gpu-layers 99` — offload every layer to the GPU (any value above the layer count works).
- `--flash-attn on` — FlashAttention kernels.
- `--no-mmap` — load the GGUF straight into memory instead of mmap'ing it; avoids page-fault stalls during decode.
- `--temp 1.0 --top-p 0.95 --top-k 64` — Gemma-4's recommended sampling defaults.
- No `--parallel` flag — llama-server auto-selects `n_parallel = 4` with a unified KV cache. This does **not** shrink the per-request context; see **Concurrency** below.

### Concurrency — 4 slots, unified KV cache

With no `--parallel` flag, llama-server auto-selects `n_parallel = 4` and a **unified** KV cache (`kv_unified = true`) — one shared pool of `n_ctx` cells, not a private cache per slot. From the startup log:

```
main: n_parallel is set to auto, using n_parallel = 4 and kv_unified = true
slot load_model: id 0 | task -1 | new slot, n_ctx = 131072   (× 4 slots)
```

Consequences:
- A **single request gets the full 131072-token context** — `n_ctx` is *not* divided by the slot count; each slot reports `n_ctx = 131072`.
- Up to **4 requests are served concurrently**, all drawing from the one 131072-cell KV pool — the combined cached tokens of all in-flight requests can't exceed 131072 at once.

Verify:
```bash
curl -s http://127.0.0.1:18080/props \
  | python3 -c 'import sys,json; d=json.load(sys.stdin); print("slots", d["total_slots"], "| n_ctx", d["default_generation_settings"]["n_ctx"])'
# -> slots 4 | n_ctx 131072
```

### vLLM (not currently installed — Gemma-4-31B-NVFP4)

vLLM was the backend through ~2026-05, serving `RedHatAI/gemma-4-31B-it-NVFP4` for a Blackwell-native FP4 fast path. Its venv (`/workspace/venvs/vllm`) is no longer present, so `vllm-server-launch.sh` fails on every boot and `bootstrap.sh` falls through to llama-server.

The launcher (`/workspace/bin/vllm-server-launch.sh`) is kept for if vLLM is reinstalled. To bring it back: recreate the venv at `/workspace/venvs/vllm` with vLLM installed, then re-run `bootstrap.sh` (or the launcher directly) — both pick it up automatically. The launcher serves with `--served-model-name gemma-4-31b`, `--enable-auto-tool-choice --tool-call-parser gemma4` (Gemma-4 uses a custom non-JSON tool-call format that vLLM's `gemma4` parser handles), and `--max-num-batched-tokens 8192` (Gemma-4's per-image vision tokens exceed the default 2048-token prefill batch). NVFP4 reaches a lower context ceiling than the GGUF path — see below.

## Verify

```bash
opencode run "what is 7*8?"
```
Expect a one-shot answer. If the response is empty or errors, run `opencode --debug` and check `curl -s http://127.0.0.1:18080/v1/models` returns the expected model.

## VRAM math (RTX 5090, 32 GB)

llama-server runs Gemma-4-31B-it at **131K** context: the GGUF weights (UD-Q4_K_XL, ~18.8 GB on disk) plus a q8_0 (8-bit) KV cache fit the 32 GB card. Gemma-4's hybrid attention keeps the KV cache from blowing up — only 12 of its 60 layers are global (KV scales with the full context window); the other 48 are sliding-window-1024 (KV capped at a 1024-token window regardless of context length). 131K is the configured `--ctx-size`; the model itself trained at 262K.

### vLLM/NVFP4 — why it was capped at 32K

For reference, when vLLM/NVFP4 was the backend it could only reach 32K. With Gemma-4-31B-NVFP4 (only the transformer linears are FP4-packed; vision tower, 262K-vocab embeddings, and LM head stay in BF16/FP8):

| Component | VRAM @ 32K (FP8 KV) | VRAM @ 64K (FP8 KV) |
|---|---|---|
| Weights (measured at load) | ~20 GB | ~20 GB |
| KV cache (Gemma-4 hybrid sliding: 12 global + 48 sliding-1024 layers) | ~3 GB | ~6 GB |
| CUDA graphs + activations + workspace | ~4-6 GB | ~4-6 GB |
| **Total** | **~28-30 GB** (fits) | **~32-34 GB** (OOM) |

vLLM's fixed CUDA-graph + workspace overhead is what made 64K OOM there. 64K-plus on NVFP4 would need an RTX PRO 6000 Blackwell (96 GB) or B200; on this GPU the levers are `--enforce-eager` (drops CUDA graphs, slower) or a smaller checkpoint (Gemma-4-12B-NVFP4 fits 64K easily).
