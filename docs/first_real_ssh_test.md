# First real SSH test

Use this path when you want the smallest real-world validation with two Linux hosts over SSH.

## 1. Prepare two hosts

- Install OpenSSH server, Git, Node.js 22+, and systemd.
- Ensure your local macOS or Windows machine has a working OpenSSH client in `PATH`.
- Create a non-root deploy user with either SSH key auth or a credential-backed secret ref.
- Clone this repo to the same `repo_path` on both hosts.

## 2. Copy and edit inventory

### macOS / bash

```bash
cp lab/ssh_cluster/inventory.compact.yml /tmp/real-hosts.yml
```

### Windows PowerShell

```powershell
Copy-Item .\lab\ssh_cluster\inventory.compact.yml $env:TEMP\real-hosts.yml
```

Edit these fields on both hosts:

- `hostname`
- `port`
- `ssh_user`
- `ssh_implementation`
- `ssh_options`
- `secret_ref`
- `repo_path`
- `cluster_ids`
- `repo_discovery_paths`

## 3. Verify SSH reachability

- Test that your local machine can open an SSH session to both hosts with the chosen auth mode.
- Do not proceed to MCP file writes until plain SSH works first.

## 4. Start the local MCP server

```bash
REMOTE_INFRA_INVENTORY=/tmp/real-hosts.yml node packages/remote-infra-mcp/src/main.ts --inventory /tmp/real-hosts.yml
```

## 5. Run the first safe workflow

1. `list_hosts`
2. `list_clusters`
3. `diagnose_host_connectivity` for both hosts
4. `discover_host_repos` for both hosts
5. `explain_host_role` for both hosts
6. `report_repo_state`
7. `compare_host_state`
8. `refresh_indexes`

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
