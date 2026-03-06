import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import os from "node:os";
import { mkdtemp, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import type { HostSnapshot } from "../../packages/remote-infra-types/src/index.ts";
import { generateInfraIndex, loadInventory } from "../../packages/remote-infra-core/src/index.ts";

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

test("index generator writes required host summaries", async () => {
  const inventory = await loadInventory(path.join(workspaceRoot, "lab/ssh_cluster/inventory.compact.yml"));
  const snapshots = JSON.parse(
    await readFile(path.join(workspaceRoot, "examples/demo_sharded_snake/docs/demo_host_snapshots.json"), "utf8")
  ) as HostSnapshot[];
  const outputRoot = await mkdtemp(path.join(os.tmpdir(), "infra-index-"));

  await generateInfraIndex(inventory, snapshots, {
    outputRoot,
    workspaceRoot
  });

  const hostBRepoStatus = await readFile(path.join(outputRoot, "hosts/host_b/repo_status.md"), "utf8");
  const topology = await readFile(path.join(outputRoot, "topology.md"), "utf8");
  assert.match(hostBRepoStatus, /examples\/demo_sharded_snake\/services\/snake_shard\/src\/main\.ts/u);
  assert.match(topology, /host_a/u);
});
