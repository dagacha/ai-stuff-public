# Codex Autonomy and Approval Modes

**Status:** active — verified 2026-08-19

Codex controls autonomy with two independent settings:

- `approval_policy` decides whether Codex pauses for permission.
- `sandbox_mode` decides what local commands may access.

## Recommended: prompt-free workspace access

Use this when Codex should work autonomously inside the current repository while
remaining isolated from the rest of the machine:

```bash
codex --sandbox workspace-write --ask-for-approval never
```

To make it the default, add this to `~/.codex/config.toml`:

```toml
sandbox_mode = "workspace-write"
approval_policy = "never"

[sandbox_workspace_write]
network_access = true
```

With `approval_policy = "never"`, Codex does not ask for escalation when an
operation is outside the sandbox; that operation fails instead. Give it access
to additional trusted directories with `--add-dir <path>` rather than disabling
the sandbox for routine repository work. The `network_access` setting lets
commands reach the network for dependency installation, source fetches, and
similar trusted-repository workflows; omit it when network isolation is desired.

## Maximum autonomy: unrestricted local execution

If the host, VM, or container is itself the trusted security boundary:

```bash
codex --sandbox danger-full-access --ask-for-approval never
```

The canonical bypass flag is:

```bash
codex --dangerously-bypass-approvals-and-sandbox
```

`codex --yolo` is an accepted convenience alias.

Persistent configuration:

```toml
sandbox_mode = "danger-full-access"
approval_policy = "never"
```

This combination removes both approval prompts and Codex's local sandbox. It
allows generated commands to read, modify, delete, and transmit anything the
operating-system user can access. Use it only in a disposable or otherwise
independently isolated environment; repository instructions and content fetched
from the web must still be treated as untrusted input.

## Interactive alternatives

```bash
# Automatically run trusted read operations; ask for other commands.
codex --sandbox workspace-write --ask-for-approval untrusted

# Let Codex decide when it needs to request an escalation.
codex --sandbox workspace-write --ask-for-approval on-request
```

`on-failure` is deprecated. Use `on-request` for interactive work or `never`
for non-interactive work.

## Managed environments

Organization policy, a managed permission profile, or the environment that
launched Codex can restrict or override local settings. If prompts continue
despite `approval_policy = "never"`, inspect the active permission profile and
managed configuration. A sandbox initialization failure can also prevent
commands from running; treat that as an environment setup problem rather than
weakening the sandbox automatically.
