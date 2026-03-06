# OpenSSH support

The transport model in this repository assumes OpenSSH.

## Local platforms

- macOS:
  use the system `ssh` client and keychain-backed identities when available.
- Windows:
  use the built-in OpenSSH client or a compatible installation in `PATH`, plus Windows Credential Manager or agent-backed keys.

## Inventory fields

- `ssh_implementation`:
  currently `openssh`.
- `ssh_options`:
  host-specific options such as `-o BatchMode=yes`.
- `secret_ref`:
  pointer to the chosen auth source.
- `privilege_mode` and `root_allowed`:
  the per-host declaration of whether Codex is connecting as an unprivileged user, a `sudo`-capable admin, or direct root.

## Current scope

- Primary path:
  SSH key, agent, keychain, or Windows credential-backed workflows, usually paired with root-capable remote access.
- Fallback path:
  password auth is modeled in inventory for lab or legacy use, but is not the default operational path.

## Why this matters

The Codex desktop app does not become a full remote IDE by itself. This project bridges that gap by giving Codex a local MCP control plane that can still understand remote repos, remote services, root-capable host setup, cluster state, and OpenSSH connectivity without requiring VS Code Remote SSH.
