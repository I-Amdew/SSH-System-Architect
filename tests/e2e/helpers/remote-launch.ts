import { mkdir, open, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

function parseArgs(argv: string[]) {
  const args: Record<string, string> = {};
  const separator = argv.indexOf("--");
  const head = separator === -1 ? argv : argv.slice(0, separator);
  const command = separator === -1 ? [] : argv.slice(separator + 1);

  for (let index = 0; index < head.length; index += 1) {
    const current = head[index];
    if (!current.startsWith("--")) {
      continue;
    }
    args[current.slice(2)] = head[index + 1] ?? "";
    index += 1;
  }

  return { args, command };
}

async function main() {
  const { args, command } = parseArgs(process.argv.slice(2));
  if (command.length === 0) {
    throw new Error("remote-launch requires a command after --");
  }

  const cwd = args.cwd ? path.resolve(args.cwd) : process.cwd();
  const pidFile = args["pid-file"];
  const logFile = args["log-file"];
  if (!pidFile || !logFile) {
    throw new Error("remote-launch requires --pid-file and --log-file");
  }

  await mkdir(path.dirname(logFile), { recursive: true });
  await mkdir(path.dirname(pidFile), { recursive: true });

  const logHandle = await open(logFile, "a");
  const child = spawn(command[0], command.slice(1), {
    cwd,
    detached: true,
    stdio: ["ignore", logHandle.fd, logHandle.fd]
  });
  child.unref();
  await logHandle.close();
  await writeFile(pidFile, `${child.pid}\n`, "utf8");
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
