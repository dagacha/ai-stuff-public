# Note: "Pi" is the repo-local name used elsewhere in this repo for the same agent stack that OMP (Open My Pi) refers to. This document uses the OMP command/path names because it describes migration and sync from the source machine.

# OMP Configuration Migration & Tailscale Sync

**Status:** active — verified 2026-09-02

## 1. Migration Strategy (One-Time)

To migrate OMP from Computer A to Computer B:

1.  **Identify Agent Directory:** Run `omp config path` on Computer A to find your base agent directory (default `~/.omp/agent/`).
2.  **Copy Data:** Transfer the directory contents to the corresponding location on Computer B.
    *   **Include:** `config.yml`, `agent.db`, `models.yml`, `managed-skills/`.
    *   **Exclude/Handle Separately:** System-level credentials (SSH keys, system keyring integration, PAM setups) must be re-configured on Computer B to match the new machine's identity.
3.  **Sync Environment:** Ensure all `OMP_*` environment variables (e.g., `OMP_CODING_AGENT_DIR`, API keys) are set in Computer B's shell configuration (`.zshrc`, `.bashrc`).

## 2. Synchronization Strategy (Ongoing via Tailscale)

To keep Computer B's configuration synced with Computer A over Tailscale:

### Rsync over Tailscale
Use `rsync` for robust, incremental synchronization of the agent directory.

**Command (from Computer B):**

```bash
rsync -avzP user@computer-a-tailscale-ip:/home/user/.omp/agent/ /home/user/.omp/agent/
```

### Accessing Model Proxy over Tailscale
To ensure secrets (OAuth JWTs, API keys) stay local to the machine running the agent, **do not expose the proxy gateway over the network**.

Instead, follow these steps to replicate the gateway on Machine B:

1.  **Replicate Gateway Config:** Copy `~/.cli-proxy-api/` (or equivalent) from Machine A to Machine B.
2.  **Run Local Proxy:** Start `cli-proxy-api` on Machine B, bound to `127.0.0.1:8317`.
3.  **Use Localhost:** Agents on Machine B should point to `baseUrl: http://127.0.0.1:8317`.

This maintains the security boundary described in [configs/unified-model-gateway.md](../unified-model-gateway.md) §11.

### Related Documentation
- For connecting Droid/agents over Tailscale: see [learnings/droid.md](../../learnings/droid.md) § *"Local / Self-hosted Models (Direct Connection)"*.
- For cross-machine replication and proxying: see [configs/unified-model-gateway.md](../unified-model-gateway.md) §11.

## 3. Important Notes
*   **System Keyrings:** System-level secrets (like `IRONCLAW` PAM integration) are machine-bound and **cannot** be synchronized via file copying. They must be re-initialized on each machine.
*   **Restart Required:** OMP sessions cache some configuration at startup. Always restart the OMP process after syncing configuration changes.
*   **Automated Sync:** For regular synchronization, consider adding the `rsync` command to a systemd timer or cron job on Computer B.
*   **OAuth tokens do NOT copy cleanly (refresh-token rotation):** the `claude-*` / `codex-*` OAuth files under `~/.cli-proxy-api/` are refresh-rotated by the provider. Two machines sharing one copied token collide, and one side's copy gets revoked (Claude fails within ~a day; Codex is a ~10-day time bomb). After the rsync, re-login **each** OAuth provider on the new machine so it holds its own independent grant:
    ```bash
    # 1. STOP the gateway daemon first — the login flow cannot bind its callback
    #    port while the proxy is running (see unified-model-gateway.md Pitfall 9/13):
    systemctl --user stop cli-proxy-api          # macOS: launchctl unload ~/Library/LaunchAgents/com.cliproxyapi.server.plist
    # 2. headless box: -no-browser prints a URL; forward the callback port from a
    #    browser machine first:  ssh -L 54545:127.0.0.1:54545 <B-user>@<B-host>
    cli-proxy-api --config ~/.cli-proxy-api/config.yaml -claude-login -no-browser
    cli-proxy-api --config ~/.cli-proxy-api/config.yaml -codex-login  -no-browser
    #    (codex alternative with no tunnel: -codex-device-login, then open the
    #     printed URL on any device and enter the code)
    # 3. RESTART the daemon so it loads the new grant:
    systemctl --user start cli-proxy-api         # macOS: launchctl load  ~/Library/LaunchAgents/com.cliproxyapi.server.plist
    ```
    Re-login is one-time per machine and does **not** revoke the source machine's grant. Static `openai-compatibility` API-key entries (Fireworks / Z.AI / `sk-local`) copy fine with no re-login. Full details + the failure signature in `unified-model-gateway.md` **Pitfall 13**.
*   **Config-as-Code:** For the most robust solution, maintain your `~/.omp/agent/config.yml` in a version-controlled dotfiles repository.
