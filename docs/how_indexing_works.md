# How indexing works

The index is a local control-plane mirror of remote state. It is written under `.infra-index/` and is safe to regenerate.

For real systems, the preferred entrypoint is `inspect_system`. It gathers the system snapshot and writes the index in one MCP call.

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
2. Collect repo state, service state, and classified file snapshots for each host.
3. Collect whole-system diagnostics such as SSH reachability, repo reachability, health checks, and repo discovery.
4. Classify file paths into shared repo, overlay, runtime, and drift.
5. Render system summaries, host summaries, health summaries, discovery summaries, and tree indexes.
6. Keep exhaustive per-file docs off by default to avoid noisy output.

Use `examples/expected_index_output/` as the reference snapshot for the demo topology.
