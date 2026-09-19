#!/bin/bash
# Starts vLLM serving Gemma-4-31B-NVFP4 on 127.0.0.1:18080 with 128K context.
# Idempotent — skips if already healthy. Persistent venv at /workspace/venvs/vllm.
set -eu

PORT=18080
MODEL=RedHatAI/gemma-4-31B-it-NVFP4
LOG=/workspace/logs/vllm-server.log
VENV=/workspace/venvs/vllm

mkdir -p /workspace/logs /workspace/.cache/flashinfer

# Already healthy?
if curl -fsS --max-time 2 "http://127.0.0.1:${PORT}/health" >/dev/null 2>&1; then
    echo "vllm-server-launch: already healthy on :${PORT}"
    exit 0
fi

# Already starting? (process up but /health not yet 200)
if pgrep -f "vllm.*serve.*${MODEL}" >/dev/null 2>&1; then
    echo "vllm-server-launch: process already running, waiting on /health"
    exit 0
fi

export HF_HOME=/workspace/.hf_home
export FLASHINFER_CACHE_DIR=/workspace/.cache/flashinfer
export VLLM_USE_V1=1

nohup "${VENV}/bin/vllm" serve "${MODEL}" \
    --host 127.0.0.1 \
    --port "${PORT}" \
    --max-model-len 131072 \
    --max-num-batched-tokens 8192 \
    --gpu-memory-utilization 0.90 \
    --kv-cache-dtype auto \
    --served-model-name gemma-4-31b \
    --enable-auto-tool-choice \
    --tool-call-parser gemma4 \
    >>"${LOG}" 2>&1 &

echo "vllm-server-launch: started (pid $!) — tail ${LOG} for progress"
