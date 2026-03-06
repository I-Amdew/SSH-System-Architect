# Role: host_a

Runs the browser gateway and the left-half authoritative shard in compact mode on a root-capable managed host.

## Managed scopes
- `gateway`
- `shard`
- `repo-sync`
- `diagnostics`

## Overlays
- `examples/demo_sharded_snake/deploy/overlays/gateway`
- `examples/demo_sharded_snake/deploy/overlays/shard_a`

## Existing repos
- `/srv/ssh-system-architect` -> git@github.com:example/ssh-system-architect.git (primary deployment repo)

## Health checks
- `gateway_http` -> http http://127.0.0.1:8080/health
- `shard_a_http` -> http http://127.0.0.1:4101/health
