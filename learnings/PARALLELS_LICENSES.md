# Parallels Desktop licence management over SSH

**Status:** active — verified 2026-09-10

Verified 2026-09-10: transferred a single-seat Parallels Desktop Pro subscription from an M4 Pro Mac to an M1 Max Mac using `prlsrvctl`. The destination ran Parallels Desktop 26.3.3 (57507). No Screen Sharing or activation-dialog automation was needed.

## The supported CLI

Parallels ships a licence-management CLI inside the application bundle:

```sh
PRLSRVCTL='/Applications/Parallels Desktop.app/Contents/MacOS/prlsrvctl'
"$PRLSRVCTL" --help
"$PRLSRVCTL" info --license
```

The installed help lists:

- `info --license`: inspect the actual installed licence.
- `deactivate-license`: deactivate the current licence.
- `install-license --key <key>`: install/activate a licence.
- `update-license`: update licence information.

Check the installed help before assuming commands are available on another version or edition. The successful transfer below did not require `sudo`.

## Transfer a single-seat licence

Keep the source and destination terminals clearly identified. Your viewing/SSH-client Mac can be a third machine; it is not necessarily either licence host.

### 1. Preflight on both hosts

Connect to each host using its own macOS account, then run:

```sh
hostname
whoami
PRLSRVCTL='/Applications/Parallels Desktop.app/Contents/MacOS/prlsrvctl'
"$PRLSRVCTL" info --license
```

Record the masked serial, status, edition and subscription dates. Confirm the source has the licence intended for transfer. If the destination already has an active different licence, decide how to handle that entitlement before replacing it; do not delete its preferences.

Have the **full activation key** available privately from your Parallels account or purchase record. A masked serial cannot activate a licence. Do not commit keys, hardware IDs or account credentials to this repository.

Before releasing the source seat, also confirm destination readiness:

- For Standard/Pro activation, ensure the destination is signed into the appropriate Parallels account. The account sign-in command is `prlsrvctl web-portal signin`; consult the documentation for your installed version for its required options and authentication flow. Sign-in was not exercised during this transfer, so this runbook does not claim a verified fresh-account login procedure. Keep account passwords out of shell history and logs.
- Ensure the destination has outbound access to Parallels account/licensing services, including through any firewall or proxy. Working inbound SSH is not proof of outbound licensing connectivity.
- Resolve account/network prerequisites before deactivating the source. If destination activation subsequently fails, the source seat has already been released; neither machine should be assumed active.

If the CLI reports it cannot connect to Parallels Service, try:

```sh
open -a 'Parallels Desktop'
sleep 5
"$PRLSRVCTL" info --license
```

This restored service access on the source in the verified transfer. Launching the app does not require interacting with its windows, but this is not a guarantee for every headless/login-session configuration. If service access still fails, stop and diagnose it rather than killing services or deleting files. Do not interrupt running VMs unnecessarily.

### 2. Deactivate on the source only

This disables licensed use on the source. Confirm the host and licence first, then:

```sh
"$PRLSRVCTL" deactivate-license
"$PRLSRVCTL" info --license
```

Observed success:

```text
The license has been successfully deactivated.
Searching for installed licenses...
No licenses installed.
```

Do not proceed on an unexplained failure. Avoid `--skip-network-errors` for a transfer where server-side release must be confirmed.

### 3. Activate on the destination only

In the destination's SSH shell, set `PRLSRVCTL` again. For the default macOS **zsh**, read the key without displaying it or putting its literal value into shell history:

```zsh
PRLSRVCTL='/Applications/Parallels Desktop.app/Contents/MacOS/prlsrvctl'
read -rs 'PARALLELS_KEY?Parallels activation key: '
printf '\n'
"$PRLSRVCTL" install-license --key "$PARALLELS_KEY"
unset PARALLELS_KEY
"$PRLSRVCTL" info --license
```

The CLI takes the key as a command-line argument, so it may briefly be visible to local process inspection. Do not use shell tracing (`set -x`) or paste the key into logs, tickets or PRs.

Observed success:

```text
The license has been successfully installed.
Searching for installed licenses...
    status="ACTIVE"
    serial="<masked transferred key>"
    edition="pro"
```

Check that the masked serial matches the transferred licence. Distinguish `main_period_ends_at` from `grace_period_ends_at`: `expiration` may reflect the grace-period end rather than the billing/subscription end.

### 4. Verify both ends

The completed transfer must show:

| Host | Expected result |
|------|-----------------|
| Source | `No licenses installed.` |
| Destination | `status="ACTIVE"` and the transferred masked serial |

If activation fails, retain the exact error without exposing the key. First recheck destination account sign-in and outbound licensing connectivity before diagnosing an invalid key or a licence-limit problem. Resolve remaining issues through the CLI's guidance or Parallels support. Do not repeatedly clear local files or assume the transfer succeeded. If abandoning the transfer, reactivation on the source is a separate explicit recovery action.

This procedure verifies **Desktop**, not Toolbox. Bundled Toolbox activation must be checked separately; do not infer it from Desktop's success.

## Lessons from the failed approaches

### Deleting preferences is not deactivation

Removing `License.*` values from `com.parallels.Parallels Desktop.plist`, deleting the Toolbox licence plist or restarting `cfprefsd` does **not** establish server-side deactivation.

In this incident, after those deletions, `prlsrvctl info --license` still reported the source licence as **ACTIVE** and the destination's previous licence as **EXPIRED**. Only the real `deactivate-license` / `install-license` sequence completed the transfer. Never report a cleared preference cache as a freed licence seat.

### Inspect CLI help before pursuing GUI workarounds

Looking only for binaries with “license” in their filenames missed `prlsrvctl`. AppleScript timed out, and enabling a Screen Sharing listener did not grant macOS permission to control the screen. An open TCP port 5900 is not proof that Screen Sharing is usable. None of these workarounds was necessary for licence management.

### SSH: an accepted public key is not completed authentication

The server can report `Server accepts key` / `Postponed publickey` after recognizing the public key, before the client signs anything. In this incident the private key was passphrase-protected and the agent visible to the automation had no identities. This was not a remote permissions problem or a failed signature verification.

Check on the **SSH client**, in the environment actually running the automation:

```sh
ssh-add -l
printf '%s\n' "$SSH_AUTH_SOCK"
```

Unlock the key interactively with `ssh-add` in that same agent context. `BatchMode=yes` prevents interactive passphrase prompts; it does not disable agent authentication. Loading a key into a different terminal's agent or onto the destination does not fix the client's agent. Never ask someone to paste their private-key passphrase into chat.

Prefer an existing protected key. If temporary access keys or debug SSH/Screen Sharing services were introduced during troubleshooting, remove that temporary access after verifying it is no longer needed, without disrupting other users' access.

### Copy/paste and macOS shell differences

- Interactive zsh may treat pasted `#` comments as commands unless `INTERACTIVE_COMMENTS` is enabled. Paste command-only blocks.
- Visual terminal wrapping is harmless; an actual newline after `>>` is a syntax error.
- macOS `cat` does not support GNU `cat -A`; use `cat -vet` to inspect line endings if needed.
- An authorized key needs its key type and base64 key on the same line; its optional comment is not part of the cryptographic key.
