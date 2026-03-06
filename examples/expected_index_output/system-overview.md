# System Overview

- Repo: `ssh-system-architect`
- Git remote: `git@github.com:example/ssh-system-architect.git`
- Intended commit: `7d9e3aa`
- Topology mode: `optional 3-host mode`

## Hosts
- `host_a`: roles=gateway, shard_a, services=web_gateway, snake_shard_a
- `host_b`: roles=shard_b, services=snake_shard_b

## Shared roots
- `examples/demo_sharded_snake/apps/web_gateway`
- `examples/demo_sharded_snake/services/snake_shard`
- `examples/demo_sharded_snake/packages/shared_protocol`

## Runtime root hints
- `examples/demo_sharded_snake/runtime`

## Clusters
- `compact_demo`: Compact demo cluster -> host_a, host_b
- `shard_plane`: Shard plane -> host_a, host_b

## VM adapters
- `remote_libvirt`: libvirt (remote-host) enabled=false
- `local_qemu_image`: qemu (local) enabled=true
