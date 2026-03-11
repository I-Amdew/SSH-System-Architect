import http from "node:http";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import type {
  GatewayConfig,
  StepRequest
} from "../../../packages/shared_protocol/src/index.ts";

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

async function loadConfig(): Promise<GatewayConfig> {
  const currentFile = fileURLToPath(import.meta.url);
  const args = parseArgs(process.argv.slice(2));
  const defaultConfig = path.resolve(path.dirname(currentFile), "../../deploy/overlays/gateway/gateway.config.json");
  const configPath = args.config || process.env.SNAKE_GATEWAY_CONFIG || defaultConfig;
  return JSON.parse(await readFile(configPath, "utf8")) as GatewayConfig;
}

async function readBody(request: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk.toString("utf8");
    });
    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}

function sendJson(response: http.ServerResponse, statusCode: number, payload: unknown): void {
  response.statusCode = statusCode;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.end(JSON.stringify(payload, null, 2));
}

function sendText(response: http.ServerResponse, statusCode: number, payload: string, contentType = "text/plain; charset=utf-8"): void {
  response.statusCode = statusCode;
  response.setHeader("content-type", contentType);
  response.end(payload);
}

function selectBackend(config: GatewayConfig) {
  return config.shards.find((shard) => shard.id === "shard_b") ?? config.shards[config.shards.length - 1];
}

async function main(): Promise<void> {
  const config = await loadConfig();
  const backend = selectBackend(config);
  if (!backend) {
    throw new Error("gateway config does not define any backend shard");
  }

  const currentFile = fileURLToPath(import.meta.url);
  const publicRoot = path.resolve(path.dirname(currentFile), "../public");
  const indexHtml = await readFile(path.join(publicRoot, "index.html"), "utf8");
  const clientJs = await readFile(path.join(publicRoot, "client.js"), "utf8");

  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "127.0.0.1"}`);

    if (request.method === "GET" && url.pathname === "/") {
      sendText(response, 200, indexHtml, "text/html; charset=utf-8");
      return;
    }

    if (request.method === "GET" && url.pathname === "/client.js") {
      sendText(response, 200, clientJs, "application/javascript; charset=utf-8");
      return;
    }

    if (request.method === "GET" && url.pathname === "/health") {
      const upstream = await fetch(`${backend.url}/health`);
      sendJson(response, upstream.status, {
        service: "web_gateway",
        backend: backend.id,
        upstream: await upstream.json()
      });
      return;
    }

    if (request.method === "GET" && url.pathname === "/state") {
      const upstream = await fetch(`${backend.url}/state`);
      sendJson(response, upstream.status, await upstream.json());
      return;
    }

    if (request.method === "POST" && url.pathname === "/input") {
      const body = JSON.parse(await readBody(request)) as StepRequest;
      const upstream = await fetch(`${backend.url}/input`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body)
      });
      sendJson(response, upstream.status, await upstream.json());
      return;
    }

    sendJson(response, 404, { error: "not_found" });
  });

  server.listen(config.listenPort, () => {
    process.stdout.write(`demo_sharded_snake gateway listening on http://127.0.0.1:${config.listenPort}\n`);
  });
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
