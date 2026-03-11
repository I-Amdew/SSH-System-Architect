import http from "node:http";
import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import type { BotConfig, BotDecision, BotView } from "../../../packages/shared_protocol/src/index.ts";
import { chooseVelocityToward } from "../../../packages/shared_protocol/src/index.ts";

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

async function loadConfig(): Promise<BotConfig> {
  const currentFile = fileURLToPath(import.meta.url);
  const args = parseArgs(process.argv.slice(2));
  const defaultConfig = path.resolve(path.dirname(currentFile), "../../deploy/overlays/bot_a/bot.config.json");
  const configPath = args.config || process.env.BOT_ARENA_BOT_CONFIG || defaultConfig;
  return JSON.parse(await readFile(configPath, "utf8")) as BotConfig;
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

function decisionFor(config: BotConfig, view: BotView): BotDecision {
  const head = view.self.body[0];
  const nearestOrb = [...view.orbs].sort((left, right) => {
    const leftDistance = Math.abs(left.x - head.x) + Math.abs(left.y - head.y);
    const rightDistance = Math.abs(right.x - head.x) + Math.abs(right.y - head.y);
    return leftDistance - rightDistance;
  })[0];

  switch (config.strategy) {
    case "greedy":
      return { velocity: chooseVelocityToward(head, nearestOrb ?? head), taunt: "mine" };
    case "ambush": {
      const target = view.opponents[0]?.body[0] ?? nearestOrb ?? head;
      return { velocity: chooseVelocityToward(head, target), taunt: "cutting in" };
    }
    case "sweeper":
      return {
        velocity: view.tick % 8 < 4 ? { x: 1, y: 0 } : { x: 0, y: 1 },
        taunt: "sweep"
      };
    case "chaotic":
      return {
        velocity: [
          { x: 1, y: 0 },
          { x: -1, y: 0 },
          { x: 0, y: 1 },
          { x: 0, y: -1 }
        ][(view.tick + config.seed) % 4],
        taunt: "chaos"
      };
  }
}

async function persistRuntime(config: BotConfig, view: BotView, decision: BotDecision): Promise<void> {
  await mkdir(config.runtimeDir, { recursive: true });
  await writeFile(
    path.join(config.runtimeDir, "last-decision.json"),
    JSON.stringify({ generatedAt: new Date().toISOString(), view, decision }, null, 2)
  );
}

async function main(): Promise<void> {
  const config = await loadConfig();

  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "127.0.0.1"}`);
    if (request.method === "GET" && url.pathname === "/health") {
      response.writeHead(200, { "content-type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ service: "snake_bot", id: config.id, strategy: config.strategy }, null, 2));
      return;
    }
    if (request.method === "POST" && url.pathname === "/move") {
      const view = JSON.parse(await readBody(request)) as BotView;
      const decision = decisionFor(config, view);
      await persistRuntime(config, view, decision);
      response.writeHead(200, { "content-type": "application/json; charset=utf-8" });
      response.end(JSON.stringify(decision, null, 2));
      return;
    }
    response.writeHead(404, { "content-type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ error: "not_found" }));
  });

  server.listen(config.listenPort, () => {
    process.stdout.write(`demo_bot_arena bot ${config.id} listening on http://127.0.0.1:${config.listenPort}\n`);
  });
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
