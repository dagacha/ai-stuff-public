# Contributing to ai-stuff

Thanks for your interest. This is the public mirror of my personal ops
knowledge base, so contribution flow is a little unusual — here's
what works.

## What's welcome

- **Corrections** — a command that's wrong, a flag that changed, a benchmark
  number that doesn't reproduce, a doc whose status label is stale.
- **Additions that fit the format** — a machine guide under
  `configs/<machine-name>/`, a benchmark report in its suite directory with
  a `benchmarks/README.md` link, a research note under `learnings/`.
- **Tooling** — improvements to `scripts/` (shell/Python, stdlib-only
  preferred, matching the existing style).

## Before opening a PR

1. Run the link check — CI enforces it on every PR:

   ```bash
   python3 scripts/check-links.py
   ```

2. Follow the doc conventions in the
   [README](README.md#conventions) — every doc carries an explicit status
   label (`active — verified YYYY-MM-DD`, `historical`,
   `feasibility / unmeasured`, `superseded`).
3. **Leave the placeholders alone.** Values like `<user>`, `<account>`,
   `<tailnet>`, `<vastai-node>`, `<olas>`, `100.<tailscale-ip-N>` are
   intentional sanitization of private identifiers — please don't "fix"
   them into concrete-looking values.

## Things to know

- **This is a mirror.** Content originates in an upstream private repo, so
  some PRs may be ported upstream and re-mirrored rather than merged here
  directly. Either way, your contribution is credited in the merge history.
- **No secrets, ever.** Don't post API keys, tokens, or auth files in
  issues or PRs — including "redacted but recognizable" ones.
- **License:** code (shell/Python/service files) is
  [MIT](LICENSE); docs, guides, and benchmark reports are
  [CC-BY-4.0](LICENSE-CC-BY-4.0). By contributing, you agree your
  contributions are licensed under those terms.
