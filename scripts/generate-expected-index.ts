import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { HostSnapshot } from "../packages/remote-infra-types/src/index.ts";
import { generateInfraIndex, loadInventory } from "../packages/remote-infra-core/src/index.ts";

async function main(): Promise<void> {
  const currentFile = fileURLToPath(import.meta.url);
  const workspaceRoot = path.resolve(path.dirname(currentFile), "..");
  const inventoryPath = path.join(workspaceRoot, "lab/ssh_cluster/inventory.compact.yml");
  const snapshotsPath = path.join(workspaceRoot, "examples/demo_sharded_snake/docs/demo_host_snapshots.json");
  const outputRoot = process.argv[2]
    ? path.resolve(process.argv[2])
    : path.join(workspaceRoot, "examples/expected_index_output");

  await mkdir(outputRoot, { recursive: true });
  const inventory = await loadInventory(inventoryPath);
  const snapshots = JSON.parse(await readFile(snapshotsPath, "utf8")) as HostSnapshot[];
  await generateInfraIndex(inventory, snapshots, {
    outputRoot,
    workspaceRoot
  });
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
