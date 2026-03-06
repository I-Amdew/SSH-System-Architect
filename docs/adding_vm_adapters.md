# Adding VM adapters

The repository intentionally keeps VM lifecycle actions separate from routine SSH workflows.

## Current state

- The MCP server exposes named destructive tool slots:
  `vm_create`, `vm_delete`, `wipe_host`, `destroy_data`, `rotate_deploy_key`, and `reimage_host`.
- They are disabled by default.
- Their existence is meant to keep high-risk actions auditable and distinct from routine edits or service restarts.

## Adding a real adapter later

1. Create a provider-specific module in `packages/remote-infra-core`.
2. Add a `vm_adapters` entry in inventory with `kind`, `scope`, `management_host_id`, image template, and capability flags.
3. Decide whether bootstrap images should create a root-capable admin account and record that with `grant_sudo_on_bootstrap`.
4. Require explicit provider config in inventory or a separate non-committed local config.
5. Keep destructive confirmation tokens separate from routine SSH tool inputs.
6. Return host IDs, provider instance IDs, exact actions taken, and which deploy key or image path was involved.
7. Regenerate indexes after provisioning so the topology remains current.

Do not collapse VM lifecycle actions into `run_remote_command`.
