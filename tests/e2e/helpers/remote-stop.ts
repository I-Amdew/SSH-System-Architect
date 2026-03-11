import { readFile, rm } from "node:fs/promises";

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

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const pidFile = args["pid-file"];
  if (!pidFile) {
    throw new Error("remote-stop requires --pid-file");
  }
  const pid = Number((await readFile(pidFile, "utf8")).trim());
  if (!Number.isFinite(pid) || pid <= 0) {
    throw new Error(`Invalid pid in ${pidFile}`);
  }
  process.kill(pid, "SIGTERM");
  await rm(pidFile, { force: true });
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
