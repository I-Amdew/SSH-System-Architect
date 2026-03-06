import test from "node:test";

test("lab e2e is optional and disabled by default", { skip: process.env.RUN_LAB_E2E !== "1" }, async () => {
  // This placeholder keeps the e2e target visible without forcing Docker on every contributor.
});
