import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { RemoteInfraOrchestrator, SshTransport, loadInventory } from "../../packages/remote-infra-core/src/index.ts";

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const nodeBinary = process.execPath;

function runCommand(
  command: string,
  args: string[],
  options?: {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
  }
) {
  return new Promise<{ code: number; stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options?.cwd,
      env: options?.env,
      stdio: ["ignore", "pipe", "pipe"]
    });
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
  });
}

function startCommand(
  command: string,
  args: string[],
  options?: {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
  }
) {
  return spawn(command, args, {
    cwd: options?.cwd,
    env: options?.env,
    stdio: ["ignore", "pipe", "pipe"]
  });
}

async function reservePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (typeof address !== "object" || address === null) {
        reject(new Error("Unable to reserve port"));
        return;
      }
      const port = address.port;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(port);
      });
    });
    server.on("error", reject);
  });
}

async function waitForHttp(url: string, timeoutMs: number) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return response;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function copyRepoSkeleton(sourceRoot: string, targetRoot: string) {
  await cp(sourceRoot, targetRoot, {
    recursive: true,
    filter(source) {
      const relative = path.relative(sourceRoot, source);
      if (!relative) {
        return true;
      }
      if (relative === ".infra-index" || relative.startsWith(`.infra-index${path.sep}`)) {
        return false;
      }
      if (relative === "node_modules" || relative.startsWith(`node_modules${path.sep}`)) {
        return false;
      }
      if (relative === ".git" || relative.startsWith(`.git${path.sep}`)) {
        return false;
      }
      return true;
    }
  });
}

async function initializeGitRepo(repoPath: string) {
  const init = await runCommand("git", ["init", "-b", "main"], { cwd: repoPath });
  assert.equal(init.code, 0, init.stderr);
  const configName = await runCommand("git", ["config", "user.name", "SSH System Architect Lab"], { cwd: repoPath });
  assert.equal(configName.code, 0, configName.stderr);
  const configEmail = await runCommand("git", ["config", "user.email", "lab@example.invalid"], { cwd: repoPath });
  assert.equal(configEmail.code, 0, configEmail.stderr);
  const add = await runCommand("git", ["add", "."], { cwd: repoPath });
  assert.equal(add.code, 0, add.stderr);
  const commit = await runCommand("git", ["commit", "-m", "lab seed"], { cwd: repoPath });
  assert.equal(commit.code, 0, commit.stderr);
  const head = await runCommand("git", ["rev-parse", "--short", "HEAD"], { cwd: repoPath });
  assert.equal(head.code, 0, head.stderr);
  return head.stdout.trim();
}

async function cloneGitRepo(sourceRepoPath: string, targetRepoPath: string) {
  const clone = await runCommand("git", ["clone", sourceRepoPath, targetRepoPath]);
  assert.equal(clone.code, 0, clone.stderr);
}

async function collectLabLogs(logFiles: string[]) {
  const chunks: string[] = [];
  for (const logFile of logFiles) {
    try {
      const contents = await readFile(logFile, "utf8");
      chunks.push(`--- ${path.basename(logFile)} ---\n${contents.trim()}`);
    } catch {}
  }
  return chunks.join("\n\n");
}

function collectProcessOutput(child: ChildProcess) {
  let stderr = "";
  child.stderr?.on("data", (chunk) => {
    stderr += chunk.toString("utf8");
  });
  return () => stderr;
}

test("lab e2e boots two SSH hosts, runs the demo across both, and tears down", { skip: process.env.RUN_LAB_E2E !== "1", timeout: 120_000 }, async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "ssh-system-architect-lab-"));
  const hostARepo = path.join(tempRoot, "host_a_repo");
  const hostBRepo = path.join(tempRoot, "host_b_repo");
  const clientKeyPath = path.join(tempRoot, "lab_key");
  const authorizedKeysPath = path.join(tempRoot, "authorized_keys");
  const sshConfigPath = path.join(tempRoot, "ssh_config");
  const inventoryPath = path.join(tempRoot, "inventory.lab.yml");
  const sshPortA = await reservePort();
  const sshPortB = await reservePort();
  const shardPortA = await reservePort();
  const shardPortB = await reservePort();
  const gatewayPort = await reservePort();
  const currentUser = os.userInfo().username;
  const sshdChildren: ChildProcess[] = [];
  const logFiles = [
    path.join(tempRoot, "gateway.log"),
    path.join(tempRoot, "shard_a.log"),
    path.join(tempRoot, "shard_b.log")
  ];

  await copyRepoSkeleton(workspaceRoot, hostARepo);
  const intendedCommit = await initializeGitRepo(hostARepo);
  await cloneGitRepo(hostARepo, hostBRepo);

  await writeFile(
    path.join(hostBRepo, "examples/demo_sharded_snake/services/snake_shard/src/main.ts"),
    `${await readFile(path.join(hostBRepo, "examples/demo_sharded_snake/services/snake_shard/src/main.ts"), "utf8")}\n// host_b lab drift marker\n`,
    "utf8"
  );

  const keygen = await runCommand("ssh-keygen", ["-q", "-t", "ed25519", "-N", "", "-f", clientKeyPath]);
  assert.equal(keygen.code, 0, keygen.stderr);
  await cp(`${clientKeyPath}.pub`, authorizedKeysPath);

  const hostAHostKey = path.join(tempRoot, "host_a_ed25519");
  const hostBHostKey = path.join(tempRoot, "host_b_ed25519");
  assert.equal((await runCommand("ssh-keygen", ["-q", "-t", "ed25519", "-N", "", "-f", hostAHostKey])).code, 0);
  assert.equal((await runCommand("ssh-keygen", ["-q", "-t", "ed25519", "-N", "", "-f", hostBHostKey])).code, 0);

  await writeFile(
    sshConfigPath,
    [
      "Host host_a_lab",
      "  HostName 127.0.0.1",
      `  Port ${sshPortA}`,
      `  User ${currentUser}`,
      `  IdentityFile ${clientKeyPath}`,
      "  StrictHostKeyChecking no",
      "  UserKnownHostsFile /dev/null",
      "  LogLevel ERROR",
      "",
      "Host host_b_lab",
      "  HostName 127.0.0.1",
      `  Port ${sshPortB}`,
      `  User ${currentUser}`,
      `  IdentityFile ${clientKeyPath}`,
      "  StrictHostKeyChecking no",
      "  UserKnownHostsFile /dev/null",
      "  LogLevel ERROR",
      ""
    ].join("\n"),
    "utf8"
  );

  const inventorySource = await readFile(path.join(workspaceRoot, "lab/ssh_cluster/inventory.compact.yml"), "utf8");
  const inventoryText = inventorySource
    .replaceAll("7d9e3aa", intendedCommit)
    .replace("hostname: 127.0.0.1\n    port: 2222", `hostname: 127.0.0.1\n    port: ${sshPortA}\n    ssh_host_alias: host_a_lab`)
    .replace("hostname: 127.0.0.1\n    port: 2223", `hostname: 127.0.0.1\n    port: ${sshPortB}\n    ssh_host_alias: host_b_lab`)
    .replace("ssh_user: codex", `ssh_user: ${currentUser}`)
    .replace("ssh_user: codex", `ssh_user: ${currentUser}`)
    .replace("privilege_mode: sudo", "privilege_mode: none")
    .replace("privilege_mode: sudo", "privilege_mode: none")
    .replace("root_allowed: true", "root_allowed: false")
    .replace("root_allowed: true", "root_allowed: false")
    .replace("repo_path: /srv/ssh-system-architect", `repo_path: ${hostARepo}`)
    .replace("repo_path: /srv/ssh-system-architect", `repo_path: ${hostBRepo}`)
    .replace("http://127.0.0.1:8080/health", `http://127.0.0.1:${gatewayPort}/health`)
    .replace("http://127.0.0.1:4101/health", `http://127.0.0.1:${shardPortA}/health`)
    .replace("http://127.0.0.1:4102/health", `http://127.0.0.1:${shardPortB}/health`);
  await writeFile(inventoryPath, inventoryText, "utf8");

  const sshdConfigs = [
    { alias: "host_a_lab", port: sshPortA, hostKey: hostAHostKey },
    { alias: "host_b_lab", port: sshPortB, hostKey: hostBHostKey }
  ];

  for (const config of sshdConfigs) {
    const configPath = path.join(tempRoot, `${config.alias}.sshd_config`);
    await writeFile(
      configPath,
      [
        `Port ${config.port}`,
        "ListenAddress 127.0.0.1",
        `PidFile ${path.join(tempRoot, `${config.alias}.pid`)}`,
        `HostKey ${config.hostKey}`,
        `AuthorizedKeysFile ${authorizedKeysPath}`,
        `AllowUsers ${currentUser}`,
        "PasswordAuthentication no",
        "KbdInteractiveAuthentication no",
        "PubkeyAuthentication yes",
        "PermitRootLogin no",
        "UsePAM no",
        "StrictModes no",
        "LogLevel ERROR",
        "Subsystem sftp internal-sftp",
        ""
      ].join("\n"),
      "utf8"
    );
    const child = startCommand("/usr/sbin/sshd", ["-D", "-e", "-f", configPath]);
    const getStderr = collectProcessOutput(child);
    sshdChildren.push(child);
    await new Promise((resolve) => setTimeout(resolve, 500));
    assert.equal(child.exitCode, null, getStderr());
  }

  process.env.SSH_CONFIG_FILE = sshConfigPath;

  const inventory = await loadInventory(inventoryPath);
  const orchestrator = new RemoteInfraOrchestrator(inventory, new SshTransport(), {
    workspaceRoot
  });
  let testFailed = false;

  try {
    const imported = await orchestrator.importSshConfigHosts(sshConfigPath);
    assert.equal(imported.inventoryStubs.length, 2);

    const hostAConnectivity = await orchestrator.diagnoseHostConnectivity("host_a");
    const hostBConnectivity = await orchestrator.diagnoseHostConnectivity("host_b");
    assert.equal(hostAConnectivity.sshReachable, true, JSON.stringify(hostAConnectivity));
    assert.equal(hostBConnectivity.sshReachable, true, JSON.stringify(hostBConnectivity));
    assert.equal(hostAConnectivity.repoReachable, true, JSON.stringify(hostAConnectivity));
    assert.equal(hostBConnectivity.repoReachable, true, JSON.stringify(hostBConnectivity));

    await orchestrator.applyRemotePatch(`${"host_a"}`, path.join(hostARepo, "examples/demo_sharded_snake/deploy/overlays/gateway/gateway.config.json"), [
      {
        op: "replace_text",
        find: "\"listenPort\": 8080",
        replace: `"listenPort": ${gatewayPort}`
      },
      {
        op: "replace_text",
        find: "http://127.0.0.1:4101",
        replace: `http://127.0.0.1:${shardPortA}`
      },
      {
        op: "replace_text",
        find: "http://127.0.0.1:4102",
        replace: `http://127.0.0.1:${shardPortB}`
      }
    ]);

    await orchestrator.applyRemotePatch("host_a", path.join(hostARepo, "examples/demo_sharded_snake/deploy/overlays/shard_a/shard.config.json"), [
      {
        op: "replace_text",
        find: "\"listenPort\": 4101",
        replace: `"listenPort": ${shardPortA}`
      }
    ]);

    await orchestrator.applyRemotePatch("host_b", path.join(hostBRepo, "examples/demo_sharded_snake/deploy/overlays/shard_b/shard.config.json"), [
      {
        op: "replace_text",
        find: "\"listenPort\": 4102",
        replace: `"listenPort": ${shardPortB}`
      }
    ]);

    const shardLaunches = [
      {
        hostId: "host_a",
        repoPath: hostARepo,
        pidFile: path.join(tempRoot, "shard_a.pid"),
        logFile: path.join(tempRoot, "shard_a.log"),
        command: [
          nodeBinary,
          "examples/demo_sharded_snake/services/snake_shard/src/main.ts",
          "--config",
          "examples/demo_sharded_snake/deploy/overlays/shard_a/shard.config.json"
        ]
      },
      {
        hostId: "host_b",
        repoPath: hostBRepo,
        pidFile: path.join(tempRoot, "shard_b.pid"),
        logFile: path.join(tempRoot, "shard_b.log"),
        command: [
          nodeBinary,
          "examples/demo_sharded_snake/services/snake_shard/src/main.ts",
          "--config",
          "examples/demo_sharded_snake/deploy/overlays/shard_b/shard.config.json"
        ]
      }
    ];

    for (const launch of shardLaunches) {
      const result = await orchestrator.runRemoteCommand(launch.hostId, {
        argv: [
          nodeBinary,
          path.join(launch.repoPath, "tests/e2e/helpers/remote-launch.ts"),
          "--cwd",
          launch.repoPath,
          "--pid-file",
          launch.pidFile,
          "--log-file",
          launch.logFile,
          "--",
          ...launch.command
        ]
      });
      assert.equal(result.code, 0, result.stderr);
    }

    await waitForHttp(`http://127.0.0.1:${shardPortA}/health`, 20_000);
    await waitForHttp(`http://127.0.0.1:${shardPortB}/health`, 20_000);

    const gatewayLaunch = {
      hostId: "host_a",
      repoPath: hostARepo,
      pidFile: path.join(tempRoot, "gateway.pid"),
      logFile: path.join(tempRoot, "gateway.log"),
      command: [
        nodeBinary,
        "examples/demo_sharded_snake/apps/web_gateway/src/main.ts",
        "--config",
        "examples/demo_sharded_snake/deploy/overlays/gateway/gateway.config.json"
      ]
    };
    const gatewayResult = await orchestrator.runRemoteCommand(gatewayLaunch.hostId, {
      argv: [
        nodeBinary,
        path.join(gatewayLaunch.repoPath, "tests/e2e/helpers/remote-launch.ts"),
        "--cwd",
        gatewayLaunch.repoPath,
        "--pid-file",
        gatewayLaunch.pidFile,
        "--log-file",
        gatewayLaunch.logFile,
        "--",
        ...gatewayLaunch.command
      ]
    });
    assert.equal(gatewayResult.code, 0, gatewayResult.stderr);

    await waitForHttp(`http://127.0.0.1:${gatewayPort}/health`, 20_000);
    await new Promise((resolve) => setTimeout(resolve, 4_000));
    const stateResponse = await waitForHttp(`http://127.0.0.1:${gatewayPort}/state`, 5_000);
    const state = await stateResponse.json() as {
      state: {
        owner: string;
        handoffs: Array<unknown>;
      };
    };

    assert.ok(["shard_a", "shard_b"].includes(state.state.owner));
    assert.ok(state.state.handoffs.length > 0);

    const repoStates = await orchestrator.reportRepoState(["host_a", "host_b"]);
    const hostBState = repoStates.find((entry) => entry.hostId === "host_b");
    assert.ok(hostBState);
    assert.equal(hostBState.repoStatus.clean, false);

    const comparison = await orchestrator.compareState("host_a");
    assert.ok(comparison.overlays.some((entry) => entry.path.includes("gateway.config.json")));
  } catch (error) {
    testFailed = true;
    const logs = await collectLabLogs(logFiles);
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    throw new Error(logs ? `${message}\n\n${logs}` : message);
  } finally {
    for (const stop of [
      { hostId: "host_a", repoPath: hostARepo, pidFile: path.join(tempRoot, "gateway.pid") },
      { hostId: "host_a", repoPath: hostARepo, pidFile: path.join(tempRoot, "shard_a.pid") },
      { hostId: "host_b", repoPath: hostBRepo, pidFile: path.join(tempRoot, "shard_b.pid") }
    ]) {
      try {
        await orchestrator.runRemoteCommand(stop.hostId, {
          argv: [nodeBinary, path.join(stop.repoPath, "tests/e2e/helpers/remote-stop.ts"), "--pid-file", stop.pidFile]
        });
      } catch {}
    }

    for (const child of sshdChildren) {
      if (child.exitCode === null) {
        child.kill("SIGTERM");
      }
    }
    delete process.env.SSH_CONFIG_FILE;
    if (!testFailed || process.env.SSH_SYSTEM_ARCHITECT_KEEP_LAB !== "1") {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }
});
