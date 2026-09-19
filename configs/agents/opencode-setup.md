# Configuring OpenAI and Anthropic Subscriptions in OpenCode via CLIProxyAPI

**Status:** active — verified 2026-09-02

This guide explains how to route your OpenAI and Anthropic (Claude Max) subscriptions through `CLIProxyAPI` to use them in `opencode`.

## Prerequisites

- `opencode` installed via Homebrew.
- `CLIProxyAPI` installed and running.
- Active subscriptions to OpenAI and Anthropic.

## 1. Authenticate CLIProxyAPI

Before configuring `opencode`, you must authenticate the proxy server with your accounts.

### Anthropic (Claude Max)
```bash
cd ~/CLIProxyAPI
./cli-proxy-api --config ~/.cli-proxy-api/config.yaml --claude-login
```

### OpenAI (ChatGPT Plus/Pro)
```bash
cd ~/CLIProxyAPI
./cli-proxy-api --config ~/.cli-proxy-api/config.yaml --codex-login
```

*Note: If the browser shows `CONNECTION_REFUSED` on the callback page, simply copy the full URL from the address bar and paste it back into the terminal prompt.*

## 2. Configure OpenCode

Add the proxy providers to your `opencode.json` configuration file located at `~/.config/opencode/opencode.json`.

### Example Configuration

```json
{
  "provider": {
    "claude-max": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "Claude Max (CLIProxyAPI)",
      "options": {
        "baseURL": "http://127.0.0.1:8317/v1",
        "apiKey": "sk-dummy"
      },
      "models": {
        "claude-opus-4-7": { "name": "Opus 4.7 [Max]" },
        "claude-opus-4-6": { "name": "Opus 4.6 [Max]" },
        "claude-sonnet-4-6": { "name": "Sonnet 4.6 [Max]" }
      }
    },
    "openai-max": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "OpenAI Max (CLIProxyAPI)",
      "options": {
        "baseURL": "http://127.0.0.1:8317/v1",
        "apiKey": "sk-dummy"
      },
      "models": {
        "gpt-5.4": { "name": "GPT-5.4 [Max]" },
        "gpt-5.4-fast": { "name": "GPT-5.4 Fast [Max]" },
        "gpt-5.4-mini": { "name": "GPT-5.4 mini [Max]" },
        "gpt-5.4-mini-fast": { "name": "GPT-5.4 mini Fast [Max]" },
        "gpt-5.5": { "name": "GPT-5.5 [Max]" },
        "gpt-5.5-fast": { "name": "GPT-5.5 Fast [Max]" },
        "gpt-5.5-pro": { "name": "GPT-5.5 Pro [Max]" }
      }
    }
  }
}
```

### Key Details:
- **baseURL**: Both providers use `http://127.0.0.1:8317/v1`.
- **apiKey**: Use `sk-dummy` as the proxy handles the actual OAuth tokens.
- **Provider**: Ensure `npm` is set to `@ai-sdk/openai-compatible`.

## 3. Verification

Check that the models are available:
```bash
opencode models
```

Test a request:
```bash
opencode run --model openai-max/gpt-5.4 "Hello, are you working through the proxy?"
```
