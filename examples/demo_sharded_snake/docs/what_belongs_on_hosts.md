# What belongs on hosts

- Keep shared source in Git:
  gateway code, shard code, and shared protocol types.
- Keep overlays in Git when they describe deployment intent:
  service unit files, role configs, env templates, and reverse proxy snippets.
- Keep runtime state out of shared source:
  `last-step.json`, session snapshots, logs, pid files, caches, and host-generated journals.
- Treat host-local edits to shared source as drift:
  they should show up in `repo_status.md` and `drift.md`.
