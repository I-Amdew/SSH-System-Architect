import type { StructuredPatchOperation } from "../../remote-infra-types/src/index.ts";

function replaceText(input: string, find: string, replace: string, all = false): string {
  if (all) {
    return input.split(find).join(replace);
  }
  const index = input.indexOf(find);
  if (index === -1) {
    throw new Error(`Unable to find text: ${find}`);
  }
  return `${input.slice(0, index)}${replace}${input.slice(index + find.length)}`;
}

export function applyStructuredPatch(source: string, operations: StructuredPatchOperation[]): string {
  return operations.reduce((current, operation) => {
    switch (operation.op) {
      case "replace_text":
        if (!operation.find || operation.replace === undefined) {
          throw new Error("replace_text requires find and replace");
        }
        return replaceText(current, operation.find, operation.replace, operation.all);
      case "insert_before":
        if (!operation.find || operation.text === undefined) {
          throw new Error("insert_before requires find and text");
        }
        return replaceText(current, operation.find, `${operation.text}${operation.find}`);
      case "insert_after":
        if (!operation.find || operation.text === undefined) {
          throw new Error("insert_after requires find and text");
        }
        return replaceText(current, operation.find, `${operation.find}${operation.text}`);
      case "append":
        if (operation.text === undefined) {
          throw new Error("append requires text");
        }
        return `${current}${operation.text}`;
      case "delete_text":
        if (!operation.find) {
          throw new Error("delete_text requires find");
        }
        return replaceText(current, operation.find, "", operation.all);
      default:
        throw new Error(`Unsupported patch operation: ${(operation as StructuredPatchOperation).op}`);
    }
  }, source);
}
