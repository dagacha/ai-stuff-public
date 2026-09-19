# Zcode Model Configuration

**Status:** active — verified 2026-09-02

This document explains how models are configured in Zcode, based on reverse-engineering the `~/.zcode/v2/config.json` format.

## Configuration Files

| File | Purpose |
|------|---------|
| `~/.zcode/v2/config.json` | **Primary config** — defines providers, API keys, base URLs, and model metadata |
| `~/.zcode/v2/bots-model-cache.v2.json` | **Auto-generated cache** — Zcode rebuilds this from `config.json` + `credentials.json` |
| `~/.zcode/v2/credentials.json` | **Encrypted credentials** — OAuth tokens and JWTs (auto-managed) |
| `~/.zcode/v2/setting.json` | **User settings** — provider family domain, selected keys, etc. |

## Provider Config Format (`config.json`)

```json
{
  "provider": {
    "<provider-id>": {
      "name": "Display Name",
      "kind": "openai-compatible",    // or "anthropic"
      "options": {
        "apiKey": "your-api-key",
        "baseURL": "https://api.example.com/v1",
        "apiKeyRequired": true        // optional
      },
      "enabled": true,                // optional, defaults to true
      "source": "custom",             // "custom" for user-added, "builtin" for Zcode defaults
      "models": {
        "<model-id>": {
          "name": "Display Name",     // optional, defaults to model-id
          "limit": {
            "context": 1000000,       // context window in tokens
            "output": 64000           // max output tokens (optional)
          },
          "modalities": {
            "input": ["text", "image"],
            "output": ["text"]
          },
          "reasoning": {              // optional — for reasoning-capable models
            "enabled": true,
            "variants": ["enabled", "off"],
            "defaultVariant": "enabled"
          }
        }
      },
      "systemDisabledReason": "..."   // optional, for builtin providers
    }
  }
}
```

## Provider `kind` Values

| Kind | API Format | Endpoint |
|------|-----------|----------|
| `"anthropic"` | Anthropic Messages API | `POST /v1/messages` |
| `"openai-compatible"` | OpenAI Chat Completions API | `POST /v1/chat/completions` |

## Provider ID Conventions

- **Built-in providers** use `builtin:<name>` prefix (e.g., `builtin:zai-coding-plan`)
- **Custom providers** use a UUID as the key (e.g., `8b913815-5e36-4bec-b83c-58abab55f5cf`)

## Models Migrated from Pi Agent

The following providers and models were migrated from `~/.pi/agent/models.json` and `~/.pi/agent/extensions/gateway.ts`:

### Direct (Local) Providers

| Provider | Base URL | Models |
|----------|----------|--------|
| `bosgame` | `http://100.<tailscale-ip-4>:8081/v1` | Gemma-4-26B (Q4, 64K), Qwen3.6-35B-A3B MoE (262K) |
| `msioffice` | `http://100.<tailscale-ip-1>:8100/v1` | Qwen3.6-27B AEON XS (NVFP4, 128K) |
| `macbookm1max` | `http://100.<tailscale-ip-2>:8080/v1` | Gemma 4 26B 4-bit (MacBook M1 Max) |
| `msioffice-gemma` | `http://100.<tailscale-ip-1>:8100/v1` | Gemma-4-31B (QAT Q4_K_XL, 108K) |
| `dgx-spark` | `http://spark-head:8888/v1` | DeepSeek V4 Flash DSpark (1M context) |

### Cloud Providers

| Provider | Base URL | Models |
|----------|----------|--------|
| `bailian-token-plan-personal` | `https://token-plan.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1` | Qwen3.8 Max Preview, Qwen3.7 Max, Qwen3.7 Plus, Qwen3.6 Plus, Qwen3.6 Flash |

### Gateway (via CLIProxyAPI at `127.0.0.1:8317`)

| Provider | Models |
|----------|--------|
| `cliproxy (Unified Gateway)` | Gemini 3 Flash, Gemini 3 Flash Agent, Gemini 3.5 Flash Low, Gemini 3.1 Pro Low, Gemini Pro Agent, Gemini 3.1 Flash Image, Claude Sonnet 4.6, Claude Opus 4.8, Claude Opus Max, Claude Fable 5, GPT-5.5, GPT-5.4, GPT-5.4 Mini, GPT-OSS 120B Medium, GPT-5.3 Codex Spark, GLM-5.1, Qwen-3.6-27B |

## Adding a New Model

1. Add a provider entry in `config.json` under `"provider"` with a UUID key
2. Set `"kind"` to `"openai-compatible"` (for OpenAI API) or `"anthropic"` (for Anthropic Messages API)
3. Add model entries under `"models"` with context window, modalities, and optional reasoning config
4. Restart Zcode to pick up the changes

## Adding a New Model to an Existing Provider

Simply add a new entry under the provider's `"models"` object:

```json
"my-new-model": {
  "name": "My New Model",
  "limit": {
    "context": 128000,
    "output": 16384
  },
  "modalities": {
    "input": ["text"],
    "output": ["text"]
  }
}
```

## Notes

- The `bots-model-cache.v2.json` is auto-generated — Zcode rebuilds it from `config.json` + `credentials.json` on startup
- API keys are stored in `config.json` for custom providers, or in `credentials.json` (encrypted) for OAuth-based providers
- The `setting.json` controls which provider family is active (`providerFamilyDomain`) and which specific provider keys are selected (`modelProviderFamilySelectedKeys`)
