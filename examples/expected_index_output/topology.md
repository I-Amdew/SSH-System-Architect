# Topology

This snapshot reflects the optional 3-host mode.

- `host_a`: gateway, shard_a | clusters=compact_demo, shard_plane | overlays=examples/demo_sharded_snake/deploy/overlays/gateway, examples/demo_sharded_snake/deploy/overlays/shard_a | runtime=examples/demo_sharded_snake/runtime/gateway, examples/demo_sharded_snake/runtime/shard_a
- `host_b`: shard_b | clusters=compact_demo, shard_plane | overlays=examples/demo_sharded_snake/deploy/overlays/shard_b | runtime=examples/demo_sharded_snake/runtime/shard_b

## Discovery roots
- `/srv`
- `/opt/services`
