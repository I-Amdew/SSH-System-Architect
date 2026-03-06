# Migrating existing repos

This repo is intended to adopt existing SSH-managed machines, not just greenfield hosts.

## Goal

Take a server that already has one or more repos on it, discover what is there, classify what belongs in inventory, and bring it under the indexed control plane without leaking secrets or flattening host-specific state into shared source.

## Workflow

1. Add the host to inventory with:
   `ssh_implementation`, `ssh_options`, `cluster_ids`, `repo_discovery_paths`, `managed_scopes`, and any known `existing_repos`.
2. Run `diagnose_host_connectivity`.
3. Run `discover_host_repos`.
4. Compare discovered repos against `existing_repos` and the intended shared repo.
5. Decide which repo should become the managed deployment repo and which repos should remain adjacent services.
6. Refresh indexes.

## What to record

- deployment repo path,
- Git remote,
- branch,
- role of the repo on that host,
- overlay paths,
- runtime-only paths,
- any pre-existing drift that should be preserved or cleaned up.

## What not to do

- Do not treat every file on a machine as shared source.
- Do not assume runtime directories belong in Git.
- Do not overwrite unknown repos before discovery and indexing are complete.
