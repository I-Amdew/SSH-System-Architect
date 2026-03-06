# Demo topology

## Compact 2-host mode

- `host_a`:
  gateway + `shard_a`
- `host_b`:
  `shard_b`

This is the default example because it makes the indexing model obvious:

- the gateway role and one shard role can coexist on one host,
- the second shard host can carry intentional drift without changing the gateway host,
- runtime files are easy to contrast against shared Git-tracked code.

## Optional 3-host mode

- `gateway_host`
- `shard_a_host`
- `shard_b_host`

Use [lab/ssh_cluster/inventory.three-host.yml](/Users/andrewturner/Projects/SSH System Architect/lab/ssh_cluster/inventory.three-host.yml) when you want a cleaner one-role-per-host deployment.

## Boundary handoff

`demo_sharded_snake` divides the board at `boundaryX = 10`.

- `shard_a` owns columns `0-9`
- `shard_b` owns columns `10-19`

When the head crosses the boundary, the active shard returns a handoff response and the gateway records the transfer in runtime state and in the browser UI.
