import { readdir } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

async function collectTests(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const results: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      results.push(...(await collectTests(fullPath)));
    } else if (entry.isFile() && entry.name.endsWith(".test.ts")) {
      results.push(fullPath);
    }
  }
  return results;
}

async function main(): Promise<void> {
  const currentFile = fileURLToPath(import.meta.url);
  const workspaceRoot = path.resolve(path.dirname(currentFile), "..");
  const targets = process.argv.slice(2);
  const directories = targets.length > 0 ? targets : ["unit", "integration"];

  const files = (
    await Promise.all(directories.map((directory) => collectTests(path.join(workspaceRoot, "tests", directory))))
  ).flat();

  if (files.length === 0) {
    throw new Error(`No tests found for targets: ${directories.join(", ")}`);
  }

  await new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, ["--test", ...files], {
      stdio: "inherit"
    });
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`node --test exited with status ${code}`));
    });
    child.on("error", reject);
  });
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
