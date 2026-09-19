# ZCode harness — adding a local provider (DGX Spark example)

How to register an OpenAI-compatible local model provider in the **ZCode**
agent harness, using the DGX Spark DeepSeek provider as the worked example.

> **Status:** `active — verified 2026-08-16`
> This documents the *agent-side* pointer for ZCode. The server itself
> (endpoint `http://spark-head:8888/v1`, model id `deepseek-v4-flash-dspark`)
> is covered in [`dgx-spark/deepseek-v4-flash-server.md`](../dgx-spark/deepseek-v4-flash-server.md).

## Why ZCode is separate from the gateway

ZCode is a Zhipu/AI GLM desktop + CLI coding agent. It is **not** wired into
the `cli-proxy-api` gateway on `localhost:8317` the way Pi / OpenCode / Droid
/ Hermes are (see [`unified-model-gateway.md`](../unified-model-gateway.md)).
Like Pi's *direct* LAN providers (`bosgame`, `msioffice`, `msioffice-gemma`),
ZCode points straight at the backend over the Tailscale LAN, and holds its own
API key. So adding a local model to ZCode is a plain provider edit, not a
gateway edit.

## Where ZCode stores providers

```
~/.zcode/v2/config.json
```

Providers live under the top-level `provider` map. Two key shapes exist:

- **`builtin:<name>`** (e.g. `builtin:zai-coding-plan`) — ZCode's own GLM /
  BigModel providers shipped with the app.
- **Generated UUID keys** (e.g. `49cd5450-3f45-4b34-a0bf-46575543004a`) —
  user-added providers. ZCode assigns the UUID when you add the provider
  through the app's UI; when hand-editing the file, any unique key works
  (the live DGX entry uses the UUID the app generated). The key itself is
  **not** load-bearing: what marks an entry as user-added is
  `source: "custom"`, not the key format.

The model catalog is `models.json`-equivalent: it overrides the bundled
catalog in `/Applications/ZCode.app/Contents/Resources/model-providers/`.

> Note: ZCode regenerates `~/.zcode/v2/bots-model-cache.v2.json` from
> `config.json` on startup — edit `config.json` only; never hand-maintain the
> cache file.

## Copying a provider from Pi → ZCode (Pi `models.json` → ZCode `config.json`)

Pi defines local providers in `~/.pi/agent/models.json` as a `providers` map.
The same values must be re-expressed in ZCode's `provider` map shape. Field
mapping:

| Pi `models.json` | ZCode `config.json` | Notes |
|---|---|---|
| provider key (`dgx_spark`) | map key (generated UUID) | ZCode assigns the key; pick the entry up by `name` |
| — | `name` | picker label (live entry uses `dgx-spark`) |
| `api: "openai-completions"` | `kind: "openai-compatible"` | DGX endpoint is OpenAI-compatible chat completions |
| `baseUrl` | `options.baseURL` | verbatim |
| `apiKey` | `options.apiKey` | verbatim |
| — | `options.apiKeyRequired` | `true` for a keyed endpoint |
| — | `source` | `"custom"` — this (not the key) marks the entry user-added |
| — | `enabled` | optional; absent = enabled (live entry omits it) |
| model `id` | model key | verbatim (e.g. `deepseek-v4-flash-dspark`) |
| model `name` | model `name` | cosmetic; optional (falls back to the key) |
| model `contextWindow` | model `limit.context` | verbatim |
| model `maxTokens` | model `limit.output` | verbatim — do **not** downgrade (see note below) |
| model `input` | model `modalities.input` | verbatim |
| — | model `modalities.output` | set to `["text"]` (model is text-only) |
| model `reasoning: true` + `thinkingLevelMap` | model `reasoning` object | `variants` from the map's keys, `defaultVariant` picks one |

### Worked example: `dgx-spark` provider

**Pi** (`~/.pi/agent/models.json`, abridged to the mapping-relevant fields):

```json
"dgx_spark": {
  "baseUrl": "http://spark-head:8888/v1",
  "api": "openai-completions",
  "apiKey": "local",
  "compat": {
    "supportsDeveloperRole": false,
    "supportsReasoningEffort": false
  },
  "models": [
    {
      "id": "deepseek-v4-flash-dspark",
      "name": "DeepSeek V4 Flash DSpark on DGX Spark",
      "reasoning": true,
      "contextWindow": 1000000,
      "maxTokens": 384000,
      "input": ["text"],
      "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0 },
      "thinkingLevelMap": {
        "minimal": "low",
        "low": "low",
        "medium": "low",
        "high": "high",
        "xhigh": "high",
        "max": "max"
      }
    }
  ]
}
```

**ZCode** (`~/.zcode/v2/config.json`, merge into `provider` — this is the
entry as it exists live, key included):

```json
"49cd5450-3f45-4b34-a0bf-46575543004a": {
  "name": "dgx-spark",
  "kind": "openai-compatible",
  "options": {
    "apiKey": "local",
    "baseURL": "http://spark-head:8888/v1",
    "apiKeyRequired": true
  },
  "source": "custom",
  "models": {
    "deepseek-v4-flash-dspark": {
      "reasoning": {
        "enabled": true,
        "variants": ["minimal", "low", "medium", "high", "xhigh", "max"],
        "defaultVariant": "high"
      },
      "limit": {
        "context": 1000000,
        "output": 384000
      },
      "modalities": {
        "input": ["text"],
        "output": ["text"]
      }
    }
  }
}
```

> **`limit.output` must mirror Pi's `maxTokens`.** Pi documents
> `maxTokens: 384000` for this model, and the live ZCode entry carries
> `limit.output: 384000`. Do not substitute a "conservative" smaller value —
> for a coding agent an 8192 output cap is an order-of-magnitude downgrade
> that silently truncates long generations. `context` mirrors Pi's
> `contextWindow: 1000000`. `cost` is not a ZCode field — local model cost is
> inherently zero.

> **Reasoning levels.** Pi's `thinkingLevelMap` folds six UI levels onto three
> backend values (`minimal`/`medium`→`low`, `xhigh`→`high`, `max`→`max`) and
> passes them via chat-template kwargs. ZCode has no equivalent mapping layer:
> `variants` lists the level names the picker offers and the selected name is
> passed through as-is. The live entry mirrors Pi's six level names with
> `defaultVariant: "high"`; the folding Pi does server-side is lost — harmless
> if the backend treats unknown efforts leniently, but worth knowing.

> **No `zcode` block needed.** Only the `builtin:` GLM models carry a `zcode`
> property (`modified`, `priority`). User-added providers work without it —
> the live DGX entry has none.

### Applying / verifying

```bash
# 1. Validate JSON before editing the live file
python3 -m json.tool ~/.zcode/v2/config.json

# 2. Confirm the endpoint answers from this machine (Tailscale required):
#    spark-head must be reachable
curl -s http://spark-head:8888/v1/models | python3 -m json.tool | grep -i deepseek-v4-flash-dspark

# 3. Confirm the provider/model are registered in ZCode's config
python3 -c "import json;d=json.load(open('$HOME/.zcode/v2/config.json'));print(list(d['provider'].keys()))"

# 4. Confirm the limits survived (output must be 384000, not a default)
python3 -c "import json;d=json.load(open('$HOME/.zcode/v2/config.json'));p=[v for v in d['provider'].values() if v.get('name')=='dgx-spark'][0];print(p['models']['deepseek-v4-flash-dspark']['limit'])"
```

Then pick the model in ZCode's model selector (the provider shows by its
`name`, **dgx-spark**). ZCode reads `config.json` fresh on startup; if the
app is running, restart it (or the relevant provider/session) so the new
provider is picked up.

## Gotchas

- **`kind` must match the endpoint protocol.** The DGX Spark endpoint is
  OpenAI-compatible chat completions → use `kind: "openai-compatible"`.
  Do not set `kind: "anthropic"` — the existing `builtin:` GLM providers use
  Anthropic `messages`-style API, which this vLLM endpoint does not speak.
- **Provider keys are opaque.** ZCode may rewrite or re-key user-added
  providers on its own (the DGX entry lives under a generated UUID). Locate
  entries by `name`, not by key, in any script that reads the config.
- **No gateway / no OAuth here.** Unlike the gateway models, ZCode talks to
  the LAN endpoint directly and uses the plain API key (`local`). There is no
  shared OAuth token to copy — nothing account-bound to re-login.
- **`config.json` is user-scoped**, so it already applies to every workspace.
  Prefer editing it directly over the bundled catalog in the app bundle,
  which is replaced on every app update.
- **Do not commit secrets.** `apiKey` here is the inert `local` value; if you
  add a keyed external provider, keep the real key only in the local file (its
  `.gitignore`d / out of version control per repo convention).
