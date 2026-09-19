# GB10 clock cap (2200 MHz) on the 2x DGX Spark cluster

**Status:** active — verified 2026-09-02

GPU SM clocks on both Sparks are capped at **2200 MHz** via a systemd oneshot,
after benchmarking showed the cap is effectively free on our workload while
cutting GPU power ~25% and peak temps 6–9 °C. Written 2026-08-16.

## Why

Evaluated [agjs/gb10-clock-cap](https://github.com/agjs/gb10-clock-cap)
(cloned at `~/gb10-clock-cap` on the head) against the live DeepSeek V4 Flash
DSpark stack (see [deepseek-v4-flash-server.md](deepseek-v4-flash-server.md)).
Its reference system is literally our setup — 2x GB10, vLLM TP=2, same model.

Full run 2026-08-15 (`./run.sh --hosts "172.31.100.1 172.31.100.2" --api-host
172.31.100.1 --mode full`; those are the pre-ring addresses — since the
2026-09-11 [ring cutover](ring-cluster.md) use `10.10.0.1 10.10.0.2`), measured at the real workload profile discovered
from live vLLM metrics: mean prompt 127,585 tokens.
Interleaved A/B (n=20 decode / n=24 prefill per arm, all prefill probes
verified cold at 0.0% prefix-cache hit rate) plus 1-hour thermal soaks per arm:

| | stock (~2405/2411 MHz) | capped 2200 |
|---|---|---|
| Decode | 52.4 tok/s | 54.0 tok/s (within noise, 2·SE = 2.9) |
| Cold prefill, 127k tok | 140.7 s | 142.0 s (+0.9%) |
| Peak temp head / worker | 78 / 81 °C | 72 / 72 °C |
| Mean GPU-rail power head / worker | 43.1 / 49.4 W | 32.2 / 36.6 W (−25%) |
| Throttling | 0 | 0 |

Weighted cost (per `summary.json`): weights from the server's TTFT share of
e2e latency at analysis time, prefill 0.335 / decode 0.665, so
`0.665 × (−2.95%) + 0.335 × (+0.91%) ≈ −1.6%` vs the 3% limit → verdict
**apply**. Caveat on that headline: the negative sign comes entirely from the
decode *point estimate* (54.0 vs 52.4 tok/s, i.e. capped measured ~3% faster —
plausibly extra thermal margin, stock ran 78/81 °C), which is within noise
(2·SE = 2.9 tok/s). Treating decode as truly unchanged gives
`0.335 × 0.91% ≈ +0.3%` — the conservative reading. Either way the cap is a
power/thermal play at ≈zero perf cost, notably cheaper than the repo author's
own +3.9% prefill hit: our 127k TP=2 prefill barely responds to SM clock
(likely bandwidth/interconnect-bound). Raw data:
`~/gb10-clock-cap/results/` (`summary.json` is the machine-readable verdict;
`results.bad-run-1/` is a contaminated first attempt, see gotchas).

Caveats: single-stream measurements only (concurrency changes the
compute-to-bandwidth ratio); power figures are the GPU rail from nvidia-smi,
not wall power; the lower-clock sweep (2000/1800) was not run — 2000 might
save more watts for a small prefill cost if that ever matters.

## What is installed

`/etc/systemd/system/gb10-clock-cap.service` on **both** nodes (oneshot,
enabled): `ExecStart=/usr/bin/nvidia-smi -lgc 0,2200`,
`ExecStop=/usr/bin/nvidia-smi -rgc`, `After=nvidia-persistenced.service`.
`nvidia-smi -lgc` does not survive reboot and persistence mode does not
preserve it, hence the unit. Installed 2026-08-16 via the repo's
`scripts/install_cap.sh` with the vLLM stack stopped first — **order is
mandatory**: `systemctl daemon-reload` revokes GPU access from running
containers (NVML "Unknown Error" until restart).

Verified: worker reboot-tested (journal shows the unit re-applied
`gpuClkMax 2200` at boot); head unit enabled+active but boot survival
unchecked until its next reboot; under decode load both nodes hold 2190 MHz
at ~55–58 °C with decode ~53 tok/s.

**The 3rd Spark (`spark-indie`, on the [ring](ring-cluster.md) since 2026-09-11) has the same unit, enabled and active; its journal shows the cap re-applied at the 2026-09-11 boot (checked 2026-09-12).**

Rollback per node:

```bash
sudo systemctl disable --now gb10-clock-cap.service && sudo nvidia-smi -rgc
```

### Sudoers

Two NOPASSWD files were added on both nodes:

- `/etc/sudoers.d/nvidia-smi-clockcap` (`/usr/bin/nvidia-smi`, any args) —
  kept: the harness and rollback need it. Note it is command-scoped, not
  arg-scoped, so it allows any nvidia-smi invocation (config changes
  included), which is broader than "clock control only".
- `/etc/sudoers.d/clockcap-install` (tee to the unit file, `daemon-reload`,
  `enable/disable --now` of the unit, `systemctl reboot`) — **root-equivalent
  despite the narrow-looking list**: privileged `tee` into a unit file plus
  reload plus enable lets the account set `ExecStart=` to any root command.
  It existed only for the one-time install; **remove it now that the install
  is verified**:

  ```bash
  sudo rm /etc/sudoers.d/clockcap-install   # on each node
  ```

  Any future reinstall (e.g. the 3rd Spark) should be done by an
  administrator directly rather than by re-granting this rule.

## Gotchas hit (local uncommitted patches in ~/gb10-clock-cap)

- **Bench scripts crash / produce garbage against our vLLM**: our server
  streams reasoning in the nonstandard `reasoning` delta field (not
  `reasoning_content` — documented in deepseek-v4-flash-server.md under
  "Client configuration requirements"). The
  harness's `bench/decode_bench.py` and `bench/prefill_probe.py` only watched
  `content`/`reasoning_content`, so with thinking enabled every prefill probe
  died with `t_first=None` (its `max_tokens=8` are all reasoning tokens) and
  decode tok/s was wildly inflated (timer started at the first *visible*
  token — up to 1548 "tok/s"). Fix: also accept `d.get("reasoning")` in both
  scripts' delta checks. Without the fix the first run produced no prefill
  data at all and an invalid soak; archived at `results.bad-run-1/`.
- **Preflight `sudo -n true` check**: the harness probes generic passwordless
  sudo, but everything its measurement path runs is `nvidia-smi`. Narrowed
  the check in `run.sh` to `sudo -n nvidia-smi -L` so a scoped sudoers rule
  passes.
- Both patches would make a reasonable upstream PR to agjs/gb10-clock-cap.
- Cold-prefill probes at our 127k mean prompt are safe w.r.t. upstream
  deployment issue #32 (single cold ~256k prefill hard-resets the head);
  keep probe sizes well under 200k.
