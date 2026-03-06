import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

interface EvalCase {
  id: string;
  prompt: string;
  expectTrigger: boolean;
  expectInventoryFirst: boolean;
  expectMcpPreferred: boolean;
  expectRefreshIndexes: boolean;
  expectHostByHostReport: boolean;
}

const TRIGGER_PATTERNS = [
  /ssh/u,
  /remote host/u,
  /inventory/u,
  /drift/u,
  /service.*restart/u,
  /patch.*host/u,
  /role explanation/u,
  /git sync/u,
  /shared versus host-specific/u,
  /what .* host/u
];

async function main(): Promise<void> {
  const currentFile = fileURLToPath(import.meta.url);
  const workspaceRoot = path.resolve(path.dirname(currentFile), "..");
  const evalCases = JSON.parse(
    await readFile(path.join(workspaceRoot, "evals/remote_infra_eval_cases.json"), "utf8")
  ) as EvalCase[];
  const skillText = await readFile(
    path.join(workspaceRoot, ".codex/skills/SSH System Architect/SKILL.md"),
    "utf8"
  );

  const requiredPhrases = [
    "read the inventory first",
    "prefer targeted mcp tools",
    "refresh or regenerate indexes",
    "report results by host",
    "destructive"
  ];

  for (const phrase of requiredPhrases) {
    if (!skillText.toLowerCase().includes(phrase.toLowerCase())) {
      throw new Error(`SKILL.md is missing required phrase: ${phrase}`);
    }
  }

  for (const evalCase of evalCases) {
    const detected = TRIGGER_PATTERNS.some((pattern) => pattern.test(evalCase.prompt.toLowerCase()));
    if (detected !== evalCase.expectTrigger) {
      throw new Error(`Trigger heuristic mismatch for ${evalCase.id}`);
    }
  }

  process.stdout.write(`Validated ${evalCases.length} eval cases and SKILL workflow phrases.\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
