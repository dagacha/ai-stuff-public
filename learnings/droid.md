# Setup CLIProxyAPI with Claude Max Plan and ChatGPT for Factory Droid

This guide sets up CLIProxyAPI to proxy your Claude Max Plan and/or ChatGPT Plus/Pro (OAuth) subscriptions through a local API endpoint, then configures Factory Droid CLI to use those models via BYOK.

Custom models only work in the Factory **CLI** (`droid`), not in the desktop app.

## Prerequisites

- macOS with Homebrew installed
- Claude Max Plan subscription
- Factory.app installed (`/Applications/Factory.app`)

## Steps

### 1. Install Go

```bash
brew install go
```

### 2. Clone and build CLIProxyAPI from source

```bash
git clone https://github.com/router-for-me/CLIProxyAPI.git ~/CLIProxyAPI
cd ~/CLIProxyAPI
go build -o cli-proxy-api ./cmd/server
```

### 3. Create the CLIProxyAPI config directory

```bash
mkdir -p ~/.cli-proxy-api
```

### 4. Create the CLIProxyAPI config file

Write to `~/.cli-proxy-api/config.yaml`:

```yaml
host: "127.0.0.1"
port: 8317
auth-dir: "~/.cli-proxy-api"
api-keys:
  - "sk-dummy"
```

`host: "127.0.0.1"` binds only to localhost for security.

### 5. Authenticate with Claude Max Plan

```bash
cd ~/CLIProxyAPI
./cli-proxy-api --config ~/.cli-proxy-api/config.yaml --claude-login
```

This opens a browser for OAuth with your Claude Max Plan. Verify the URL is on Anthropic's domain before entering credentials. The callback uses port `54545`. After success, credentials are saved to `~/.cli-proxy-api/claude-<email>.json`.

### 6. Start the CLIProxyAPI server

```bash
cd ~/CLIProxyAPI
nohup ./cli-proxy-api --config ~/.cli-proxy-api/config.yaml > ~/.cli-proxy-api/server.log 2>&1 &
echo $! > ~/.cli-proxy-api/server.pid
```

Verify it is running:

```bash
curl -s http://127.0.0.1:8317/v1/models -H "Authorization: Bearer sk-dummy" | python3 -m json.tool | grep '"id"'
```

You should see models including `claude-opus-4-7`, `claude-opus-4-6`, `claude-sonnet-4-6`.

### 7. Configure Factory Droid

Write to `~/.factory/settings.json`. Merge with any existing settings (preserve existing keys):

```json
{
  "enabledPlugins": {
    "core@factory-plugins": true
  },
  "logoAnimation": "off",
  "customModels": [
    {
      "model": "claude-opus-4-7",
      "displayName": "Opus 4.7 [Max]",
      "baseUrl": "http://127.0.0.1:8317",
      "apiKey": "sk-dummy",
      "provider": "anthropic"
    },
    {
      "model": "claude-opus-4-6",
      "displayName": "Opus 4.6 [Max]",
      "baseUrl": "http://127.0.0.1:8317",
      "apiKey": "sk-dummy",
      "provider": "anthropic"
    },
    {
      "model": "claude-sonnet-4-6",
      "displayName": "Sonnet 4.6 [Max]",
      "baseUrl": "http://127.0.0.1:8317",
      "apiKey": "sk-dummy",
      "provider": "anthropic"
    }
  ]
}
```

Key details:
- File is `~/.factory/settings.json` (not `config.json`)
- Keys are **camelCase**: `customModels`, `baseUrl`, `apiKey` (not snake_case)
- `baseUrl` for Anthropic provider models does NOT include `/v1`
- `apiKey` is `sk-dummy` because real auth comes from the OAuth token stored by CLIProxyAPI
- `provider` must be `anthropic`, `openai`, or `generic-chat-completion-api`

### 8. Restart Factory daemon

```bash
kill $(pgrep -f "droid daemon") 2>/dev/null
killall factory-desktop 2>/dev/null
sleep 2
open -a Factory
```

### 9. Verify via CLI

```bash
/Applications/Factory.app/Contents/Resources/bin/droid exec --help 2>&1 | grep -A5 "Custom Models"
```

You should see:

```
Custom Models:
  custom:Opus-4.7-[Max]-0      Opus 4.7 [Max]
  custom:Opus-4.6-[Max]-1      Opus 4.6 [Max]
  custom:Sonnet-4.6-[Max]-2    Sonnet 4.6 [Max]
```

Test a request:

```bash
/Applications/Factory.app/Contents/Resources/bin/droid exec --model "custom:Opus-4.7-[Max]-0" "say hello"
```

Note: quote the model name to prevent zsh glob expansion of `[` and `]`.

### 10. (Optional) Add a shell alias

Add to `~/.zshrc`:

```bash
alias droid='/Applications/Factory.app/Contents/Resources/bin/droid'
```

Then `source ~/.zshrc` and use `droid` directly.

## Managing the proxy

### Start the proxy

```bash
cd ~/CLIProxyAPI
nohup ./cli-proxy-api --config ~/.cli-proxy-api/config.yaml > ~/.cli-proxy-api/server.log 2>&1 &
echo $! > ~/.cli-proxy-api/server.pid
```

### Stop the proxy

```bash
kill $(cat ~/.cli-proxy-api/server.pid) 2>/dev/null
```

### Check if proxy is running

```bash
curl -s http://127.0.0.1:8317/v1/models -H "Authorization: Bearer sk-dummy" > /dev/null 2>&1 && echo "running" || echo "stopped"
```

### View proxy logs

```bash
cat ~/.cli-proxy-api/server.log
```

---

## OpenAI / ChatGPT Subscription Setup

This section configures CLIProxyAPI to use your ChatGPT Plus/Pro subscription (with Codex access) instead of API keys.

### Prerequisites

- ChatGPT Plus or Pro subscription with Codex access
- Same CLIProxyAPI installation from the Claude section above

### 1. Authenticate with OpenAI/Codex

```bash
cd ~/CLIProxyAPI
./cli-proxy-api --config ~/.cli-proxy-api/config.yaml --codex-login
```

This opens a browser for OAuth with your OpenAI account. After success, credentials are saved to `~/.cli-proxy-api/codex-<email>.json`.

### 2. Update Factory Droid settings

Add OpenAI models to `~/.factory/settings.json` (merge with existing `customModels`):

```json
{
  "enabledPlugins": {
    "core@factory-plugins": true
  },
  "logoAnimation": "off",
  "customModels": [
    {
      "model": "claude-opus-4-7",
      "displayName": "Opus 4.7 [Max]",
      "baseUrl": "http://127.0.0.1:8317",
      "apiKey": "sk-dummy",
      "provider": "anthropic"
    },
    {
      "model": "claude-opus-4-6",
      "displayName": "Opus 4.6 [Max]",
      "baseUrl": "http://127.0.0.1:8317",
      "apiKey": "sk-dummy",
      "provider": "anthropic"
    },
    {
      "model": "claude-sonnet-4-6",
      "displayName": "Sonnet 4.6 [Max]",
      "baseUrl": "http://127.0.0.1:8317",
      "apiKey": "sk-dummy",
      "provider": "anthropic"
    },
    {
      "model": "gpt-5.3-codex",
      "displayName": "GPT 5.3 Codex [ChatGPT]",
      "baseUrl": "http://127.0.0.1:8317/v1",
      "apiKey": "sk-dummy",
      "provider": "openai"
    },
    {
      "model": "gpt-5.4",
      "displayName": "GPT 5.4 [ChatGPT]",
      "baseUrl": "http://127.0.0.1:8317/v1",
      "apiKey": "sk-dummy",
      "provider": "openai"
    },
    {
      "model": "gpt-5.5",
      "displayName": "GPT 5.5 [ChatGPT]",
      "baseUrl": "http://127.0.0.1:8317/v1",
      "apiKey": "sk-dummy",
      "provider": "openai"
    }
  ]
}
```

**Key differences for OpenAI models:**
- `baseUrl` includes `/v1` at the end: `"http://127.0.0.1:8317/v1"`
- `provider` is `"openai"` (not `"anthropic"`)
- Models: `gpt-5.3-codex`, `gpt-5.4`, `gpt-5.5`

### 3. Restart Factory daemon

```bash
kill $(pgrep -f "droid daemon") 2>/dev/null
killall factory-desktop 2>/dev/null
sleep 2
open -a Factory
```

### 4. Verify via CLI

```bash
/Applications/Factory.app/Contents/Resources/bin/droid exec --help 2>&1 | grep -A10 "Custom Models"
```

You should see both Claude and OpenAI models:

```
Custom Models:
  custom:Opus-4.7-[Max]-0           Opus 4.7 [Max]
  custom:Opus-4.6-[Max]-1           Opus 4.6 [Max]
  custom:Sonnet-4.6-[Max]-2         Sonnet 4.6 [Max]
  custom:GPT-5.3-Codex-[ChatGPT]-3  GPT 5.3 Codex [ChatGPT]
  custom:GPT-5.4-[ChatGPT]-4        GPT 5.4 [ChatGPT]
  custom:GPT-5.5-[ChatGPT]-5        GPT 5.5 [ChatGPT]
```

Test a request:

```bash
/Applications/Factory.app/Contents/Resources/bin/droid exec --model "custom:GPT-5.4-[ChatGPT]-4" "say hello"
```

---

## Local / Self-hosted Models (Direct Connection)

The entries above all route through the local CLIProxyAPI gateway (`127.0.0.1:8317`) using OAuth'd upstream subscriptions. You can also point Droid **directly** at a self-hosted OpenAI-compatible server (llama.cpp, vLLM, LM Studio, Ollama, etc.) running on another Tailscale node — no proxy in between.

This example connects Droid directly to a Gemma 4 26B server running on an M1 Max at `100.<tailscale-ip-2>:8080`. Add it to `~/.factory/settings.json` by merging into the existing `customModels` array (preserve any other keys and model entries):

```json
{
  "customModels": [
    {
      "model": "mlx-community/gemma-4-26b-a4b-it-4bit",
      "displayName": "Gemma 4 26B 4bit (M1 Max)",
      "baseUrl": "http://100.<tailscale-ip-2>:8080/v1",
      "apiKey": "not-needed",
      "noImageSupport": false,
      "provider": "openai"
    }
  ]
}
```

> **`model` must match a real served id.** This is the #1 reason a local entry silently fails. Find the exact value the server expects before writing the entry:
> ```bash
> curl -s http://100.<tailscale-ip-2>:8080/v1/models | python3 -m json.tool   # use an "id" from here
> ```
> Single-model servers (e.g. `llama-server` launched with one `--model`) often accept any string and serve the loaded model, but **multi-model** servers (MLX-LM serving several checkpoints, LM Studio, vLLM with `--served-model-name`, Ollama) dispatch by exact id and will **404** on a mismatch. Droid sends whatever you put in `model` verbatim as the request's `model` field, so it has to match.

Key details (how this differs from the proxy entries above):
- **Direct connection:** `baseUrl` points at the model server over Tailscale (`100.<tailscale-ip-2>:8080`), not at `127.0.0.1:8317`. The M1 Max must be reachable on the tailnet and serving on that port.
- **`provider: "openai"` + `/v1` suffix:** llama.cpp/vLLM/etc. expose an OpenAI-compatible `/v1/chat/completions` endpoint, so they reuse the OpenAI shape (same as the ChatGPT entries above), **not** `anthropic`. (`baseUrl` therefore ends in `/v1`, like the OpenAI entries and unlike the Anthropic ones.)
- **`apiKey: "not-needed"`:** there's no gateway token to present — local servers typically don't enforce auth. If the server *does* require a key, put it here instead.
- Same camelCase keys (`customModels`, `baseUrl`, `apiKey`) and merge-don't-overwrite rules as the other sections.

### ⚠️ Apply the edit only while Factory is fully quit (clobber trap)

There is **no `droid models add` subcommand** — editing `~/.factory/settings.json` by hand is the only way to register a custom model. But the **Factory desktop app** spawns a long-lived `droid daemon` child (visible as `droid daemon --enable-child-ipc …`) that **owns `settings.json` and re-persists its in-memory model list to disk**. If you edit the file while that daemon is running, it **overwrites your change within seconds** — silently dropping the new entry (and, observed in practice, also stripping unrelated keys like `droid-control@factory-plugins` from `enabledPlugins` in the same write).

Quitting the **terminal CLI** does *not* help — that's a separate process; the desktop daemon keeps running and keeps clobbering. So do it in this order:

```bash
# 1. Fully QUIT the Factory app first (Cmd+Q, or): 
killall factory-desktop 2>/dev/null
kill $(pgrep -f "droid daemon") 2>/dev/null
sleep 2

# 2. Confirm NOTHING Factory/droid is running before you touch the file:
ps aux | grep -iE "factory-desktop|droid daemon" | grep -v grep
#   ^^ must print nothing. If it prints anything, a daemon is still alive and will revert your edit.

# 3. NOW edit ~/.factory/settings.json (merge into customModels as above).

# 4. Verify with a one-shot exec — it re-reads the file fresh and lists all models:
/Applications/Factory.app/Contents/Resources/bin/droid exec --help 2>&1 | grep -i gemma

# 5. Test the call — copy the EXACT custom:<id> printed by step 4
#    (the trailing index depends on position/order in the array):
/Applications/Factory.app/Contents/Resources/bin/droid exec \
  --model "custom:Gemma-4-26B-4bit-(M1-Max)-0" "say hello"

# 6. Reopen Factory whenever you like — its daemon now reads the corrected file.
```

Always **quote** the model name: the parentheses/brackets trigger zsh glob expansion otherwise. And don't guess the `<id>`/index — the daemon assigns it from your `displayName` + array position, so read it from `--help` first.

> **Alternative:** to keep all model traffic on one port, register the same server as an `openai-compatibility` provider inside CLIProxyAPI, then add it here pointing at `http://127.0.0.1:8317/v1` with `apiKey: "sk-dummy"` (see `configs/unified-model-gateway.md`).

---

## Managing the proxy

- **Model not in CLI**: Check `~/.factory/settings.json` uses camelCase (`customModels`, `baseUrl`, `apiKey`). Settings changes are auto-detected via file watching.
- **"no matches found" in zsh**: Quote the model name: `"custom:Opus-4.7-[Max]-0"`
- **Custom models not in desktop app**: This is a Factory limitation. BYOK custom models only appear in the CLI, not in the desktop/web UI.
- **Proxy not responding**: Ensure CLIProxyAPI process is running (`ps aux | grep cli-proxy-api`) and port 8317 is free (`lsof -i :8317`).
- **OAuth expired**: Re-run `./cli-proxy-api --config ~/.cli-proxy-api/config.yaml --claude-login` from `~/CLIProxyAPI`.
- **OpenAI/Codex OAuth expired**: Re-run `./cli-proxy-api --config ~/.cli-proxy-api/config.yaml --codex-login` from `~/CLIProxyAPI`.
- **OpenAI models not working**: Verify `baseUrl` ends with `/v1` and `provider` is `"openai"` (not `"anthropic"`).
