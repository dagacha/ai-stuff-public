## Linux Master Key Access (No Password Required)

   ---

### How It Works

   On Linux, IronClaw uses the **Secret Service API** via D-Bus, which connects to:
   - **GNOME Keyring** (default on GNOME, Ubuntu, Fedora, etc.)
   - **KWallet** (default on KDE)

   ---

### Why No Password Prompt?

   ```
   ┌─────────────────────────────────────────────────────────────────────────────┐
   │  LINUX KEYRING SESSION FLOW                                                   │
   ├─────────────────────────────────────────────────────────────────────────────┤
   │                                                                              │
   │  1. USER LOGS INTO DESKTOP                                                   │
   │     │                                                                        │
   │     ▼                                                                        │
   │  ┌─────────────────────────────────────────────────────────────────────┐    │
   │  │  PAM (Pluggable Auth Module)                                        │    │
   │  │                                                                      │    │
   │  │  pam_gnome_keyring.so / pam_kwallet.so                              │    │
   │  │                                                                      │    │
   │  │  Your login password ──► Unlocks the keyring automatically         │    │
   │  └─────────────────────────────────────────────────────────────────────┘    │
   │     │                                                                        │
   │     ▼                                                                        │
   │  2. KEYRING IS NOW UNLOCKED IN YOUR SESSION                                  │
   │     │                                                                        │
   │     │  ┌─────────────────────────────────────────────────────────────┐      │
   │     │  │  "login" keyring (default, unlocked)                        │      │
   │     │  │                                                              │      │
   │     │  │  • Browser saved passwords                                   │      │
   │     │  │  • WiFi passwords                                            │      │
   │     │  │  • SSH keys (if stored)                                      │      │
   │     │  │  • IronClaw master key ──────────────────────────────────────┼──┐   │
   │     │  └─────────────────────────────────────────────────────────────┘  │   │
   │     │                                                                   │   │
   │     ▼                                                                   │   │
   │  3. IRONCLAW RUNS                                                        │   │
   │     │                                                                    │   │
   │     ▼                                                                    │   │
   │  ┌─────────────────────────────────────────────────────────────────────┐ │   │
   │  │  IronClaw calls get_master_key()                                    │ │   │
   │  │                                                                      │ │   │
   │  │  secret-service crate ──► D-Bus ──► GNOME Keyring                  │ │   │
   │  │                                                                      │ │   │
   │  │  Keyring is already unlocked ──► Returns key immediately ◄─────────┼─┘   │
   │  │  (no password needed)                                                │     │
   │  └─────────────────────────────────────────────────────────────────────┘     │
   │                                                                              │
   └─────────────────────────────────────────────────────────────────────────────┘
   ```

   ---

### The Secret: PAM Integration

   When you log into your Linux desktop, **PAM** (Pluggable Authentication Modules) automatically unlocks your default keyring using your
   login password:

   ```
   /etc/pam.d/login  (or similar)
   ────────────────────────────────────
   auth    optional    pam_gnome_keyring.so
   session optional    pam_gnome_keyring.so auto_start
   ```

   This means:
   - Your **login password** = your **keyring password** (by default)
   - Keyring unlocks **automatically** at desktop login
   - Applications can access secrets **without prompting**

   ---

### IronClaw's Keyring Lookup

   ```rust
   // Linux implementation (simplified)
   pub async fn get_master_key() -> Result<Vec<u8>, SecretError> {
       // Connect to Secret Service via D-Bus
       let ss = SecretService::connect(EncryptionType::Dh).await?;

       // Get the "default" collection (usually "login" keyring)
       let collection = ss.get_default_collection().await?;

       // Auto-unlock if locked (uses session auth, no password prompt)
       if collection.is_locked().await? {
           collection.unlock().await?;  // Succeeds if PAM unlocked it
       }

       // Search for IronClaw's master key
       let search_attrs = vec![
           ("service", "ironclaw"),
           ("account", "master_key"),
       ];

       let items = collection.search_items(search_attrs).await?;
       let item = items.first()?;

       // Retrieve the secret (hex-encoded key)
       let secret = item.get_secret().await?;
       hex_to_bytes(&secret)
   }
   ```

   ---

### Where the Key Is Stored

   ```
   ~/.local/share/keyrings/
   ├── login.keyring      # Default, unlocked at login
   ├── user.keyring       # May require separate password
   └── ...
   ```

   IronClaw stores in the **"default" collection**, which is typically the `login` keyring.

   ---

### Verify With CLI

   ```bash
# List what's in your keyring
   secret-tool search --all service ironclaw

# Or using gnome-keyring CLI
   gnome-keyring-daemon --start

# View all secrets (requires keyring password if not unlocked)
   secret-tool search --all
   ```

   ---

### Security Implications

   | Aspect | Behavior |
   |--------|----------|
   | **Physical access** | Keyring is encrypted on disk; requires your login password to unlock |
   | **While logged in** | Any app can read secrets from unlocked keyring (this is by design) |
   | **SSH/Headless** | Keyring is locked; must use `SECRETS_MASTER_KEY` env var instead |
   | **After logout** | Keyring is locked again; requires password to unlock |

   ---

### Headless/Server Scenario

   If you run IronClaw on a server (no desktop session), the keyring won't be unlocked:

   ```bash
# Option 1: Set env var
   export SECRETS_MASTER_KEY=$(openssl rand -hex 32)
   echo "SECRETS_MASTER_KEY=$SECRETS_MASTER_KEY" >> ~/.ironclaw/.env

# Option 2: Use secret-tool with explicit unlock (requires password)
   echo "your-keyring-password" | secret-tool store --label="IronClaw Master Key" service ironclaw account master_key
   ```

   ---

### Summary

   You don't enter a password because:

   1. **PAM** unlocked your keyring when you logged into your desktop
   2. The keyring stays unlocked for your entire session
   3. IronClaw just reads from the already-unlocked keyring via D-Bus

   This is the same mechanism that allows Chrome, Firefox, and other apps to access saved passwords without prompting you every time.
