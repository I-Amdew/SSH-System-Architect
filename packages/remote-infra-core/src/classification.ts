import path from "node:path";

import type { FileKind, HostComparison, HostDefinition, HostFileEntry, HostSnapshot, Inventory } from "../../remote-infra-types/src/index.ts";

function normalizePath(input: string): string {
  return input.replaceAll("\\", "/").replace(/\/+/gu, "/").replace(/^\.\//u, "").replace(/\/$/u, "");
}

function normalizeRelativeToRepo(host: HostDefinition, candidatePath: string): string {
  const normalizedCandidate = normalizePath(candidatePath);
  const normalizedRepoRoot = normalizePath(host.repoPath);
  if (normalizedCandidate === normalizedRepoRoot) {
    return "";
  }
  if (normalizedCandidate.startsWith(`${normalizedRepoRoot}/`)) {
    return normalizedCandidate.slice(normalizedRepoRoot.length + 1);
  }
  return normalizedCandidate;
}

function isWithin(candidatePath: string, rootPath: string): boolean {
  if (!rootPath) {
    return false;
  }
  const normalizedCandidate = normalizePath(candidatePath);
  const normalizedRoot = normalizePath(rootPath);
  return normalizedCandidate === normalizedRoot || normalizedCandidate.startsWith(`${normalizedRoot}/`);
}

export function classifyPath(inventory: Inventory, host: HostDefinition, candidatePath: string): FileKind {
  const relativePath = normalizeRelativeToRepo(host, candidatePath);
  if (host.runtimePaths.some((runtimePath) => isWithin(relativePath, runtimePath) || isWithin(candidatePath, runtimePath))) {
    return "runtime";
  }
  if (host.overlayPaths.some((overlayPath) => isWithin(relativePath, overlayPath))) {
    return "overlay";
  }
  if (inventory.repo.sharedRoots.some((sharedRoot) => isWithin(relativePath, sharedRoot))) {
    return "shared_repo";
  }
  return "drift";
}

export function compareHostSnapshot(snapshot: HostSnapshot): HostComparison {
  const group = (kind: FileKind): HostFileEntry[] => snapshot.files.filter((entry) => entry.kind === kind);
  return {
    hostId: snapshot.hostId,
    sharedRepo: group("shared_repo"),
    overlays: group("overlay"),
    runtimeOnly: group("runtime"),
    drift: group("drift")
  };
}

export function relativeOutputPath(basePath: string): string {
  const normalized = normalizePath(basePath);
  if (normalized.startsWith("/")) {
    return path.posix.join("absolute", normalized.slice(1));
  }
  return normalized;
}
