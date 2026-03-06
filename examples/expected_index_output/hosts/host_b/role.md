# Role: host_b

Runs the right-half authoritative shard and is used to demonstrate host-local drift on a root-capable managed host.

## Managed scopes
- `shard`
- `repo-sync`
- `diagnostics`

## Overlays
- `examples/demo_sharded_snake/deploy/overlays/shard_b`

## Existing repos
- `/srv/ssh-system-architect` -> git@github.com:example/ssh-system-architect.git (primary deployment repo)

## Health checks
- `shard_b_http` -> http http://127.0.0.1:4102/health
