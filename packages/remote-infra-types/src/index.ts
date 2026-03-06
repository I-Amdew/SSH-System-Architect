export type AuthMode = "ssh-agent" | "keychain" | "wincred" | "env" | "password";
export type PrivilegeMode = "none" | "sudo" | "root";
export type ServiceManager = "systemd" | "supervisor" | "none";
export type FileKind = "shared_repo" | "overlay" | "runtime" | "drift";
export type SshImplementation = "openssh";
export type VmAdapterKind = "libvirt" | "proxmox" | "hyperv" | "vmware" | "qemu" | "custom";
export type VmAdapterScope = "local" | "remote-host";

export interface SharedRepoDefinition {
  name: string;
  gitRemote: string;
  repoRoot: string;
  defaultBranch: string;
  intendedCommit: string;
  sharedRoots: string[];
  runtimeRootHints: string[];
}

export interface Inventory {
  version: string;
  repo: SharedRepoDefinition;
  repoDiscovery: RepoDiscoveryPolicy;
  secretBackends: SecretBackendDefinition[];
  safety: SafetyPolicy;
  clusters: ClusterDefinition[];
  vmAdapters: VmAdapterDefinition[];
  hosts: HostDefinition[];
}

export interface RepoDiscoveryPolicy {
  scanRoots: string[];
  repoMarkers: string[];
  indexExistingRepos: boolean;
}

export interface SecretBackendDefinition {
  id: string;
  kind: "ssh-agent" | "keychain" | "wincred" | "env" | "password";
  enabled: boolean;
  notes?: string;
}

export interface SafetyPolicy {
  destructiveToolsEnabled: boolean;
  requireConfirmationToken: boolean;
  localShellAssumption: "workspace-write" | "unknown";
  notes: string[];
}

export interface HostDefinition {
  id: string;
  hostname: string;
  port: number;
  sshUser: string;
  sshImplementation: SshImplementation;
  sshOptions: string[];
  authMode: AuthMode;
  secretRef?: string;
  privilegeMode: PrivilegeMode;
  rootAllowed: boolean;
  repoPath: string;
  clusterIds: string[];
  networkZone?: string;
  roleLabels: string[];
  mutable: boolean;
  deletionProtected: boolean;
  managedScopes: string[];
  repoDiscoveryPaths: string[];
  existingRepos: ManagedRepoDefinition[];
  vmAdapterIds: string[];
  services: ServiceDefinition[];
  healthChecks: HealthCheck[];
  overlayPaths: string[];
  runtimePaths: string[];
  intendedCommit?: string;
  notes?: string;
}

export interface ManagedRepoDefinition {
  id: string;
  path: string;
  remote?: string;
  branch?: string;
  role?: string;
}

export interface ClusterDefinition {
  id: string;
  displayName: string;
  hostIds: string[];
  purpose: string;
  serviceGroups: string[];
  mutable: boolean;
  notes?: string;
}

export interface VmAdapterDefinition {
  id: string;
  kind: VmAdapterKind;
  scope: VmAdapterScope;
  enabled: boolean;
  managementHostId?: string;
  imageTemplate?: string;
  grantSudoOnBootstrap: boolean;
  supportsDelete: boolean;
  supportsSnapshots: boolean;
  notes?: string;
}

export interface ServiceDefinition {
  name: string;
  manager: ServiceManager;
  unit: string;
  cwd?: string;
  description?: string;
  restartRequiresPrivilege?: boolean;
  logHint?: string;
}

export interface HealthCheck {
  name: string;
  kind: "http" | "tcp" | "command";
  target: string;
  expected?: string;
}

export interface RepoStatus {
  branch: string;
  head: string;
  clean: boolean;
  ahead: number;
  behind: number;
  modified: string[];
  deleted: string[];
  untracked: string[];
}

export interface HostFileEntry {
  path: string;
  kind: FileKind;
  tracked: boolean;
  exists: boolean;
  notes?: string;
}

export interface ServiceRuntimeStatus {
  name: string;
  unit: string;
  state: "active" | "inactive" | "failed" | "unknown";
  detail?: string;
}

export interface HostSnapshot {
  hostId: string;
  deployedCommit: string;
  intendedCommit: string;
  repoStatus: RepoStatus;
  files: HostFileEntry[];
  serviceStatus: ServiceRuntimeStatus[];
  roleSummary?: string;
  runtimeNotes?: string[];
  overlayNotes?: string[];
  driftSummary?: string;
}

export interface CommandRequest {
  argv: string[];
  cwd?: string;
  requiresPrivilege?: boolean;
  reason?: string;
}

export interface CommandResult {
  code: number;
  stdout: string;
  stderr: string;
}

export interface RemoteFileWriteResult {
  hostId: string;
  path: string;
  changed: boolean;
}

export interface StructuredPatchOperation {
  op: "replace_text" | "insert_before" | "insert_after" | "append" | "delete_text";
  find?: string;
  replace?: string;
  text?: string;
  all?: boolean;
}

export interface GenerateIndexOptions {
  outputRoot: string;
  workspaceRoot: string;
  exhaustiveFiles?: boolean;
}

export interface TopologySummary {
  topology: string;
  hosts: Array<{
    hostId: string;
    roles: string[];
    services: string[];
    overlayPaths: string[];
    runtimePaths: string[];
  }>;
  clusters: Array<{
    id: string;
    displayName: string;
    hostIds: string[];
  }>;
  vmAdapters: Array<{
    id: string;
    kind: VmAdapterKind;
    scope: VmAdapterScope;
    enabled: boolean;
  }>;
}

export interface HostComparison {
  hostId: string;
  sharedRepo: HostFileEntry[];
  overlays: HostFileEntry[];
  runtimeOnly: HostFileEntry[];
  drift: HostFileEntry[];
}

export interface ConnectivityCheckResult {
  hostId: string;
  sshReachable: boolean;
  repoReachable: boolean;
  deployedCommit?: string;
  healthChecks: Array<{
    name: string;
    state: "ok" | "failed" | "skipped";
    detail: string;
  }>;
  notes: string[];
}

export interface DiscoveredRepo {
  path: string;
  remote?: string;
  branch?: string;
  matchedInventory: boolean;
}

export interface RepoDiscoveryResult {
  hostId: string;
  scanRoots: string[];
  repos: DiscoveredRepo[];
}

export interface ClusterActionResult<T> {
  clusterId?: string;
  hostIds: string[];
  results: Array<{
    hostId: string;
    result: T;
  }>;
}
