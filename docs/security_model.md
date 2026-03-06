# Security model

## Local boundaries

- Assume the local machine is not danger-full-access.
- Prefer writes to workspace files, docs, configs, tests, and `.infra-index/`.
- Block or prompt on destructive local shell patterns through `.codex/rules/remote_infra.rules`.
- Keep MCP env forwarding minimal:
  only inventory location, secret backend hints, and SSH-related variables.
- Treat local inventory edits, docs, and `.infra-index/` generation as the main local write path.

## Remote boundaries

- Routine remote actions:
  file reads, structured patches, Git status/fetch/pull/push/clone, service status, restart, logs, cluster pulls, repo discovery, network diagnostics, topology summaries, and index refreshes.
- Destructive remote actions:
  isolated into dedicated tools and disabled by default.
- Privilege handling:
  explicit per host through `privilege_mode` and `root_allowed`.
- Scope handling:
  explicit per host through `managed_scopes`, `cluster_ids`, and VM adapter assignments.
- Network boundary:
  inventory-managed hosts and configured repo discovery roots define the intended operating surface; do not wander the broader network with generic shell exploration.
- Deletion safety:
  `deletion_protected` is inventory metadata that should bias operators and automations away from wipe or reimage flows.

## Secret handling

- `secret_ref` values are pointers, not secrets.
- Supported adapter slots:
  `ssh-agent`, macOS keychain, Windows Credential Manager, and env fallback.
- Password auth:
  modeled for legacy/lab scenarios only and disabled by default in docs and config.
- Deploy keys:
  treat generation and rotation as explicit sensitive workflows; do not bury them inside normal repo sync tools.

## Shared vs host-specific state

- Shared Git-tracked code:
  should remain identical across hosts after sync.
- Overlay files:
  intentionally different by role or host.
- Runtime files:
  host-local state, logs, caches, pid files, or sockets.
- Drift:
  host-local modifications to shared source or tracked overlays that were not intended.
