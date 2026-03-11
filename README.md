# SSH System Architect

`SSH System Architect` is a Codex skill repo for understanding and operating whole SSH-backed systems through a project-scoped MCP server.

The skill package lives in `.codex/skills/ssh-system-architect`. The rest of the repo exists to make that skill real: a local MCP server, inventory/types/core packages, demo systems, docs, tests, and evals.

This repo keeps the repo-scoped skill under `.codex/skills` for compatibility with the current Codex desktop workflow in this workspace. Inside that folder, the package follows the standard skill anatomy: `SKILL.md`, `agents/openai.yaml`, and optional `references/`, `assets/`, and `LICENSE.txt`.

## Skill shape

The repo follows the same pattern as shipped Codex skills:

- `SKILL.md`: trigger language and core workflow
- `agents/openai.yaml`: UI metadata
- `references/`: load-on-demand workflow references
- `assets/`: icons and report template
- `LICENSE.txt`: skill-local license copy

## What it does

Use this skill when Codex needs to:

- inspect a multi-host SSH deployment before acting
- explain host roles, clusters, overlays, runtime paths, and drift
- patch remote files and sync Git state across hosts
- adopt existing repos already deployed on servers
- bootstrap new managed hosts from a Git remote
- refresh `.infra-index` and report exact host-by-host outcomes

## Repo contents

- `.codex/skills/ssh-system-architect`: repo-scoped skill package
- `packages/remote-infra-mcp`: local MCP server
- `packages/remote-infra-core`: inventory, OpenSSH transport, orchestration, indexing
- `packages/remote-infra-types`: shared types
- `examples/demo_sharded_snake`: gateway + split shard demo
- `examples/demo_bot_arena`: coordinator + four bot hosts demo
- `examples/expected_index_output`: committed sample index snapshot
- `lab/ssh_cluster`: optional OpenSSH lab

## Quick start

Requirements:

- Node.js 22+
- OpenSSH client in `PATH`

macOS / bash:

```bash
npm install
npm test
cp .codex/config.toml.example .codex/config.toml
node packages/remote-infra-mcp/src/main.ts --inventory lab/ssh_cluster/inventory.compact.yml --index-root .infra-index
```

Windows PowerShell:

```powershell
npm install
npm test
Copy-Item .codex/config.toml.example .codex/config.toml
node .\packages\remote-infra-mcp\src\main.ts --inventory .\lab\ssh_cluster\inventory.compact.yml --index-root .infra-index
```

## Normal flow

1. Start with `inspect_system`.
2. Narrow scope with `explain_host_role` or `explain_cluster`.
3. Use MCP file/Git/service tools instead of ad-hoc SSH shell.
4. Refresh indexes after changes.
5. Report changes by host.

## Validation

```bash
npm test
node scripts/run-evals.ts
```

Optional real SSH lab:

```bash
RUN_LAB_E2E=1 node scripts/run-tests.ts e2e
```

## Docs

- [docs/architecture.md](docs/architecture.md)
- [docs/security_model.md](docs/security_model.md)
- [docs/how_indexing_works.md](docs/how_indexing_works.md)
- [docs/first_real_ssh_test.md](docs/first_real_ssh_test.md)

## License

Apache-2.0
