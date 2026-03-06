import http from "node:http";
import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import type {
  Direction,
  GatewayConfig,
  GatewayEvent,
  GameState,
  StepRequest,
  StepResponse
} from "../../packages/shared_protocol/src/index.ts";
import {
  createInitialState,
  isOppositeDirection
} from "../../packages/shared_protocol/src/index.ts";

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

async function requestShard(config: GatewayConfig, state: GameState): Promise<StepResponse> {
  const activeShard = config.shards.find((shard) => shard.id === state.owner) ?? config.shards[0];
  const payload: StepRequest = {
    sessionId: "demo-sharded-snake",
    tick: state.tick + 1,
    board: config.board,
    head: state.snake[0],
    direction: state.direction
  };
  const response = await fetch(`${activeShard.url}/step`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    throw new Error(`Shard ${activeShard.id} returned ${response.status}`);
  }
  return (await response.json()) as StepResponse;
}

async function persistRuntime(config: GatewayConfig, state: GameState): Promise<void> {
  await mkdir(config.runtimeDir, { recursive: true });
  await writeFile(
    path.join(config.runtimeDir, "session.json"),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        state
      },
      null,
      2
    )
  );
}

async function main(): Promise<void> {
  const config = await loadConfig();
  const state = createInitialState(config.board, config.shards[0]?.id ?? "shard_a");
  let pendingDirection: Direction | undefined;
  const clients = new Set<http.ServerResponse>();
  let tickInFlight = false;

  function broadcast(event: GatewayEvent): void {
    const encoded = `data: ${JSON.stringify(event)}\n\n`;
    for (const client of clients) {
      client.write(encoded);
    }
  }

  async function step(): Promise<void> {
    if (tickInFlight) {
      return;
    }
    tickInFlight = true;
    try {
      if (pendingDirection && !isOppositeDirection(state.direction, pendingDirection)) {
        state.direction = pendingDirection;
      }
      pendingDirection = undefined;

      const response = await requestShard(config, state);
      state.tick += 1;
      state.snake.unshift(response.nextHead);
      while (state.snake.length > state.length) {
        state.snake.pop();
      }

      if (response.handoff) {
        state.owner = response.handoff.to;
        state.handoffs = [response.handoff, ...state.handoffs].slice(0, 8);
        broadcast({
          type: "handoff",
          handoff: response.handoff
        });
      } else {
        state.owner = response.owner;
      }

      await persistRuntime(config, state);
      broadcast({
        type: "snapshot",
        board: config.board,
        state
      });
    } finally {
      tickInFlight = false;
    }
  }

  setInterval(() => {
    step().catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      process.stderr.write(`[gateway] ${message}\n`);
    });
  }, config.tickMs).unref();

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
      sendJson(response, 200, {
        service: "web_gateway",
        owner: state.owner,
        tick: state.tick
      });
      return;
    }

    if (request.method === "GET" && url.pathname === "/events") {
      response.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        connection: "keep-alive"
      });
      clients.add(response);
      response.write(
        `data: ${JSON.stringify({
          type: "snapshot",
          board: config.board,
          state
        } satisfies GatewayEvent)}\n\n`
      );
      request.on("close", () => {
        clients.delete(response);
      });
      return;
    }

    if (request.method === "POST" && url.pathname === "/input") {
      const body = JSON.parse(await readBody(request)) as { direction?: Direction };
      if (body.direction) {
        pendingDirection = body.direction;
      }
      sendJson(response, 202, {
        accepted: Boolean(body.direction),
        pendingDirection
      });
      return;
    }

    if (request.method === "GET" && url.pathname === "/state") {
      sendJson(response, 200, { board: config.board, state });
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
