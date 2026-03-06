# First real SSH test

Use this path when you want the smallest real-world validation with two Linux hosts over OpenSSH.

## 1. Prepare two hosts

- Install OpenSSH server, Git, Node.js 22+, and systemd.
- Ensure your local macOS or Windows machine has a working OpenSSH client in `PATH`.
- Use either direct root SSH or a root-capable admin user with passwordless `sudo`.
- Decide the managed `repo_path`, runtime directories, and role overlays for each host before connecting Codex.

## 2. Copy inventory into an ignored local file

### macOS / bash

```bash
cp lab/ssh_cluster/inventory.compact.yml real-hosts.local.yml
```

### Windows PowerShell

```powershell
Copy-Item .\lab\ssh_cluster\inventory.compact.yml .\real-hosts.local.yml
```

Edit these fields:

- `hostname`
- `port`
- `ssh_user`
- `ssh_implementation`
- `ssh_options`
- `secret_ref`
- `privilege_mode`
- `root_allowed`
- `repo_path`
- `cluster_ids`
- `repo_discovery_paths`

## 3. Verify SSH reachability

- Test plain SSH to both hosts first.
- Confirm the selected account can perform the expected privileged operations without interactive prompts.
- Do not proceed to MCP file writes until both checks pass.

## 4. Start the local MCP server

### macOS / bash

```bash
REMOTE_INFRA_INVENTORY=real-hosts.local.yml node packages/remote-infra-mcp/src/main.ts --inventory real-hosts.local.yml
```

### Windows PowerShell

```powershell
$env:REMOTE_INFRA_INVENTORY = "real-hosts.local.yml"
node .\packages\remote-infra-mcp\src\main.ts --inventory .\real-hosts.local.yml
```

## 5. Run the first safe workflow

1. `describe_control_plane`
2. `list_hosts`
3. `list_clusters`
4. `diagnose_host_connectivity` for both hosts
5. `discover_host_repos` for both hosts
6. `explain_host_role` for both hosts
7. `report_repo_state`
8. `compare_host_state`
9. `refresh_indexes`

If the repo or runtime paths are not ready yet, run `bootstrap_host` before any patch or restart workflow.

After that, test one non-destructive edit path:

1. `read_remote_file`
2. `apply_remote_patch`
3. `restart_service`
4. `refresh_indexes`

The expected operator report is:

- which files changed on each host,
- which service was restarted,
- which host or cluster was unreachable or unhealthy,
- which hosts are clean or dirty,
- intended vs deployed commit per host.
