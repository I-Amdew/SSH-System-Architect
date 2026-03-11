# Repo bootstrap reference

Use this when the user wants a new managed system rather than an edit to an existing one.

Local-first order:

1. Create or update the repo structure in the workspace.
2. Commit shared code, protocol/types, overlays, inventory, and docs.
3. Mark runtime directories as ignored and document them as host-only state.
4. Add or update inventory entries:
   - host identity and auth path
   - repo path
   - role labels
   - overlay paths
   - runtime paths
   - service definitions and health checks
5. Push the repo or otherwise make the Git remote reachable from the managed hosts.
6. Use `bootstrap_host` to clone or prepare the repo path remotely.
7. Use Git and file tools for the smallest required rollout.
8. Run `inspect_system` and refresh `.infra-index`.

Rules:

- Do not create secrets in committed files.
- Do not assume demo-specific folder names.
- Keep shared code, overlays, and runtime output visibly separate.
- If the user asks for new VM-backed hosts, keep VM lifecycle steps separate from routine file edits and service restarts.
