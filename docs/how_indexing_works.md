# How indexing works

The index is a local control-plane mirror of remote state. It is written under `.infra-index/` and is safe to regenerate.

## Required outputs

- `system-overview.md`
- `topology.md`
- `network-health.md`
- `shared_repo/index.md`
- `shared_repo/.../index.md`
- `hosts/<host>/host.md`
- `hosts/<host>/role.md`
- `hosts/<host>/repo_status.md`
- `hosts/<host>/overlay.md`
- `hosts/<host>/runtime.md`
- `hosts/<host>/drift.md`
- `hosts/<host>/tree/.../index.md`

## Generation sequence

1. Read inventory and shared roots.
2. Collect a snapshot for each host.
3. Classify file paths.
4. Render host summaries and tree indexes.
5. Keep exhaustive per-file docs off by default to avoid noisy output.

Use `examples/expected_index_output/` as the reference snapshot for the demo topology.
