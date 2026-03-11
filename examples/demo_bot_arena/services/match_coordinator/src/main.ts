import http from "node:http";
import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import type {
  BotDecision,
  BotSnake,
  BotView,
  CoordinatorConfig,
  OrbState
} from "../../../packages/shared_protocol/src/index.ts";
import {
  addPosition,
  chooseVelocityToward,
  createInitialSnake,
  distance,
  normalizeVelocity
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

async function loadConfig(): Promise<CoordinatorConfig> {
  const currentFile = fileURLToPath(import.meta.url);
  const args = parseArgs(process.argv.slice(2));
  const defaultConfig = path.resolve(path.dirname(currentFile), "../../deploy/overlays/coordinator/coordinator.config.json");
  const configPath = args.config || process.env.BOT_ARENA_COORDINATOR_CONFIG || defaultConfig;
  return JSON.parse(await readFile(configPath, "utf8")) as CoordinatorConfig;
}

function randomOrb(config: CoordinatorConfig, tick: number, salt: number): OrbState {
  return {
    id: `orb-${tick}-${salt}`,
    x: (tick * 7 + salt * 11 + 3) % config.arena.width,
    y: (tick * 5 + salt * 13 + 7) % config.arena.height
  };
}

async function persistRuntime(config: CoordinatorConfig, state: unknown): Promise<void> {
  await mkdir(config.runtimeDir, { recursive: true });
  await writeFile(path.join(config.runtimeDir, "arena-state.json"), JSON.stringify(state, null, 2));
}

async function main(): Promise<void> {
  const config = await loadConfig();
  const snakes = config.bots.map((bot, index) => createInitialSnake(bot, config.arena, index));
  const clients = new Set<http.ServerResponse>();
  const state = {
    tick: 0,
    winnerId: undefined as string | undefined,
    bots: snakes,
    orbs: Array.from({ length: 10 }, (_, index) => randomOrb(config, 0, index)),
    events: ["match booted"]
  };

  function broadcast() {
    const encoded = `data: ${JSON.stringify({ type: "snapshot", state, arena: config.arena })}\n\n`;
    for (const client of clients) {
      client.write(encoded);
    }
  }

  async function getDecision(snake: BotSnake): Promise<BotDecision> {
    const descriptor = config.bots.find((bot) => bot.id === snake.id);
    if (!descriptor) {
      return { velocity: snake.velocity };
    }
    const payload: BotView = {
      tick: state.tick,
      arena: config.arena,
      self: snake,
      opponents: state.bots.filter((bot) => bot.id !== snake.id),
      orbs: state.orbs
    };
    try {
      const response = await fetch(`${descriptor.endpoint}/move`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!response.ok) {
        return { velocity: snake.velocity, taunt: `${descriptor.id} unreachable` };
      }
      return (await response.json()) as BotDecision;
    } catch {
      return { velocity: snake.velocity, taunt: `${descriptor.id} offline` };
    }
  }

  function advanceSnake(snake: BotSnake, velocity: BotDecision["velocity"]) {
    snake.velocity = normalizeVelocity(velocity);
    const nextHead = addPosition(snake.body[0], snake.velocity, config.arena);
    snake.body.unshift(nextHead);
    const orbIndex = state.orbs.findIndex((orb) => orb.x === nextHead.x && orb.y === nextHead.y);
    if (orbIndex !== -1) {
      snake.score += 1;
      state.orbs.splice(orbIndex, 1, randomOrb(config, state.tick, orbIndex + snake.score));
      state.events = [`${snake.name} ate an orb`, ...state.events].slice(0, 10);
    } else {
      snake.body.pop();
    }
  }

  async function tick() {
    if (state.winnerId) {
      return;
    }
    const decisions = await Promise.all(state.bots.map((snake) => getDecision(snake)));
    state.tick += 1;
    for (let index = 0; index < state.bots.length; index += 1) {
      advanceSnake(state.bots[index], decisions[index].velocity);
    }

    for (const snake of state.bots) {
      const nearestOrb = state.orbs.reduce((best, orb) => {
        if (!best || distance(snake.body[0], orb) < distance(snake.body[0], best)) {
          return orb;
        }
        return best;
      }, undefined as OrbState | undefined);
      if (!nearestOrb) {
        continue;
      }
      if (distance(snake.body[0], nearestOrb) === 0) {
        state.events = [`${snake.name} secured ${nearestOrb.id}`, ...state.events].slice(0, 10);
      }
    }

    const winner = [...state.bots].sort((left, right) => right.score - left.score)[0];
    if (state.tick >= config.arena.maxTicks) {
      state.winnerId = winner.id;
      state.events = [`winner: ${winner.name}`, ...state.events].slice(0, 10);
    }

    await persistRuntime(config, state);
    broadcast();
  }

  setInterval(() => {
    tick().catch((error) => {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    });
  }, config.arena.tickMs).unref();

  const currentFile = fileURLToPath(import.meta.url);
  const publicRoot = path.resolve(path.dirname(currentFile), "../../../apps/spectator_dashboard/public");
  const indexHtml = await readFile(path.join(publicRoot, "index.html"), "utf8");
  const clientJs = await readFile(path.join(publicRoot, "client.js"), "utf8");

  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "127.0.0.1"}`);
    if (request.method === "GET" && url.pathname === "/") {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end(indexHtml);
      return;
    }
    if (request.method === "GET" && url.pathname === "/client.js") {
      response.writeHead(200, { "content-type": "application/javascript; charset=utf-8" });
      response.end(clientJs);
      return;
    }
    if (request.method === "GET" && url.pathname === "/health") {
      response.writeHead(200, { "content-type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ service: "match_coordinator", tick: state.tick, winnerId: state.winnerId }, null, 2));
      return;
    }
    if (request.method === "GET" && url.pathname === "/state") {
      response.writeHead(200, { "content-type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ arena: config.arena, state }, null, 2));
      return;
    }
    if (request.method === "GET" && url.pathname === "/events") {
      response.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        connection: "keep-alive"
      });
      clients.add(response);
      response.write(`data: ${JSON.stringify({ type: "snapshot", state, arena: config.arena })}\n\n`);
      request.on("close", () => clients.delete(response));
      return;
    }
    response.writeHead(404, { "content-type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ error: "not_found" }));
  });

  server.listen(config.listenPort, () => {
    process.stdout.write(`demo_bot_arena coordinator listening on http://127.0.0.1:${config.listenPort}\n`);
  });
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
