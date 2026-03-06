# Security model

## Local boundaries

- Assume the local machine is workspace-bounded, not danger-full-access.
- Prefer local writes to docs, config examples, tests, scripts, and `.infra-index/`.
- Keep local operator state in ignored files such as `.codex/config.toml` and `*.local.yml`.
- Block or prompt on destructive local shell patterns through `.codex/rules/remote_infra.rules`.
- Forward only the minimum SSH and inventory environment to the MCP server.

## Remote boundaries

- Routine remote actions stay on the main path:
  file reads, structured patches, Git status/fetch/pull/push/clone, repo discovery, host bootstrap, service status, restarts, logs, diagnostics, topology summaries, and index refreshes.
- Destructive remote actions stay isolated:
  `vm_create`, `vm_delete`, `wipe_host`, `destroy_data`, `rotate_deploy_key`, and `reimage_host` are separate and disabled by default.
- Root-capable access is explicit per host:
  `privilege_mode` models `none`, `sudo`, or direct `root`; `root_allowed` states whether root-level operations are within policy for that host.
- Scope is explicit per host:
  `managed_scopes`, `cluster_ids`, `repo_discovery_paths`, and VM adapter assignments tell Codex what each machine is for.
- Network exploration is bounded:
  inventory-managed hosts and configured discovery roots define the intended operating surface.
- Deletion safety is explicit:
  `deletion_protected` should bias operators and automation away from wipe or reimage flows.

## Secret handling

- `secret_ref` values are pointers, not secrets.
- Supported adapter slots:
  `ssh-agent`, macOS keychain, Windows Credential Manager, and env fallback.
- Password auth is a legacy or lab fallback and stays disabled by default in examples.
- Deploy key generation and rotation are sensitive workflows and should not be buried inside routine sync tools.
- Public issues, commits, docs, and snapshots must not include live hostnames, private key material, or machine-local paths.

## Shared vs host-specific state

- Shared Git-tracked code should converge across hosts after sync.
- Overlay files are intentionally different by role or host.
- Runtime files are host-local state such as logs, pid files, sockets, caches, and mutable service data.
- Drift is an unintended host-local modification to shared source or tracked overlays.
