# Hermes Agent Codebase Analysis

**Repository:** https://github.com/NousResearch/hermes-agent  
**License:** MIT  
**Language:** Python 3.11+  
**Author:** Nous Research

---

## Executive Summary

Hermes Agent is a **self-improving AI agent framework** featuring a closed learning loop. Unlike typical agents that reset between sessions, Hermes creates skills from experience, improves them during use, persists knowledge across conversations, and builds a deepening model of the user over time.

The agent is designed for **multi-platform deployment** - run it on a $5 VPS, a GPU cluster, or serverless infrastructure, while interacting with it from Telegram, Discord, Slack, WhatsApp, Signal, or CLI.

---

## Architecture Overview

### Core Components

```
+-------------------+        +-------------------+        +-------------------+
|   CLI / Gateway   |<------>|    AIAgent        |<------>|   Tool System     |
|  (Interactive UI) |        |  (Orchestrator)   |        |  (40+ tools)      |
+-------------------+        +-------------------+        +-------------------+
         |                             |                            |
         v                             v                            v
+-------------------+        +-------------------+        +-------------------+
|  Platform Adapters|        | IterationBudget   |        |  mini-swe-agent   |
| (Telegram/Discord |        |  (Turn Counter)   |        | (Terminal Backend)|
|  /WhatsApp/Signal)|        +-------------------+        +-------------------+
+-------------------+                  |
         |                             v
         v                    +-------------------+
+-------------------+        | ContextCompressor |
|   SessionStore    |        | PromptCaching     |
| (JSON/JSONL-backed)|        | Trajectory Export |
+-------------------+        +-------------------+
```

---

## Directory Structure

```
hermes-agent/
├── agent/                      # Core agent internals
│   ├── context_compressor.py   # Auto-summarization at 85% context
│   ├── display.py              # Rich TUI formatting/spinners
│   ├── model_metadata.py       # Context length tracking per model
│   ├── prompt_builder.py       # System prompt construction
│   ├── prompt_caching.py       # Anthropic cache control
│   ├── redact.py               # Secret redaction for logs
│   ├── skill_commands.py       # Skill execution logic
│   └── trajectory.py           # Training data (ShareGPT format)
│
├── cli.py                      # Interactive CLI (4,100+ lines)
├── run_agent.py                # AIAgent class (4,500+ lines)
├── model_tools.py              # Tool dispatch system
├── toolsets.py                 # Toolset resolution & filtering
│
├── hermes_cli/                 # Modular CLI package
│   ├── banner.py               # ASCII art & branding
│   ├── commands.py             # Slash command system (/new, /model, etc.)
│   ├── callbacks.py            # Tool progress display
│   └── main.py                 # Entry point
│
├── tools/                      # Tool implementations
│   ├── terminal_tool.py        # Shell via mini-swe-agent
│   ├── web_tools.py            # Firecrawl search/extract
│   ├── vision_tools.py         # Image analysis
│   ├── browser_tool.py         # Local Chromium / Browserbase automation
│   ├── file_tools.py           # File I/O operations
│   ├── skills_tool.py          # Skill discovery
│   ├── skill_manager_tool.py   # Skill CRUD
│   ├── cronjob_tools.py        # Scheduled tasks
│   ├── delegate_tool.py        # Subagent spawning
│   ├── code_execution_tool.py  # Python script execution
│   ├── mixture_of_agents_tool.py  # Multi-model reasoning
│   └── image_generation_tool.py   # FAL image generation
│
├── gateway/                    # Messaging platform gateway
│   ├── run.py                  # Gateway entry (3,100+ lines)
│   ├── config.py               # Platform configuration
│   ├── session.py              # Session management (JSON + JSONL)
│   ├── delivery.py             # Message routing
│   ├── hooks.py                # Webhook handlers
│   └── platforms/              # Platform adapters
│       ├── base.py             # Abstract base class
│       ├── telegram.py         # Telegram Bot API
│       ├── discord.py          # Discord.py integration
│       ├── whatsapp.py         # WhatsApp Business API
│       ├── signal.py           # Signal Messenger
│       ├── slack.py            # Slack Bolt SDK
│       └── homeassistant.py    # Home Assistant integration
│
├── environments/               # RL training environments
│   ├── agent_loop.py           # Reusable agent engine
│   ├── hermes_base_env.py      # Base environment class
│   ├── hermes_swe_env/         # SWE-bench environment
│   ├── benchmarks/             # Benchmark implementations
│   │   ├── terminalbench_2/    # TerminalBench v2
│   │   ├── yc_bench/           # YC Bench
│   │   └── tblite/             # TBLite
│   └── tool_call_parsers/      # Model-specific parsers
│       ├── hermes_parser.py
│       ├── llama_parser.py
│       ├── qwen_parser.py
│       ├── deepseek_v3_parser.py
│       └── ...
│
├── cron/                       # Scheduled job system
│   ├── scheduler.py            # Cron job execution
│   └── jobs.py                 # Job definitions
│
├── skills/                     # 40+ built-in skills (agentskills.io)
│   ├── github/                 # PR workflow, issues, auth
│   ├── mlops/                  # Training, inference, evaluation
│   ├── software-development/   # TDD, debugging, subagents
│   ├── productivity/           # Google Workspace, Notion, PowerPoint
│   ├── research/               # arXiv, Polymarket, blog watcher
│   ├── media/                  # YouTube, GIFs, music
│   ├── smart-home/             # Philips Hue
│   └── autonomous-ai-agents/   # Claude Code, Codex, Hermes subagents
│
├── mini-swe-agent/             # Terminal execution backend (submodule)
├── honcho_integration/         # Honcho dialectic user modeling
└── tests/                      # Test suite
    ├── test_cli.py
    ├── test_tools.py
    ├── test_gateway.py
    └── integration/
```

---

## Key Components Deep Dive

### 1. AIAgent Class (run_agent.py)

The central orchestrator managing the conversation loop:

**Core Responsibilities:**
- Tool calling loop with OpenAI-compatible function calling
- Context window management with automatic compression
- Iteration budget tracking (shared across parent/child agents)
- Prompt caching for cost reduction
- Trajectory export for training data

**Key Configuration:**
```python
AIAgent(
    model="anthropic/claude-opus-4.6",
    max_iterations=90,              # Shared budget with subagents
    base_url="https://openrouter.ai/api/v1",
    provider="openrouter",
    reasoning_config={"effort": "medium"},
    save_trajectories=False,        # Export for RL training
    enabled_toolsets=["all"],       # Toolset filtering
)
```

**IterationBudget:**
- Thread-safe counter for tracking turns across agent hierarchy
- `consume()` - decrement on LLM calls
- `refund()` - return turns for execute_code (zero context cost)
- Shared between parent and all subagents prevents runaway delegation

### 2. Tool System (tools/)

**Terminal Tool (terminal_tool.py):**
- Backend: mini-swe-agent (local/docker/modal/daytona/singularity/SSH)
- Supports: Command execution, file editing, package installation
- Features: Sudo support, approval callbacks, environment cleanup

**Web Tools (web_tools.py):**
- `web_search` - Firecrawl web search
- `web_extract` - Structured content extraction
- `web_crawl` - Site crawling with depth control

**Browser Tools (browser_tool.py):**
- Supports both local headless Chromium and Browserbase cloud mode
- Vision-enabled snapshots with accessibility tree
- Supports: navigate, click, type, scroll, back, press, vision

**Skill Tools (skills_tool.py, skill_manager_tool.py):**
- `skills_list` - Discover available skills
- `skill_view` - Load skill content
- `skill_manage` - Create/update/delete skills

**Delegation (delegate_tool.py / `delegate_task` tool):**
- Spawns isolated subagents for parallel work
- Inherits the parent agent's iteration budget
- Runs in isolated contexts with separate tool execution state

### 3. HermesAgentLoop (environments/agent_loop.py)

Reusable agent engine for RL environments:

```python
loop = HermesAgentLoop(
    server=openai_server,           # Any OpenAI-compatible server
    tool_schemas=schemas,
    valid_tool_names=valid_tools,
    max_turns=30,
    task_id=str(uuid.uuid4()),      # Session isolation
    extra_body={"provider": {...}}  # OpenRouter preferences
)

result = await loop.run(messages)
# Returns: AgentResult with messages, state, tool_errors
```

**Features:**
- Works with vLLM, SGLang, OpenRouter, or ManagedServer
- ThreadPoolExecutor (128 workers) for concurrent tools
- Per-loop TodoStore for `todo` tool
- Structured error tracking

### 4. Gateway System (gateway/)

Multi-platform messaging architecture:

**SessionStore (session.py):**
- Disk-backed session persistence using JSON metadata plus per-session JSONL transcripts
- Cross-platform conversation continuity
- Metadata tracking (platform, user_id, timestamps)

**Platform Adapters (platforms/):**
All inherit from `BasePlatformAdapter`:
- Telegram: python-telegram-bot, supports voice memos
- Discord: discord.py, embed formatting
- WhatsApp: WhatsApp Business API
- Signal: Signal Messenger CLI
- Slack: Bolt SDK with modal support

**Media Handling (platforms/base.py):**
- Image cache: Downloaded to `~/.hermes/image_cache/`
- Audio cache: Voice memos for Whisper transcription
- Document cache: PDFs, Office files

**Security:**
- DM pairing required for sensitive operations
- `HERMES_EXEC_ASK=1` for command approval on messaging platforms
- Secret redaction in logs

### 5. Skills System (skills/)

Procedural memory following agentskills.io standard:

**Skill Structure:**
```
skills/category/skill-name/
├── SKILL.md              # Main documentation with YAML frontmatter
├── references/           # Supporting docs
├── templates/            # Reusable templates
└── scripts/              # Automation scripts
```

**SKILL.md Format:**
```markdown
---
name: github-pr-workflow
description: Full pull request lifecycle
version: 1.1.0
author: Hermes Agent
license: MIT
metadata:
  hermes:
    tags: [GitHub, CI/CD, Automation]
    related_skills: [github-auth]
---

# GitHub Pull Request Workflow

Complete guide for managing the PR lifecycle...
```

**Skill Categories:**
- **github**: PR workflow, issues, code review, repo management
- **mlops**: Training (GRPO, SFT), inference (vLLM, TensorRT-LLM), evaluation
- **software-development**: TDD, debugging, code review, subagent patterns
- **productivity**: Google Workspace, Notion, PowerPoint, PDF editing
- **research**: arXiv, Polymarket, blog watcher, domain intel
- **autonomous-ai-agents**: Claude Code, Codex, Hermes subagents

---

## Configuration System

**Config Lookup Order:**
1. `~/.hermes/config.yaml` (user config - preferred)
2. `./cli-config.yaml` (project fallback)
3. Environment variables (override everything)

**Example Configuration:**
```yaml
# Model configuration
model: "anthropic/claude-opus-4.6"
# OR old dict format:
# model:
#   default: "claude-opus-4-20250514"
#   base_url: "https://api.anthropic.com/v1"

# Terminal backend settings
terminal:
  env_type: "local"           # local, docker, modal, daytona, singularity, ssh
  cwd: "."                    # Working directory
  timeout: 60                 # Command timeout
  lifetime_seconds: 300       # VM lifetime
  docker_image: "python:3.11"
  modal_image: "python:3.11"
  daytona_image: "nikolaik/python-nodejs:python3.11-nodejs20"

# Context compression
compression:
  enabled: true               # Auto-compress at threshold
  threshold: 0.85             # 85% of context limit
  summary_model: "google/gemini-3-flash-preview"

# Agent behavior
agent:
  max_turns: 90               # Max tool-calling iterations
  personalities:              # Custom personas
    helpful: "You are a helpful assistant."
    kawaii: "You are kawaii! (◕‿◕)"

# Platform-specific toolsets
platform_toolsets:
  telegram: ["web", "terminal", "file"]
  discord: ["all"]

# Auxiliary models
auxiliary:
  vision:
    provider: "openrouter"
    model: "anthropic/claude-3.5-sonnet"
  web_extract:
    provider: "google"
    model: "gemini-3-flash-preview"

# Honcho user modeling
honcho:
  base_url: "https://demo.honcho.dev"
  api_key: "..."

# MCP servers
mcp:
  servers:
    - name: "filesystem"
      command: "npx"
      args: ["-y", "@modelcontextprotocol/server-filesystem", "/home/user"]
```

**Environment Variable Bridging:**
Config.yaml values automatically bridge to environment variables:
- `terminal.backend` or legacy `terminal.env_type` → `TERMINAL_ENV`
- `terminal.cwd` → `TERMINAL_CWD`
- `compression.enabled` → `CONTEXT_COMPRESSION_ENABLED`

---

## Entry Points

| Command | Entry / Handler | Purpose |
|---------|------------------|---------|
| `hermes` | `hermes_cli.main:main` | Main CLI entry point |
| `hermes setup` | `hermes_cli.main` → `hermes_cli.setup.run_setup_wizard()` | Configuration wizard |
| `hermes gateway` | `hermes_cli.main` / `gateway.run` | Start messaging gateway |
| `hermes model` | `hermes_cli.main` model command | Select provider and default model |
| `hermes doctor` | `hermes_cli.main` / `hermes_cli.doctor` | Diagnostics |
| `python run_agent.py` | `run_agent:main` | Direct agent execution |
| `python cli.py` | legacy standalone CLI | Older direct CLI entry |
| `python -m gateway.run` | `gateway.run` | Start gateway directly |

---

## Dependencies

**Core:**
- `openai` - OpenAI client library
- `httpx` - Async HTTP client
- `rich` - Terminal formatting
- `pydantic>=2.0` - Data validation
- `pyyaml` - YAML parsing
- `jinja2` - Template engine
- `prompt_toolkit` - Interactive CLI

**Tools:**
- `firecrawl-py` - Web search/extraction
- `fal-client` - Image generation
- `edge-tts` - Text-to-speech
- `mini-swe-agent` - Terminal execution

**Gateway:**
- `python-telegram-bot>=20.0` - Telegram
- `discord.py>=2.0` - Discord
- `slack-bolt>=1.18.0` - Slack
- `aiohttp>=3.9.0` - Async web

**Optional:**
- `modal` - Serverless GPU
- `daytona` - Dev environment
- `croniter` - Cron scheduling
- `honcho-ai` - User modeling
- `mcp>=1.2.0` - MCP client

---

## Notable Design Patterns

### 1. Iteration Budget Management
Prevents runaway agent loops by sharing turn counter:
```python
budget = IterationBudget(max_total=90)
parent = AIAgent(iteration_budget=budget)
child = AIAgent(iteration_budget=budget)  # Shares same budget
```

### 2. Tool Thread Pool
128-worker pool for concurrent tool execution:
```python
_tool_executor = ThreadPoolExecutor(max_workers=128)
# Allows 89+ concurrent TB2 evaluation tasks
```

### 3. Context Compression Pipeline
Automatic summarization when approaching context limit:
```
Messages → Token estimation → 85% threshold → Gemini Flash summary
```

### 4. Prompt Caching Strategy
Anthropic cache control for cost reduction:
- Auto-enabled for Claude on OpenRouter
- ~75% input cost reduction on multi-turn
- 5-minute TTL (1.25x write cost)

### 5. Worktree Isolation
Git worktrees for isolated session contexts:
```bash
hermes -w  # Creates .worktrees/hermes-{uuid}/ branch hermes/hermes-{uuid}
```

---

## Testing

```bash
# Unit tests
pytest tests/ -q

# Integration tests (requires API keys)
pytest tests/ -m integration

# Specific examples
pytest tests/test_run_agent.py -v
pytest tests/tools/test_file_tools.py -v
```

---

## Documentation

- **Main docs:** https://hermes-agent.nousresearch.com/docs/
- **Skills Hub:** https://agentskills.io
- **GitHub:** https://github.com/NousResearch/hermes-agent
- **Discord:** https://discord.gg/NousResearch

---

## Summary

Hermes Agent represents a **production-ready, multi-platform AI agent framework** with several unique characteristics:

1. **Closed Learning Loop** - Creates skills from experience and improves them during use
2. **Multi-Platform by Design** - Not CLI-first with messaging bolted on; all platforms are first-class
3. **Research-Grade Infrastructure** - Trajectory export, RL environments, tool-call parsers
4. **Cost-Conscious** - Prompt caching, context compression, cheap models for summaries
5. **Extensible** - Skills system, MCP integration, custom toolsets
6. **Portable** - Runs on VPS, GPU cluster, or serverless (Modal/Daytona)

The codebase demonstrates sophisticated software engineering with clear separation of concerns, comprehensive configuration systems, and thoughtful abstractions for multi-modal AI interactions.
