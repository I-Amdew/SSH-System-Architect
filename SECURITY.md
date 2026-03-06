# Security policy

## Scope

SSH System Architect is designed to manage root-capable remote hosts through explicit inventory metadata and dedicated MCP tools. That makes safety boundaries and disclosure hygiene important.

## Reporting a vulnerability

- Do not open public issues with live credentials, private hostnames, internal network details, or machine-local paths.
- Report vulnerabilities privately to the maintainer channel you use for this project.
- Include the affected package or file path, reproduction steps, impact, and whether the issue touches local safety, SSH transport, secrets, privilege handling, destructive tools, or indexing.

## What counts as sensitive

- Private inventories or hostnames
- Deploy keys, passwords, or secret backend material
- Screenshots or logs containing internal network topology
- Machine-local absolute paths from contributor workstations

## Supported disclosure expectations

- Routine SSH, Git, service, and indexing workflows should remain non-destructive by default.
- Destructive tools should remain separated and confirmation-gated.
- Public examples must use placeholder values only.
- Root-capable host support must stay explicit per inventory entry through `privilege_mode` and `root_allowed`.
