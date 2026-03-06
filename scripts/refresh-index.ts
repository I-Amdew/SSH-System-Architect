import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { HostSnapshot } from "../packages/remote-infra-types/src/index.ts";
import { generateInfraIndex, loadInventory } from "../packages/remote-infra-core/src/index.ts";

function parseArgs(argv: string[]): Record<string, string> {
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
  const currentFile = fileURLToPath(import.meta.url);
  const workspaceRoot = path.resolve(path.dirname(currentFile), "..");
  const args = parseArgs(process.argv.slice(2));
  const inventoryPath = path.resolve(
    workspaceRoot,
    args.inventory || process.env.REMOTE_INFRA_INVENTORY || "lab/ssh_cluster/inventory.compact.yml"
  );
  const snapshotsPath = path.resolve(
    workspaceRoot,
    args.snapshots || "examples/demo_sharded_snake/docs/demo_host_snapshots.json"
  );
  const outputRoot = path.resolve(workspaceRoot, args.output || ".infra-index");
  const inventory = await loadInventory(inventoryPath);
  const snapshots = JSON.parse(await readFile(snapshotsPath, "utf8")) as HostSnapshot[];
  await generateInfraIndex(inventory, snapshots, {
    outputRoot,
    workspaceRoot,
    exhaustiveFiles: args.exhaustive === "true"
  });
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
