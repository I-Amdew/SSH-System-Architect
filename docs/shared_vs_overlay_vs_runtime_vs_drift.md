# Shared vs overlay vs runtime vs drift

## Shared repo

Git-tracked source that should match across hosts after a healthy deploy.

Example:
`examples/demo_sharded_snake/services/snake_shard/src/main.ts`

## Overlay

Git-tracked files that intentionally differ by role or host.

Examples:
- `examples/demo_sharded_snake/deploy/overlays/gateway/gateway.config.json`
- `examples/demo_sharded_snake/deploy/overlays/shard_b/shard.config.json`

## Runtime

Host-local files created by services or operators. They are not shared source.

Examples:
- `examples/demo_sharded_snake/runtime/gateway/session.json`
- `examples/demo_sharded_snake/runtime/shard_b/last-step.json`

## Drift

Unintended host-local modifications to shared source or tracked overlays.

Example:
`host_b` intentionally modifies `examples/demo_sharded_snake/services/snake_shard/src/main.ts` in the canned snapshot.

The goal of the index is to show these categories clearly enough that Codex does not treat runtime noise as shared source changes.
