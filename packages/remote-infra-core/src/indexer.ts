import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import type {
  ConnectivityCheckResult,
  GenerateIndexOptions,
  HostDefinition,
  HostFileEntry,
  HostSnapshot,
  Inventory,
  RepoDiscoveryResult,
  TopologySummary
} from "../../remote-infra-types/src/index.ts";
import { compareHostSnapshot, relativeOutputPath } from "./classification.ts";

function markdownList(items: string[]): string {
  if (items.length === 0) {
    return "- None";
  }
  return items.map((item) => `- ${item}`).join("\n");
}

async function ensureDirectory(targetPath: string): Promise<void> {
  await mkdir(targetPath, { recursive: true });
}

async function safeReadDir(targetPath: string) {
  try {
    return await readdir(targetPath, { withFileTypes: true });
  } catch {
    return [];
  }
}

async function writeMarkdown(targetPath: string, content: string): Promise<void> {
  await ensureDirectory(path.dirname(targetPath));
  await writeFile(targetPath, `${content.trim()}\n`, "utf8");
}

function summarizeTopology(inventory: Inventory): TopologySummary {
  const gatewayHosts = inventory.hosts.filter((host) => host.roleLabels.includes("gateway")).length;
  const shardHosts = inventory.hosts.filter((host) => host.roleLabels.some((role) => role.startsWith("shard"))).length;
  const coordinatorHosts = inventory.hosts.filter((host) => host.roleLabels.includes("coordinator")).length;
  const botHosts = inventory.hosts.filter((host) => host.roleLabels.includes("bot_runner")).length;
  const topology =
    coordinatorHosts === 1 && botHosts === 4
      ? "coordinator + 4 bot hosts"
      : inventory.hosts.length === 3 && gatewayHosts === 1 && shardHosts === 2
      ? "optional 3-host mode"
      : "compact 2-host mode";

  return {
    topology,
    hosts: inventory.hosts.map((host) => ({
      hostId: host.id,
      roles: host.roleLabels,
      services: host.services.map((service) => service.name),
      overlayPaths: host.overlayPaths,
      runtimePaths: host.runtimePaths
    })),
    clusters: inventory.clusters.map((cluster) => ({
      id: cluster.id,
      displayName: cluster.displayName,
      hostIds: cluster.hostIds
    })),
    vmAdapters: inventory.vmAdapters.map((adapter) => ({
      id: adapter.id,
      kind: adapter.kind,
      scope: adapter.scope,
      enabled: adapter.enabled
    }))
  };
}

async function writeLocalTreeIndexes(sourceRoot: string, outputRoot: string, rootTitle: string): Promise<void> {
  async function walk(currentSourcePath: string, currentOutputPath: string): Promise<void> {
    const entries = await safeReadDir(currentSourcePath);
    const directories = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
    const files = entries.filter((entry) => entry.isFile()).map((entry) => entry.name).sort();

    await writeMarkdown(
      path.join(currentOutputPath, "index.md"),
      [
        `# ${rootTitle}`,
        "",
        `Source path: \`${path.relative(process.cwd(), currentSourcePath) || "."}\``,
        "",
        "## Directories",
        markdownList(directories.map((directory) => `\`${directory}/\``)),
        "",
        "## Files",
        markdownList(files.map((fileName) => `\`${fileName}\``))
      ].join("\n")
    );

    for (const directory of directories) {
      await walk(path.join(currentSourcePath, directory), path.join(currentOutputPath, directory));
    }
  }

  const sourceStats = await stat(sourceRoot);
  if (!sourceStats.isDirectory()) {
    return;
  }
  await walk(sourceRoot, outputRoot);
}

function renderRepoStatus(snapshot: HostSnapshot): string {
  const status = snapshot.repoStatus;
  return [
    `# Repo Status: ${snapshot.hostId}`,
    "",
    `- Intended commit: \`${snapshot.intendedCommit}\``,
    `- Deployed commit: \`${snapshot.deployedCommit}\``,
    `- Branch: \`${status.branch}\``,
    `- Clean: \`${status.clean}\``,
    `- Ahead/behind: \`${status.ahead}/${status.behind}\``,
    "",
    "## Modified",
    markdownList(status.modified.map((entry) => `\`${entry}\``)),
    "",
    "## Deleted",
    markdownList(status.deleted.map((entry) => `\`${entry}\``)),
    "",
    "## Untracked",
    markdownList(status.untracked.map((entry) => `\`${entry}\``))
  ].join("\n");
}

function renderFileGroup(title: string, entries: HostFileEntry[]): string {
  return [
    `# ${title}`,
    "",
    markdownList(
      entries.map((entry) => {
        const notes = entry.notes ? ` (${entry.notes})` : "";
        return `\`${entry.path}\`${notes}`;
      })
    )
  ].join("\n");
}

function renderHealthStatus(status?: ConnectivityCheckResult): string {
  if (!status) {
    return "No health snapshot recorded.";
  }
  return [
    `- SSH reachable: \`${status.sshReachable}\``,
    `- Repo reachable: \`${status.repoReachable}\``,
    status.deployedCommit ? `- Reported deployed commit: \`${status.deployedCommit}\`` : "",
    "",
    "## Health checks",
    markdownList(
      status.healthChecks.map((entry) => `\`${entry.name}\`: ${entry.state}${entry.detail ? ` (${entry.detail})` : ""}`)
    ),
    "",
    "## Notes",
    markdownList(status.notes)
  ]
    .filter(Boolean)
    .join("\n");
}

function renderDiscoveredRepos(discovery?: RepoDiscoveryResult): string {
  if (!discovery) {
    return "# Discovered Repos\n\nNo discovery snapshot recorded.";
  }
  return [
    "# Discovered Repos",
    "",
    "## Scan roots",
    markdownList(discovery.scanRoots.map((entry) => `\`${entry}\``)),
    "",
    "## Repos",
    markdownList(
      discovery.repos.map(
        (repo) =>
          `\`${repo.path}\`${repo.remote ? ` -> ${repo.remote}` : ""}${repo.branch ? ` [${repo.branch}]` : ""}${
            repo.matchedInventory ? " (inventory)" : ""
          }`
      )
    )
  ].join("\n");
}

function buildTreeMap(entries: HostFileEntry[]): Map<string, HostFileEntry[]> {
  const folders = new Map<string, HostFileEntry[]>();
  for (const entry of entries) {
    const relativePath = relativeOutputPath(entry.path);
    const segments = relativePath.split("/").filter(Boolean);
    for (let index = 0; index <= segments.length - 1; index += 1) {
      const folder = segments.slice(0, index).join("/");
      const current = folders.get(folder) ?? [];
      current.push(entry);
      folders.set(folder, current);
    }
  }
  return folders;
}

async function writeHostTreeIndexes(outputRoot: string, entries: HostFileEntry[]): Promise<void> {
  const folders = buildTreeMap(entries);
  for (const [folder, folderEntries] of folders.entries()) {
    const targetDirectory = folder ? path.join(outputRoot, folder) : outputRoot;
    const groupedByKind = {
      shared_repo: folderEntries.filter((entry) => entry.kind === "shared_repo"),
      overlay: folderEntries.filter((entry) => entry.kind === "overlay"),
      runtime: folderEntries.filter((entry) => entry.kind === "runtime"),
      drift: folderEntries.filter((entry) => entry.kind === "drift")
    };
    await writeMarkdown(
      path.join(targetDirectory, "index.md"),
      [
        `# Host Tree: ${folder || "/"}`,
        "",
        "## Shared repo",
        markdownList(groupedByKind.shared_repo.map((entry) => `\`${entry.path}\``)),
        "",
        "## Overlay",
        markdownList(groupedByKind.overlay.map((entry) => `\`${entry.path}\``)),
        "",
        "## Runtime",
        markdownList(groupedByKind.runtime.map((entry) => `\`${entry.path}\``)),
        "",
        "## Drift",
        markdownList(groupedByKind.drift.map((entry) => `\`${entry.path}\``))
      ].join("\n")
    );
  }
}

export async function generateInfraIndex(
  inventory: Inventory,
  hostSnapshots: HostSnapshot[],
  options: GenerateIndexOptions
): Promise<void> {
  const outputRoot = path.resolve(options.outputRoot);
  const workspaceRoot = path.resolve(options.workspaceRoot);
  await rm(outputRoot, { recursive: true, force: true });
  await ensureDirectory(outputRoot);

  const topology = summarizeTopology(inventory);
  const inspection = options.inspection;
  const networkHealthByHost = new Map(
    (inspection?.networkHealth?.results ?? []).map((entry) => [entry.hostId, entry] as const)
  );
  const repoDiscoveryByHost = new Map(
    (inspection?.repoDiscovery ?? []).map((entry) => [entry.hostId, entry] as const)
  );
  const comparisonByHost = new Map(
    (inspection?.comparisons ?? []).map((entry) => [entry.hostId, entry] as const)
  );
  const hostSnapshotsById = new Map(hostSnapshots.map((snapshot) => [snapshot.hostId, snapshot] as const));
  const dirtyHosts = hostSnapshots.filter((snapshot) => !snapshot.repoStatus.clean).map((snapshot) => `\`${snapshot.hostId}\``);
  const degradedHosts = (inspection?.networkHealth?.results ?? [])
    .filter((result) => !result.sshReachable || !result.repoReachable || result.healthChecks.some((check) => check.state === "failed"))
    .map((result) => `\`${result.hostId}\``);

  await writeMarkdown(
    path.join(outputRoot, "system-overview.md"),
    [
      "# System Overview",
      "",
      inspection?.generatedAt ? `- Generated at: \`${inspection.generatedAt}\`` : "",
      `- Repo: \`${inventory.repo.name}\``,
      `- Git remote: \`${inventory.repo.gitRemote}\``,
      `- Intended commit: \`${inventory.repo.intendedCommit}\``,
      `- Topology mode: \`${topology.topology}\``,
      `- Dirty hosts: ${dirtyHosts.length > 0 ? dirtyHosts.join(", ") : "none"}`,
      `- Degraded hosts: ${degradedHosts.length > 0 ? degradedHosts.join(", ") : "none"}`,
      "",
      "## Hosts",
      markdownList(
        topology.hosts.map(
          (host) => {
            const snapshot = hostSnapshotsById.get(host.hostId);
            const health = networkHealthByHost.get(host.hostId);
            return `\`${host.hostId}\`: roles=${host.roles.join(", ")}, services=${host.services.join(
              ", "
            )}, clean=${snapshot?.repoStatus.clean ?? "unknown"}, ssh=${health?.sshReachable ?? "unknown"}`;
          }
        )
      ),
      "",
      "## Shared roots",
      markdownList(inventory.repo.sharedRoots.map((rootPath) => `\`${rootPath}\``)),
      "",
      "## Runtime root hints",
      markdownList(inventory.repo.runtimeRootHints.map((rootPath) => `\`${rootPath}\``)),
      "",
      "## Clusters",
      markdownList(
        inventory.clusters.map(
          (cluster) => `\`${cluster.id}\`: ${cluster.displayName} -> ${cluster.hostIds.join(", ")}`
        )
      ),
      "",
      "## VM adapters",
      markdownList(
        inventory.vmAdapters.map(
          (adapter) => `\`${adapter.id}\`: ${adapter.kind} (${adapter.scope}) enabled=${adapter.enabled}`
        )
      )
    ]
      .filter(Boolean)
      .join("\n")
  );

  await writeMarkdown(
    path.join(outputRoot, "topology.md"),
    [
      "# Topology",
      "",
      `This snapshot reflects the ${topology.topology}.`,
      "",
      markdownList(
        inventory.hosts.map(
          (host) =>
            `\`${host.id}\`: ${host.roleLabels.join(", ")} | clusters=${host.clusterIds.join(", ")} | overlays=${host.overlayPaths.join(", ")} | runtime=${host.runtimePaths.join(", ")}`
        )
      ),
      "",
      "## Discovery roots",
      markdownList(inventory.repoDiscovery.scanRoots.map((rootPath) => `\`${rootPath}\``))
    ].join("\n")
  );

  await writeMarkdown(
    path.join(outputRoot, "network-health.md"),
    [
      "# Network Health Intent",
      "",
      inspection?.networkHealth
        ? "This file records the latest collected diagnostic surface for the inventory."
        : "This file records the intended diagnostic surface for the inventory.",
      "",
      "## Hosts",
      markdownList(
        inventory.hosts.map(
          (host) => {
            const health = networkHealthByHost.get(host.id);
            return `\`${host.id}\`: OpenSSH=${host.sshImplementation}, zone=${host.networkZone ?? "unspecified"}, scopes=${host.managedScopes.join(
              ", "
            )}, ssh=${health?.sshReachable ?? "unknown"}, repo=${health?.repoReachable ?? "unknown"}`;
          }
        )
      )
    ].join("\n")
  );

  const sharedRepoOutputRoot = path.join(outputRoot, "shared_repo");
  await writeMarkdown(
    path.join(sharedRepoOutputRoot, "index.md"),
    [
      "# Shared Repo",
      "",
      "Shared code lives in Git and is expected to stay consistent across hosts.",
      "",
      "## Roots",
      markdownList(inventory.repo.sharedRoots.map((rootPath) => `\`${rootPath}\``))
    ].join("\n")
  );

  for (const sharedRoot of inventory.repo.sharedRoots) {
    await writeLocalTreeIndexes(
      path.join(workspaceRoot, sharedRoot),
      path.join(sharedRepoOutputRoot, relativeOutputPath(sharedRoot)),
      `Shared Repo: ${sharedRoot}`
    );
  }

  for (const host of inventory.hosts) {
    const snapshot = hostSnapshots.find((entry) => entry.hostId === host.id);
    if (!snapshot) {
      continue;
    }
    const hostRoot = path.join(outputRoot, "hosts", host.id);
    const comparison = comparisonByHost.get(host.id) ?? compareHostSnapshot(snapshot);
    const hostHealth = networkHealthByHost.get(host.id);
    const hostDiscovery = repoDiscoveryByHost.get(host.id);

    await writeMarkdown(
      path.join(hostRoot, "host.md"),
      [
        `# Host: ${host.id}`,
        "",
        `- SSH target: \`${host.sshUser}@${host.hostname}:${host.port}\``,
        host.sshHostAlias ? `- SSH alias: \`${host.sshHostAlias}\`` : "",
        `- Repo path: \`${host.repoPath}\``,
        `- Roles: \`${host.roleLabels.join(", ")}\``,
        `- Clusters: \`${host.clusterIds.join(", ")}\``,
        `- Network zone: \`${host.networkZone ?? "unspecified"}\``,
        `- SSH implementation: \`${host.sshImplementation}\``,
        `- Privilege mode: \`${host.privilegeMode}\``,
        `- Root allowed: \`${host.rootAllowed}\``,
        `- Mutable: \`${host.mutable}\``,
        `- Deletion protected: \`${host.deletionProtected}\``,
        snapshot.roleSummary ? `- Role summary: ${snapshot.roleSummary}` : "",
        "",
        "## Service status",
        markdownList(
          snapshot.serviceStatus.map((service) => `\`${service.name}\` -> ${service.state}${service.detail ? ` (${service.detail})` : ""}`)
        ),
        "",
        "## Latest diagnostics",
        renderHealthStatus(hostHealth)
      ]
        .filter(Boolean)
        .join("\n")
    );

    await writeMarkdown(
      path.join(hostRoot, "role.md"),
      [
        `# Role: ${host.id}`,
        "",
        host.notes ?? "No additional role notes provided.",
        "",
        "## Managed scopes",
        markdownList(host.managedScopes.map((entry) => `\`${entry}\``)),
        "",
        "## Overlays",
        markdownList(host.overlayPaths.map((entry) => `\`${entry}\``)),
        "",
        "## Existing repos",
        markdownList(
          host.existingRepos.map(
            (repo) => `\`${repo.path}\`${repo.remote ? ` -> ${repo.remote}` : ""}${repo.role ? ` (${repo.role})` : ""}`
          )
        ),
        "",
        "## Services",
        markdownList(host.services.map((service) => `\`${service.name}\` -> ${service.unit} (${service.manager})`)),
        "",
        "## Health checks",
        markdownList(host.healthChecks.map((check) => `\`${check.name}\` -> ${check.kind} ${check.target}`))
      ].join("\n")
    );

    await writeMarkdown(path.join(hostRoot, "repo_status.md"), renderRepoStatus(snapshot));
    await writeMarkdown(path.join(hostRoot, "health.md"), `# Health: ${host.id}\n\n${renderHealthStatus(hostHealth)}`);
    await writeMarkdown(path.join(hostRoot, "discovered_repos.md"), renderDiscoveredRepos(hostDiscovery));
    await writeMarkdown(path.join(hostRoot, "overlay.md"), renderFileGroup("Overlay Files", comparison.overlays));
    await writeMarkdown(path.join(hostRoot, "runtime.md"), renderFileGroup("Runtime Files", comparison.runtimeOnly));
    await writeMarkdown(path.join(hostRoot, "drift.md"), renderFileGroup("Drift", comparison.drift));
    await writeHostTreeIndexes(path.join(hostRoot, "tree"), snapshot.files);
  }
}
