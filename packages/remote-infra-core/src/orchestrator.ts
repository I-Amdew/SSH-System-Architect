import path from "node:path";

import type {
  ClusterActionResult,
  CommandRequest,
  ConnectivityCheckResult,
  HostComparison,
  HostDefinition,
  HostSnapshot,
  Inventory,
  RepoDiscoveryResult,
  RemoteFileWriteResult,
  StructuredPatchOperation,
  TopologySummary
} from "../../remote-infra-types/src/index.ts";
import { compareHostSnapshot } from "./classification.ts";
import { generateInfraIndex } from "./indexer.ts";
import { applyStructuredPatch } from "./patch.ts";
import type { RemoteTransport } from "./transport.ts";

const ALLOWED_COMMANDS = new Set([
  "git",
  "systemctl",
  "journalctl",
  "cat",
  "sed",
  "grep",
  "find",
  "ls",
  "stat",
  "mkdir",
  "cp",
  "mv",
  "node",
  "npm",
  "curl",
  "pwd",
  "true"
]);

const BLOCKED_TOKENS = ["rm", "shutdown", "reboot", "mkfs", "dd", "format", "del"];

export interface OrchestratorOptions {
  workspaceRoot: string;
  allowDestructiveTools?: boolean;
}

export class RemoteInfraOrchestrator {
  private readonly inventory: Inventory;
  private readonly transport: RemoteTransport;
  private readonly options: OrchestratorOptions;

  constructor(
    inventory: Inventory,
    transport: RemoteTransport,
    options: OrchestratorOptions
  ) {
    this.inventory = inventory;
    this.transport = transport;
    this.options = options;
  }

  listHosts() {
    return this.inventory.hosts.map((host) => ({
      id: host.id,
      hostname: host.hostname,
      port: host.port,
      sshUser: host.sshUser,
      roles: host.roleLabels,
      mutable: host.mutable,
      deletionProtected: host.deletionProtected
    }));
  }

  readInventory() {
    return this.inventory;
  }

  getHost(hostId: string): HostDefinition {
    const host = this.inventory.hosts.find((entry) => entry.id === hostId);
    if (!host) {
      throw new Error(`Unknown host: ${hostId}`);
    }
    return host;
  }

  getCluster(clusterId: string) {
    const cluster = this.inventory.clusters.find((entry) => entry.id === clusterId);
    if (!cluster) {
      throw new Error(`Unknown cluster: ${clusterId}`);
    }
    return cluster;
  }

  listClusters() {
    return this.inventory.clusters.map((cluster) => ({
      id: cluster.id,
      displayName: cluster.displayName,
      hostIds: cluster.hostIds,
      purpose: cluster.purpose,
      mutable: cluster.mutable,
      serviceGroups: cluster.serviceGroups
    }));
  }

  explainCluster(clusterId: string) {
    const cluster = this.getCluster(clusterId);
    const hosts = cluster.hostIds.map((hostId) => this.getHost(hostId));
    return {
      ...cluster,
      hosts: hosts.map((host) => ({
        id: host.id,
        hostname: host.hostname,
        roles: host.roleLabels,
        services: host.services.map((service) => service.name),
        repoPath: host.repoPath,
        networkZone: host.networkZone,
        rootAllowed: host.rootAllowed,
        vmAdapterIds: host.vmAdapterIds
      }))
    };
  }

  explainHostRole(hostId: string) {
    const host = this.getHost(hostId);
    return {
      hostId,
      roles: host.roleLabels,
      clusters: host.clusterIds,
      networkZone: host.networkZone,
      sshImplementation: host.sshImplementation,
      sshOptions: host.sshOptions,
      repoPath: host.repoPath,
      existingRepos: host.existingRepos,
      overlays: host.overlayPaths,
      runtimePaths: host.runtimePaths,
      managedScopes: host.managedScopes,
      vmAdapters: this.inventory.vmAdapters.filter((adapter) => host.vmAdapterIds.includes(adapter.id)),
      services: host.services,
      intent: host.notes ?? `Host ${host.id} runs ${host.roleLabels.join(", ")} for ${this.inventory.repo.name}.`
    };
  }

  listVmAdapters() {
    return this.inventory.vmAdapters;
  }

  private resolveHosts(hostIds?: string[], clusterId?: string): HostDefinition[] {
    if (clusterId) {
      const cluster = this.getCluster(clusterId);
      return cluster.hostIds.map((hostId) => this.getHost(hostId));
    }
    if (hostIds?.length) {
      return hostIds.map((hostId) => this.getHost(hostId));
    }
    return this.inventory.hosts;
  }

  async readRemoteFile(hostId: string, targetPath: string) {
    return this.transport.readFile(this.getHost(hostId), targetPath);
  }

  async writeRemoteFile(hostId: string, targetPath: string, contents: string): Promise<RemoteFileWriteResult> {
    return this.transport.writeFile(this.getHost(hostId), targetPath, contents);
  }

  async applyRemotePatch(hostId: string, targetPath: string, operations: StructuredPatchOperation[]) {
    const current = await this.readRemoteFile(hostId, targetPath);
    const updated = applyStructuredPatch(current, operations);
    const result = await this.writeRemoteFile(hostId, targetPath, updated);
    return {
      ...result,
      preview: updated
    };
  }

  private validateCommand(request: CommandRequest): void {
    const [binary, ...rest] = request.argv;
    if (!binary || !ALLOWED_COMMANDS.has(binary)) {
      throw new Error(`Command ${binary ?? "<empty>"} is not allowed by the constrained remote command policy`);
    }
    const allTokens = [binary, ...rest].join(" ");
    if (BLOCKED_TOKENS.some((token) => allTokens.includes(token))) {
      throw new Error(`Command contains blocked token: ${allTokens}`);
    }
  }

  async runRemoteCommand(hostId: string, request: CommandRequest) {
    this.validateCommand(request);
    return this.transport.exec(this.getHost(hostId), request);
  }

  async gitStatus(hostId: string) {
    const host = this.getHost(hostId);
    return this.runRemoteCommand(hostId, {
      argv: ["git", "-C", host.repoPath, "status", "--short", "--branch"]
    });
  }

  async gitFetch(hostId: string, remote = "origin") {
    const host = this.getHost(hostId);
    return this.runRemoteCommand(hostId, {
      argv: ["git", "-C", host.repoPath, "fetch", remote]
    });
  }

  async gitPull(hostId: string, remote = "origin", branch?: string) {
    const host = this.getHost(hostId);
    return this.runRemoteCommand(hostId, {
      argv: ["git", "-C", host.repoPath, "pull", remote, branch ?? this.inventory.repo.defaultBranch]
    });
  }

  async gitPush(hostId: string, remote = "origin", branch?: string) {
    const host = this.getHost(hostId);
    return this.runRemoteCommand(hostId, {
      argv: ["git", "-C", host.repoPath, "push", remote, branch ?? this.inventory.repo.defaultBranch]
    });
  }

  async gitClone(hostId: string, repositoryUrl: string, targetPath?: string) {
    const host = this.getHost(hostId);
    return this.runRemoteCommand(hostId, {
      argv: ["git", "clone", repositoryUrl, targetPath ?? host.repoPath]
    });
  }

  async reportRepoState(hostIds?: string[], clusterId?: string): Promise<HostSnapshot[]> {
    const hosts = this.resolveHosts(hostIds, clusterId);
    return Promise.all(hosts.map((host) => this.transport.collectSnapshot(host, this.inventory)));
  }

  async serviceStatus(hostId: string, serviceName?: string) {
    const host = this.getHost(hostId);
    const targets = serviceName ? host.services.filter((service) => service.name === serviceName) : host.services;
    return Promise.all(
      targets.map((service) =>
        this.runRemoteCommand(hostId, {
          argv: ["systemctl", "status", service.unit, "--no-pager"],
          requiresPrivilege: service.restartRequiresPrivilege ?? false
        })
      )
    );
  }

  async restartService(hostId: string, serviceName: string, reason?: string) {
    const host = this.getHost(hostId);
    const service = host.services.find((entry) => entry.name === serviceName);
    if (!service) {
      throw new Error(`Unknown service ${serviceName} on ${hostId}`);
    }
    const result = await this.runRemoteCommand(hostId, {
      argv: ["systemctl", "restart", service.unit],
      requiresPrivilege: service.restartRequiresPrivilege ?? false,
      reason
    });
    return {
      hostId,
      service: service.name,
      unit: service.unit,
      result
    };
  }

  async tailServiceLogs(hostId: string, serviceName: string, lines = 100) {
    const host = this.getHost(hostId);
    const service = host.services.find((entry) => entry.name === serviceName);
    if (!service) {
      throw new Error(`Unknown service ${serviceName} on ${hostId}`);
    }
    return this.runRemoteCommand(hostId, {
      argv: ["journalctl", "-u", service.unit, "-n", String(lines), "--no-pager"],
      requiresPrivilege: service.restartRequiresPrivilege ?? false
    });
  }

  async restartServiceGroup(
    serviceName: string,
    clusterId?: string,
    hostIds?: string[],
    reason?: string
  ): Promise<ClusterActionResult<unknown>> {
    const hosts = this.resolveHosts(hostIds, clusterId);
    const results = await Promise.all(
      hosts.map(async (host) => {
        const service = host.services.find((entry) => entry.name === serviceName);
        if (!service) {
          return {
            hostId: host.id,
            result: {
              skipped: true,
              reason: `Service ${serviceName} is not configured on ${host.id}`
            }
          };
        }
        return {
          hostId: host.id,
          result: await this.restartService(host.id, serviceName, reason)
        };
      })
    );
    return {
      clusterId,
      hostIds: hosts.map((host) => host.id),
      results
    };
  }

  async gitPullGroup(
    clusterId?: string,
    hostIds?: string[],
    remote = "origin",
    branch?: string
  ): Promise<ClusterActionResult<unknown>> {
    const hosts = this.resolveHosts(hostIds, clusterId);
    const results = await Promise.all(
      hosts.map(async (host) => ({
        hostId: host.id,
        result: await this.gitPull(host.id, remote, branch)
      }))
    );
    return {
      clusterId,
      hostIds: hosts.map((host) => host.id),
      results
    };
  }

  async discoverHostRepos(hostId: string): Promise<RepoDiscoveryResult> {
    const host = this.getHost(hostId);
    const scanRoots = [...new Set([...host.repoDiscoveryPaths, ...this.inventory.repoDiscovery.scanRoots, host.repoPath])];
    if (scanRoots.length === 0) {
      return {
        hostId,
        scanRoots: [],
        repos: []
      };
    }

    const result = await this.runRemoteCommand(hostId, {
      argv: ["find", ...scanRoots, "-type", "d", "-name", ".git"]
    });
    const repoRoots = result.stdout
      .split(/\r?\n/u)
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => entry.replace(/\/\.git$/u, ""));

    const repos = await Promise.all(
      repoRoots.map(async (repoPath) => {
        const remote = await this.runRemoteCommand(hostId, {
          argv: ["git", "-C", repoPath, "remote", "get-url", "origin"]
        });
        const branch = await this.runRemoteCommand(hostId, {
          argv: ["git", "-C", repoPath, "rev-parse", "--abbrev-ref", "HEAD"]
        });
        const matchedInventory =
          repoPath === host.repoPath || host.existingRepos.some((repo) => repo.path === repoPath);
        return {
          path: repoPath,
          remote: remote.code === 0 ? remote.stdout.trim() : undefined,
          branch: branch.code === 0 ? branch.stdout.trim() : undefined,
          matchedInventory
        };
      })
    );

    return {
      hostId,
      scanRoots,
      repos
    };
  }

  async diagnoseHostConnectivity(hostId: string): Promise<ConnectivityCheckResult> {
    const host = this.getHost(hostId);
    const notes: string[] = [];
    const sshProbe = await this.runRemoteCommand(hostId, {
      argv: ["pwd"]
    });
    const sshReachable = sshProbe.code === 0;
    if (!sshReachable) {
      return {
        hostId,
        sshReachable: false,
        repoReachable: false,
        healthChecks: [],
        notes: [sshProbe.stderr.trim() || `Unable to reach ${host.hostname}:${host.port} over OpenSSH`]
      };
    }

    const repoProbe = await this.runRemoteCommand(hostId, {
      argv: ["git", "-C", host.repoPath, "rev-parse", "HEAD"]
    });
    const repoReachable = repoProbe.code === 0;
    if (!repoReachable) {
      notes.push(repoProbe.stderr.trim() || `Repo path ${host.repoPath} is not a valid Git working tree`);
    }

    const healthChecks = await Promise.all(
      host.healthChecks.map(async (check) => {
        if (check.kind === "http") {
          const response = await this.runRemoteCommand(hostId, {
            argv: ["curl", "-fsS", check.target]
          });
          return {
            name: check.name,
            state: response.code === 0 ? "ok" : "failed",
            detail: response.code === 0 ? `HTTP check passed for ${check.target}` : response.stderr.trim() || response.stdout.trim()
          } as ConnectivityCheckResult["healthChecks"][number];
        }
        return {
          name: check.name,
          state: "skipped",
          detail: `Health check kind ${check.kind} requires an adapter-specific implementation`
        } as ConnectivityCheckResult["healthChecks"][number];
      })
    );

    return {
      hostId,
      sshReachable,
      repoReachable,
      deployedCommit: repoReachable ? repoProbe.stdout.trim() : undefined,
      healthChecks,
      notes
    };
  }

  async reportNetworkHealth(clusterId?: string, hostIds?: string[]) {
    const hosts = this.resolveHosts(hostIds, clusterId);
    const results = await Promise.all(hosts.map((host) => this.diagnoseHostConnectivity(host.id)));
    return {
      clusterId,
      hostIds: hosts.map((host) => host.id),
      results
    };
  }

  generateTopologySummary(): TopologySummary {
    const gatewayHosts = this.inventory.hosts.filter((host) => host.roleLabels.includes("gateway")).length;
    return {
      topology: gatewayHosts === 1 ? "compact 2-host mode" : "optional 3-host mode",
      hosts: this.inventory.hosts.map((host) => ({
        hostId: host.id,
        roles: host.roleLabels,
        services: host.services.map((service) => service.name),
        overlayPaths: host.overlayPaths,
        runtimePaths: host.runtimePaths
      })),
      clusters: this.inventory.clusters.map((cluster) => ({
        id: cluster.id,
        displayName: cluster.displayName,
        hostIds: cluster.hostIds
      })),
      vmAdapters: this.inventory.vmAdapters.map((adapter) => ({
        id: adapter.id,
        kind: adapter.kind,
        scope: adapter.scope,
        enabled: adapter.enabled
      }))
    };
  }

  async generateHostSummary(hostId: string) {
    const snapshot = (await this.reportRepoState([hostId]))[0];
    return {
      host: this.getHost(hostId),
      snapshot,
      comparison: compareHostSnapshot(snapshot)
    };
  }

  async compareState(hostId: string): Promise<HostComparison> {
    const snapshot = (await this.reportRepoState([hostId]))[0];
    return compareHostSnapshot(snapshot);
  }

  async refreshIndexes(
    outputRoot = path.join(this.options.workspaceRoot, ".infra-index"),
    exhaustiveFiles = false,
    hostIds?: string[],
    clusterId?: string
  ) {
    const snapshots = await this.reportRepoState(hostIds, clusterId);
    await generateInfraIndex(this.inventory, snapshots, {
      outputRoot,
      workspaceRoot: this.options.workspaceRoot,
      exhaustiveFiles
    });
    return {
      outputRoot,
      hosts: snapshots.map((snapshot) => ({
        hostId: snapshot.hostId,
        clean: snapshot.repoStatus.clean,
        deployedCommit: snapshot.deployedCommit,
        intendedCommit: snapshot.intendedCommit
      }))
    };
  }

  ensureDestructiveToolAllowed(toolName: string, confirmation?: string) {
    if (!this.options.allowDestructiveTools || !this.inventory.safety.destructiveToolsEnabled) {
      throw new Error(`${toolName} is disabled by default`);
    }
    if (this.inventory.safety.requireConfirmationToken && confirmation !== toolName) {
      throw new Error(`${toolName} requires confirmation token matching the tool name`);
    }
  }
}
