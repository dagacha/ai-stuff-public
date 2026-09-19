# ai-stuff

**Status:** active — verified 2026-09-02

Operational notes, setup guides, and benchmark results for running local LLM infrastructure and AI agent frameworks — on DGX Spark clusters, Windows/WSL2 workstations, cloud GPUs, and Apple Silicon. This is the public mirror of my personal ops knowledge base; private ops notes and unrelated tooling live in a separate private repo.

> **Not production software** — this repo contains operational notes, setup guides, research artifacts, and benchmark results. No secrets are committed. Most docs reference 2026-05/06; some configs reference models that may have changed.

---

## Start Here

| Goal | Start with |
|------|------------|
| Configure gateway-backed agents through a single proxy | [`configs/unified-model-gateway.md`](configs/unified-model-gateway.md) — the most important doc |
| Verify the gateway is reachable | Ready-to-paste `curl` snippets in the gateway doc's [Validation Procedure](configs/unified-model-gateway.md#validation-procedure) |
| Set up OpenCode with Claude Max / ChatGPT | [`configs/agents/opencode-setup.md`](./configs/agents/opencode-setup.md) |
| Run Codex with fewer or no approval prompts | [`configs/agents/codex-autonomy.md`](./configs/agents/codex-autonomy.md) |
| Run a local model on Linux (llama.cpp) | [`configs/vastai/llama-server-launch.sh`](configs/vastai/llama-server-launch.sh) |
| Run a local model on Windows (llama.cpp / vLLM) | [`configs/bosgame/project_llm_setup.md`](configs/bosgame/project_llm_setup.md) or [`configs/msi/connection-llm-setup.md`](configs/msi/connection-llm-setup.md) |
| Deploy on a DGX Spark cluster | [`configs/dgx-spark/deepseek-v4-flash-server.md`](configs/dgx-spark/deepseek-v4-flash-server.md) |
| Run GLM-5.3-Flash on the DGX Spark cluster (and switch stacks) | [`configs/dgx-spark/glm-5.3-flash-exl3.md`](configs/dgx-spark/glm-5.3-flash-exl3.md) |
| Wire three DGX Sparks into a CX7 ring (and validate with NCCL) | [`configs/dgx-spark/ring-cluster.md`](configs/dgx-spark/ring-cluster.md) |
| Run Qwen3.8-Flash-Next on a single DGX Spark (TP=1) | [`configs/dgx-spark/qwen38-flash-next-single-spark.md`](configs/dgx-spark/qwen38-flash-next-single-spark.md) |
| Point the ZCode harness at a local model + configure its models | [`configs/agents/zcode-setup.md`](./configs/agents/zcode-setup.md) (providers) and [`configs/agents/zcode-model-config.md`](./configs/agents/zcode-model-config.md) (model list format) |
| Enter model/provider configs in the DeepSeek Harness (dsh) | [`configs/agents/dsh-model-config.md`](./configs/agents/dsh-model-config.md) |
| Set up a Vast.ai cloud instance | [`configs/vastai/WORKSPACE.md`](configs/vastai/WORKSPACE.md) |
| Benchmark a model's throughput/coding ability | [`benchmarks/README.md`](benchmarks/README.md) |

---

## Operational Status

| Machine | Host OS | Backend | Models | Status | Last verified |
|---------|---------|---------|--------|--------|---------------|
| **DGX Spark** (3-node CX7 ring) | DGX OS (Linux) | vLLM via Anemll / MiaAI-Lab EXL3 image | GLM-5.3-Flash EXL3 **TP=3 on all three nodes** (live); DeepSeek-V4-Flash-DSpark (stock + abliterated) and GLM TP=2 as 2-node fallbacks | Active | 2026-09 |
| **DGX Spark** (`spark-indie`, single node) | DGX OS (Linux) | vLLM (TP=1) | Qwen3.8-Flash-Next NVFP4 (262k, vision) | Stopped 2026-09-15 — the GB10 is rank 1 of GLM TP=3; cannot run concurrently | 2026-09 |
| **Bosgame M5** (Ryzen AI Max+ 395) | Windows | llama.cpp (3x NSSM services) | Qwen3.6-27B, Qwen3.6-35B-A3B, Gemma 4 26B | Active | 2026-06 |
| **MSI** (RTX 5090) | Windows / WSL2 | vLLM / llama.cpp | Qwen3.8-27B-NVFP4 (vLLM production lane), Gemma 4 31B QAT (llama.cpp) | Active | 2026-08 |
| **Vast.ai** (cloud GPU) | Linux | llama-server / vLLM | Gemma 4 31B GGUF | Active | 2026-06 |
| **MacBook** (M1 Max) | macOS | MLX | Qwen 3.6 35B, Gemma 4 | Benchmark environment only | 2026-06 |

The deployment notes in this README are a **snapshot**, not a live dashboard. Model availability depends on subscription/OAuth health — always verify a model id answers before adding it to an agent's model list (see the gateway doc for verification snippets).

---

## Infrastructure

Hardware setups and deployment guides for running local LLMs.

### Machine Guides

| Machine | Primary guide | Supporting files | Type |
|---------|---------------|------------------|------|
| **DGX Spark** (2-node) | [`deepseek-v4-flash-server.md`](configs/dgx-spark/deepseek-v4-flash-server.md) | [`switch-dspark-model.sh`](configs/dgx-spark/switch-dspark-model.sh) | Operational runbook |
| **DGX Spark** (GLM-5.3-Flash EXL3) | [`glm-5.3-flash-exl3.md`](configs/dgx-spark/glm-5.3-flash-exl3.md) | [`switch-stack.sh`](configs/dgx-spark/switch-stack.sh), [`receipts/`](configs/dgx-spark/receipts/) | Operational runbook: TP=3 on the 3-node ring (live, NFS weights, `.env.tp3`), TP=2 profile, upstream-update log, DeepSeek ⇄ GLM switcher |
| **DGX Spark** (`spark-indie`, Qwen3.8-Flash-Next) | [`qwen38-flash-next-single-spark.md`](configs/dgx-spark/qwen38-flash-next-single-spark.md) | — | Operational runbook (single node, TP=1; stopped since 2026-09-15 while `spark-indie` serves as GLM TP=3 rank 1) |
| **DGX Spark** (GLM-5.2 analysis) | [`glm-5.2.md`](configs/dgx-spark/glm-5.2.md) | — | Feasibility / sizing analysis (not measured) |
| **DGX Spark** (3-node ring) | [`ring-cluster.md`](configs/dgx-spark/ring-cluster.md) | [`ring-cluster/`](configs/dgx-spark/ring-cluster/) | Ring cabling/addressing, cutover, NCCL 22.9 GB/s, IOMMU + hotplug gotchas, TP=3 control-plane routes (netplan) |
| **DGX Spark** (clock cap) | [`gb10-clock-cap.md`](configs/dgx-spark/gb10-clock-cap.md) | — | GB10 2200 MHz SM clock cap: measurement + systemd install |
| **Bosgame M5** | [`project_llm_setup.md`](configs/bosgame/project_llm_setup.md) | [`MTP_STATUS.md`](configs/bosgame/MTP_STATUS.md) | Operational runbook |
| **MSI** (RTX 5090) | [`connection-llm-setup.md`](configs/msi/connection-llm-setup.md), [`gemma4-qat-llamacpp.md`](configs/msi/gemma4-qat-llamacpp.md) | [`common.sh`](configs/msi/common.sh), [`serve-official.sh`](configs/msi/serve-official.sh), [`serve-vllm.sh`](configs/msi/serve-vllm.sh), [`start-vllm.sh`](configs/msi/start-vllm.sh), [`sync-to-runtime.sh`](configs/msi/sync-to-runtime.sh), [`tcp-forward.py`](configs/msi/tcp-forward.py), [`vllm.service`](configs/msi/vllm.service), [`vllm-bridge.service`](configs/msi/vllm-bridge.service), [`vllm-bridge.sh`](configs/msi/vllm-bridge.sh), [`tool-test.json`](configs/msi/tool-test.json) | Operational runbook |
| **Vast.ai** | [`WORKSPACE.md`](configs/vastai/WORKSPACE.md), [`OPENCODE.md`](configs/vastai/OPENCODE.md) | [`bootstrap.sh`](configs/vastai/bootstrap.sh), [`llama-server-launch.sh`](configs/vastai/llama-server-launch.sh), [`vllm-server-launch.sh`](configs/vastai/vllm-server-launch.sh), [`tailscaled-launch.sh`](configs/vastai/tailscaled-launch.sh), [`sync-home-state.sh`](configs/vastai/sync-home-state.sh), [`opencode`](configs/vastai/opencode), [`opencode.json`](configs/vastai/opencode.json) | Operational runbook |

### Agent harness configs (`configs/agents/`)

Setup and autonomy docs for the agent harnesses themselves (machine-independent):

- **`opencode-setup.md`** — Configuring OpenAI and Anthropic subscriptions in OpenCode via CLIProxyAPI
- **`codex-autonomy.md`** — Codex approval and sandbox modes
- **`zcode-setup.md`** / **`zcode-model-config.md`** — ZCode providers and model-list format
- **`dsh-model-config.md`** — DeepSeek Harness (dsh) provider/model config format, Pi→dsh field mapping, cross-machine sync
- **`migration-omp.md`** — Migrating/syncing OMP agent config across machines (see [OMP Migration](#omp-migration))

---

## Unified Model Gateway

The central proxy architecture that routes gateway-backed agents through a single `cli-proxy-api` instance on `localhost:8317`. Some agents (notably Pi) also run direct non-gateway providers for LAN-local models — see the gateway doc for details.

**Canonical doc:** [`configs/unified-model-gateway.md`](configs/unified-model-gateway.md) — complete plan, implementation status, 13 pitfalls learned, per-agent config matrix, and cross-machine replication guide.

```
cli-proxy-api (localhost:8317)
├── Claude Max (OAuth)       → claude-opus-max, claude-opus-4-8, claude-sonnet-max
├── ChatGPT Plus (OAuth)     → gpt-5.5-plus, gpt-5.3-codex
├── Google AI Pro (Antigravity OAuth) → gemini-3-flash, gemini-3.1-pro-low, claude-sonnet-4-6, gpt-5.5
├── Z.AI (API key)           → glm-5.1, glm-5-turbo, glm-4.7
├── Fireworks (API key)      → kimi-k2p6-turbo
└── Local llama.cpp (API key)→ gemma-4-31b

Agents pointing to proxy:
├── Pi  → ~/.pi/agent/extensions/gateway.ts
├── OpenCode → ~/.config/opencode/opencode.jsonc
├── Droid → ~/.factory/settings.json
└── Hermes → ~/.hermes/config.yaml
```

> **Snapshot note:** This diagram reflects the intended architecture. Some agents also run direct (non-gateway) providers — e.g. Pi accesses LAN-local llama.cpp instances directly (see gateway doc §5 for details). Model ids listed via `/v1/models` are not a guarantee — availability depends on subscription tier and OAuth health. Always confirm with a `chat/completions` test before adding to an agent.

**Agents covered:** Pi, OpenCode, Factory Droid, Hermes Agent (plus ZCode — a separate harness that talks to LAN providers directly, not through the gateway — see [`configs/agents/zcode-setup.md`](./configs/agents/zcode-setup.md))
**Providers:** Claude (OAuth), ChatGPT (OAuth), Google AI Pro / Antigravity (OAuth), Z.AI, Fireworks, local llama.cpp

---

## Research & ops notes

Research notes and operational runbooks live in `learnings/`; harness setup configs live in [`configs/agents/`](configs/agents/) (above).

- **`learnings/HERMES.md`** — Deep-dive analysis of the Hermes Agent framework (Nous Research): architecture, tool system, gateway, skills, RL environments
- **`learnings/HERMES_LEARNINGS.md`** — Condensed takeaways on skills, memory, and the closed learning loop
- **`learnings/droid.md`** — Factory Droid CLI setup with CLIProxyAPI proxy for Claude Max + ChatGPT subscriptions
- **`learnings/IRONCLAW.md`** — How IronClaw accesses the Linux keyring without password prompts (PAM, GNOME Keyring, D-Bus)
- **[`learnings/PARALLELS_LICENSES.md`](learnings/PARALLELS_LICENSES.md)** — Verified Parallels Desktop licence transfers over SSH and troubleshooting lessons

---

## Benchmarks

Comprehensive performance, coding capability, and game generation benchmarks. Full index at [`benchmarks/README.md`](benchmarks/README.md).

### Categories

| Category | What's measured | Hardware backends | How to reproduce |
|----------|----------------|-------------------|------------------|
| **Throughput** | Prefill tok/s, decode tok/s, TTFT | MSI (vLLM), DGX Spark (vLLM) | Run [`bench_vllm.py`](benchmarks/throughput/bench_vllm.py) against any OpenAI-compatible endpoint |
| **Coding tasks** | LRU Cache (18 tests), Async Job Queue (4 bugs) | MSI, Bosgame, MacBook | See [`coding-tasks/README.md`](benchmarks/coding-tasks/README.md) for methodology |
| **Game generation** | Full browser-based space shooter quality | MSI, MacBook (MLX), Bosgame | Outputs are versioned under [`space-shooter-results/`](benchmarks/space-shooter-results/); local run outputs are gitignored |
| **Tool-calling eval** | Tool-call quality, Hard Mode, safety | 2x DGX Spark, MSI | DGX Spark: stock, abliterated, GA-0731, and keys-32-32 reports; MSI: ThinkingCap + NVFP4 tool-eval reports |

### Key Reports

Curated highlights — the full index lives in [`benchmarks/README.md`](benchmarks/README.md).

**Tool-eval** (`benchmarks/tool-eval/`)
- [DeepSeek-V4-Flash-DSpark Tool Eval (abliterated)](./benchmarks/tool-eval/report-2x-dgx-spark-deepseek-v4-flash-dspark-tool-eval.md) — 82/100
- [DeepSeek-V4-Flash-DSpark Tool Eval (stock)](./benchmarks/tool-eval/report-2x-dgx-spark-deepseek-v4-flash-dspark-stock-tool-eval.md) — 85/100
- [DeepSeek-V4-Flash-0731 (GA) Tool Eval](./benchmarks/tool-eval/report-2x-dgx-spark-deepseek-v4-flash-0731-tool-eval.md) — 88/100, fleet-best
- [Qwen3.6-27B-NVFP4 MSI Tool Eval](./benchmarks/tool-eval/report-msi-qwen3.6-27b-nvfp4-tool-eval.md) — 88/100 base score
- [Qwen3.8-Flash-Next (spark-indie) Tool Eval + VulcanBench](./benchmarks/tool-eval/report-single-dgx-spark-qwen38-flash-next-c1-thinking.md) — 85/100 full, 77/100 Hard Mode (thinking on)

**VulcanBench** (`benchmarks/vulcanbench/`)
- [Stock DSv4-Flash-DSpark VulcanBench](./benchmarks/vulcanbench/report-2x-dgx-spark-deepseek-v4-flash-dspark-vulcanbench.md) — v3 18/23 (78.3%)
- [DeepSeek-V4-Flash-0731 (GA) VulcanBench](./benchmarks/vulcanbench/report-2x-dgx-spark-deepseek-v4-flash-0731-vulcanbench.md) — v3 13/23 at 20× fewer tokens/task
- [Qwen3.8-Flash-Next VulcanBench (c1, capped)](./benchmarks/tool-eval/report-single-dgx-spark-qwen38-flash-next-c1-thinking.md#2-vulcanbench-concurrency-1) — v1 42/52 · carbyne 19/22 · v3 10/23 on one DGX Spark at default budgets; [override ablation](./benchmarks/vulcanbench/report-single-dgx-spark-qwen38-flash-next-vulcanbench-v3.md) v3 15/23 (3,600 s)

**Lane assessments** (`benchmarks/lane-assessments/`)
- [Qwen3.8-27B: the 131K lane (MSI)](./benchmarks/lane-assessments/report-msi-qwen3.8-27b-131k.md) — current production lane
- [Qwen3.8-27B EXL3 / DFlash2 (MSI)](./benchmarks/lane-assessments/report-msi-qwen3.8-27b-exl3-dflash2.md) — switchable canary

**Throughput** (`benchmarks/throughput/`)
- [Qwen 3.6 27B AEON-XS](benchmarks/throughput/report-msi-Qwen3.6-27B-AEON-XS.md) — ~16K tok/s prefill, ~40 tok/s decode
- [Gemma 4 31B NVFP4](benchmarks/throughput/gemma-4-31B-NVFP4-vllm.md) — ~6.7K tok/s prefill, ~45 tok/s decode

---

## Repository Layout

```
ai-stuff/
├── README.md              # This file
├── LICENSE                # MIT — code (scripts, shell, Python, service files)
├── LICENSE-CC-BY-4.0      # CC-BY-4.0 — docs, guides, benchmark reports
├── benchmarks/            # Benchmark suites, outputs, and tools
│   ├── tool-eval/         # Tool-call quality / Hard Mode / safety reports
│   ├── vulcanbench/       # Agentic SWE reports (+ images/)
│   ├── lane-assessments/  # MSI production-lane writeups
│   ├── throughput/        # Throughput probe scripts and reports
│   ├── coding-tasks/      # LRU Cache & Async Queue evaluations
│   └── space-shooter-results/  # Generated game outputs (versioned)
├── configs/               # Infrastructure setup guides and scripts
│   ├── agents/            # Agent-harness configs (opencode, codex, zcode, OMP migration)
│   ├── bosgame/           # Bosgame M5 (Windows/llama.cpp)
│   ├── dgx-spark/         # DGX Spark cluster (vLLM)
│   ├── msi/               # MSI workstation (Windows/WSL2/vLLM + llama.cpp)
│   ├── vastai/            # Vast.ai cloud instance (Linux)
│   └── unified-model-gateway.md  # Cross-machine proxy SSOT
├── learnings/             # Research notes and operational runbooks
└── scripts/               # Repo maintenance (check-links.py)
```

### Conventions

| Convention | Guidance |
|------------|----------|
| **Adding a machine guide** | Create a directory under `configs/<machine-name>/` with a primary `.md` guide, launch scripts, and service files |
| **Adding a benchmark run** | Generated outputs (space-shooter runs, coding-task results) go under `benchmarks/<category>/<model-name>/` and get linked from `benchmarks/README.md` |
| **Adding a benchmark report** | Place it in its suite dir (`tool-eval/`, `vulcanbench/`, `lane-assessments/`, `throughput/`) and link from `benchmarks/README.md` |
| **Naming space-shooter runs** | New run dirs use `<model>-<backend>[-variant]`; existing dirs keep their names (renaming would churn cross-citations) |
| **Link check** | Run `python3 scripts/check-links.py` after moving/renaming docs — it fails on broken relative markdown links (inline + reference-style; fenced code skipped, anchors not validated) |
| **Doc status** | Docs **must** carry an explicit label: `active — verified YYYY-MM-DD`, `historical`, `feasibility / unmeasured`, or `superseded`. Unlabeled docs should be treated as unknown. |
| **Secrets** | Never commit `.env`, API keys, or auth tokens — they are gitignored; use placeholders in docs |
| **License** | Code: [MIT](LICENSE) · Docs, guides, and benchmark reports: [CC-BY-4.0](LICENSE-CC-BY-4.0) |

---

## OMP Migration

- **[`configs/agents/migration-omp.md`](configs/agents/migration-omp.md)** — Guide for migrating and synchronizing OMP configurations across machines, including Tailscale rsync workflows and proxy replication.
