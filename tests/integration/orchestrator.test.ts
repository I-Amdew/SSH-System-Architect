import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import os from "node:os";
import { mkdtemp } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { MockTransport, RemoteInfraOrchestrator, loadInventory } from "../../packages/remote-infra-core/src/index.ts";

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

test("orchestrator patches remote content, reports state, and refreshes indexes", async () => {
  const inventory = await loadInventory(path.join(workspaceRoot, "lab/ssh_cluster/inventory.compact.yml"));
  const transport = new MockTransport([
    {
      hostId: "host_a",
      deployedCommit: "7d9e3aa",
      intendedCommit: "7d9e3aa",
      repoStatus: {
        branch: "main",
        head: "7d9e3aa",
        clean: true,
        ahead: 0,
        behind: 0,
        modified: [],
        deleted: [],
        untracked: []
      },
      files: [
        {
          path: "examples/demo_sharded_snake/deploy/overlays/gateway/gateway.config.json",
          kind: "overlay",
          tracked: true,
          exists: true
        }
      ],
      serviceStatus: [
        {
          name: "web_gateway",
          unit: "demo-sharded-snake-gateway.service",
          state: "inactive"
        }
      ],
      fileContents: {
        "examples/demo_sharded_snake/deploy/overlays/gateway/gateway.config.json": "{\"listenPort\":8080}\n"
      }
    },
    {
      hostId: "host_b",
      deployedCommit: "7d9e3aa",
      intendedCommit: "7d9e3aa",
      repoStatus: {
        branch: "main",
        head: "7d9e3aa",
        clean: true,
        ahead: 0,
        behind: 0,
        modified: [],
        deleted: [],
        untracked: []
      },
      files: [],
      serviceStatus: [],
      fileContents: {}
    }
  ]);

  const orchestrator = new RemoteInfraOrchestrator(inventory, transport, {
    workspaceRoot
  });

  const controlPlane = orchestrator.describeControlPlane();
  assert.equal(controlPlane.name, "SSH System Architect");
  assert.equal(controlPlane.capabilities.supportsBootstrapHost, true);

  const patchResult = await orchestrator.applyRemotePatch(
    "host_a",
    "examples/demo_sharded_snake/deploy/overlays/gateway/gateway.config.json",
    [
      {
        op: "replace_text",
        find: "8080",
        replace: "8181"
      }
    ]
  );

  assert.equal(patchResult.changed, true);

  const restartResult = await orchestrator.restartService("host_a", "web_gateway");
  assert.equal(restartResult.service, "web_gateway");

  const outputRoot = await mkdtemp(path.join(os.tmpdir(), "orchestrator-index-"));
  const refreshResult = await orchestrator.refreshIndexes(outputRoot);
  assert.equal(refreshResult.hosts[0].hostId, "host_a");

  const comparison = await orchestrator.compareState("host_a");
  assert.equal(comparison.overlays.length, 1);

  const clusters = orchestrator.listClusters();
  assert.equal(clusters[0].id, "compact_demo");

  const networkHealth = await orchestrator.reportNetworkHealth("compact_demo");
  assert.equal(networkHealth.results[0].sshReachable, true);

  const repoDiscovery = await orchestrator.discoverHostRepos("host_a");
  assert.ok(Array.isArray(repoDiscovery.repos));

  const bootstrapResult = await orchestrator.bootstrapHost("host_a");
  assert.equal(bootstrapResult.hostId, "host_a");
  assert.ok(Array.isArray(bootstrapResult.createdDirectories));
});
