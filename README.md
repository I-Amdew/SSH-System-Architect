# SSH System Architect

SSH System Architect is a public Apache-2.0 monorepo for running Codex-driven SSH infrastructure workflows through a local MCP server. It is built for bounded local work on macOS or Windows while still managing root-capable remote Linux hosts, shared deployment repos, host-specific overlays, runtime state, drift detection, clustered actions, and inventory-backed indexing.

The repository includes one concrete demo, `examples/demo_sharded_snake`, because the indexing model is much easier to understand with a real topology than with abstract hosts. The same shared `snake_shard` service code is deployed to multiple hosts, while overlays and runtime files diverge per role and per host.

## Public distribution and privacy

- No plaintext secrets are committed.
- No machine-local absolute paths are required in repo files.
- Example hostnames, remotes, and secret references are placeholders.
- Local operator config belongs in ignored files such as `.codex/config.toml` and `*.local.yml`.
- Live `.infra-index/` output is ignored; the committed demo snapshot lives under `examples/expected_index_output/`.

## What is here

- `.codex/skills/SSH System Architect`: repo-scoped Codex skill for SSH/MCP workflows.
- `.codex/config.toml.example`: project-scoped Codex config with bounded local behavior.
- `.codex/rules/remote_infra.rules`: example shell guardrails for local usage.
- `packages/remote-infra-types`: shared inventory, transport, and snapshot types.
- `packages/remote-infra-core`: inventory parsing, classification, repo discovery, orchestration, transport, and index generation.
- `packages/remote-infra-mcp`: local MCP server exposing SSH, Git, service, indexing, topology, bootstrap, and diagnostics tools.
- `examples/demo_sharded_snake`: the demo app and deployment overlays.
- `examples/expected_index_output`: committed reference snapshot for the demo.
- `lab/ssh_cluster`: optional Docker-based SSH lab.
- `tests` and `evals`: unit, integration, optional lab e2e coverage, and skill/workflow evals.

## Remote privilege model

- Local work stays bounded to the workspace unless you explicitly approve more.
- Remote hosts are modeled as root-capable per host, typically through passwordless `sudo` or direct root SSH.
- Routine remote actions use dedicated MCP tools instead of ad-hoc shell.
- Destructive remote actions remain separate, disabled by default, and confirmation-gated.
- `managed_scopes`, `cluster_ids`, and `deletion_protected` constrain how Codex should reason about each host.

Read the [security model](docs/security_model.md) for the full trust-boundary and risk split.

## Quick start

### Prerequisites

- Node.js 22 or newer
- OpenSSH client available in `PATH`
- Docker Desktop or Docker Engine if you want the included lab

### macOS

```bash
npm install
npm test
cp .codex/config.toml.example .codex/config.toml
REMOTE_INFRA_INVENTORY=lab/ssh_cluster/inventory.compact.yml node packages/remote-infra-mcp/src/main.ts --inventory lab/ssh_cluster/inventory.compact.yml --index-root .infra-index
```

### Windows PowerShell

```powershell
npm install
npm test
Copy-Item .codex/config.toml.example .codex/config.toml
$env:REMOTE_INFRA_INVENTORY = "lab/ssh_cluster/inventory.compact.yml"
node .\packages\remote-infra-mcp\src\main.ts --inventory .\lab\ssh_cluster\inventory.compact.yml --index-root .infra-index
```

## Demo app

Run the demo components locally:

### macOS

```bash
node examples/demo_sharded_snake/services/snake_shard/src/main.ts --config examples/demo_sharded_snake/deploy/overlays/shard_a/shard.config.json
node examples/demo_sharded_snake/services/snake_shard/src/main.ts --config examples/demo_sharded_snake/deploy/overlays/shard_b/shard.config.json
node examples/demo_sharded_snake/apps/web_gateway/src/main.ts --config examples/demo_sharded_snake/deploy/overlays/gateway/gateway.config.json
```

### Windows PowerShell

```powershell
node .\examples\demo_sharded_snake\services\snake_shard\src\main.ts --config .\examples\demo_sharded_snake\deploy\overlays\shard_a\shard.config.json
node .\examples\demo_sharded_snake\services\snake_shard\src\main.ts --config .\examples\demo_sharded_snake\deploy\overlays\shard_b\shard.config.json
node .\examples\demo_sharded_snake\apps\web_gateway\src\main.ts --config .\examples\demo_sharded_snake\deploy\overlays\gateway\gateway.config.json
```

Then open `http://127.0.0.1:8080`.

## Core MCP workflows

- `describe_control_plane`: explain what the control plane can do and how it is scoped.
- `list_hosts`, `list_clusters`, `explain_host_role`, `explain_cluster`: understand topology before changing anything.
- `diagnose_host_connectivity` and `report_network_health`: confirm reachability and health.
- `discover_host_repos`: inventory existing repos on managed hosts.
- `bootstrap_host`: prepare a mutable host by ensuring repo/runtime paths exist and cloning the managed repo if missing.
- `git_pull_group` and `restart_service_group`: take routine clustered actions without shell loops.
- `refresh_indexes`: regenerate `.infra-index` after changes.

## Configure inventory, clusters, and secret refs

- Start from `lab/ssh_cluster/inventory.compact.yml` or `lab/ssh_cluster/inventory.three-host.yml`.
- Copy the inventory to an ignored local file such as `real-hosts.local.yml` before editing real targets.
- Set `hostname`, `port`, `ssh_user`, `privilege_mode`, `root_allowed`, `repo_path`, `overlay_paths`, `runtime_paths`, `cluster_ids`, and `repo_discovery_paths` per host.
- Use `clusters` to define server groups for pull, restart, diagnostics, and topology reporting.
- Use `vm_adapters` to record hypervisors, image builders, and future provider integrations.
- Use the templates under `lab/ssh_cluster/templates/` when adding new hosts or VM adapters.
- Use `secret_ref` values such as `keychain:ssh-system-architect/host_a`, `wincred:ssh-system-architect/host_b`, or `env:SSH_SYSTEM_ARCHITECT_HOST_A_PASSWORD`.
- Keep password auth disabled except for lab or legacy use.

## Indexing

Regenerate the committed demo snapshot or a live local index:

```bash
node scripts/generate-expected-index.ts
node scripts/refresh-index.ts --inventory lab/ssh_cluster/inventory.compact.yml --output .infra-index
```

Read [how indexing works](docs/how_indexing_works.md) and [shared vs overlay vs runtime vs drift](docs/shared_vs_overlay_vs_runtime_vs_drift.md) before changing classification logic.

## Run tests and evals

```bash
npm test
node scripts/run-evals.ts
```

Optional lab e2e coverage:

```bash
RUN_LAB_E2E=1 node scripts/run-tests.ts e2e
```

## Try the SSH lab

Add your own public key to the placeholder `authorized_keys` files, then start the containers:

### macOS

```bash
./lab/ssh_cluster/scripts/up.sh
```

### Windows PowerShell

```powershell
.\lab\ssh_cluster\scripts\up.ps1
```

The lab intentionally simulates root-capable managed hosts while keeping destructive VM lifecycle actions outside the routine path.

## Move to real hosts

- Read [first_real_ssh_test.md](docs/first_real_ssh_test.md).
- Read [migrating_existing_repos.md](docs/migrating_existing_repos.md).
- Read [openssh_support.md](docs/openssh_support.md).
- Keep the shared repo cloned on each host, but map host roles through overlay paths and runtime directories.
- Use MCP to inspect first, patch second, restart third, and refresh indexes last.

## Extend the system

- Add a new role: [adding_new_host_roles.md](docs/adding_new_host_roles.md)
- Add a VM adapter: [adding_vm_adapters.md](docs/adding_vm_adapters.md)
- Review package boundaries: [architecture.md](docs/architecture.md)
- Read contribution rules: [CONTRIBUTING.md](CONTRIBUTING.md)
- Read security reporting guidance: [SECURITY.md](SECURITY.md)

## License

This repository is licensed under Apache License 2.0. Apache-2.0 permits public redistribution, modification, contribution, and commercial use.
