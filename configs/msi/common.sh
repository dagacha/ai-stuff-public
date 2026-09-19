#!/bin/bash
# Shared launch constants for the MSI vLLM / bridge scripts.
# Keep production and rollback separate, but make the repeated literals live here.

MSI_PUBLIC_PORT=8100
MSI_INTERNAL_PORT=8101
MSI_BRIDGE_UPSTREAM_HOST=100.<tailscale-ip-1>
MSI_BRIDGE_UPSTREAM_PORT=8101

MSI_OFFICIAL_MODEL=nvidia/Qwen3.6-27B-NVFP4
MSI_OFFICIAL_SERVED_NAME=qwen3.6-27b-nvfp4

MSI_THINKINGCAP_MODEL=morosystems/ThinkingCap-Qwen3.6-27B-NVFP4
MSI_THINKINGCAP_SERVED_NAME=qwen3.6-27b-nvfp4

MSI_ROLLBACK_MODEL=AEON-7/Qwen3.6-27B-AEON-Ultimate-Uncensored-Text-NVFP4-MTP-XS
MSI_ROLLBACK_SERVED_NAME=qwen3.6-27b-nvfp4

MSI_TOOL_CALL_PARSER=qwen3_xml
MSI_MAX_MODEL_LEN=131072
# Guardrail (2026-07-23): capped 16 -> 2 after vLLM EngineCore crashed under
# 3-way concurrent agentic load (ThinkingCap + MTP n=5 + NVFP4; see
# connection-llm-setup.md "Open questions" #4 and ai-stuff PR #72). vLLM
# queues requests above the cap instead of crashing. Sole production client
# (Pi agent) is single-stream, so no throughput impact. Rollback: restore 16
# once the crash is root-caused; revalidate with a concurrency-3 suite run.
MSI_MAX_NUM_SEQS=2
MSI_MAX_NUM_BATCHED_TOKENS=8192
MSI_GPU_MEMORY_UTILIZATION=0.93
