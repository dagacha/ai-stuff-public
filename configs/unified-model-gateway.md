# Unified Model Gateway for Coding Agents

**Status:** active — verified 2026-09-02

## 1. Objective
Establish `cli-proxy-api` (a.k.a. CLIProxyAPI) as the **Single Source of Truth (SSOT)** for all custom and shared models. Instead of agents managing API keys and upstream URLs, they will act as thin clients pointing to a local gateway.

## 2. Target Architecture
**Current Flow (Fragmented):**
`Agent A` $\rightarrow$ `Upstream API (Key A)`
`Agent B` $\rightarrow$ `Upstream API (Key B)`
`Agent C` $\rightarrow$ `Upstream API (Key C)`

**Proposed Flow (Uniform):**
`Agent A` $\rightarrow$ `cli-proxy-api (Port 8317)` $\rightarrow$ `Upstream API`
`Agent B` $\rightarrow$ `cli-proxy-api (Port 8317)` $\rightarrow$ `Upstream API`
`Agent C` $\rightarrow$ `cli-proxy-api (Port 8317)` $\rightarrow$ `Upstream API`

---

## 3. Proxy Architecture (`cli-proxy-api`)

**Binary:** `/Users/<user>/CLIProxyAPI/cli-proxy-api`
**Config:** `~/.cli-proxy-api/config.yaml`
**Auth Dir:** `~/.cli-proxy-api/` (OAuth token files auto-discovered)
**Docs:** https://help.router-for.me/
**Source:** `/Users/<user>/CLIProxyAPI/`

### Auth Sources (Priority & Routing)

`cli-proxy-api` has **multiple auth channels** that serve different upstream providers. Understanding the distinction is critical to avoid misconfiguration.

| Channel | Config Key | Auth Method | Auto-Discovery |
|---|---|---|---|
| **Claude OAuth** | *(auth-dir files)* | OAuth JWT tokens in `~/.cli-proxy-api/*.json` | ✅ Yes — files with `"type": "claude"` |
| **Codex OAuth** | *(auth-dir files)* | OAuth JWT tokens in `~/.cli-proxy-api/*.json` | ✅ Yes — files with `"type": "codex"` |
| **Gemini OAuth** | *(auth-dir files)* | OAuth tokens | ✅ Yes — files with `"type": "gemini"` |
| **Antigravity OAuth** | *(auth-dir files)* | Google OAuth → Code Assist backend | ✅ Yes — files with `"type": "antigravity"` |
| **OpenAI-Compatible** | `openai-compatibility:` | Static API keys in config | ❌ Manual entries |
| **Claude API Key** | `claude-api-key:` | Static API keys in config | ❌ Manual entries |
| **Codex API Key** | `codex-api-key:` | Static API keys in config | ❌ Manual entries |
| **Gemini API Key** | `gemini-api-key:` | Static API keys in config | ❌ Manual entries |

### ⚠️ Critical: OAuth vs OpenAI-Compatibility

**The `openai-compatibility` channel is for third-party providers only.** Do NOT use it for OpenAI or Anthropic models that have OAuth tokens in auth-dir. 

Using `openai-compatibility` for these providers creates a **static API key entry** that shadows the working OAuth route. If the static key is invalid (e.g., `sk-dummy`), all requests through that route will 401 — even though the OAuth tokens in auth-dir would have worked.

**Wrong ✗:**
```yaml
openai-compatibility:
  - name: "openai"
    base-url: "https://api.openai.com/v1"
    api-key-entries:
      - api-key: "sk-dummy"    # ← Literally sends this to OpenAI. 401!
  - name: "anthropic"
    base-url: "https://api.anthropic.com/v1"
    api-key-entries:
      - api-key: "sk-dummy"    # ← Same problem. 401!
```

**Right ✓:** Let the OAuth token files handle OpenAI/Anthropic. Use `oauth-model-alias` for model name mapping:
```yaml
oauth-model-alias:
  codex:
    - name: "gpt-5.5"
      alias: "gpt-5.5-plus"
      fork: true    # keep original name too
  claude:
    - name: "claude-opus-4-7"
      alias: "claude-opus-max"
      fork: true
    - name: "claude-sonnet-4-6"
      alias: "claude-sonnet-max"
      fork: true
```

### Current Auth Files in `~/.cli-proxy-api/`

| File | Type | Subscription | Expiry |
|---|---|---|---|
| `claude-<account>.json` | `claude` | Claude Max | 2026-06-09 |
| `codex-<account>-plus.json` | `codex` | ChatGPT Plus | 2026-06-18 |
| `codex-<account>-prolite.json` | `codex` | ChatGPT Prolite | 2026-06-18 |
| `antigravity-<google-account>@gmail.com.json` | `antigravity` | Google AI Pro (Antigravity) | auto-refreshed |

Tokens auto-refresh via the proxy's `auth-auto-refresh` worker (every 15 min).

---

## 4. Execution Phases

### Phase 1: Gateway Consolidation (The "Backend")

All "heavy" configuration (actual API keys, secret tokens, and provider-specific Base URLs) is moved into `cli-proxy-api`.

1.  **Define Universal Model IDs:** Create a standardized list of IDs used across all agents.
    *   *Example:* `glm-5.1`, `gemma-4-31b`, `claude-opus-max`.
2.  **Map Upstreams:** Configure `cli-proxy-api` to map these IDs to the actual providers.
    *   `glm-5.1` $\rightarrow$ `Z.AI` (Key: `753af...`) — via `openai-compatibility`
    *   `gemma-4-31b` $\rightarrow$ `Local llama.cpp` (Key: `sk-local`) — via `openai-compatibility`
    *   `kimi-k2p6-turbo` $\rightarrow$ `Fireworks` (Key: `fw_LKB...`) — via `openai-compatibility`
    *   `claude-opus-max` $\rightarrow$ `Claude Max` (OAuth) — via auth-dir + `oauth-model-alias`
    *   `gpt-5.5-plus` $\rightarrow$ `ChatGPT Plus` (OAuth) — via auth-dir + `oauth-model-alias`
3.  **Centralize Secrets:** Remove API keys from agent config files where possible and move them to the proxy's auth-dir or config.

### Phase 2: Agent Pointer Setup (The "Frontend")

Update the agents to point to the proxy.

#### **A. OpenCode Setup**
Modify `~/.config/opencode/opencode.jsonc` to use provider entries pointing to the proxy.
*   **Base URL:** `http://127.0.0.1:8317/v1`
*   **API Key:** `sk-dummy`
*   **Models:** List the **Universal Model IDs** only.
*   **Note:** Use `@ai-sdk/openai-compatible` for chat and `@ai-sdk/openai` for Codex/Responses API.

#### **B. Droid (Factory) Setup**
Modify `~/.factory/settings.json` in the `customModels` array.

**⚠️ Critical: Droid's `provider` field determines the API protocol AND is validated against the model name:**
- `provider: "anthropic"` $\rightarrow$ Droid appends `/v1/messages` $\rightarrow$ **Use `baseUrl: "http://127.0.0.1:8317"`** (Droid adds its own `/v1`). **Required** for any model whose name contains "claude", "haiku", "sonnet", or "opus" — Droid rejects other providers for these names.
- `provider: "generic-chat-completion-api"` $\rightarrow$ Droid appends `/chat/completions` $\rightarrow$ **Use `baseUrl: "http://127.0.0.1:8317/v1"`** (proxy adds `/v1` prefix). Use this for GPT/Codex/GLM/Gemma models.
- **`apiKey`** must be `"sk-dummy"` (must match an entry in the proxy's `api-keys` list in `config.yaml`).

If you use `/v1` in the baseUrl for `anthropic` provider, Droid will hit `/v1/v1/messages` → **404 error**.

> **Note:** There is no section C — the original outline reserved a slot for a fourth agent that was never added. Sections continue at D below.

#### **D. Hermes Agent Setup**
Modify `~/.hermes/config.yaml` (and profile-specific configs) to register the gateway.
*   **Provider Config**: Add a `unified-gateway` entry under both `providers:` and `model_catalog:`.
*   **API Mode**: Set `api_mode: chat_completions`.
*   **Base URL**: `http://127.0.0.1:8317/v1`.
*   **API Key**: `sk-dummy`.
*   **Model Registration**: Every Universal Model ID must be listed in both `providers` and `model_catalog` sections to be visible in the model selection UI.
*   **Default Model**: Set `model.provider` to `unified-gateway` and `model.default` to a Universal Model ID (e.g., `claude-opus-max`).

---

## 5. The "New Model" Workflow (Post-Implementation)

Once this plan is active, adding a new model (e.g., "DeepSeek-V4") changes from a 3-step chore to a 1-step process:

1.  **Step 1 (Proxy):** Add `deepseek-v4` to `cli-proxy-api` config with the real API key and upstream URL.
2.  **Step 2 (Agents):** Add the ID `deepseek-v4` to the simple model lists in the agents (no keys, no URLs).

*Note: If you use a dynamic model discovery endpoint in Pi/OpenCode, Step 2 happens automatically.*

### Adding a new model — by provider type:

**OAuth provider (Claude/Codex):**
1. **Stop the background proxy first** (the login flow can't bind the port while the server is running):
   ```bash
   launchctl unload ~/Library/LaunchAgents/com.cliproxyapi.server.plist
   ```
2. Authenticate using the **flag-based** login commands (NOT `auth login` — that is not a valid subcommand in this build):
   - Claude: `cli-proxy-api --config ~/.cli-proxy-api/config.yaml -claude-login`
   - Codex: `cli-proxy-api --config ~/.cli-proxy-api/config.yaml -codex-login` (or `-codex-device-login` for device code flow)
   - Add `-no-browser` if the browser doesn't open automatically (prints URL to terminal instead).
   - **⚠️ The `--config` flag MUST come first**, before the login flag. Placing it after the login flag causes the binary to ignore it and look for `config.yaml` in the current directory.
3. Complete the login in your browser, then press `Ctrl+C` to stop the login process.
4. Add `oauth-model-alias` in `config.yaml` if you want a custom name.
5. Restart the background proxy:
   ```bash
   launchctl load ~/Library/LaunchAgents/com.cliproxyapi.server.plist
   ```

   **Available login flags** (from `cli-proxy-api --help`): `-claude-login`, `-codex-login`, `-codex-device-login`, `-kimi-login`, `-login` (Google/Gemini), `-antigravity-login`, `-vertex-import <file>`.

**Static API key provider:**
1. Add `openai-compatibility` entry in `config.yaml` with real API key
2. Restart proxy

### Adding a new model — per-agent (Pi + Droid)

The steps above add the model to the **proxy** (backend). This subsection covers the matching **agent-side** edit so Pi and Droid actually expose it. Precondition: the proxy already serves the id — verify before touching either agent:

```bash
# 1. Confirm the id is advertised
ID=claude-fable-5   # example
curl -s http://127.0.0.1:8317/v1/models -H "Authorization: Bearer sk-dummy" | python3 -m json.tool | grep -i "$ID"
# 2. Confirm it actually responds (not just listed)
curl -s http://127.0.0.1:8317/v1/chat/completions \
  -H "Authorization: Bearer sk-dummy" -H "Content-Type: application/json" \
  -d "{\"model\":\"$ID\",\"messages\":[{\"role\":\"user\",\"content\":\"hi\"}],\"max_tokens\":20}"
```

#### Pi — `~/.pi/agent/extensions/gateway.ts`

Add one object to the `cliproxy` provider's `models[]` array, matching the existing entries:

```ts
{
    id: "claude-fable-5",                       // MUST match the proxy-served id exactly
    name: "Claude Fable 5 (Gateway)",            // cosmetic — the picker label
    reasoning: true,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 200000,
    maxTokens: 8192,
},
```

- **No restart needed** — pi reloads extensions each session.
- **`id` is sent verbatim** as the request's `model` field, so it has to match what the proxy advertises. `name` is only the picker label.
- The extension's `models[]` is the **sole** source of truth — any stale `cliproxy` block in `models.json` is fully overridden (Pitfall 8).
- Verify (one-shot, non-interactive): `pi -p --model cliproxy/claude-fable-5 -na "say hi"`.

#### Droid — `~/.factory/settings.json`

Add one object to the `customModels[]` array:

```json
{
  "model": "claude-fable-5",
  "baseUrl": "http://127.0.0.1:8317/v1",
  "apiKey": "sk-dummy",
  "displayName": "Claude Fable 5",
  "noImageSupport": false,
  "provider": "generic-chat-completion-api"
}
```

- **`model` must match the proxy id verbatim.** `displayName` is the picker label; droid derives the `custom:<...>-<N>` id from it + array position — **do not set `id`/`index` yourself**, let droid assign on load and read the assigned id from `droid exec --help`.
- **`apiKey` must be `sk-dummy`** — the proxy 401-rejects anything else (Pitfall 10).
- **Provider field** — pick per the Technical Specifications Matrix (§6). Discrepancy to know about: on Factory 0.159.x the live config uses `generic-chat-completion-api` + `/v1` for Claude models and it works; older Droid builds enforced `provider: "anthropic"` + **no** `/v1` for claude-named models (Pitfall 6). If `droid exec` rejects your Claude entry with a provider-validation error, flip to the `anthropic` / no-`/v1` pattern.

**⚠️ Clobber trap — quit Factory before editing.** The desktop app spawns a long-lived `droid daemon` that *owns* `settings.json` and re-persists its in-memory model list, overwriting any file edit made while it runs (within seconds), silently dropping the new entry. Quitting the **terminal CLI** is not enough — that's a separate process. Edit only when nothing Factory/droid is running:

```bash
# 1. Fully quit Factory (desktop + daemon)
killall factory-desktop 2>/dev/null
kill $(pgrep -f "droid daemon") 2>/dev/null
sleep 2
# 2. Confirm nothing is running — must print nothing:
ps aux | grep -iE "factory-desktop|droid daemon" | grep -v grep
# 3. NOW edit ~/.factory/settings.json (merge into customModels[]).
# 4. Verify — droid re-reads the file fresh and lists every model:
/Applications/Factory.app/Contents/Resources/bin/droid exec --help 2>&1 | grep -i fable
# 5. Test with the EXACT custom:<id> printed by step 4 (quote it — parens/brackets trip zsh):
/Applications/Factory.app/Contents/Resources/bin/droid exec --model "custom:Claude-Fable-5-0" "say hi"
# 6. Reopen Factory whenever you like — its daemon now reads the corrected file.
```

#### Worked example: adding a new model

Following the steps above, a new model (e.g. `claude-fable-5`) is added to both agents with one `gateway.ts` object + one `customModels[]` entry (grouped with the other Claude models). Both verified end-to-end: a "say hi" → "hello" round trip through the gateway. The Droid edit must be performed with Factory fully quit, so the entry survives. (An earlier Gemma entry was lost on a first attempt because the desktop daemon was still running during the edit — the clobber trap above.)

#### Adding a *thinking-effort variant* of a model (e.g. `claude-fable-5-low`)

Model pickers in Pi display entries by the `id` field, **not** the `name` label (`name` is only shown as secondary/matching text). So you **cannot** create a second selectable variant of the same model by duplicating the entry with the same `id` but a different `name` — Pi renders both rows identically and the picker shows only one, deduplicated look.

To expose two distinct, independently-selectable variants of one upstream model (e.g. default + a low-thinking-effort clone), three files must change together — **all three are required**:

1. **Proxy — `cli-proxy-api` `config.yaml`**, add the distinct `claude-fable-5-low` id as an alias under `oauth-model-alias.claude` so requests for it route upstream to the real `claude-fable-5`. With `fork: true` the alias is added **and** the original name stays available:
    ```yaml
    oauth-model-alias:
      claude:
        - name: "claude-fable-5"       # upstream model actually sent to the API
          alias: "claude-fable-5-low"  # client-visible id Pi sends
          fork: true                     # keep the original id available too
    ```
    The proxy hot-reloads `config.yaml` on file change (fsnotify; see `config_reload.go:64/133` in the cliproxy log) — **no proxy restart needed**. Verify the alias is live with:
    ```bash
    curl -s http://127.0.0.1:8317/v1/models -H "Authorization: Bearer sk-dummy" | python3 -m json.tool | grep -i fable
    # must list both claude-fable-5 AND claude-fable-5-low
    ```

2. **Pi — `gateway.ts`**, add a second `model` entry whose `id` is the new alias. Give it its own `thinkingLevelMap` mapping **every** Pi thinking level to the target value so the variant's reasoning effort is pinned regardless of which thinking level is cycled to:
    ```ts
    {
        id: "claude-fable-5-low",                       // MUST match the proxy alias id
        name: "Claude Fable 5 Low (Gateway)",            // cosmetic — picker label
        reasoning: true,
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 200000,
        maxTokens: 8192,
        thinkingLevelMap: {
            off: "low", minimal: "low", low: "low", medium: "low",
            high: "low", xhigh: "low", max: "low",
        },
    },
    ```
    Pi sends the mapped value as `reasoning_effort` on the request (its default for a reasoning model is `high`, which is why the stock `claude-fable-5` shows "• high"). Mapping every level to `"low"` forces `reasoning_effort: low` no matter what the user cycles the thinking level to.

3. **Reload the Pi extension.** `gateway.ts` is a TypeScript extension, not `models.json` — editing it does **not** hot-reload into live Pi sessions. Run `/reload` in the Pi TUI (or restart Pi), then open `/model` (`ctrl+l`) to see `claude-fable-5` and `claude-fable-5-low` as two separate rows.

Verify the pair end-to-end (one-shot, non-interactive):
```bash
pi -p --model cliproxy/claude-fable-5     -na "say hi"
pi -p --model cliproxy/claude-fable-5-low -na "say hi"
```
Both should answer through the gateway; the `-low` requests carry `reasoning_effort: low`.

---

## 6. Technical Specifications Matrix

| Agent | Config File | Base URL | Protocol | Notes |
| :--- | :--- | :--- | :--- | :--- |
| **OpenCode** | `opencode.jsonc` | `http://127.0.0.1:8317/v1` | OpenAI-compatible | All providers use `/v1` prefix |
| **Droid (OpenAI)** | `settings.json` | `http://127.0.0.1:8317/v1` | OpenAI-compatible | `/v1` prefix in baseUrl |
| **Droid (Claude/Anthropic)** | `settings.json` | `http://127.0.0.1:8317` (no `/v1`) *or* `http://127.0.0.1:8317/v1` | Anthropic Messages / OpenAI-compatible | Both `provider: "anthropic"` (no `/v1`) and `provider: "generic-chat-completion-api"` (with `/v1`) work for Claude models on current Droid (see Pitfall 6). **Do not mix**: `anthropic` + `/v1` → 404 double-`/v1` (Pitfall 2). `apiKey: "sk-dummy"`. |
| **Droid (GPT/OpenAI)** | `settings.json` | `http://127.0.0.1:8317/v1` | OpenAI-compatible | **Use `provider: "generic-chat-completion-api"`** for GPT/Codex models. `/v1` prefix in baseUrl. Use `apiKey: "sk-dummy"`. |
| **Pi** | `gateway.ts` | `http://127.0.0.1:8317/v1` | OpenAI-compatible | All providers use `/v1` prefix |
| **Hermes** | `config.yaml` | `http://127.0.0.1:8317/v1` | OpenAI-compatible | **Requires registration in both `providers` and `model_catalog` for visibility** |

---

## 7. Risk Mitigation & Validation

*   **Risk:** Proxy downtime kills all agents.
    *   **Mitigation:** Keep the "Native" providers configured in the agents as a fallback. If the proxy is down, simply switch the model to a native one.
*   **Risk:** Context window mismatch.
    *   **Mitigation:** Define the `contextWindow` and `maxTokens` in the agent's config to match the proxy's limits, ensuring the agent's "auto-compaction" logic triggers correctly.
*   **Risk:** OAuth token expiry.
    *   **Mitigation:** Tokens auto-refresh every 15 min via `cli-proxy-api`'s auth-refresh worker. Monitor auth files for `"disabled": true` or expired `"expired"` timestamps.
*   **Risk:** `openai-compatibility` shadowing OAuth routes.
    *   **Mitigation:** Never add `openai-compatibility` entries for providers that have OAuth tokens in auth-dir. Use `oauth-model-alias` for name mapping instead.
*   **Risk:** Double `/v1` path for Anthropic provider in Droid.
    *   **Mitigation:** Use `baseUrl: "http://127.0.0.1:8317"` (no `/v1`) for `provider: "anthropic"` entries in Droid.
*   **Risk:** Proxy process dies when launched from a shell session.
    *   **Mitigation:** Proxy is managed by `launchd` (see §10) — auto-starts on login and auto-restarts on crash. No manual `nohup` needed.
*   **Risk:** OpenCode uses wrong SDK for Responses API models.
    *   **Mitigation:** Keep `cliproxy` (`@ai-sdk/openai-compatible`) for chat models and `cliproxy-responses` (`@ai-sdk/openai`) for Codex/Responses API models. The `openai-compatible` SDK cannot handle the `/v1/responses` endpoint.

### Validation Procedure
1.  **Check proxy model list:**
    ```bash
    curl -s http://127.0.0.1:8317/v1/models -H "Authorization: Bearer sk-dummy" | python3 -c "import sys,json; [print(m['id'], m['owned_by']) for m in json.load(sys.stdin)['data']]"
    ```
    Verify OAuth models show `owned_by: "openai"` (Codex) or `owned_by: "anthropic"` (Claude) — NOT from an `openai-compatibility` entry.

2.  **Test a Claude model (chat completions):**
    ```bash
    curl -s http://127.0.0.1:8317/v1/chat/completions \
      -H "Authorization: Bearer sk-dummy" -H "Content-Type: application/json" \
      -d '{"model":"claude-opus-max","messages":[{"role":"user","content":"Say hi"}],"max_tokens":10}'
    ```
    Should return 200 with a response like `"content": "Hi"`.

3.  **Test a GPT model (chat completions):**
    ```bash
    curl -s http://127.0.0.1:8317/v1/chat/completions \
      -H "Authorization: Bearer sk-dummy" -H "Content-Type: application/json" \
      -d '{"model":"gpt-5.5-plus","messages":[{"role":"user","content":"Say hi"}],"max_tokens":10}'
    ```

4.  **Test a Codex model (responses API):**
    ```bash
    curl -s http://127.0.0.1:8317/v1/responses \
      -H "Authorization: Bearer sk-dummy" -H "Content-Type: application/json" \
      -d '{"model":"gpt-5.3-codex-spark","input":"Say hi"}'
    ```

5.  **Verify Droid Anthropic path (no double `/v1`):**
    Check server logs for `POST "/v1/v1/messages"` (404) vs `POST "/v1/messages"` (200):
    ```bash
    tail -5 ~/.cli-proxy-api/server.log
    ```

6.  **Verify OpenCode model list:**
    ```bash
    opencode models 2>&1 | grep cliproxy
    ```
    Should list all `cliproxy/` and `cliproxy-responses/` models.

---

## 8. Implementation Status (Current State)

The implementation of the Unified Model Gateway is now **complete** across all three coding agents.

### Implemented Changes

#### **1. Pi Agent**
- **Extension:** `~/.pi/agent/extensions/gateway.ts` — registers the `cliproxy` provider pointing at `http://127.0.0.1:8317/v1` and defines the full model list **inline in the `.ts` file** (see Universal Model Mapping below). `claude-opus-4-8` is registered alongside `claude-opus-max` (4.7), `claude-sonnet-max` (4.6), `gpt-5.5-plus`, `gpt-5.3-codex`, `gemma-4-31b`, and `glm-5.1`.
- **⚠️ Gateway models live ONLY in the extension:** Any `cliproxy` block left in `~/.pi/agent/models.json` is fully overridden by `gateway.ts` and silently ignored — see **Pitfall 8**. Edit the `.ts` file when changing gateway models; do not maintain a duplicate in `models.json`.
- **Capabilities:** Full support for reasoning and context windows. Integrated `@ai-sdk/openai` for Codex/Responses API compatibility.
- **Non-gateway (direct) providers:** Pi also runs LAN-direct providers that bypass the proxy — `msioffice-gemma` (`msioffice-gemma.ts` → local llama.cpp Gemma-4-31B), plus `msioffice` and `bosgame1` (defined in `models.json`). These are intentionally outside the gateway.

#### **2. OpenCode**
- **Config Updated:** `~/.config/opencode/opencode.jsonc`
- **Simplification:** Collapsed 4 fragmented providers (`claude-max`, `local-gemma`, `openai`, `zai`) into 2 unified gateway providers:
  - `cliproxy` (`@ai-sdk/openai-compatible`) — all chat models (Claude, GPT, GLM, Gemma, Kimi)
  - `cliproxy-responses` (`@ai-sdk/openai`) — Codex/Responses API models only
- **New models added:** `claude-opus-max`, `claude-sonnet-max`, `gpt-5.5-plus`, `kimi-k2p6-turbo`
- **Default model:** `cliproxy/claude-opus-max`
- **API Handling:** `@ai-sdk/openai-compatible` handles Chat Completions; `@ai-sdk/openai` handles Responses API for Codex models.

#### **3. Droid (Factory)**
- **Config Updated:** `~/.factory/settings.json`
- **Unified Routing:** All `customModels` now use the proxy base URL.
- **⚠️ Provider-Specific baseUrl:** Anthropic models use `http://127.0.0.1:8317` (no `/v1`), OpenAI models use `http://127.0.0.1:8317/v1`.

#### **4. Hermes Agent**
- **Config Updated:** `~/.hermes/config.yaml` (and profile-specific configs)
- **Unified Routing:** Registered `unified-gateway` provider pointing to `http://127.0.0.1:8317/v1`.
- **Visibility:** Explicitly registered Universal Model IDs in both `providers` and `model_catalog` to ensure visibility in the model selection UI.
- **Default model:** `claude-opus-max` via `unified-gateway`.

### Proxy Configuration (`~/.cli-proxy-api/config.yaml`)

| Provider | Channel | Auth Method | Model IDs |
|---|---|---|---|
| Claude Max | auth-dir OAuth | `claude-<account>.json` | `claude-opus-max`, `claude-sonnet-max`, + native names |
| ChatGPT Plus | auth-dir OAuth | `codex-<account>-plus.json` | `gpt-5.5-plus`, `gpt-5.5`, + native names |
| ChatGPT Prolite | auth-dir OAuth | `codex-<account>-prolite.json` | Additional Codex models |
| Z.AI | openai-compatibility | API key `753af...` | `glm-5.1`, `glm-5-turbo`, `glm-5v-turbo`, `glm-4.7`, `glm-4.5-air` |
| Fireworks | openai-compatibility | API key `fw_LKB...` | `kimi-k2p6-turbo` |
| Local Gemma | openai-compatibility | API key `sk-local` | `gemma-4-31b` |

### Current Universal Model Mapping

The following IDs are now standardized across all three agents:

| Universal ID | Display Name | Upstream | Auth |
|---|---|---|---|
| `glm-5.1` | GLM-5.1 Z.AI Coding Plan | Z.AI | API key |
| `gemma-4-31b` | Gemma-4-31B (QAT Q4_K_XL, 108K) | Local llama.cpp | `sk-local` |
| `kimi-k2p6-turbo` | Kimi K2 P6 Turbo | Fireworks | API key |
| `claude-opus-max` | Claude Opus 4.7 [Max] | Claude Max OAuth | JWT |
| `claude-opus-4-8` | Claude Opus 4.8 | Claude Max OAuth | JWT |
| `claude-sonnet-max` | Claude Sonnet 4.6 [Max] | Claude Max OAuth | JWT |
| `gpt-5.5-plus` | GPT-5.5 [Plus] | ChatGPT Plus OAuth | JWT |
| `gpt-5.3-codex` | GPT-5.3 Codex [Plus] | ChatGPT Plus/Prolite OAuth | JWT |

### Verification Results
- **Base URL Unification:** All agents are successfully routing through `http://127.0.0.1:8317`.
- **Auth Simplification:** API keys are now handled exclusively by `cli-proxy-api`; agents use `sk-dummy`.
- **OAuth Routing:** Claude and Codex models now route through their respective OAuth channels (not `openai-compatibility`).
- **API Compatibility:** The `gpt-5.3-codex` model is correctly routed through the Responses API implementation.
- **Path Fix:** Droid Anthropic models use correct `/v1/messages` path (no double `/v1`).

---

## 9. Lessons Learned & Pitfalls

### Pitfall 1: `openai-compatibility` Shadowing OAuth Routes
Adding `openai-compatibility` entries for providers that also have OAuth tokens in auth-dir causes the static API key entry to take precedence. If the static key is invalid (`sk-dummy`), all requests to those models will 401 — **even though the OAuth tokens would have worked**. Use `oauth-model-alias` for name mapping instead.

### Pitfall 2: Double `/v1` in Droid Anthropic Paths
When Droid has `provider: "anthropic"`, it appends `/v1/messages` to the baseUrl. If baseUrl is `http://127.0.0.1:8317/v1`, the actual request goes to `/v1/v1/messages` → 404. **Always omit `/v1` from baseUrl for Anthropic provider entries in Droid.**

### Pitfall 3: Proxy Process Persistence
Launching `cli-proxy-api` in a shell background (`&`) will kill the process when the shell exits. Always use `nohup`:
```bash
nohup /Users/<user>/CLIProxyAPI/cli-proxy-api --config ~/.cli-proxy-api/config.yaml > ~/.cli-proxy-api/server.log 2>&1 &
```

### Pitfall 4: `fork: true` in `oauth-model-alias`
Without `fork: true`, an alias replaces the original model name. If OpenCode uses `gpt-5.5` (native) and Droid uses `gpt-5.5-plus` (alias), **both names must be available**. Always set `fork: true` for universal aliases.

### Pitfall 5: OpenCode Requires Two SDK Providers
OpenCode cannot use a single provider for all models. The `@ai-sdk/openai-compatible` package only supports `/v1/chat/completions`, while Codex models need the `/v1/responses` endpoint which requires `@ai-sdk/openai`. **Use two providers:** `cliproxy` (openai-compatible) for chat models, and `cliproxy-responses` (openai) for Codex/Responses API models.

### Pitfall 6: Droid Provider for Claude Models (no longer enforced on current Droid)

**History:** older Droid builds **validated** the `provider` field against the model name — if a model name contained "claude"/"haiku"/"sonnet"/"opus", Droid **required** `provider: "anthropic"` and rejected anything else:
> `Your custom model "claude-opus-4-7" appears to be a Claude/Anthropic model, but is configured with provider "generic-chat-completion-api". For Claude models (Haiku, Sonnet, Opus), use "provider": "anthropic".`

**Current behavior (verified on Droid CLI 0.162.1, 2026-07-02):** this validation is **gone**. Both providers are accepted for Claude model names. A/B tested with throwaway entries for `claude-sonnet-5` through the gateway, each returning a clean response:

| Pattern | `provider` | `baseUrl` | Result |
|---|---|---|---|
| A | `anthropic` | `http://127.0.0.1:8317` (no `/v1`) | ✅ works |
| B | `generic-chat-completion-api` | `http://127.0.0.1:8317/v1` | ✅ works |
| C | `anthropic` | `http://127.0.0.1:8317/v1` (with `/v1`) | ❌ fails — double `/v1` (Pitfall 2) |

**Practical guidance:**
- The **live config** uses pattern B (`generic-chat-completion-api` + `/v1`) for all Claude models (`claude-opus-max`, `claude-sonnet-max`, `claude-fable-5`, …) and it works — so staying consistent with B is the path of least surprise across the fleet.
- Pattern A (`anthropic` + no `/v1`) is equally valid if you prefer the native Anthropic Messages path; just keep the provider and the `/v1` (no `/v1`) convention **paired** as shown — mixing them is the only way to break it (pattern C).
- If you hit the old validation error on a **stale** Droid build, switch that entry to pattern A.

**Note:** An even earlier version of this doc recommended `generic-chat-completion-api` for Claude models to avoid tool-schema 400s, then flipped to "must use `anthropic`" when validation appeared. With validation removed on current Droid, both are viable; pick one per fleet and stay consistent.

### Pitfall 7: Hermes Model Visibility (Registration Gap)
In the Hermes Agent, simply defining a provider in the `providers` section is not enough to make models appear in the model selection menu. Models must be explicitly registered in **both** the `providers` and the `model_catalog` sections of the configuration. If a model is missing from `model_catalog`, it will be ignored by the agent's UI, even if the provider is correctly configured.

### Pitfall 8: Pi Extension Overrides `models.json` for the Same Provider
In Pi, if a provider is registered by an extension (`pi.registerProvider("cliproxy", { models: [...] })`) **and** also defined in `~/.pi/agent/models.json`, the extension's `models` array **completely replaces** the `models.json` entry — it does **not** merge. A stale `cliproxy` block in `models.json` is silently ignored, so editing it has no effect and the visible model list is truncated to the extension's subset.

**Symptom:** `pi --list-models` shows fewer `cliproxy` models than `models.json` defines; models newly added to `models.json` never appear in the picker.

**Fix:** Maintain gateway models in `gateway.ts` only, and delete the dead `cliproxy` block from `models.json` to remove the footgun. Keep genuinely non-extension providers (e.g. `bosgame1`, `msioffice`) in `models.json`.

### Pitfall 9: OAuth Login Uses Flags, Not Subcommands
The `cli-proxy-api` binary does **NOT** support `auth login <provider>` as a subcommand. Running `cli-proxy-api auth login claude` will **silently ignore** the arguments and start the API server instead (which then blocks the terminal without printing a login URL).

**Correct usage** — login is triggered via **flags**, and `--config` must come **first**:
```bash
# Stop background server first (port conflict otherwise)
launchctl unload ~/Library/LaunchAgents/com.cliproxyapi.server.plist

# Login — --config MUST be first!
cli-proxy-api --config ~/.cli-proxy-api/config.yaml -claude-login
cli-proxy-api --config ~/.cli-proxy-api/config.yaml -codex-login

# Add -no-browser if the browser doesn't auto-open (prints URL to terminal)
cli-proxy-api --config ~/.cli-proxy-api/config.yaml -claude-login -no-browser

# Restart background server after login
launchctl load ~/Library/LaunchAgents/com.cliproxyapi.server.plist
```

**Available login flags** (from `cli-proxy-api --help`):
`-claude-login`, `-codex-login`, `-codex-device-login`, `-kimi-login`, `-login` (Google/Gemini), `-antigravity-login`, `-vertex-import <file>`.

### Pitfall 10: `apiKey` in Droid Must Match Proxy's `api-keys` List
Droid's `customModels` entries must use `"apiKey": "sk-dummy"` — the same value listed in the proxy's `config.yaml` under `api-keys:`. Using a placeholder like `"dummy-not-used"` causes a `401 {"error":"Invalid API key"}` from the proxy's auth middleware, **even though the OAuth tokens in auth-dir are valid**. The proxy rejects the request before it ever reaches the routing layer.

**Symptom:** `BYOK Error: 401 {"error":"Invalid API key"}` in Droid.

**Fix:** Set `"apiKey": "sk-dummy"` for all `customModels` entries in `~/.factory/settings.json`.

### Pitfall 11: An AI Studio subscription token (`AQ.`) is not a Gemini API key
The credential exposed by a Google AI Studio Pro web session is a **subscription/quota token** (recognisable by its `AQ.` prefix), not a public `generativelanguage.googleapis.com` key (`AIza…` prefix). Placing it under `gemini-api-key:` in `config.yaml` makes every Gemini request return `400 API_KEY_INVALID`, and — worse — it shadows any working route so even plain chat breaks.

**Symptom:** `400 {"error":{"code":400,"message":"API key not valid. Please pass a valid API key.","status":"INVALID_ARGUMENT", … "reason":"API_KEY_INVALID"}}` on all `gemini-*` calls.

**Fix:** delete the `AQ.` token from `gemini-api-key:` and authenticate the Gemini/Claude/GPT catalog via `--antigravity-login` instead (see §12). The `AQ.` token has **no** valid use anywhere in `config.yaml`.

### Pitfall 12: The AI Studio web-session relay forbids tool calls and images
Driving Gemini from a coding agent by relaying requests through the AI Studio browser tab (the `wss://` "AI Studio Build" WebSocket-proxy approach — usually fronted by a `cloudflared`/`ngrok` tunnel to dodge the HTTPS mixed-content block) works for plain chat but **cannot serve coding agents**. The web-session API rejects tool schemas with `403 PERMISSION_DENIED` and image inputs with `400 At most 0 image(s) may be provided`, and the rejection tears down the relay connection. Reconnection loops don't help — it's a server-side restriction on the session, not a transport hiccup.

**Symptom:** a bare `curl "ping"` returns `Pong!` through the relay, but the moment a coding agent sends its first tool-calling request the connection dies with `403` and every subsequent call returns `503 auth_unavailable` until you re-click *Run* in the browser app.

**Fix:** abandon the relay for agentic use and switch to `--antigravity-login` (§12), which speaks to Google's tool-friendly Code Assist backend instead of the restricted web-session API.

### Pitfall 13: Copied OAuth tokens collide via refresh-token rotation (B dies, A survives)

§11 (and its TL;DR) claims that after copying `~/.cli-proxy-api/`, "B's daemon refreshes its own OAuth tokens every 15 min independently of A. No ongoing sync is required." **This is wrong for shared OAuth tokens (Claude/Codex).** OAuth providers — Anthropic Claude most aggressively — use **refresh-token rotation**: each refresh issues a *new* refresh token and invalidates the *old* one. When two daemons (A and B) hold the *same* copied refresh token, the one that refreshes **second** reuses an already-rotated token, and the provider **revokes the session** as a suspected token-theft replay.

The failure is **asymmetric**, which makes it confusing:
- The machine that refreshes **first** keeps the live chain.
- The other machine's copy **dies** — its token file's `last_refresh` stays frozen at the copy-time value and never advances; every call returns `401`.
- **Claude** (access-token TTL ~8h) surfaces this within ~a day of the copy. **Codex** (access-token TTL ~10d) is silently fine for ~10 days, then dies on its first post-expiry refresh — a **time bomb**: the copied token keeps answering until its access token expires, then the refresh collides and one side dies.

**Symptom on the dead machine (Claude):** `401 {"type":"authentication_error","message":"OAuth access token has been revoked."}` (subsequent calls degrade to `"Invalid authentication credentials"`). Token file: `last_refresh` == the value at copy time, `expired` in the past. The live machine keeps working, which is why this reads as "B is just broken" rather than "the grant is contested".

**Fix — give each machine its OWN OAuth grant (do NOT re-copy; that just restarts the fight):**
```bash
# Headless B: stop the daemon, run the flag-based login (Pitfall 9: --config first),
# with -no-browser so it prints a URL instead of opening a local browser.
systemctl --user stop cli-proxy-api          # macOS: launchctl unload …/com.cliproxyapi.server.plist
cli-proxy-api --config ~/.cli-proxy-api/config.yaml -claude-login -no-browser
cli-proxy-api --config ~/.cli-proxy-api/config.yaml -codex-login  -no-browser
systemctl --user start cli-proxy-api
```
The login binds a **loopback callback server on `127.0.0.1:54545`**, so on a headless box forward that port from a browser-equipped machine first:
```bash
# run on your laptop, keep the session open while you approve in the browser:
ssh -L 54545:127.0.0.1:54545 <B-user>@<B-tailscale-host>   # e.g. dgx@gn100-worker; else dgx@<B-public-IP>
```
then open the printed `https://claude.ai/oauth/authorize?…` (or OpenAI) URL, approve, and the waiting login process writes a fresh grant and exits.

**Re-login does NOT revoke the other machine's grant** (verified A→B: A's Claude kept answering after B re-logged in). Each machine then refreshes its own independent grant indefinitely — no further sync, no further collisions. Re-login is a **one-time per-machine** operation; do it once on every new box, right after the §11 rsync, for **each** OAuth provider in use (Claude, Codex, Antigravity, …). The static `openai-compatibility` API-key entries (Fireworks, Z.AI, `sk-local`) are *not* account-bound and copy cleanly with no re-login.

> **Pre-flight after sync:** on B, check a token file's `last_refresh` (e.g. `python3 -c "import json;print(json.load(open('$HOME/.cli-proxy-api/claude-<acct>.json'))['last_refresh'])"`). If it equals the copy-time value and never advances past one refresh interval, that provider is dead on B and needs re-login. Codex won't show the failure until its ~10d access token expires — so re-login it proactively, don't wait for the 401.

### Pitfall 14: A "same model, different thinking" clone needs a new `id`, not a new `name`

Model pickers in Pi display entries by the model `id` — the `name` field is only cosmetic/secondary (`/model`, `--list-models`, and the footer all render the `id`). So you cannot expose a second selectable variant of an upstream model by copying its `gateway.ts` entry with the same `id` and only changing `name`: Pi shows both rows identically. To add a genuine alternate (e.g. a low-thinking-effort `claude-fable-5-low` clone):
- give the clone a **distinct `id`** in `gateway.ts`, pinned with a `thinkingLevelMap` (so `reasoning_effort` is forced regardless of the cycled thinking level), **and**
- register that distinct id as an `oauth-model-alias` in `config.yaml` (with `fork: true`) so the proxy routes it upstream to the real model, **and**
- `/reload` the Pi extension (editing `gateway.ts` is **not** hot-picked-up by live Pi sessions — see §5, "Adding a thinking-effort variant").

All three pieces are required — skipping the proxy alias means the distinct id `400`s upstream; skipping a distinct id means the picker can't tell the two entries apart; skipping the reload means the running session keeps the stale one-entry catalogue.

---

## 10. Proxy Service (launchd)

The `cli-proxy-api` process is managed by macOS `launchd` for persistence and auto-restart.

**Plist:** `~/Library/LaunchAgents/com.cliproxyapi.server.plist`

**Management commands:**
```bash
# Check if running
ps aux | grep cli-proxy-api | grep -v grep

# Start / restart (if not running)
launchctl load ~/Library/LaunchAgents/com.cliproxyapi.server.plist

# Stop
launchctl unload ~/Library/LaunchAgents/com.cliproxyapi.server.plist

# View logs
tail -f ~/.cli-proxy-api/server.log
```

**Key plist settings:**
- `RunAtLoad: true` — starts on login
- `KeepAlive: true` — auto-restarts on crash
- Logs to `~/.cli-proxy-api/server.log`

**Config hot-reload:** The proxy watches `~/.cli-proxy-api/config.yaml` and auth-dir files for changes. Most config changes take effect without restarting. For major changes (adding/removing providers), restart:
```bash
launchctl unload ~/Library/LaunchAgents/com.cliproxyapi.server.plist && \
launchctl load ~/Library/LaunchAgents/com.cliproxyapi.server.plist
```

---

## 11. Replicating to a Second Machine (A → B Full Parity)

This is the authoritative cross-machine replication guide. It assumes the two prerequisites below, which make the procedure a straight config-sync rather than a fresh install.

### Prerequisites (verified for the current setup)

1. **Both machines are on the same Tailscale tailnet**, so all `100.x` LAN providers (e.g. `msioffice-qwen-27b` → `100.<tailscale-ip-1>:8100`, `local-qwen` → `100.<tailscale-ip-4>:8081`, `msioffice-gemma`) are reachable from either side. No port forwarding or public exposure needed.
2. **`cli-proxy-api` is already installed and running on B** (the daemon binary exists; this guide only syncs its *configuration*). It does **not** need to be re-installed or re-authenticated from scratch.

> **⚠️ Why copying `~/.pi/agent/` alone is NOT enough.**
> The real upstream credentials (Fireworks / Z.AI API keys, plus Claude & Codex **OAuth JWT tokens**) live in **`~/.cli-proxy-api/`**, never under `~/.pi/agent/`. Pi's `auth.json` only carries the agent-level keys (e.g. `fireworks`, `opencode-go`, `xiaomi-token-plan-ams`) and the `sk-dummy` gateway token; the Gateway models themselves (`cliproxy/*`) resolve their real auth through B's *own* local daemon. So a bare `scp ~/.pi/agent/` leaves every `cliproxy/*` model broken on B even though the provider + model list look correct.

### What to copy

Two trees from A to B. Use `rsync` and exclude logs/backups/static artefacts.

```bash
# 1. Pi agent config: settings, models.json, auth.json, and extensions/
#    (extensions/ is REQUIRED — gateway.ts registers the cliproxy provider; without
#     it the cliproxy models don't exist in pi at all, see Pitfall 8.)
rsync -av --exclude='logs' ~/.pi/agent/  B:~/.pi/agent/

# 2. cli-proxy-api config + real upstream keys + OAuth token files
#    (this is the piece step 1 misses — the actual Gateway secrets)
rsync -av --exclude='logs' --exclude='*.log' --exclude='*.bak*' --exclude='static' \
  ~/.cli-proxy-api/  B:~/.cli-proxy-api/

# 3. (Optional, macOS only) auto-start the daemon at login on B
rsync -av ~/Library/LaunchAgents/com.cliproxyapi.server.plist \
  B:~/Library/LaunchAgents/
```

If B's username differs from A's, fix the absolute paths in the plist and in any absolute `auth-dir`/binary references (the `config.yaml` `auth-dir: "~/.cli-proxy-api"` uses `~` and needs no edit):
```bash
ssh B 'sed -i "" "s|/Users/A_USER/CLIProxyAPI|/Users/B_USER/CLIProxyAPI|g" ~/Library/LaunchAgents/com.cliproxyapi.server.plist'
ssh B 'sed -i "" "s|/Users/A_USER/.cli-proxy-api|/Users/B_USER/.cli-proxy-api|g" ~/Library/LaunchAgents/com.cliproxyapi.server.plist'
```

Then (re)load the daemon on B so it picks up the new config:
```bash
ssh B 'launchctl unload ~/Library/LaunchAgents/com.cliproxyapi.server.plist 2>/dev/null; \
        launchctl load   ~/Library/LaunchAgents/com.cliproxyapi.server.plist; \
        sleep 2'   # give the daemon a moment to bind to 127.0.0.1:8317
```

### Why the daemon must run on B (loopback binding)

`config.yaml` binds `host: "127.0.0.1"`, `port: 8317` — i.e. **loopback only**, not the Tailscale interface. So B's pi talks to **B's own** `127.0.0.1:8317`, never to A's daemon over the tailnet. This is deliberate (keeps the real upstream keys off the network) and is why "cliproxyapi installed on B" is a prerequisite: B must serve its own Gateway traffic locally. Syncing `~/.cli-proxy-api/` is what makes B's daemon functionally identical to A's.

### Verify on B

```bash
# 1. Daemon is up and bound to loopback
ssh B 'lsof -nP -iTCP:8317 -sTCP:LISTEN'

# 2. Proxy advertises the full model list (expect the same count as A)
ssh B 'curl -s http://127.0.0.1:8317/v1/models -H "Authorization: Bearer sk-dummy" \
        | python3 -c "import sys,json; d=json.load(sys.stdin)[\"data\"]; print(len(d),\"models\"); [print(m[\"id\"],m[\"owned_by\"]) for m in d[:5]]"'

# 3. pi sees the providers/models
ssh B 'cat ~/.pi/agent/models.json | python3 -c "import sys,json; print(list(json.load(sys.stdin)[\"providers\"].keys()))"'

# 4. End-to-end: a Gateway chat call through B's own daemon
ssh B 'curl -s http://127.0.0.1:8317/v1/chat/completions \
        -H "Authorization: Bearer sk-dummy" -H "Content-Type: application/json" \
        -d "{\"model\":\"glm-5.1\",\"messages\":[{\"role\":\"user\",\"content\":\"Say hi\"}],\"max_tokens\":10}"'
```

### Caveats

- **OAuth tokens are per-account AND per-machine — copying is NOT enough.** The `claude-*.json` / `codex-*.json` files are JWT refresh tokens tied to the authenticating account (e.g. `<account>`). Two subtleties:
  - **Same account, two machines (the common A→B case):** the providers **rotate** refresh tokens, so A and B fighting over one copied token ends with one side's copy revoked (see **Pitfall 13**). After the rsync you MUST re-login each OAuth provider on B (`-claude-login` / `-codex-login`) so B holds its own independent grant. One-time per machine; does not revoke A.
  - **Different user on B:** do not copy these at all — just re-login on B so it holds its own tokens. (Login is via **flags**, not `auth login` — see Pitfall 9.)
  - The `openai-compatibility` API-key entries (Fireworks, Z.AI, `sk-local`) are not account-bound and copy cleanly with no re-login.
- **`settings.json` `enabledModels`** may reference providers (`bosgame-*`, `vast-vllm`) not present in `models.json`; those entries are simply ignored on B (harmless). Optionally prune them.
- **`auth.json` agent-level keys** (`opencode-go`, `xiaomi-token-plan-ams`, `fireworks`) travel with step 1. `fireworks` is the `defaultProvider`/`defaultModel` (`accounts/fireworks/models/glm-5p2`), so the **pi default works standalone on B with no daemon at all** — the Gateway sync is only needed if you actually use `cliproxy/*` models.
- **Refresh intervals.** **Only after** B holds its own OAuth grant (post re-login, per the bullet above / Pitfall 13) does B's daemon refresh that grant every 15 min independently of A — then no ongoing sync is required. Before that re-login, copied Claude/Codex tokens are **not** independently refreshable and will collide the moment one side rotates the refresh token. Re-run the two `rsync`s only when A's config or model list changes — but **never re-sync the OAuth token files** once each machine has its own grant (that re-introduces the collision; see Pitfall 13).
- **⚠️ Skill collisions from duplicate installs.** Pi discovers skills **recursively** in `~/.pi/agent/skills/` (see `docs/skills.md`), so if the same skill exists both as a top-level dir *and* nested inside a cloned repo — the canonical install per `pi-skills/README.md` — pi prints `[Skill conflicts]` at startup, keeps only the first copy it finds, and silently loads a potentially **stale** version. This bit the A→B replication here: A's `skills/` tree had both layouts (loose top-level dirs *plus* the `pi-skills/` and `gemini-skills/` repos), and `rsync ~/.pi/agent/` faithfully copied both, so every skill collided on B. Detect it:
  ```bash
  # prints any skill name seen more than once (empty output = clean).
  # Keep this strict: only exclude node_modules/.git. Do NOT exclude backup/cache
  # dirs (e.g. _dedup-backup/, .backup*) — a duplicate parked there is exactly the
  # failure mode this audit is meant to catch; filtering them out would print a
  # false "clean" while pi still collides at startup. Backups must live OUTSIDE
  # ~/.pi/agent/skills/ (see the Fix below), so they have no place in this tree.
  find ~/.pi/agent/skills -name SKILL.md -not -path '*/node_modules/*' -not -path '*/.git/*' \
    -exec awk -F': ' '/^name:/{print $2; exit}' {} \; | sort | uniq -d
  ```
  **Fix:** install skills only via their repos (`git clone …/pi-skills ~/.pi/agent/skills/pi-skills`, and `gemini-skills` likewise) and `mv` any duplicate top-level skill dirs **out of `skills/`** to a sibling dir such as `~/.pi/agent/.skill-dedup-backup/` — *not* a subdir of `skills/`. Pi scans `skills/` recursively and only skips `node_modules` and `.git`, so a backup/cache dir left *inside* `skills/` keeps colliding at startup (and would be silently hidden if the audit excluded it). Best done on **A** first so subsequent A→B syncs stay clean. (Confirmed: the repo copies are canonical and frequently newer than loose top-level copies — for the Gemini skills the loose copies were ~40% shorter / out of date.)

### TL;DR

Given Tailscale ✅ and cliproxyapi-on-both ✅, full parity is exactly two `rsync`s:
```bash
rsync -av --exclude='logs' ~/.pi/agent/          B:~/.pi/agent/
rsync -av --exclude='logs' --exclude='*.log' --exclude='*.bak*' --exclude='static' \
        ~/.cli-proxy-api/  B:~/.cli-proxy-api/
```
then reload B's daemon (with a 2s `sleep` before any curl, so the daemon has time to bind to `127.0.0.1:8317`), and confirm pi starts clean with no `[Skill conflicts]` block (see the skills-dedup caveat above if it does). Everything else (binary, plist, Tailscale) is assumed already in place. The only step that's ever missed in practice is the second `rsync` — that's the one carrying the real Gateway secrets.

**But the rsync is not the last step.** The copied OAuth tokens (Claude/Codex) will **collide** via refresh-token rotation — re-login each OAuth provider on B (`-claude-login` / `-codex-login`, Pitfall 13) so B holds its own independent grant. Otherwise Claude dies within ~a day and Codex dies within ~10 days of the sync.

---

## 12. Google AI Pro via the Antigravity Backend

### 12.1 The problem: an AI Studio subscription is not an API key
A paid **Google AI Studio (Pro)** subscription gives unlimited Gemini usage through the AI Studio web UI, but it does **not** hand you a standard `generativelanguage.googleapis.com` API key. The credential you can dig out of the web session is a **subscription/quota token** recognisable by its `AQ.` prefix (real keys are `AIza…`). Two natural attempts to use it from a coding agent both fail:

| Attempt | What you do | Result |
|---|---|---|
| **A. Public API key slot** | Put the `AQ.` token in `gemini-api-key:` in `config.yaml` | `400 API_KEY_INVALID` from `generativelanguage.googleapis.com` — the public endpoint rejects subscription tokens outright (Pitfall 11). |
| **B. Web-session relay** | Stand up a `wss://` relay that forwards requests through the AI Studio browser tab (the "AI Studio Build" WebSocket-proxy approach, fronted by a cloudflared/ngrok tunnel for HTTPS mixed-content) | Plain-text chat works, but the web-session API **forbids tool calls and image inputs** — coding-agent requests get `403 PERMISSION_DENIED` / `400 At most 0 image(s) may be provided`, and the rejection tears down the relay connection (Pitfall 12). |

Neither path can drive a coding agent (Pi/Droid/OpenCode), because every coding agent sends tool schemas and the relay rejects them.

### 12.2 The solution: `--antigravity-login` (Code Assist backend)
CLIProxyAPI ships a dedicated **Antigravity OAuth** channel (`--antigravity-login`) that authenticates with your **Google account** — the same one the AI Pro subscription is on — and routes through Google's **Code Assist / Antigravity backend**, the agentic backend that powers the Antigravity product. Because that backend is built for tool-calling agents, it has **none** of the relay's restrictions: full tool + image support. One login, no API key, no relay, no tunnel:

```bash
# --config MUST come first (see Pitfall 9). The running launchd server can stay up —
# login is a one-shot command mode, it does not bind port 8317.
cli-proxy-api --config ~/.cli-proxy-api/config.yaml --antigravity-login
```

This opens a browser OAuth consent. On success it writes a token file to the auth dir and the proxy's file watcher hot-loads it live (no restart needed):

```
~/.cli-proxy-api/antigravity-<account>.json   # "type": "antigravity"; carries access_token + project_id
```

A GCP project is auto-provisioned for the account on first login (e.g. `expanded-carver-rn50x`) and recorded in the token file. Tokens auto-refresh via the same auth-refresh worker as the other OAuth channels (§7).

### 12.3 What one subscription unlocks
The Antigravity backend serves a **multi-vendor** model catalog through this single OAuth login — Gemini *plus* Claude *plus* GPT — all covered by the Google AI Pro subscription (zero per-token API cost). See what's on offer:

```bash
curl -s http://127.0.0.1:8317/v1/models -H "Authorization: Bearer sk-dummy" \
  | python3 -c "import sys,json; [print(m['id']) for m in json.load(sys.stdin)['data']]"
```

Representative ids observed after login (the list changes over time — verify before adding to an agent):

| Family | IDs |
|---|---|
| Gemini | `gemini-3-flash`, `gemini-3-flash-agent`, `gemini-3.1-pro-low`, `gemini-3.5-flash-low`, `gemini-pro-agent`, `gemini-3.1-flash-image` |
| Claude | `claude-sonnet-4-6`, `claude-opus-4-8`, `claude-opus-max`, `claude-fable-5` |
| GPT | `gpt-5.5`, `gpt-5.4`, `gpt-5.4-mini`, `gpt-oss-120b-medium`, `gpt-5.3-codex-spark` |

> **⚠️ A listing is not a guarantee.** `/v1/models` advertises ids whose availability depends on subscription tier *and* on which other auth channels are healthy. Notably the Claude aliases (`claude-opus-max`, `claude-sonnet-max`) route through the **Claude OAuth** channel (via `oauth-model-alias`), **not** Antigravity — they `503 auth_unavailable` when the Claude token is expired, while the bare `claude-sonnet-4-6` id answers through Antigravity. **Always confirm each id actually answers** (`200` from a `chat/completions` test) before adding it to an agent's model list — see the verify snippet in §5 ("Adding a new model — per-agent").

### 12.4 Wiring it into the agents
Antigravity-sourced ids are ordinary gateway ids from the agents' point of view — add them to the `cliproxy` provider like any OAuth model (see §5 for the per-agent edit). Example for Pi (`~/.pi/agent/extensions/gateway.ts`):

```ts
{
    id: "gemini-3-flash",                         // MUST match the proxy-served id exactly
    name: "Gemini 3 Flash",                        // cosmetic picker label
    reasoning: false,
    input: ["text", "image"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },  // subscription → zero per-token cost
    contextWindow: 1048576,
    maxTokens: 65536,
},
```

`cost` is all-zero because usage is covered by the flat subscription, not billed per-token.

### 12.5 The native `agy` CLI (separate auth store)
Google also ships a native Antigravity coding-agent CLI, installed via Homebrew as **`agy`** (data dir `~/.gemini/antigravity-cli/`; auth stored in the **macOS Keychain**, not on disk). `agy` is a complete agent on its own and is the easiest way to sanity-check that the subscription itself is live:

```bash
brew install agy          # if not already installed
agy models                # lists subscription-unlocked models
agy -p "say ok"           # one-shot print mode; tool calls work (use as a read-only sanity test)
```

Because `agy` keeps its token in the Keychain, **CLIProxyAPI cannot reuse it** — the proxy needs its own `--antigravity-login` (§12.2). The two coexist fine; they simply each hold their own OAuth token for the same Google account.

### 12.6 Summary

| | AI Studio web relay | `AQ.` token in `gemini-api-key` | **`--antigravity-login`** |
|---|---|---|---|
| Auth | fragile browser tab + tunnel | subscription token | **Google OAuth (auto-refresh)** |
| Tool calls | ❌ `403` | ❌ `400` (key invalid) | ✅ |
| Images | ❌ `400` | ❌ | ✅ |
| Models served | Gemini only | Gemini only | **Gemini + Claude + GPT** |
| Fit for coding agents | No | No | **Yes** |