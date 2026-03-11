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
  SystemInspectionResult,
  TopologySummary
} from "../../remote-infra-types/src/index.ts";
import { compareHostSnapshot } from "./classification.ts";
import { generateInfraIndex } from "./indexer.ts";
import { applyStructuredPatch } from "./patch.ts";
import { importSshConfig } from "./ssh-config.ts";
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
      sshHostAlias: host.sshHostAlias,
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

  describeControlPlane() {
    const rootCapableHosts = this.inventory.hosts
      .filter((host) => host.rootAllowed || host.privilegeMode === "root" || host.privilegeMode === "sudo")
      .map((host) => ({
        id: host.id,
        privilegeMode: host.privilegeMode,
        rootAllowed: host.rootAllowed
      }));

    return {
      name: "SSH System Architect",
      server: "remote-infra-mcp",
      version: "0.1.0",
      repo: {
        name: this.inventory.repo.name,
        gitRemote: this.inventory.repo.gitRemote,
        defaultBranch: this.inventory.repo.defaultBranch,
        intendedCommit: this.inventory.repo.intendedCommit
      },
      inventoryScope: {
        hostCount: this.inventory.hosts.length,
        clusterCount: this.inventory.clusters.length,
        vmAdapterCount: this.inventory.vmAdapters.length,
        rootCapableHosts
      },
      capabilities: {
        supportsOpenSsh: true,
        supportsRepoDiscovery: true,
        supportsBootstrapHost: true,
        supportsClusterActions: true,
        supportsSystemInspection: true,
        supportsIndexRefresh: true,
        destructiveToolsEnabled: this.options.allowDestructiveTools && this.inventory.safety.destructiveToolsEnabled
      },
      routineTools: [
        "inspect_system",
        "list_hosts",
        "list_clusters",
        "explain_host_role",
        "read_remote_file",
        "write_remote_file",
        "apply_remote_patch",
        "git_pull_group",
        "restart_service_group",
        "discover_host_repos",
        "bootstrap_host",
        "refresh_indexes"
      ],
      destructiveTools: ["vm_create", "vm_delete", "wipe_host", "destroy_data", "rotate_deploy_key", "reimage_host"],
      safety: this.inventory.safety
    };
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
      sshHostAlias: host.sshHostAlias,
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

  async importSshConfigHosts(configPath?: string, aliases?: string[]) {
    const defaultConfigPath =
      process.env.SSH_CONFIG_FILE ||
      (process.platform === "win32"
        ? path.join(process.env.USERPROFILE ?? "", ".ssh", "config")
        : path.join(process.env.HOME ?? "", ".ssh", "config"));
    const resolvedConfigPath = configPath || defaultConfigPath;
    if (!resolvedConfigPath) {
      throw new Error("No SSH config path provided and no SSH_CONFIG_FILE or home directory is available");
    }
    return importSshConfig(resolvedConfigPath, aliases);
  }

  async bootstrapHost(
    hostId: string,
    options?: {
      repositoryUrl?: string;
      branch?: string;
      createRuntimeDirs?: boolean;
      createOverlayDirs?: boolean;
      reason?: string;
    }
  ) {
    const host = this.getHost(hostId);
    if (!host.mutable) {
      throw new Error(`Host ${hostId} is marked immutable and cannot be bootstrapped`);
    }

    const repositoryUrl = options?.repositoryUrl ?? this.inventory.repo.gitRemote;
    const branch = options?.branch ?? this.inventory.repo.defaultBranch;
    const requiresPrivilege = host.privilegeMode !== "none";
    const createdDirectories: string[] = [];
    const notes: string[] = [];

    const repoParent = path.posix.dirname(host.repoPath);
    await this.runRemoteCommand(hostId, {
      argv: ["mkdir", "-p", repoParent],
      requiresPrivilege,
      reason: options?.reason ?? "Prepare repo parent directory"
    });

    const repoProbe = await this.runRemoteCommand(hostId, {
      argv: ["git", "-C", host.repoPath, "rev-parse", "--is-inside-work-tree"]
    });

    let clonedRepo = false;
    if (repoProbe.code !== 0) {
      const cloneResult = await this.runRemoteCommand(hostId, {
        argv: ["git", "clone", "--branch", branch, repositoryUrl, host.repoPath],
        requiresPrivilege,
        reason: options?.reason ?? "Clone managed repo during host bootstrap"
      });
      if (cloneResult.code !== 0) {
        throw new Error(cloneResult.stderr.trim() || `Unable to clone ${repositoryUrl} onto ${hostId}`);
      }
      clonedRepo = true;
      notes.push(`Cloned ${repositoryUrl} into ${host.repoPath}`);
    } else {
      notes.push(`Repo already present at ${host.repoPath}`);
    }

    const targetDirs = new Set<string>();
    if (options?.createRuntimeDirs !== false) {
      for (const runtimePath of host.runtimePaths) {
        targetDirs.add(runtimePath.startsWith("/") ? runtimePath : path.posix.join(host.repoPath, runtimePath));
      }
    }
    if (options?.createOverlayDirs === true) {
      for (const overlayPath of host.overlayPaths) {
        if (overlayPath.startsWith("/")) {
          targetDirs.add(overlayPath);
        }
      }
    }

    for (const targetDir of targetDirs) {
      const result = await this.runRemoteCommand(hostId, {
        argv: ["mkdir", "-p", targetDir],
        requiresPrivilege,
        reason: options?.reason ?? "Prepare managed directories during host bootstrap"
      });
      if (result.code !== 0) {
        throw new Error(result.stderr.trim() || `Unable to create directory ${targetDir} on ${hostId}`);
      }
      createdDirectories.push(targetDir);
    }

    return {
      hostId,
      repoPath: host.repoPath,
      repositoryUrl,
      branch,
      privilegeMode: host.privilegeMode,
      rootAllowed: host.rootAllowed,
      clonedRepo,
      createdDirectories,
      notes
    };
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
    const normalizedBinary = binary?.replace(/\\/gu, "/");
    const binaryName = normalizedBinary ? normalizedBinary.split("/").pop() ?? normalizedBinary : "";
    if (!binary || (!ALLOWED_COMMANDS.has(binary) && !ALLOWED_COMMANDS.has(binaryName))) {
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
      targets.map((service) => {
        if (service.manager !== "systemd") {
          return Promise.resolve({
            code: 0,
            stdout:
              service.manager === "none"
                ? "No service manager configured; rely on health checks or explicit launch tooling."
                : `Service manager ${service.manager} is not implemented by the constrained OpenSSH workflow yet.`,
            stderr: ""
          });
        }
        return this.runRemoteCommand(hostId, {
          argv: ["systemctl", "status", service.unit, "--no-pager"],
          requiresPrivilege: service.restartRequiresPrivilege ?? false
        });
      })
    );
  }

  async restartService(hostId: string, serviceName: string, reason?: string) {
    const host = this.getHost(hostId);
    const service = host.services.find((entry) => entry.name === serviceName);
    if (!service) {
      throw new Error(`Unknown service ${serviceName} on ${hostId}`);
    }
    if (service.manager !== "systemd") {
      throw new Error(
        service.manager === "none"
          ? `Service ${serviceName} on ${hostId} does not declare a service manager; use explicit launch tooling for this host`
          : `Service manager ${service.manager} is not implemented for restart_service`
      );
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
    if (service.manager !== "systemd") {
      throw new Error(
        service.manager === "none"
          ? `Service ${serviceName} on ${hostId} does not declare a service manager; use its logHint or runtime files instead`
          : `Service manager ${service.manager} is not implemented for tail_service_logs`
      );
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
    const shardHosts = this.inventory.hosts.filter((host) => host.roleLabels.some((role) => role.startsWith("shard"))).length;
    const coordinatorHosts = this.inventory.hosts.filter((host) => host.roleLabels.includes("coordinator")).length;
    const botHosts = this.inventory.hosts.filter((host) => host.roleLabels.includes("bot_runner")).length;
    const topology =
      coordinatorHosts === 1 && botHosts === 4
        ? "coordinator + 4 bot hosts"
        : this.inventory.hosts.length === 3 && gatewayHosts === 1 && shardHosts === 2
        ? "optional 3-host mode"
        : "compact 2-host mode";
    return {
      topology,
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

  async inspectSystem(options?: {
    outputRoot?: string;
    exhaustiveFiles?: boolean;
    hostIds?: string[];
    clusterId?: string;
    refreshIndexes?: boolean;
    includeRepoDiscovery?: boolean;
  }): Promise<SystemInspectionResult> {
    const hosts = this.resolveHosts(options?.hostIds, options?.clusterId);
    const hostIds = hosts.map((host) => host.id);
    const repoStates = await this.reportRepoState(hostIds);
    const comparisons = repoStates.map((snapshot) => compareHostSnapshot(snapshot));
    const networkHealth = await this.reportNetworkHealth(options?.clusterId, options?.hostIds ?? hostIds);
    const repoDiscovery =
      options?.includeRepoDiscovery === false
        ? []
        : await Promise.all(hosts.map((host) => this.discoverHostRepos(host.id)));
    const topology = this.generateTopologySummary();
    const generatedAt = new Date().toISOString();

    let indexes: SystemInspectionResult["indexes"];
    if (options?.refreshIndexes !== false) {
      const outputRoot = path.join(this.options.workspaceRoot, ".infra-index");
      const requestedOutputRoot = options?.outputRoot ? path.resolve(options.outputRoot) : outputRoot;
      await generateInfraIndex(this.inventory, repoStates, {
        outputRoot: requestedOutputRoot,
        workspaceRoot: this.options.workspaceRoot,
        exhaustiveFiles: options?.exhaustiveFiles,
        inspection: {
          generatedAt,
          topology,
          networkHealth,
          repoDiscovery,
          comparisons
        }
      });
      indexes = {
        outputRoot: requestedOutputRoot,
        hosts: repoStates.map((snapshot) => ({
          hostId: snapshot.hostId,
          clean: snapshot.repoStatus.clean,
          deployedCommit: snapshot.deployedCommit,
          intendedCommit: snapshot.intendedCommit
        }))
      };
    }

    return {
      generatedAt,
      clusterId: options?.clusterId,
      hostIds,
      topology,
      hostRoles: hosts.map((host) => {
        const explained = this.explainHostRole(host.id);
        return {
          hostId: host.id,
          roles: explained.roles,
          clusters: explained.clusters,
          sshImplementation: explained.sshImplementation,
          sshHostAlias: explained.sshHostAlias,
          managedScopes: explained.managedScopes,
          services: explained.services.map((service) => service.name),
          overlays: explained.overlays,
          runtimePaths: explained.runtimePaths,
          existingRepos: explained.existingRepos,
          intent: explained.intent
        };
      }),
      repoStates,
      comparisons,
      networkHealth,
      repoDiscovery,
      indexes
    };
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
