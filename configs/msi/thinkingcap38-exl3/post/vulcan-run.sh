#!/bin/bash
# VulcanBench v1, v1-carbyne, v3 against LIVE production (8100 bridge), matching the
# base Qwen3.8 promotion runs of 2026-08-17/18: --no-judges, docker sandbox, concurrency 1.
# Waits for the tc38-post quick set to finish first so speed numbers are not contended.
set -uo pipefail
LOG=/home/<user>/runs/tc38-vulcan.log; exec >>"$LOG" 2>&1
echo "=== $(date -Is) vulcan runner start; waiting for tc38-post"
while systemctl --user is-active tc38-post.service >/dev/null; do sleep 60; done
echo "=== $(date -Is) quick set finished; starting VulcanBench"
cd ~/VulcanBench
# OPENAI_BASE_URL is the model endpoint. (VULCANBENCH_API_BASE is the dashboard
# persistence backend and must stay unset here, or the harness demands a token.)
export OPENAI_BASE_URL=${OPENAI_BASE_URL:-http://100.<tailscale-ip-1>:8100/v1}
export OPENAI_API_KEY=${OPENAI_API_KEY:-local}
unset VULCANBENCH_API_BASE VULCANBENCH_API_TOKEN
# The EXL3 kit defaults max_tokens to 1024 when the client sends none, which truncates any
# agent step over ~1K tokens (first attempt 2026-09-24 19:07: every failure was a 1019-token
# response with no tool call). The vLLM lane the base run used had no such cap. Needs the
# checked-in providers.py extra-payload patch. Temperature is left at the harness default (0).
export VULCANBENCH_OPENAI_EXTRA_PAYLOAD='{"max_tokens":16000}'
grep -q VULCANBENCH_OPENAI_EXTRA_PAYLOAD harness/agent/providers.py || { echo "extra-payload patch not applied"; exit 1; }
M=openai:thinkingcap-qwen3.8-27b-exl3-5.5bpw
for suite in v1 v1-carbyne v3; do
  echo "=== $(date -Is) suite $suite start"
  .venv/bin/vulcanbench run --suite "$suite" --model "$M" --no-judges --max-concurrency 1 > "/home/<user>/runs/tc38-vulcan-$suite.log" 2>&1
  echo "=== $(date -Is) suite $suite rc=$?"; tail -5 "/home/<user>/runs/tc38-vulcan-$suite.log" | cut -c1-200
done
echo "=== $(date -Is) leaderboard"; .venv/bin/vulcanbench leaderboard 2>&1 | head -40 | cut -c1-200
echo "=== $(date -Is) all suites done"
