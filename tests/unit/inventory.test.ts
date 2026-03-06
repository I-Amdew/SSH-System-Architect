import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadInventory } from "../../packages/remote-infra-core/src/index.ts";

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

test("inventory parser loads compact topology", async () => {
  const inventory = await loadInventory(path.join(workspaceRoot, "lab/ssh_cluster/inventory.compact.yml"));
  assert.equal(inventory.hosts.length, 2);
  assert.equal(inventory.clusters.length, 2);
  assert.equal(inventory.vmAdapters.length, 2);
  assert.equal(inventory.hosts[0].id, "host_a");
  assert.equal(inventory.hosts[0].sshImplementation, "openssh");
  assert.equal(inventory.hosts[0].rootAllowed, true);
  assert.equal(inventory.hosts[1].roleLabels[0], "shard_b");
  assert.equal(inventory.safety.destructiveToolsEnabled, false);
});
