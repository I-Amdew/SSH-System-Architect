# Workflow reference

Use this when the task spans more than one host or includes both Git state and service state.

1. Read inventory.
2. Explain host role, cluster intent, and overlay intent.
3. Check connectivity, repo state, and drift before editing.
4. Discover existing repos if the host is being adopted into the system.
5. Patch the smallest correct surface area.
6. Restart only the affected services or service groups.
7. Refresh indexes.
8. Report per host.

Default order for a patch-and-restart request:

- `list_hosts`
- `list_clusters`
- `read_inventory`
- `explain_host_role`
- `explain_cluster`
- `diagnose_host_connectivity`
- `report_repo_state`
- `read_remote_file`
- `apply_remote_patch`
- `restart_service`
- `refresh_indexes`
- final host-by-host report
