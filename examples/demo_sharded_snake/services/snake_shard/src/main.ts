import http from "node:http";
import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import type { ShardConfig, StepRequest, StepResponse } from "../../packages/shared_protocol/src/index.ts";
import { nextPosition, ownsColumn } from "../../packages/shared_protocol/src/index.ts";

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

async function loadConfig(): Promise<ShardConfig> {
  const currentFile = fileURLToPath(import.meta.url);
  const args = parseArgs(process.argv.slice(2));
  const defaultConfig = path.resolve(path.dirname(currentFile), "../../deploy/overlays/shard_a/shard.config.json");
  const configPath = args.config || process.env.SNAKE_SHARD_CONFIG || defaultConfig;
  return JSON.parse(await readFile(configPath, "utf8")) as ShardConfig;
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

async function persistRuntime(config: ShardConfig, request: StepRequest, response: StepResponse): Promise<void> {
  await mkdir(config.runtimeDir, { recursive: true });
  await writeFile(
    path.join(config.runtimeDir, "last-step.json"),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        host: config.hostTag,
        shard: config.id,
        request,
        response
      },
      null,
      2
    )
  );
}

async function main(): Promise<void> {
  const config = await loadConfig();

  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "127.0.0.1"}`);

    if (request.method === "GET" && url.pathname === "/health") {
      sendJson(response, 200, {
        service: "snake_shard",
        host: config.hostTag,
        shard: config.id,
        ownedColumns: config.ownedColumns
      });
      return;
    }

    if (request.method === "GET" && url.pathname === "/role") {
      sendJson(response, 200, config);
      return;
    }

    if (request.method === "POST" && url.pathname === "/step") {
      const payload = JSON.parse(await readBody(request)) as StepRequest;
      const nextHead = nextPosition(payload.head, payload.direction, payload.board);
      const ownsNextCell = ownsColumn(config.ownedColumns, nextHead.x);
      const result: StepResponse = ownsNextCell
        ? {
            decision: "accept",
            owner: config.id,
            nextHead,
            notes: [`${config.id} accepted tick ${payload.tick}`]
          }
        : {
            decision: "handoff",
            owner: config.id,
            nextHead,
            notes: [`${config.id} handed off tick ${payload.tick}`],
            handoff: {
              tick: payload.tick,
              from: config.id,
              to: config.handoffTarget,
              boundaryX: payload.board.boundaryX,
              head: nextHead
            }
          };
      await persistRuntime(config, payload, result);
      sendJson(response, 200, result);
      return;
    }

    sendJson(response, 404, { error: "not_found" });
  });

  server.listen(config.listenPort, () => {
    process.stdout.write(`demo_sharded_snake shard ${config.id} listening on http://127.0.0.1:${config.listenPort}\n`);
  });
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
