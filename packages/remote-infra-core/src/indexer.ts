import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import type { GenerateIndexOptions, HostDefinition, HostFileEntry, HostSnapshot, Inventory, TopologySummary } from "../../remote-infra-types/src/index.ts";
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
  const topology =
    gatewayHosts === 1 && shardHosts === 2
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

  await writeMarkdown(
    path.join(outputRoot, "system-overview.md"),
    [
      "# System Overview",
      "",
      `- Repo: \`${inventory.repo.name}\``,
      `- Git remote: \`${inventory.repo.gitRemote}\``,
      `- Intended commit: \`${inventory.repo.intendedCommit}\``,
      `- Topology mode: \`${topology.topology}\``,
      "",
      "## Hosts",
      markdownList(
        topology.hosts.map(
          (host) => `\`${host.hostId}\`: roles=${host.roles.join(", ")}, services=${host.services.join(", ")}`
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
    ].join("\n")
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
      "This file records the intended diagnostic surface for the inventory.",
      "",
      "## Hosts",
      markdownList(
        inventory.hosts.map(
          (host) =>
            `\`${host.id}\`: OpenSSH=${host.sshImplementation}, zone=${host.networkZone ?? "unspecified"}, scopes=${host.managedScopes.join(", ")}`
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
    const comparison = compareHostSnapshot(snapshot);

    await writeMarkdown(
      path.join(hostRoot, "host.md"),
      [
        `# Host: ${host.id}`,
        "",
        `- SSH target: \`${host.sshUser}@${host.hostname}:${host.port}\``,
        `- Roles: \`${host.roleLabels.join(", ")}\``,
        `- Clusters: \`${host.clusterIds.join(", ")}\``,
        `- Network zone: \`${host.networkZone ?? "unspecified"}\``,
        `- SSH implementation: \`${host.sshImplementation}\``,
        `- Privilege mode: \`${host.privilegeMode}\``,
        `- Root allowed: \`${host.rootAllowed}\``,
        `- Mutable: \`${host.mutable}\``,
        `- Deletion protected: \`${host.deletionProtected}\``,
        snapshot.roleSummary ? `- Role summary: ${snapshot.roleSummary}` : ""
      ].filter(Boolean).join("\n")
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
        "## Health checks",
        markdownList(host.healthChecks.map((check) => `\`${check.name}\` -> ${check.kind} ${check.target}`))
      ].join("\n")
    );

    await writeMarkdown(path.join(hostRoot, "repo_status.md"), renderRepoStatus(snapshot));
    await writeMarkdown(path.join(hostRoot, "overlay.md"), renderFileGroup("Overlay Files", comparison.overlays));
    await writeMarkdown(path.join(hostRoot, "runtime.md"), renderFileGroup("Runtime Files", comparison.runtimeOnly));
    await writeMarkdown(path.join(hostRoot, "drift.md"), renderFileGroup("Drift", comparison.drift));
    await writeHostTreeIndexes(path.join(hostRoot, "tree"), snapshot.files);
  }
}
