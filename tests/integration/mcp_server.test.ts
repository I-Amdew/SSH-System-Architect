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

function decodeMessages(buffer: Buffer): { messages: unknown[]; remainder: Buffer } {
  const messages: unknown[] = [];
  let cursor = 0;

  while (cursor < buffer.length) {
    const separator = buffer.indexOf("\r\n\r\n", cursor, "utf8");
    if (separator === -1) {
      break;
    }
    const header = buffer.slice(cursor, separator).toString("utf8");
    const match = header.match(/Content-Length:\s*(\d+)/iu);
    if (!match) {
      throw new Error("Missing Content-Length header in MCP response");
    }
    const contentLength = Number(match[1]);
    const messageStart = separator + 4;
    const messageEnd = messageStart + contentLength;
    if (buffer.length < messageEnd) {
      break;
    }
    messages.push(JSON.parse(buffer.slice(messageStart, messageEnd).toString("utf8")));
    cursor = messageEnd;
  }

  return {
    messages,
    remainder: buffer.slice(cursor)
  };
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
  let stdoutBuffer = Buffer.alloc(0);
  const pending = new Promise<void>((resolve, reject) => {
    child.stdout.on("data", (chunk) => {
      stdoutBuffer = Buffer.concat([stdoutBuffer, Buffer.from(chunk)]);
      const decoded = decodeMessages(stdoutBuffer);
      messages.push(...decoded.messages);
      stdoutBuffer = decoded.remainder;
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
  assert.ok(toolList.result.tools.some((tool) => tool.name === "bootstrap_host"));
  assert.equal(hostList.result.structuredContent[0].id, "host_a");
});
