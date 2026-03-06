import { spawn } from "node:child_process";

import type {
  CommandRequest,
  CommandResult,
  HostDefinition,
  HostSnapshot,
  Inventory,
  RemoteFileWriteResult,
  ServiceRuntimeStatus
} from "../../remote-infra-types/src/index.ts";
import { classifyPath } from "./classification.ts";

export interface RemoteTransport {
  readFile(host: HostDefinition, targetPath: string): Promise<string>;
  writeFile(host: HostDefinition, targetPath: string, contents: string): Promise<RemoteFileWriteResult>;
  exec(host: HostDefinition, request: CommandRequest): Promise<CommandResult>;
  collectSnapshot(host: HostDefinition, inventory: Inventory): Promise<HostSnapshot>;
}

export interface MockHostState extends HostSnapshot {
  fileContents: Record<string, string>;
  logs?: Record<string, string[]>;
}

function parseBranchStatus(line: string): { branch: string; ahead: number; behind: number } {
  const branchMatch = line.match(/^## ([^. ]+)/u);
  const aheadMatch = line.match(/ahead (\d+)/u);
  const behindMatch = line.match(/behind (\d+)/u);
  return {
    branch: branchMatch?.[1] ?? "unknown",
    ahead: aheadMatch ? Number(aheadMatch[1]) : 0,
    behind: behindMatch ? Number(behindMatch[1]) : 0
  };
}

export function parseGitStatusPorcelain(output: string, head: string) {
  const lines = output.trim().split(/\r?\n/u).filter(Boolean);
  const branch = lines[0] ?? "## unknown";
  const parsedBranch = parseBranchStatus(branch);
  const modified: string[] = [];
  const deleted: string[] = [];
  const untracked: string[] = [];

  for (const line of lines.slice(1)) {
    if (line.startsWith("?? ")) {
      untracked.push(line.slice(3));
      continue;
    }
    const statusCode = line.slice(0, 2);
    const filePath = line.slice(3);
    if (statusCode.includes("D")) {
      deleted.push(filePath);
    } else {
      modified.push(filePath);
    }
  }

  return {
    branch: parsedBranch.branch,
    head,
    clean: modified.length === 0 && deleted.length === 0 && untracked.length === 0,
    ahead: parsedBranch.ahead,
    behind: parsedBranch.behind,
    modified,
    deleted,
    untracked
  };
}

export class MockTransport implements RemoteTransport {
  private readonly stateByHost = new Map<string, MockHostState>();

  constructor(states: MockHostState[]) {
    for (const state of states) {
      this.stateByHost.set(state.hostId, {
        ...state,
        files: [...state.files],
        repoStatus: {
          ...state.repoStatus,
          modified: [...state.repoStatus.modified],
          deleted: [...state.repoStatus.deleted],
          untracked: [...state.repoStatus.untracked]
        },
        serviceStatus: state.serviceStatus.map((service) => ({ ...service })),
        fileContents: { ...state.fileContents },
        logs: { ...(state.logs ?? {}) }
      });
    }
  }

  private getState(hostId: string): MockHostState {
    const state = this.stateByHost.get(hostId);
    if (!state) {
      throw new Error(`No mock state configured for host ${hostId}`);
    }
    return state;
  }

  async readFile(host: HostDefinition, targetPath: string): Promise<string> {
    const state = this.getState(host.id);
    const contents = state.fileContents[targetPath];
    if (contents === undefined) {
      throw new Error(`Mock file not found on ${host.id}: ${targetPath}`);
    }
    return contents;
  }

  async writeFile(host: HostDefinition, targetPath: string, contents: string): Promise<RemoteFileWriteResult> {
    const state = this.getState(host.id);
    const previous = state.fileContents[targetPath];
    state.fileContents[targetPath] = contents;

    const fileEntry = state.files.find((entry) => entry.path === targetPath);
    if (!fileEntry) {
      state.files.push({
        path: targetPath,
        kind: "runtime",
        tracked: false,
        exists: true,
        notes: "Created during mock write"
      });
    } else {
      fileEntry.exists = true;
    }

    if (fileEntry?.tracked ?? false) {
      const relativePath = targetPath;
      if (!state.repoStatus.modified.includes(relativePath)) {
        state.repoStatus.modified.push(relativePath);
      }
      state.repoStatus.clean = false;
    }

    return {
      hostId: host.id,
      path: targetPath,
      changed: previous !== contents
    };
  }

  async exec(host: HostDefinition, request: CommandRequest): Promise<CommandResult> {
    const state = this.getState(host.id);
    const [binary, ...rest] = request.argv;
    if (binary === "pwd") {
      return { code: 0, stdout: `${host.repoPath}\n`, stderr: "" };
    }
    if (binary === "find") {
      const matches = new Set<string>();
      const roots = rest.filter((entry) => !entry.startsWith("-") && entry !== ".git");
      for (const root of roots) {
        for (const filePath of Object.keys(state.fileContents)) {
          if (filePath.startsWith(root)) {
            matches.add(filePath.endsWith("/.git") ? filePath : `${root.replace(/\/$/u, "")}/.git`);
          }
        }
      }
      return { code: 0, stdout: Array.from(matches).sort().join("\n"), stderr: "" };
    }
    if (binary === "curl") {
      return { code: 0, stdout: "ok", stderr: "" };
    }
    if (binary === "systemctl" && rest[0] === "restart") {
      const unit = rest[1];
      const service = state.serviceStatus.find((entry) => entry.unit === unit);
      if (service) {
        service.state = "active";
        service.detail = "Restarted by mock transport";
      }
      return { code: 0, stdout: `restarted ${unit}`, stderr: "" };
    }
    if (binary === "systemctl" && rest[0] === "status") {
      const unit = rest[1];
      const service = state.serviceStatus.find((entry) => entry.unit === unit);
      return {
        code: 0,
        stdout: service ? `${service.unit} ${service.state}` : `${unit} unknown`,
        stderr: ""
      };
    }
    if (binary === "journalctl") {
      const unitIndex = rest.indexOf("-u");
      const unit = unitIndex !== -1 ? rest[unitIndex + 1] : "unknown";
      const lines = state.logs?.[unit] ?? [];
      return { code: 0, stdout: lines.join("\n"), stderr: "" };
    }
    if (binary === "git" && rest[0] === "status") {
      const branchLine = `## ${state.repoStatus.branch}`;
      const modified = state.repoStatus.modified.map((entry) => ` M ${entry}`);
      const deleted = state.repoStatus.deleted.map((entry) => ` D ${entry}`);
      const untracked = state.repoStatus.untracked.map((entry) => `?? ${entry}`);
      return {
        code: 0,
        stdout: [branchLine, ...modified, ...deleted, ...untracked].join("\n"),
        stderr: ""
      };
    }
    if (binary === "git" && rest[0] === "rev-parse") {
      return { code: 0, stdout: `${state.deployedCommit}\n`, stderr: "" };
    }
    if (binary === "git" && rest[1] === "remote" && rest[2] === "get-url") {
      return { code: 0, stdout: "git@github.com:example/ssh-system-architect.git\n", stderr: "" };
    }
    if (binary === "git" && rest.includes("--abbrev-ref")) {
      return { code: 0, stdout: `${state.repoStatus.branch}\n`, stderr: "" };
    }
    return { code: 0, stdout: "", stderr: "" };
  }

  async collectSnapshot(host: HostDefinition, inventory: Inventory): Promise<HostSnapshot> {
    const state = this.getState(host.id);
    state.files = state.files.map((entry) => ({
      ...entry,
      kind: classifyPath(inventory, host, entry.path)
    }));
    return {
      ...state,
      files: state.files.map((entry) => ({ ...entry })),
      repoStatus: {
        ...state.repoStatus,
        modified: [...state.repoStatus.modified],
        deleted: [...state.repoStatus.deleted],
        untracked: [...state.repoStatus.untracked]
      },
      serviceStatus: state.serviceStatus.map((entry) => ({ ...entry }))
    };
  }
}

function quoteForRemoteShell(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

function execute(command: string, args: string[], input?: string): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({ code: code ?? 1, stdout, stderr });
    });
    if (input !== undefined) {
      child.stdin.write(input, "utf8");
    }
    child.stdin.end();
  });
}

function buildRemoteCommand(host: HostDefinition, request: CommandRequest): string {
  const prefix =
    request.requiresPrivilege && host.privilegeMode === "sudo"
      ? "sudo -n -- "
      : "";
  const cwdPrefix = request.cwd ? `cd ${quoteForRemoteShell(request.cwd)} && ` : "";
  const body = request.argv.map((part) => quoteForRemoteShell(part)).join(" ");
  return `${prefix}${cwdPrefix}${body}`;
}

function buildSshArgs(host: HostDefinition, remoteCommand: string): string[] {
  return [
    ...host.sshOptions,
    "-p",
    String(host.port),
    `${host.sshUser}@${host.hostname}`,
    remoteCommand
  ];
}

async function collectRemoteFiles(host: HostDefinition, basePath: string): Promise<string[]> {
  const request: CommandRequest = {
    argv: ["sh", "-lc", `if [ -d ${quoteForRemoteShell(basePath)} ]; then find ${quoteForRemoteShell(basePath)} -type f | sort; fi`]
  };
  const result = await execute("ssh", buildSshArgs(host, buildRemoteCommand(host, request)));
  if (result.code !== 0) {
    return [];
  }
  return result.stdout.split(/\r?\n/u).map((entry) => entry.trim()).filter(Boolean);
}

function toServiceStatus(host: HostDefinition, serviceName: string, output: string): ServiceRuntimeStatus {
  const state = output.includes("active") ? "active" : output.includes("failed") ? "failed" : "inactive";
  const service = host.services.find((entry) => entry.name === serviceName);
  return {
    name: serviceName,
    unit: service?.unit ?? serviceName,
    state,
    detail: output.trim()
  };
}

export class SshTransport implements RemoteTransport {
  async readFile(host: HostDefinition, targetPath: string): Promise<string> {
    const result = await execute("ssh", buildSshArgs(host, `cat -- ${quoteForRemoteShell(targetPath)}`));
    if (result.code !== 0) {
      throw new Error(result.stderr || `Unable to read remote file ${targetPath}`);
    }
    return result.stdout;
  }

  async writeFile(host: HostDefinition, targetPath: string, contents: string): Promise<RemoteFileWriteResult> {
    const remoteCommand = `mkdir -p $(dirname ${quoteForRemoteShell(targetPath)}) && cat > ${quoteForRemoteShell(targetPath)}`;
    const result = await execute(
      "ssh",
      buildSshArgs(host, remoteCommand),
      contents
    );
    if (result.code !== 0) {
      throw new Error(result.stderr || `Unable to write remote file ${targetPath}`);
    }
    return { hostId: host.id, path: targetPath, changed: true };
  }

  async exec(host: HostDefinition, request: CommandRequest): Promise<CommandResult> {
    return execute("ssh", buildSshArgs(host, buildRemoteCommand(host, request)));
  }

  async collectSnapshot(host: HostDefinition, inventory: Inventory): Promise<HostSnapshot> {
    const headResult = await this.exec(host, {
      argv: ["git", "-C", host.repoPath, "rev-parse", "HEAD"]
    });
    const deployedCommit = headResult.stdout.trim() || inventory.repo.intendedCommit;
    const statusResult = await this.exec(host, {
      argv: ["git", "-C", host.repoPath, "status", "--porcelain=v1", "--branch"]
    });
    const repoStatus = parseGitStatusPorcelain(statusResult.stdout, deployedCommit);

    const files = [
      ...(await Promise.all(
        host.overlayPaths.map(async (overlayPath) =>
          (await collectRemoteFiles(host, `${host.repoPath}/${overlayPath}`)).map((entry) => ({
            path: entry,
            kind: classifyPath(inventory, host, entry),
            tracked: true,
            exists: true
          }))
        )
      )).flat(),
      ...(await Promise.all(
        host.runtimePaths.map(async (runtimePath) =>
          (await collectRemoteFiles(host, runtimePath.startsWith("/") ? runtimePath : `${host.repoPath}/${runtimePath}`)).map(
            (entry) => ({
              path: entry,
              kind: classifyPath(inventory, host, entry),
              tracked: false,
              exists: true
            })
          )
        )
      )).flat(),
      ...repoStatus.modified.map((entry) => ({
        path: entry,
        kind: classifyPath(inventory, host, entry),
        tracked: true,
        exists: true,
        notes: "Tracked change from git status"
      })),
      ...repoStatus.untracked.map((entry) => ({
        path: entry,
        kind: classifyPath(inventory, host, entry),
        tracked: false,
        exists: true,
        notes: "Untracked file"
      }))
    ];

    const serviceStatus = await Promise.all(
      host.services.map(async (service) => {
        const result = await this.exec(host, {
          argv: ["systemctl", "status", service.unit, "--no-pager"],
          requiresPrivilege: service.restartRequiresPrivilege ?? false
        });
        return toServiceStatus(host, service.name, result.stdout || result.stderr);
      })
    );

    return {
      hostId: host.id,
      deployedCommit,
      intendedCommit: host.intendedCommit ?? inventory.repo.intendedCommit,
      repoStatus,
      files,
      serviceStatus,
      roleSummary: host.notes
    };
  }
}
