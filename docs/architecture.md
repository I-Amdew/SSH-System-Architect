# Architecture

SSH System Architect has three runtime layers:

1. Local control plane:
   Codex runs in a bounded workspace, loads the inventory, and talks to the local MCP server.
2. MCP orchestration layer:
   `packages/remote-infra-mcp` exposes inventory, remote file, Git, service, cluster, repo discovery, diagnostics, and index tools over stdio.
3. Transport and indexing layer:
   `packages/remote-infra-core` uses either `SshTransport` or `MockTransport` to gather host state and render `.infra-index`.

## Package responsibilities

- `packages/remote-infra-types`:
  inventory schema, clusters, VM adapters, snapshots, service definitions, and structured patch operations.
- `packages/remote-infra-core`:
  simple YAML parsing, inventory validation, path classification, structured patch application, cluster operations, repo discovery, transport interfaces, host snapshots, and markdown index generation.
- `packages/remote-infra-mcp`:
  MCP protocol framing, tool schemas, and tool-to-orchestrator dispatch.

## OpenSSH transport assumptions

- The system transport uses the machine's `ssh` client.
- On macOS and Windows, that means OpenSSH as installed by the OS or the user's toolchain.
- Per-host `ssh_options` are inventory data, not hardcoded shell aliases.
- Public example inventories assume remote hosts are root-capable through `sudo` or direct root SSH, but the capability is still modeled explicitly with `privilege_mode` and `root_allowed`.

## Demo flow

`demo_sharded_snake` uses one shared gateway app and one shared shard service codebase. Overlay config makes each host different:

- `gateway` overlay:
  binds the browser gateway and points it at both shards.
- `shard_a` overlay:
  makes the shared service authoritative for columns `0-9`.
- `shard_b` overlay:
  makes the same service authoritative for columns `10-19`.

The gateway keeps the session clock and emits handoff events when the snake crosses the vertical boundary between shards.

## Index flow

1. Read inventory.
2. Collect host snapshots from the transport.
3. Classify each file as `shared_repo`, `overlay`, `runtime`, or `drift`.
4. Write markdown summaries to `.infra-index/`.
5. Report host-by-host outcomes back to Codex or the operator.

## Scale-out intent

The demo is intentionally small, but the inventory model now carries:

- clusters for grouped actions,
- repo discovery roots for adopting existing machines,
- VM adapter slots for hypervisors or image builders,
- bootstrap-ready host metadata for first-time setup,
- managed scopes that tell Codex what a host is allowed to touch.
