import http from "node:http";
import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import type { ShardConfig, StepRequest, StepResponse } from "../../../packages/shared_protocol/src/index.ts";
import {
  createInitialState,
  directionToward,
  nextPosition,
  ownsColumn,
  positionsEqual
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
  const board = {
    width: 24,
    height: 14,
    boundaryX: 12
  };
  const state = createInitialState(board, config.id);
  state.orbs = [
    { x: 8, y: 4 },
    { x: 15, y: 9 },
    { x: 20, y: 6 },
    { x: 11, y: 11 },
    { x: 18, y: 2 },
    { x: 6, y: 9 }
  ];
  const clients = new Set<http.ServerResponse>();

  function sendJson(response: http.ServerResponse, statusCode: number, payload: unknown): void {
    response.statusCode = statusCode;
    response.setHeader("content-type", "application/json; charset=utf-8");
    response.end(JSON.stringify(payload, null, 2));
  }

  function broadcastState() {
    const encoded = `data: ${JSON.stringify({ type: "snapshot", board, state })}\n\n`;
    for (const client of clients) {
      client.write(encoded);
    }
  }

  function spawnOrb(): { x: number; y: number } {
    const occupied = new Set([
      ...state.snake.map((segment) => `${segment.x}:${segment.y}`),
      ...state.orbs.map((orb) => `${orb.x}:${orb.y}`)
    ]);
    for (let index = 0; index < board.width * board.height; index += 1) {
      const candidate = {
        x: (state.tick * 7 + index * 5 + 3) % board.width,
        y: (state.tick * 11 + index * 3 + 5) % board.height
      };
      if (!occupied.has(`${candidate.x}:${candidate.y}`)) {
        return candidate;
      }
    }
    return { x: 0, y: 0 };
  }

  function stepWorld() {
    const head = state.snake[0];
    state.velocity = directionToward(head, state.target);
    const nextHead = nextPosition(head, state.velocity, board);
    state.tick += 1;
    state.snake.unshift(nextHead);

    const orbIndex = state.orbs.findIndex((orb) => positionsEqual(orb, nextHead));
    if (orbIndex !== -1) {
      state.score += 1;
      state.orbs.splice(orbIndex, 1, spawnOrb());
    } else {
      state.snake.pop();
    }

    const newOwner = ownsColumn(config.ownedColumns, nextHead.x) ? config.id : config.handoffTarget;
    if (state.owner !== newOwner) {
      state.handoffs = [
        {
          tick: state.tick,
          from: state.owner,
          to: newOwner,
          boundaryX: board.boundaryX,
          head: nextHead
        },
        ...state.handoffs
      ].slice(0, 8);
      state.owner = newOwner;
    }
    broadcastState();
  }

  setInterval(stepWorld, 120).unref();

  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "127.0.0.1"}`);

    if (request.method === "GET" && url.pathname === "/health") {
      sendJson(response, 200, {
        service: "snake_shard",
        host: config.hostTag,
        shard: config.id,
        owner: state.owner,
        score: state.score,
        ownedColumns: config.ownedColumns
      });
      return;
    }

    if (request.method === "GET" && url.pathname === "/role") {
      sendJson(response, 200, config);
      return;
    }

    if (request.method === "GET" && url.pathname === "/events") {
      response.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        connection: "keep-alive"
      });
      clients.add(response);
      response.write(`data: ${JSON.stringify({ type: "snapshot", board, state })}\n\n`);
      request.on("close", () => {
        clients.delete(response);
      });
      return;
    }

    if (request.method === "GET" && url.pathname === "/state") {
      sendJson(response, 200, { board, state });
      return;
    }

    if (request.method === "POST" && url.pathname === "/input") {
      const payload = JSON.parse(await readBody(request)) as StepRequest;
      state.target = {
        x: Math.max(0, Math.min(board.width - 1, Math.round(payload.target.x))),
        y: Math.max(0, Math.min(board.height - 1, Math.round(payload.target.y)))
      };
      const result: StepResponse = {
        decision: ownsColumn(config.ownedColumns, state.snake[0].x) ? "accept" : "handoff",
        owner: state.owner,
        nextHead: state.snake[0],
        notes: [`${config.id} retargeted to ${state.target.x},${state.target.y}`],
        handoff: state.handoffs[0]
      };
      await persistRuntime(config, payload, result);
      sendJson(response, 202, {
        accepted: true,
        target: state.target,
        score: state.score
      });
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
