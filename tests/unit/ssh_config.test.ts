import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { mkdtemp, writeFile } from "node:fs/promises";

import { importSshConfig, parseSshConfig } from "../../packages/remote-infra-core/src/index.ts";

test("parseSshConfig reads host aliases and key fields", () => {
  const parsed = parseSshConfig(`
Host app-a
  HostName 10.0.0.10
  User deploy
  Port 2222
  IdentityFile ~/.ssh/app-a

Host app-b *.wildcard
  HostName 10.0.0.11
  User root
`);

  assert.equal(parsed.length, 2);
  assert.equal(parsed[0].alias, "app-a");
  assert.equal(parsed[0].hostname, "10.0.0.10");
  assert.equal(parsed[0].user, "deploy");
  assert.equal(parsed[0].port, 2222);
  assert.equal(parsed[1].alias, "app-b");
});

test("importSshConfig emits inventory-ready stubs", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "ssh-system-architect-ssh-config-"));
  const configPath = path.join(tempRoot, "config");
  await writeFile(
    configPath,
    [
      "Host gateway-prod",
      "  HostName 192.0.2.10",
      "  User root",
      "  Port 2202",
      ""
    ].join("\n"),
    "utf8"
  );

  const imported = await importSshConfig(configPath);
  assert.equal(imported.hosts.length, 1);
  assert.equal(imported.inventoryStubs[0].id, "gateway-prod");
  assert.equal(imported.inventoryStubs[0].sshHostAlias, "gateway-prod");
  assert.equal(imported.inventoryStubs[0].sshUser, "root");
});
