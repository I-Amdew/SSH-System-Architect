import { readFile } from "node:fs/promises";
import path from "node:path";

import type {
  ClusterDefinition,
  HealthCheck,
  HostDefinition,
  Inventory,
  ManagedRepoDefinition,
  RepoDiscoveryPolicy,
  SafetyPolicy,
  SecretBackendDefinition,
  ServiceDefinition,
  SharedRepoDefinition,
  VmAdapterDefinition
} from "../../remote-infra-types/src/index.ts";
import { parseSimpleYaml } from "./yaml.ts";

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function asString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value;
}

function asOptionalString(value: unknown, label: string): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  return asString(value, label);
}

function asBoolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`${label} must be a boolean`);
  }
  return value;
}

function asNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    throw new Error(`${label} must be a number`);
  }
  return value;
}

function asStringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
    throw new Error(`${label} must be an array of strings`);
  }
  return value as string[];
}

function readKey(record: Record<string, unknown>, ...keys: string[]): unknown {
  for (const key of keys) {
    if (key in record) {
      return record[key];
    }
  }
  return undefined;
}

function parseSharedRepo(value: unknown): SharedRepoDefinition {
  const record = asRecord(value, "repo");
  return {
    name: asString(readKey(record, "name"), "repo.name"),
    gitRemote: asString(readKey(record, "git_remote", "gitRemote"), "repo.git_remote"),
    repoRoot: asString(readKey(record, "repo_root", "repoRoot"), "repo.repo_root"),
    defaultBranch: asString(readKey(record, "default_branch", "defaultBranch"), "repo.default_branch"),
    intendedCommit: asString(readKey(record, "intended_commit", "intendedCommit"), "repo.intended_commit"),
    sharedRoots: asStringArray(readKey(record, "shared_roots", "sharedRoots"), "repo.shared_roots"),
    runtimeRootHints: asStringArray(
      readKey(record, "runtime_root_hints", "runtimeRootHints") ?? [],
      "repo.runtime_root_hints"
    )
  };
}

function parseSecretBackends(value: unknown): SecretBackendDefinition[] {
  if (!Array.isArray(value)) {
    throw new Error("secret_backends must be an array");
  }
  return value.map((entry, index) => {
    const record = asRecord(entry, `secret_backends[${index}]`);
    return {
      id: asString(readKey(record, "id"), `secret_backends[${index}].id`),
      kind: asString(readKey(record, "kind"), `secret_backends[${index}].kind`) as SecretBackendDefinition["kind"],
      enabled: asBoolean(readKey(record, "enabled"), `secret_backends[${index}].enabled`),
      notes: asOptionalString(readKey(record, "notes"), `secret_backends[${index}].notes`)
    };
  });
}

function parseRepoDiscovery(value: unknown): RepoDiscoveryPolicy {
  const record = asRecord(value ?? {}, "repo_discovery");
  return {
    scanRoots: asStringArray(readKey(record, "scan_roots", "scanRoots") ?? [], "repo_discovery.scan_roots"),
    repoMarkers: asStringArray(readKey(record, "repo_markers", "repoMarkers") ?? [".git"], "repo_discovery.repo_markers"),
    indexExistingRepos: asBoolean(
      readKey(record, "index_existing_repos", "indexExistingRepos") ?? true,
      "repo_discovery.index_existing_repos"
    )
  };
}

function parseSafety(value: unknown): SafetyPolicy {
  const record = asRecord(value, "safety");
  return {
    destructiveToolsEnabled: asBoolean(
      readKey(record, "destructive_tools_enabled", "destructiveToolsEnabled"),
      "safety.destructive_tools_enabled"
    ),
    requireConfirmationToken: asBoolean(
      readKey(record, "require_confirmation_token", "requireConfirmationToken"),
      "safety.require_confirmation_token"
    ),
    localShellAssumption: asString(
      readKey(record, "local_shell_assumption", "localShellAssumption"),
      "safety.local_shell_assumption"
    ) as SafetyPolicy["localShellAssumption"],
    notes: asStringArray(readKey(record, "notes") ?? [], "safety.notes")
  };
}

function parseServices(value: unknown): ServiceDefinition[] {
  if (!Array.isArray(value)) {
    throw new Error("services must be an array");
  }
  return value.map((entry, index) => {
    const record = asRecord(entry, `services[${index}]`);
    return {
      name: asString(readKey(record, "name"), `services[${index}].name`),
      manager: asString(readKey(record, "manager"), `services[${index}].manager`) as ServiceDefinition["manager"],
      unit: asString(readKey(record, "unit"), `services[${index}].unit`),
      cwd: asOptionalString(readKey(record, "cwd"), `services[${index}].cwd`),
      description: asOptionalString(readKey(record, "description"), `services[${index}].description`),
      restartRequiresPrivilege: asBoolean(
        readKey(record, "restart_requires_privilege", "restartRequiresPrivilege") ?? false,
        `services[${index}].restart_requires_privilege`
      ),
      logHint: asOptionalString(readKey(record, "log_hint", "logHint"), `services[${index}].log_hint`)
    };
  });
}

function parseHealthChecks(value: unknown): HealthCheck[] {
  if (!Array.isArray(value)) {
    throw new Error("health_checks must be an array");
  }
  return value.map((entry, index) => {
    const record = asRecord(entry, `health_checks[${index}]`);
    return {
      name: asString(readKey(record, "name"), `health_checks[${index}].name`),
      kind: asString(readKey(record, "kind"), `health_checks[${index}].kind`) as HealthCheck["kind"],
      target: asString(readKey(record, "target"), `health_checks[${index}].target`),
      expected: asOptionalString(readKey(record, "expected"), `health_checks[${index}].expected`)
    };
  });
}

function parseManagedRepos(value: unknown): ManagedRepoDefinition[] {
  if (!Array.isArray(value)) {
    throw new Error("existing_repos must be an array");
  }
  return value.map((entry, index) => {
    const record = asRecord(entry, `existing_repos[${index}]`);
    return {
      id: asString(readKey(record, "id"), `existing_repos[${index}].id`),
      path: asString(readKey(record, "path"), `existing_repos[${index}].path`),
      remote: asOptionalString(readKey(record, "remote"), `existing_repos[${index}].remote`),
      branch: asOptionalString(readKey(record, "branch"), `existing_repos[${index}].branch`),
      role: asOptionalString(readKey(record, "role"), `existing_repos[${index}].role`)
    };
  });
}

function parseClusters(value: unknown): ClusterDefinition[] {
  if (!Array.isArray(value)) {
    throw new Error("clusters must be an array");
  }
  return value.map((entry, index) => {
    const record = asRecord(entry, `clusters[${index}]`);
    return {
      id: asString(readKey(record, "id"), `clusters[${index}].id`),
      displayName: asString(readKey(record, "display_name", "displayName"), `clusters[${index}].display_name`),
      hostIds: asStringArray(readKey(record, "host_ids", "hostIds"), `clusters[${index}].host_ids`),
      purpose: asString(readKey(record, "purpose"), `clusters[${index}].purpose`),
      serviceGroups: asStringArray(readKey(record, "service_groups", "serviceGroups") ?? [], `clusters[${index}].service_groups`),
      mutable: asBoolean(readKey(record, "mutable"), `clusters[${index}].mutable`),
      notes: asOptionalString(readKey(record, "notes"), `clusters[${index}].notes`)
    };
  });
}

function parseVmAdapters(value: unknown): VmAdapterDefinition[] {
  if (!Array.isArray(value)) {
    throw new Error("vm_adapters must be an array");
  }
  return value.map((entry, index) => {
    const record = asRecord(entry, `vm_adapters[${index}]`);
    return {
      id: asString(readKey(record, "id"), `vm_adapters[${index}].id`),
      kind: asString(readKey(record, "kind"), `vm_adapters[${index}].kind`) as VmAdapterDefinition["kind"],
      scope: asString(readKey(record, "scope"), `vm_adapters[${index}].scope`) as VmAdapterDefinition["scope"],
      enabled: asBoolean(readKey(record, "enabled"), `vm_adapters[${index}].enabled`),
      managementHostId: asOptionalString(
        readKey(record, "management_host_id", "managementHostId"),
        `vm_adapters[${index}].management_host_id`
      ),
      imageTemplate: asOptionalString(
        readKey(record, "image_template", "imageTemplate"),
        `vm_adapters[${index}].image_template`
      ),
      grantSudoOnBootstrap: asBoolean(
        readKey(record, "grant_sudo_on_bootstrap", "grantSudoOnBootstrap") ?? false,
        `vm_adapters[${index}].grant_sudo_on_bootstrap`
      ),
      supportsDelete: asBoolean(
        readKey(record, "supports_delete", "supportsDelete") ?? false,
        `vm_adapters[${index}].supports_delete`
      ),
      supportsSnapshots: asBoolean(
        readKey(record, "supports_snapshots", "supportsSnapshots") ?? false,
        `vm_adapters[${index}].supports_snapshots`
      ),
      notes: asOptionalString(readKey(record, "notes"), `vm_adapters[${index}].notes`)
    };
  });
}

function parseHost(value: unknown, index: number): HostDefinition {
  const record = asRecord(value, `hosts[${index}]`);
  return {
    id: asString(readKey(record, "id"), `hosts[${index}].id`),
    hostname: asString(readKey(record, "hostname"), `hosts[${index}].hostname`),
    port: asNumber(readKey(record, "port"), `hosts[${index}].port`),
    sshUser: asString(readKey(record, "ssh_user", "sshUser"), `hosts[${index}].ssh_user`),
    sshImplementation: asString(
      readKey(record, "ssh_implementation", "sshImplementation") ?? "openssh",
      `hosts[${index}].ssh_implementation`
    ) as HostDefinition["sshImplementation"],
    sshOptions: asStringArray(readKey(record, "ssh_options", "sshOptions") ?? [], `hosts[${index}].ssh_options`),
    authMode: asString(readKey(record, "auth_mode", "authMode"), `hosts[${index}].auth_mode`) as HostDefinition["authMode"],
    secretRef: asOptionalString(readKey(record, "secret_ref", "secretRef"), `hosts[${index}].secret_ref`),
    privilegeMode: asString(
      readKey(record, "privilege_mode", "privilegeMode"),
      `hosts[${index}].privilege_mode`
    ) as HostDefinition["privilegeMode"],
    rootAllowed: asBoolean(readKey(record, "root_allowed", "rootAllowed"), `hosts[${index}].root_allowed`),
    repoPath: asString(readKey(record, "repo_path", "repoPath"), `hosts[${index}].repo_path`),
    clusterIds: asStringArray(readKey(record, "cluster_ids", "clusterIds") ?? [], `hosts[${index}].cluster_ids`),
    networkZone: asOptionalString(readKey(record, "network_zone", "networkZone"), `hosts[${index}].network_zone`),
    roleLabels: asStringArray(readKey(record, "role_labels", "roleLabels"), `hosts[${index}].role_labels`),
    mutable: asBoolean(readKey(record, "mutable"), `hosts[${index}].mutable`),
    deletionProtected: asBoolean(
      readKey(record, "deletion_protected", "deletionProtected"),
      `hosts[${index}].deletion_protected`
    ),
    managedScopes: asStringArray(readKey(record, "managed_scopes", "managedScopes") ?? [], `hosts[${index}].managed_scopes`),
    repoDiscoveryPaths: asStringArray(
      readKey(record, "repo_discovery_paths", "repoDiscoveryPaths") ?? [],
      `hosts[${index}].repo_discovery_paths`
    ),
    existingRepos: parseManagedRepos(readKey(record, "existing_repos", "existingRepos") ?? []),
    vmAdapterIds: asStringArray(readKey(record, "vm_adapter_ids", "vmAdapterIds") ?? [], `hosts[${index}].vm_adapter_ids`),
    services: parseServices(readKey(record, "services") ?? []),
    healthChecks: parseHealthChecks(readKey(record, "health_checks", "healthChecks") ?? []),
    overlayPaths: asStringArray(readKey(record, "overlay_paths", "overlayPaths") ?? [], `hosts[${index}].overlay_paths`),
    runtimePaths: asStringArray(readKey(record, "runtime_paths", "runtimePaths") ?? [], `hosts[${index}].runtime_paths`),
    intendedCommit: asOptionalString(readKey(record, "intended_commit", "intendedCommit"), `hosts[${index}].intended_commit`),
    notes: asOptionalString(readKey(record, "notes"), `hosts[${index}].notes`)
  };
}

export function parseInventory(source: string): Inventory {
  const parsed = parseSimpleYaml<Record<string, unknown>>(source);
  const hostsRaw = readKey(parsed, "hosts");
  if (!Array.isArray(hostsRaw)) {
    throw new Error("hosts must be an array");
  }
  const inventory: Inventory = {
    version: asString(readKey(parsed, "version"), "version"),
    repo: parseSharedRepo(readKey(parsed, "repo")),
    repoDiscovery: parseRepoDiscovery(readKey(parsed, "repo_discovery", "repoDiscovery") ?? {}),
    secretBackends: parseSecretBackends(readKey(parsed, "secret_backends", "secretBackends") ?? []),
    safety: parseSafety(readKey(parsed, "safety")),
    clusters: parseClusters(readKey(parsed, "clusters") ?? []),
    vmAdapters: parseVmAdapters(readKey(parsed, "vm_adapters", "vmAdapters") ?? []),
    hosts: hostsRaw.map((entry, index) => parseHost(entry, index))
  };

  const hostIds = new Set<string>();
  for (const host of inventory.hosts) {
    if (hostIds.has(host.id)) {
      throw new Error(`Duplicate host id: ${host.id}`);
    }
    hostIds.add(host.id);
  }

  const clusterIds = new Set(inventory.clusters.map((cluster) => cluster.id));
  for (const host of inventory.hosts) {
    for (const clusterId of host.clusterIds) {
      if (!clusterIds.has(clusterId)) {
        throw new Error(`Host ${host.id} references unknown cluster ${clusterId}`);
      }
    }
  }

  const vmAdapterIds = new Set(inventory.vmAdapters.map((adapter) => adapter.id));
  for (const host of inventory.hosts) {
    for (const vmAdapterId of host.vmAdapterIds) {
      if (!vmAdapterIds.has(vmAdapterId)) {
        throw new Error(`Host ${host.id} references unknown vm adapter ${vmAdapterId}`);
      }
    }
  }

  return inventory;
}

export async function loadInventory(inventoryPath: string): Promise<Inventory> {
  const resolvedPath = path.resolve(inventoryPath);
  const source = await readFile(resolvedPath, "utf8");
  return parseInventory(source);
}
