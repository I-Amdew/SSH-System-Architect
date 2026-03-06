# SSH System Architect

SSH System Architect is an open-source monorepo for giving Codex a reusable remote-infrastructure workflow over OpenSSH through a local MCP server. It is designed to work from a bounded local workspace on macOS or Windows, classify what is shared versus host-specific, patch remote files safely, sync through Git, refresh local control-plane indexes, and report exactly what changed on each host, cluster, or server group.

The repository includes a concrete demo deployment, `demo_sharded_snake`, because the indexing model is easier to understand with a real topology than with abstract hosts. The same shared `snake_shard` service code is deployed to multiple hosts, while overlays and runtime files diverge per role and per host. Around that demo, the control plane models clusters, OpenSSH connectivity, existing repo discovery, VM adapter slots, and group operations so the same approach scales from a small lab to a larger self-hosted network.

## What is here

- `.codex/skills/remote-infra-orchestrator`: repo-scoped Codex skill for SSH/MCP workflows.
- `.codex/config.toml.example`: project-scoped config showing bounded local operation and MCP wiring.
- `.codex/rules/remote_infra.rules`: example shell policy that blocks or prompts on dangerous local patterns.
- `packages/remote-infra-types`: shared inventory, snapshot, and tool types.
- `packages/remote-infra-core`: inventory parsing, path classification, structured patching, cluster operations, repo discovery, diagnostics, transport abstractions, and index generation.
- `packages/remote-infra-mcp`: local MCP server exposing inventory, OpenSSH, Git, service, cluster, diagnostics, and index tools.
- `examples/demo_sharded_snake`: shared code, overlays, docs, and canned host snapshots.
- `lab/ssh_cluster`: optional Docker-based SSH lab for compact and 3-host topologies.
- `tests` and `evals`: unit, integration, optional lab e2e tests, and skill/workflow eval cases.

## Safety boundaries

- Local safety:
  the default config assumes `workspace-write`, allowlisted env forwarding, and no blanket root powers.
- Remote routine operations:
  normal edits, Git actions, service status, restarts, logs, cluster pulls, repo discovery, connectivity diagnosis, and index refreshes go through dedicated MCP tools.
- Remote destructive operations:
  `vm_create`, `vm_delete`, `wipe_host`, `destroy_data`, `rotate_deploy_key`, and `reimage_host` are separate tools and disabled by default.
- Secrets:
  inventory entries use `secret_ref` pointers only. The repo does not commit plaintext credentials.
- OpenSSH:
  the transport assumes the system `ssh` client on macOS and Windows and forwards only the minimum SSH-related environment.

See [docs/security_model.md](/Users/andrewturner/Projects/SSH System Architect/docs/security_model.md) for the full threat and trust boundary model.

## Quick start

### macOS

```bash
npm install
node examples/demo_sharded_snake/services/snake_shard/src/main.ts --config examples/demo_sharded_snake/deploy/overlays/shard_a/shard.config.json
node examples/demo_sharded_snake/services/snake_shard/src/main.ts --config examples/demo_sharded_snake/deploy/overlays/shard_b/shard.config.json
node examples/demo_sharded_snake/apps/web_gateway/src/main.ts --config examples/demo_sharded_snake/deploy/overlays/gateway/gateway.config.json
```

### Windows PowerShell

```powershell
npm install
node .\examples\demo_sharded_snake\services\snake_shard\src\main.ts --config .\examples\demo_sharded_snake\deploy\overlays\shard_a\shard.config.json
node .\examples\demo_sharded_snake\services\snake_shard\src\main.ts --config .\examples\demo_sharded_snake\deploy\overlays\shard_b\shard.config.json
node .\examples\demo_sharded_snake\apps\web_gateway\src\main.ts --config .\examples\demo_sharded_snake\deploy\overlays\gateway\gateway.config.json
```

Open `http://127.0.0.1:8080` after the three processes are running.

## Start the MCP server

### macOS

```bash
cp .codex/config.toml.example .codex/config.toml
REMOTE_INFRA_INVENTORY=lab/ssh_cluster/inventory.compact.yml node packages/remote-infra-mcp/src/main.ts --inventory lab/ssh_cluster/inventory.compact.yml --index-root .infra-index
```

### Windows PowerShell

```powershell
Copy-Item .codex/config.toml.example .codex/config.toml
$env:REMOTE_INFRA_INVENTORY = "lab/ssh_cluster/inventory.compact.yml"
node .\packages\remote-infra-mcp\src\main.ts --inventory .\lab\ssh_cluster\inventory.compact.yml --index-root .infra-index
```

## Configure inventory, clusters, and secret refs

- Start from [lab/ssh_cluster/inventory.compact.yml](/Users/andrewturner/Projects/SSH System Architect/lab/ssh_cluster/inventory.compact.yml) or [lab/ssh_cluster/inventory.three-host.yml](/Users/andrewturner/Projects/SSH System Architect/lab/ssh_cluster/inventory.three-host.yml).
- Set `hostname`, `port`, `ssh_user`, `repo_path`, `overlay_paths`, `runtime_paths`, `cluster_ids`, and `repo_discovery_paths` per host.
- Use `clusters` to define server groups for pull, restart, diagnostics, and topology reporting.
- Use `vm_adapters` to document where VM creation, image building, snapshotting, and deletion may be wired in later.
- Use the copyable templates under `lab/ssh_cluster/templates/` when adding a host, cluster, or VM adapter entry.
- Use `secret_ref` values such as:
  `keychain:ssh-system-architect/host_a`, `wincred:ssh-system-architect/host_b`, or `env:SSH_SYSTEM_ARCHITECT_HOST_A_PASSWORD`.
- Leave password auth disabled unless you are testing a lab or a legacy system.

## Cluster and network workflows

- `list_clusters` and `explain_cluster` describe grouped server intent.
- `report_network_health` and `diagnose_host_connectivity` tell you which part of the SSH network is reachable, degraded, or down.
- `discover_host_repos` identifies existing repos on a host so you can migrate them into the inventory instead of assuming a blank machine.
- `git_pull_group` and `restart_service_group` let Codex take routine actions across a cluster without dropping to ad-hoc shell loops.

## Regenerate indexes

```bash
node scripts/generate-expected-index.ts
node scripts/refresh-index.ts --inventory lab/ssh_cluster/inventory.compact.yml --output .infra-index
```

The expected committed snapshot lives under [examples/expected_index_output](/Users/andrewturner/Projects/SSH System Architect/examples/expected_index_output). Live refresh output belongs under `.infra-index/`.

## Run tests and evals

```bash
npm test
node scripts/run-evals.ts
```

Optional lab e2e tests stay separate:

```bash
RUN_LAB_E2E=1 node scripts/run-tests.ts e2e
```

## Move from demo to real hosts

- Read [docs/first_real_ssh_test.md](/Users/andrewturner/Projects/SSH System Architect/docs/first_real_ssh_test.md).
- Read [docs/migrating_existing_repos.md](/Users/andrewturner/Projects/SSH System Architect/docs/migrating_existing_repos.md).
- Read [docs/openssh_support.md](/Users/andrewturner/Projects/SSH System Architect/docs/openssh_support.md).
- Keep the shared repo cloned on each host, but map host roles through overlay paths and runtime directories.
- Use the MCP tools to read inventory first, explain the host or cluster, diagnose connectivity, discover repos, patch remote files, restart services, then refresh indexes.

## Extend the system

- Add a new role:
  [docs/adding_new_host_roles.md](/Users/andrewturner/Projects/SSH System Architect/docs/adding_new_host_roles.md)
- Add a VM adapter:
  [docs/adding_vm_adapters.md](/Users/andrewturner/Projects/SSH System Architect/docs/adding_vm_adapters.md)
- Migrate existing servers:
  [docs/migrating_existing_repos.md](/Users/andrewturner/Projects/SSH System Architect/docs/migrating_existing_repos.md)
- Understand OpenSSH assumptions:
  [docs/openssh_support.md](/Users/andrewturner/Projects/SSH System Architect/docs/openssh_support.md)
- Understand the package boundaries:
  [docs/architecture.md](/Users/andrewturner/Projects/SSH System Architect/docs/architecture.md)

## License

This repository is licensed under Apache License 2.0 for public redistribution and contribution. Apache-2.0 permits redistribution and forks; if you need revocable or non-redistributable terms, that is a different custom license model and not open source.
