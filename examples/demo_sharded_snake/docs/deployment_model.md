# demo_sharded_snake deployment model

- Shared Git-tracked code:
  `apps/web_gateway`, `services/snake_shard`, and `packages/shared_protocol`.
- Role-specific overlays:
  `deploy/overlays/gateway`, `deploy/overlays/shard_a`, and `deploy/overlays/shard_b`.
- Runtime-only files:
  `runtime/gateway`, `runtime/shard_a`, and `runtime/shard_b`.

The shared `snake_shard` service code is reused by both authoritative shard roles. The only role change is the overlay config that assigns owned columns and handoff target.
