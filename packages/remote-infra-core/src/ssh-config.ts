import { readFile } from "node:fs/promises";

import type { ImportedSshConfigHost, ImportedSshConfigResult } from "../../remote-infra-types/src/index.ts";

function normalizeInventoryId(alias: string): string {
  return alias
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "");
}

export function parseSshConfig(text: string): ImportedSshConfigHost[] {
  const results: ImportedSshConfigHost[] = [];
  let currentAliases: string[] = [];
  let currentProps = new Map<string, string>();

  function flushCurrentBlock() {
    if (currentAliases.length === 0) {
      return;
    }
    for (const alias of currentAliases) {
      if (alias.includes("*") || alias.includes("?")) {
        continue;
      }
      const extraOptions: Record<string, string> = {};
      for (const [key, value] of currentProps.entries()) {
        if (!["hostname", "user", "port", "identityfile"].includes(key)) {
          extraOptions[key] = value;
        }
      }
      results.push({
        alias,
        hostname: currentProps.get("hostname"),
        user: currentProps.get("user"),
        port: currentProps.get("port") ? Number(currentProps.get("port")) : undefined,
        identityFile: currentProps.get("identityfile"),
        extraOptions
      });
    }
  }

  for (const rawLine of text.split(/\r?\n/u)) {
    const line = rawLine.replace(/^\s+|\s+$/gu, "");
    if (line.length === 0 || line.startsWith("#")) {
      continue;
    }

    const match = line.match(/^([A-Za-z][A-Za-z0-9]*)\s+(.*)$/u);
    if (!match) {
      continue;
    }

    const key = match[1].toLowerCase();
    const value = match[2].trim();

    if (key === "host") {
      flushCurrentBlock();
      currentAliases = value.split(/\s+/u).filter(Boolean);
      currentProps = new Map<string, string>();
      continue;
    }

    if (currentAliases.length === 0) {
      continue;
    }

    if (!currentProps.has(key)) {
      currentProps.set(key, value);
    }
  }

  flushCurrentBlock();
  return results;
}

export async function importSshConfig(
  configPath: string,
  aliases?: string[]
): Promise<ImportedSshConfigResult> {
  const parsed = parseSshConfig(await readFile(configPath, "utf8"));
  const selected = aliases?.length
    ? parsed.filter((entry) => aliases.includes(entry.alias))
    : parsed;

  return {
    configPath,
    hosts: selected,
    inventoryStubs: selected.map((entry) => ({
      id: normalizeInventoryId(entry.alias),
      sshHostAlias: entry.alias,
      hostname: entry.hostname ?? entry.alias,
      port: entry.port ?? 22,
      sshUser: entry.user ?? "root",
      sshOptions: []
    }))
  };
}
