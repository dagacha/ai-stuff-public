# VulcanBench harness patches

## `vulcanbench-bc85af6-openai-extra-payload.patch`

**Target:** VulcanBench harness commit `bc85af6` (`harness/agent/providers.py`).
Apply with `git apply` from the VulcanBench checkout root before any run that
sets `VULCANBENCH_OPENAI_EXTRA_PAYLOAD`.

**What it does.** The OpenAI provider's Chat Completions path calls
`_chat_completions_complete(..., temperature=None if <omit-sampling model> else 0)`
and never populates that function's existing `extra_payload` argument, so
every request goes out at temperature 0 and without a `max_tokens` cap. The
patch reads `VULCANBENCH_OPENAI_EXTRA_PAYLOAD` (a JSON object) and passes it
as `extra_payload`; `json` and `os` are already imported in the file.

**Why the guard wins over the hardcoded temperature.** In
`_chat_completions_complete` the payload is built as
`payload["temperature"] = temperature` **then** `payload.update(extra_payload)`
(lines 764–767 at `bc85af6`), so keys in the env var override the pinned
value; `tools` / `tool_choice` are added afterwards and are not affected.
The upstream-error early return happens before any request is sent, so it
does not interact with the merge.

**Relation to the 2026-09-05 report's patch.** The v3 override report
(`benchmarks/vulcanbench/report-single-dgx-spark-qwen38-flash-next-vulcanbench-v3.md`)
describes an earlier local patch that lifted `temperature` out of the env var
explicitly. Because `update()` already gives the env var precedence, the
two-line form here has the same effect and is the canonical one; it is the
exact diff of the worker checkout that produced the 2026-09-09/10 numbers.

**Runs that used a `VULCANBENCH_OPENAI_EXTRA_PAYLOAD` mod.** Via this exact
patch: the Vision-Exp c1 addendum, the GLM-5.3 EXL3 report and the
Qwen3.8-Flash-Next c1 report. Via equivalent earlier local mods (same env var,
same merge point, not this diff): the 2026-08-03 0731 thinking-mode sweep
(`report-2x-dgx-spark-deepseek-v4-flash-0731-vulcanbench.md`, source of the
0731 row's v3 14/23) and the 2026-09-05 Qwen3.8-Flash-Next v3 override run.
