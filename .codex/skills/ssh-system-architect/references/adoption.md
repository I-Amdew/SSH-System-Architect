# Adoption reference

Use this when Codex is onboarding hosts that already exist.

1. Import or mirror the operator's OpenSSH config first:
   - `import_ssh_config_hosts`
   - set `SSH_CONFIG_FILE` when the config is not in the default location
2. Read inventory and explain host roles before touching anything.
3. Run `inspect_system` or, at minimum:
   - `diagnose_host_connectivity`
   - `discover_host_repos`
   - `report_repo_state`
4. Record which repos match inventory intent and which do not.
5. Classify differences:
   - shared repo rollout
   - role-specific overlay
   - runtime-only files
   - tracked drift
6. Update inventory only after the observed state is understood.
7. Refresh `.infra-index` after each adoption step.

Watch for local-lab artifacts:

- Shared filesystems can make repo discovery look broader than a real fleet.
- Hosts without `systemd` should be judged by health checks and explicit process launch paths instead of `systemctl`.
