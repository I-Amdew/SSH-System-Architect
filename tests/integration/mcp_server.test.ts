import assert from "node:assert/strict";
import test from "node:test";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function encodeMessage(message: object): string {
  const body = JSON.stringify(message);
  return `Content-Length: ${Buffer.byteLength(body, "utf8")}\r\n\r\n${body}`;
}

function decodeMessage(buffer: Buffer): unknown {
  const separator = buffer.indexOf("\r\n\r\n");
  const payload = buffer.slice(separator + 4).toString("utf8");
  return JSON.parse(payload);
}

test("MCP server lists tools and hosts in mock mode", async () => {
  const child = spawn(
    process.execPath,
    [
      path.join(workspaceRoot, "packages/remote-infra-mcp/src/main.ts"),
      "--inventory",
      path.join(workspaceRoot, "lab/ssh_cluster/inventory.compact.yml"),
      "--transport",
      "mock"
    ],
    {
      cwd: workspaceRoot,
      stdio: ["pipe", "pipe", "pipe"]
    }
  );

  const messages: unknown[] = [];
  const pending = new Promise<void>((resolve, reject) => {
    child.stdout.on("data", (chunk) => {
      messages.push(decodeMessage(Buffer.from(chunk)));
      if (messages.length >= 3) {
        resolve();
      }
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code && code !== 0) {
        reject(new Error(`mcp server exited with ${code}`));
      }
    });
  });

  child.stdin.write(
    encodeMessage({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {}
    })
  );
  child.stdin.write(
    encodeMessage({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/list",
      params: {}
    })
  );
  child.stdin.write(
    encodeMessage({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: {
        name: "list_hosts",
        arguments: {}
      }
    })
  );

  await pending;
  child.kill();

  const toolList = messages[1] as { result: { tools: Array<{ name: string }> } };
  const hostList = messages[2] as {
    result: { structuredContent: Array<{ id: string }> };
  };

  assert.ok(toolList.result.tools.some((tool) => tool.name === "refresh_indexes"));
  assert.equal(hostList.result.structuredContent[0].id, "host_a");
});
