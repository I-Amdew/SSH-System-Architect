import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadInventory, MockTransport, RemoteInfraOrchestrator, SshTransport } from "../../remote-infra-core/src/index.ts";
import { RemoteInfraMcpServer } from "./server.ts";

function parseArgs(argv: string[]) {
  const parsed: Record<string, string> = {};
  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (!current.startsWith("--")) {
      continue;
    }
    parsed[current.slice(2)] = argv[index + 1] ?? "";
    index += 1;
  }
  return parsed;
}

async function main(): Promise<void> {
  const cliArgs = parseArgs(process.argv.slice(2));
  const currentFile = fileURLToPath(import.meta.url);
  const workspaceRoot = path.resolve(path.dirname(currentFile), "../../..");
  const inventoryPath =
    cliArgs.inventory ||
    process.env.REMOTE_INFRA_INVENTORY ||
    path.join(workspaceRoot, "lab/ssh_cluster/inventory.compact.yml");
  const indexRoot = cliArgs["index-root"] || path.join(workspaceRoot, ".infra-index");
  const transportMode = cliArgs.transport || process.env.REMOTE_INFRA_TRANSPORT || "ssh";
  const inventory = await loadInventory(inventoryPath);
  const transport =
    transportMode === "mock"
      ? new MockTransport(
          inventory.hosts.map((host) => ({
            hostId: host.id,
            deployedCommit: host.intendedCommit ?? inventory.repo.intendedCommit,
            intendedCommit: host.intendedCommit ?? inventory.repo.intendedCommit,
            repoStatus: {
              branch: inventory.repo.defaultBranch,
              head: host.intendedCommit ?? inventory.repo.intendedCommit,
              clean: true,
              ahead: 0,
              behind: 0,
              modified: [],
              deleted: [],
              untracked: []
            },
            files: [],
            serviceStatus: host.services.map((service) => ({
              name: service.name,
              unit: service.unit,
              state: "unknown"
            })),
            fileContents: {}
          }))
        )
      : new SshTransport();
  const orchestrator = new RemoteInfraOrchestrator(inventory, transport, {
    workspaceRoot,
    allowDestructiveTools: process.env.REMOTE_INFRA_ENABLE_DESTRUCTIVE === "1"
  });
  const server = new RemoteInfraMcpServer(orchestrator);

  process.env.REMOTE_INFRA_INDEX_ROOT = indexRoot;
  server.start();
}

main().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
