# Contributing

## Before you open a PR

- Do not commit secrets, deploy keys, private inventories, or machine-local paths.
- Keep operator-specific config in ignored files such as `.codex/config.toml` and `*.local.yml`.
- Preserve the shared-vs-overlay-vs-runtime-vs-drift model. Do not flatten host-local state into shared source.
- Keep destructive remote workflows separated from routine SSH, Git, service, and indexing workflows.

## Development loop

1. Run `npm test`.
2. Run `node scripts/run-evals.ts`.
3. Regenerate the demo snapshot when inventory or indexing output changes:
   `node scripts/generate-expected-index.ts`
4. If you changed docs or example inventories, re-read `README.md` and `docs/security_model.md` to make sure the public story still matches the code.

## Pull request expectations

- Explain the host or cluster behavior that changed.
- Call out whether the change affects shared repo content, overlays, runtime paths, drift detection, or destructive tooling.
- Include test coverage for new MCP tools, orchestration behavior, inventory parsing, or indexing logic.
- Keep provider-specific adapters explicit and auditable; avoid hiding infrastructure behavior behind generic shell wrappers.

## Design rules

- Prefer explicit inventory metadata over magic inference.
- Prefer MCP tools over generic remote shell when the behavior is routine and known.
- Treat root-capable access as normal for managed hosts, but keep destructive operations confirmation-gated.
- Keep the repo publishable: no personal identifiers, no local absolute paths, and no environment-specific secrets.
