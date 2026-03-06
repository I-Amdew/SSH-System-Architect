import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { classifyPath, loadInventory } from "../../packages/remote-infra-core/src/index.ts";

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

test("classifier separates shared repo, overlay, runtime, and drift", async () => {
  const inventory = await loadInventory(path.join(workspaceRoot, "lab/ssh_cluster/inventory.compact.yml"));
  const hostA = inventory.hosts[0];

  assert.equal(
    classifyPath(inventory, hostA, "examples/demo_sharded_snake/apps/web_gateway/src/main.ts"),
    "shared_repo"
  );
  assert.equal(
    classifyPath(inventory, hostA, "examples/demo_sharded_snake/deploy/overlays/gateway/gateway.config.json"),
    "overlay"
  );
  assert.equal(
    classifyPath(inventory, hostA, "examples/demo_sharded_snake/runtime/gateway/session.json"),
    "runtime"
  );
  assert.equal(
    classifyPath(inventory, hostA, "scripts/manual-hotfix.sh"),
    "drift"
  );
});
