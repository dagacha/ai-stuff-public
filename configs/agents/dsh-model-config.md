# DeepSeek Harness (dsh) — model configuration

**Status:** active — verified 2026-09-16

How to enter model/provider configs in the **DeepSeek Harness** (`dsh`),
DeepSeek's agent harness, launched with `npx @deepseek-ai/dsh web` (browser UI)
or `dsh` / `dsh --profile headless "task"` (CLI). This documents the
*agent-side* config: where providers and models live, the exact YAML shape,
and how to port a provider from Pi's `models.json`.

> The server side of the LAN endpoints referenced below (DGX Spark, MSI,
> Bosgame) is covered in [`../dgx-spark/`](../dgx-spark/),
> [`../msi/`](../msi/) and [`../bosgame/`](../bosgame/).

## Where dsh stores model config

`DSH_HOME` defaults to `~/.dsh`:

| File | Purpose |
|------|---------|
| `~/.dsh/settings.yaml` | **Primary config** — custom providers, models, default model. This is the file you edit. |
| `~/.dsh/.credentials.yaml` | **API keys** — `refs:` map of env-var name → key value, plus the browser-session grant. Never hand-edit while a session is live; the app rewrites it. |
| `~/.dsh/profiles/web/` | Profile bundle/patch layers (`package.json`, `cordis.yml`, `cordis.patch.yml`) — plugin composition, **not** model config. |
| `~/.dsh/storages/` | Session/workspace storage — auto-managed. |

The web UI exposes the same state: **Settings → Models** lists providers with
*Edit* / *Delete* buttons, **Add provider** (built-in catalog) and **Add a
custom provider** (hand-entered), plus an **Open configuration file** button
that opens `settings.yaml` directly. UI edits and file edits are the same
state — pick one and stick to it.

## `settings.yaml` format

```yaml
llm-pi-ai:
  providers:
    <provider-id>:
      displayName: Display Name        # label in the UI picker
      api: openai-completions          # OpenAI chat-completions wire format
      baseURL: http://host:port/v1
      # auth — exactly one of:
      apiKeyEnv: SOME_ENV_VAR          # resolved from .credentials.yaml refs
      # - or -
      headers:
        Authorization: Bearer <key>    # inline key (fine for inert LAN keys)
      compat:                          # optional — endpoint capability flags
        supportsDeveloperRole: false
        supportsReasoningEffort: false
        supportsUsageInStreaming: true
        maxTokensField: max_tokens
        thinkingFormat: qwen-chat-template
      reasoning: low                   # optional — provider-level default effort
      models:
        - id: model-id                 # verbatim id the endpoint serves
          name: Display Name           # optional, cosmetic
          input: [ text, image ]       # optional modalities
          contextWindow: 262144        # tokens
          maxTokens: 32768             # max output tokens
          reasoningEfforts:            # optional — closed list; picker offers
            off: off                   #   only these keys (`off: null`/empty =
            low: low                   #   offered-but-sends-nothing, not hidden)
            medium: medium
            high: high
agent-default-model:                   # optional — harness default selection
  provider: deepseek-official
  model: deepseek-v4-flash
  reasoningEffort: high
```

### Field notes

- **`reasoningEfforts`** maps the UI's effort levels (`off`, `minimal`, `low`,
  `medium`, `high`, `xhigh`, `max`) onto the values actually sent to the
  backend. Declaring it is a closed list: the picker offers **only the keys
  the dict names** — any level without a key is hidden. (The raw pi-ai rule —
  absent `off`/`minimal`/`low`/`medium`/`high` are still offered, only
  `xhigh`/`max` need an explicit key — does not apply; dsh overrides it.)
  `off` is the one level allowed a `null`/empty value, and that means
  *offered, send nothing* — not hidden; any other `null` key is rejected at
  load. So a model that thinks unless told not to needs `off: off` (declared
  and sending the wire spelling `off`), and folding multiple UI levels onto
  one backend value works when the backend only understands a few (e.g.
  `minimal: low, low: low, medium: low, high: high, xhigh: max, max: max`).
- **`thinkingFormat`** tells dsh how to inject thinking into the request.
  Values used in this doc: `qwen` (vLLM Qwen serving, top-level
  `enable_thinking`), `qwen-chat-template` (`chat_template_kwargs.enable_thinking`
  + `preserve_thinking`), `chat-template` (raw `chat_template_kwargs`), and
  `deepseek` (sends `thinking: {type: enabled}` for any non-off effort and
  `thinking: {type: disabled}` when off is selected, plus `reasoning_effort`
  when `supportsReasoningEffort` is set). Match it to what the serving stack
  expects — wrong values produce silently-degraded or rejected reasoning.
- **`maxTokensField: max_tokens`** — needed for vLLM endpoints that reject
  the OpenAI `max_completion_tokens` field.
- **`compat.supportsReasoningEffort: false`** — set when the endpoint ignores
  `reasoning_effort`; dsh then relies on `thinkingFormat`/chat-template
  injection instead.

### Auth: `apiKeyEnv` vs inline `headers`

- `apiKeyEnv: NAME` → dsh looks up `NAME` in `~/.dsh/.credentials.yaml`
  under `refs:`. Use this for real keys (DeepSeek, DashScope) so the key
  stays out of `settings.yaml`.
- `headers: { Authorization: Bearer <key> }` → inline. Fine for inert LAN
  keys (`local`, `unused`) where there is nothing sensitive to protect.

`~/.dsh/.credentials.yaml` shape (values redacted):

```yaml
version: 1
records:
  client-connection/browser-session:
    kind: grant
    payload:
      secret: "****"
      version: 1
refs:
  DEEPSEEK_API_KEY: "sk-****"
  DGX_SPARK_API_KEY: local
```

## Built-in DeepSeek provider

The **DeepSeek** provider (id `deepseek-official`) ships with dsh and needs
no `settings.yaml` entry — only a key:

1. Web UI: **Settings → Models → DeepSeek → Edit**, paste the API key; or
2. put `DEEPSEEK_API_KEY` under `refs:` in `~/.dsh/.credentials.yaml`.

Missing key symptom: turns fail with
`no API key for provider route "deepseek-official"`.

## Worked example: `msioffice` provider (live config)

A LAN vLLM box (RTX 5090) serving Qwen3.8-27B under three model names
(`qwen3.8-27b-nvfp4`, `qwen3.8-27b`, `qwen3.6-27b-nvfp4` per
[`../msi/serve-qwen38.sh`](../msi/serve-qwen38.sh)); the live config
registers only the primary name, shown exactly as it exists in
`settings.yaml` on both Macs:

```yaml
llm-pi-ai:
  providers:
    msioffice:
      displayName: msioffice
      api: openai-completions
      baseURL: http://100.<tailscale-ip-1>:8100/v1
      headers:
        Authorization: Bearer unused
      compat:
        supportsDeveloperRole: false
        supportsReasoningEffort: true
        supportsUsageInStreaming: true
        maxTokensField: max_tokens
        thinkingFormat: qwen
      reasoning: low
      models:
        - id: qwen3.8-27b-nvfp4
          name: Qwen3.8-27B (NVFP4, 256K, reasoning)
          input: [ text ]
          contextWindow: 262144
          maxTokens: 16384
          reasoningEfforts:
            low: low
            medium: medium
            xhigh: xhigh
```

## Worked example: `xiaomi-token-plan-ams` provider (live config)

A Xiaomi token-plan endpoint (MiMo models) reached over the public internet.
Unlike the LAN examples above it uses a **real API key** (so `apiKeyEnv` →
`.credentials.yaml` `refs:`, not inline `headers`), a **`deepseek`** thinking
format, and a **1M-token** context window. All four served models are
registered; each carries a `reasoningEfforts` block with an explicit
`off: off` so the picker can switch thinking off (the `deepseek` format sends
`thinking: {type: disabled}` for it). The Pi source had `reasoning: true` but
no `thinkingLevelMap` to port, so the effort levels are a sensible default.
Shown exactly as it exists in `settings.yaml`:

```yaml
llm-pi-ai:
  providers:
    xiaomi-token-plan-ams:
      displayName: Xiaomi AMS (MiMo)
      api: openai-completions
      baseURL: https://token-plan-ams.xiaomimimo.com/v1
      apiKeyEnv: XIAOMI_AMS_API_KEY          # real key → refs in .credentials.yaml
      compat:                                # copied verbatim from Pi
        supportsStrictMode: true
        requiresReasoningContentOnAssistantMessages: true
        thinkingFormat: deepseek
      models:
        - id: mimo-v2.5
          name: MiMo-V2.5 (1M, vision, reasoning)
          input: [ text, image ]
          contextWindow: 1048576
          maxTokens: 131072
          reasoningEfforts:
            off: off
            low: low
            medium: medium
            high: high
            max: max
        - id: mimo-v2.5-pro
          name: MiMo-V2.5-Pro (1M, reasoning)
          input: [ text ]
          contextWindow: 1048576
          maxTokens: 131072
          reasoningEfforts:
            off: off
            low: low
            medium: medium
            high: high
            max: max
        - id: mimo-v2.6-flash
          name: MiMo-V2.6-Flash (1M, vision, reasoning)
          input: [ text, image ]
          contextWindow: 1048576
          maxTokens: 131072
          reasoningEfforts:
            off: off
            low: low
            medium: medium
            high: high
            max: max
        - id: mimo-v2.6-pro
          name: MiMo-V2.6-Pro (1M, vision, reasoning)
          input: [ text, image ]
          contextWindow: 1048576
          maxTokens: 131072
          reasoningEfforts:
            off: off
            low: low
            medium: medium
            high: high
            max: max
```

The matching key ref in `~/.dsh/.credentials.yaml` (value redacted):

```yaml
refs:
  XIAOMI_AMS_API_KEY: "tp-****"
```

> **Note:** `supportsStrictMode` and
> `requiresReasoningContentOnAssistantMessages` are Pi `compat` flags with no
dsh-specific handling documented here — they are carried over verbatim per the
field-mapping table below and are harmless if dsh ignores them.

## Porting a provider from Pi (`models.json` → `settings.yaml`)

Pi defines custom providers in `~/.pi/agent/models.json` under `providers`.
Field mapping:

| Pi `models.json` | dsh `settings.yaml` | Notes |
|---|---|---|
| provider key (`msioffice`) | provider key | keep the same id; dsh also accepts `-` where Pi uses `_` |
| `baseUrl` | `baseURL` | verbatim |
| `api: "openai-completions"` | `api: openai-completions` | same value |
| `apiKey` | `apiKeyEnv` (via `.credentials.yaml` refs) **or** inline `headers.Authorization` | inert LAN keys → inline; real keys → `apiKeyEnv` |
| `compat.*` | `compat.*` | same field names, copied verbatim |
| — | `displayName` | picker label (Pi has none; use the provider id) |
| model `id` | model `id` | verbatim — must match the endpoint's served id |
| model `name` | model `name` | cosmetic |
| model `contextWindow` | `contextWindow` | verbatim |
| model `maxTokens` | `maxTokens` | verbatim — do **not** downgrade (an 8192 cap silently truncates long agent turns) |
| model `input` | `input` | verbatim (`[text]`, `[text, image]`) |
| model `reasoning: true` + `thinkingLevelMap` | `reasoningEfforts` | re-key Pi's `minimal/low/medium/high/xhigh/max` map to dsh's `off/minimal/low/medium/high/xhigh/max`; closed list — only keys present are offered; `off` may be `null`/empty (offered, sends nothing) |
| model `cost` | — | no dsh equivalent; local models are free |
| — | `reasoning` (provider level) | optional default effort, e.g. `low` |

## Syncing config between machines

`settings.yaml` is the only model-config file and is machine-independent —
copy it whole:

```bash
scp <user>@<laptop>:.dsh/settings.yaml ~/.dsh/settings.yaml
```

Do **not** copy `.credentials.yaml` between machines: it is machine-scoped
(browser-session grant + local key refs). Re-enter the DeepSeek key on the
target machine via Settings → Models → DeepSeek → Edit.

After any change, restart `dsh web` (or start a new session) — the config is
read at boot.

## Gotchas

- **Docker hostnames don't resolve off-network.** `baseURL`s like
  `http://spark-head:8888/v1` or `http://spark-indie:8888/v1` only resolve
  inside the DGX Spark cluster's Docker network. From a Mac, use the
  Tailscale IP/hostname instead (or run the harness on the cluster).
- **`model id` must match the endpoint exactly.** Verify with
  `curl -s <baseURL>/models` before adding — a near-miss id fails at request
  time, not config time.
- **`maxTokens` is a hard output cap.** Carry over Pi's value verbatim when
  porting; the picker does not warn about truncation.
- **`reasoningEfforts` with all-`off`/null levels** renders a model with no
  usable reasoning levels — keep at least one non-null thinking level for
  reasoning models (a declared dict must also offer something beyond `off`,
  or dsh rejects the config at load).
- **The web UI and the file are the same state.** Editing `settings.yaml`
  while the web app is running can be clobbered by a UI save; stop the app
  (or edit through the UI) when both are in play.
- **Don't commit real keys.** This repo's convention: inert LAN keys
  (`local`, `unused`) are fine in docs; real keys live only in
  `.credentials.yaml` / `.env` (gitignored).
