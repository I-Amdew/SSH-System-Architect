---
name: "ssh-system-architect"
description: Coordinate remote infrastructure work over OpenSSH through a project-scoped MCP server. Use when Codex needs to inspect or change multiple remote hosts, explain host roles or clusters, compare shared Git-tracked code versus overlays versus runtime files, patch remote services, sync Git state across hosts, adopt existing repos on servers, bootstrap new managed hosts, diagnose connectivity or partial network failures, refresh infrastructure indexes, or report host-by-host drift and deployment outcomes. Do not use for generic local coding tasks that do not involve remote hosts, inventory, clusters, or SSH-backed service workflows.
---

# SSH System Architect

This skill turns Codex into an SSH infrastructure operator with a bounded local control plane. Use it for multi-host remote work where Codex must understand inventory, topology, repo boundaries, overlays, runtime paths, drift, service ownership, and cluster-wide operational intent.

Read the inventory first. Do not edit or restart anything until the target hosts, role labels, managed scopes, overlays, runtime paths, service managers, and intended topology are clear.

## Core workflow

1. Start with `inspect_system` whenever the user needs Codex to understand a real deployment, cluster, or mixed shared/host-specific system.
2. Read inventory and role metadata with MCP.
3. Explain the target host roles or clusters before editing.
4. If the system is being adopted rather than created fresh, discover existing repos and compare inventory intent against what is already deployed.
5. Classify touched paths as `shared_repo`, `overlay`, `runtime`, or `drift`.
6. Prefer targeted MCP tools over raw remote shell, especially for cluster-wide repo sync, repo discovery, diagnostics, indexing, and first-time setup.
7. Use `describe_control_plane` when the user asks what the system can do, and `bootstrap_host` when a managed host needs first-time setup.
8. Refresh or regenerate indexes after changes.
9. Report results by host.

## Tool preference

- Prefer `inspect_system` first when the goal is whole-system understanding, drift review, production diagnosis, or deciding what to touch.
- Prefer `describe_control_plane`, `list_hosts`, `list_clusters`, `read_inventory`, `explain_host_role`, `explain_cluster`, `report_repo_state`, `compare_host_state`, `diagnose_host_connectivity`, `discover_host_repos`, `report_network_health`, and `generate_topology_summary` before making changes.
- Prefer `read_remote_file`, `write_remote_file`, and `apply_remote_patch` for file changes.
- Prefer `git_status`, `git_fetch`, `git_pull`, `git_pull_group`, `git_push`, and `git_clone` for repo sync.
- Prefer `service_status`, `restart_service`, `restart_service_group`, and `tail_service_logs` for service operations.
- Prefer `bootstrap_host` for managed-host preparation instead of ad-hoc shell sequences.
- Use `run_remote_command` only when no dedicated MCP tool fits and the command is still routine and constrained.
- Do not open direct local `ssh` sessions when the MCP server is available; that path causes unnecessary permission prompts and weakens the system model.
- Do not assume the demo repo layout. For unfamiliar systems, derive the shared roots, overlays, runtime paths, and service boundaries from inventory plus discovery before editing.

## Reporting requirements

Always state:

- which hosts were targeted,
- which files changed on each host,
- which files were shared source vs overlay vs runtime-only vs drift,
- which services were restarted,
- which hosts are clean, dirty, ahead, or behind,
- which hosts or clusters were unreachable or degraded,
- which commit is intended versus deployed on each host.

## Repo creation and adoption

- For a new managed system, create or update the repo in the local workspace first, commit the shared structure, add inventory entries, and only then use `bootstrap_host` plus Git tools to place it on hosts.
- For an existing unmanaged system, start with `import_ssh_config_hosts` if the operator already has OpenSSH or VS Code Remote SSH entries, then use `discover_host_repos` and `inspect_system` before writing inventory changes.
- When the code differs between hosts, treat that as a system fact to be measured first. Identify whether the difference is intentional overlay data, runtime-only output, or tracked drift before proposing a rollout.
- When a host does not use `systemd`, rely on health checks, log hints, and explicit launch tooling rather than pretending normal service-manager tools apply.

## Safety requirements

- Do not assume unrestricted local shell access.
- Do not use local destructive shell patterns when MCP tools exist.
- Do not bundle destructive remote actions into normal edit or restart workflows.
- Treat VM lifecycle, deploy key rotation, and host wipes as separate high-risk workflows even when root-capable servers exist.
- Only consider `vm_create`, `vm_delete`, `wipe_host`, `destroy_data`, `rotate_deploy_key`, or `reimage_host` when that exact destructive path is explicitly requested and the dedicated tool is enabled.

## References

- Read `references/workflow.md` when planning a multi-host edit or restart.
- Read `references/classification.md` when deciding whether a path is shared, overlay, runtime, or drift.
- Read `references/adoption.md` when onboarding existing SSH hosts or importing OpenSSH config.
- Read `references/repo-bootstrap.md` when the user wants Codex to stand up a new managed repo or add a new role.
- Use `assets/host-change-report-template.md` as the output shape for host-by-host summaries when the user wants a concise operational report.
