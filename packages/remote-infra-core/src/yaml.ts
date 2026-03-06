interface SourceLine {
  indent: number;
  text: string;
  lineNumber: number;
}

interface ParseResult {
  value: unknown;
  nextIndex: number;
}

function stripComment(rawLine: string): string {
  const trimmed = rawLine.trimStart();
  if (trimmed.startsWith("#")) {
    return "";
  }
  return rawLine;
}

function preprocess(source: string): SourceLine[] {
  return source
    .split(/\r?\n/u)
    .map((rawLine, index) => ({
      rawLine: stripComment(rawLine),
      lineNumber: index + 1
    }))
    .filter(({ rawLine }) => rawLine.trim().length > 0)
    .map(({ rawLine, lineNumber }) => {
      const match = rawLine.match(/^ */u);
      return {
        indent: match?.[0].length ?? 0,
        text: rawLine.trim(),
        lineNumber
      };
    });
}

function parseScalar(rawValue: string): unknown {
  if (rawValue === "[]") {
    return [];
  }
  if (rawValue === "{}") {
    return {};
  }
  if (rawValue === "true") {
    return true;
  }
  if (rawValue === "false") {
    return false;
  }
  if (rawValue === "null") {
    return null;
  }
  if (/^-?\d+$/u.test(rawValue)) {
    return Number(rawValue);
  }
  if (
    (rawValue.startsWith("\"") && rawValue.endsWith("\"")) ||
    (rawValue.startsWith("'") && rawValue.endsWith("'"))
  ) {
    return rawValue.slice(1, -1);
  }
  return rawValue;
}

function parseBlock(lines: SourceLine[], startIndex: number, indent: number): ParseResult {
  if (startIndex >= lines.length) {
    return { value: null, nextIndex: startIndex };
  }
  if (lines[startIndex].indent !== indent) {
    throw new Error(
      `Unexpected indentation at line ${lines[startIndex].lineNumber}: expected ${indent}, got ${lines[startIndex].indent}`
    );
  }
  if (lines[startIndex].text.startsWith("- ")) {
    return parseList(lines, startIndex, indent);
  }
  return parseMap(lines, startIndex, indent);
}

function parseMap(lines: SourceLine[], startIndex: number, indent: number): ParseResult {
  const result: Record<string, unknown> = {};
  let index = startIndex;
  while (index < lines.length) {
    const line = lines[index];
    if (line.indent < indent) {
      break;
    }
    if (line.indent > indent) {
      throw new Error(`Unexpected indentation at line ${line.lineNumber}`);
    }
    if (line.text.startsWith("- ")) {
      break;
    }
    const separator = line.text.indexOf(":");
    if (separator === -1) {
      throw new Error(`Expected key/value pair at line ${line.lineNumber}`);
    }
    const key = line.text.slice(0, separator).trim();
    const rawValue = line.text.slice(separator + 1).trim();
    index += 1;

    if (rawValue.length > 0) {
      result[key] = parseScalar(rawValue);
      continue;
    }

    if (index < lines.length && lines[index].indent > indent) {
      const nested = parseBlock(lines, index, lines[index].indent);
      result[key] = nested.value;
      index = nested.nextIndex;
      continue;
    }

    result[key] = null;
  }

  return { value: result, nextIndex: index };
}

function parseList(lines: SourceLine[], startIndex: number, indent: number): ParseResult {
  const result: unknown[] = [];
  let index = startIndex;

  while (index < lines.length) {
    const line = lines[index];
    if (line.indent < indent) {
      break;
    }
    if (line.indent > indent) {
      throw new Error(`Unexpected indentation at line ${line.lineNumber}`);
    }
    if (!line.text.startsWith("- ")) {
      break;
    }

    const rawItem = line.text.slice(2).trim();
    index += 1;

    if (rawItem.length === 0) {
      if (index < lines.length && lines[index].indent > indent) {
        const nested = parseBlock(lines, index, lines[index].indent);
        result.push(nested.value);
        index = nested.nextIndex;
      } else {
        result.push(null);
      }
      continue;
    }

    const separator = rawItem.indexOf(":");
    const looksLikeInlineObject = separator !== -1 && !rawItem.startsWith("\"") && !rawItem.startsWith("'");
    if (!looksLikeInlineObject) {
      result.push(parseScalar(rawItem));
      continue;
    }

    const key = rawItem.slice(0, separator).trim();
    const inlineValue = rawItem.slice(separator + 1).trim();
    const objectValue: Record<string, unknown> = {};
    objectValue[key] = inlineValue.length > 0 ? parseScalar(inlineValue) : null;

    if (index < lines.length && lines[index].indent > indent) {
      const nested = parseBlock(lines, index, lines[index].indent);
      if (inlineValue.length === 0) {
        objectValue[key] = nested.value;
      } else if (typeof nested.value === "object" && nested.value !== null && !Array.isArray(nested.value)) {
        Object.assign(objectValue, nested.value as Record<string, unknown>);
      } else {
        objectValue._rest = nested.value;
      }
      index = nested.nextIndex;
    }

    result.push(objectValue);
  }

  return { value: result, nextIndex: index };
}

export function parseSimpleYaml<T>(source: string): T {
  const lines = preprocess(source);
  if (lines.length === 0) {
    throw new Error("YAML document is empty");
  }
  const parsed = parseBlock(lines, 0, lines[0].indent);
  return parsed.value as T;
}
