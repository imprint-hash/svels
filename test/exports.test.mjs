// The agent's targets: exports nothing imports, inside files the app does use.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildGraph } from "../src/graph.mjs";
import { unusedExports } from "../src/exports.mjs";

function targets(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "svels-exp-"));
  for (const [f, body] of Object.entries(files)) { fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true }); fs.writeFileSync(path.join(dir, f), body); }
  return unusedExports(dir, buildGraph(dir, { entries: ["index.html"], aliases: {}, keep: [] }));
}
const html = '<script type="module" src="/main.js"></script>';

test("an export nobody imports is a target; an imported one is not", () => {
  const t = targets({ "index.html": html, "main.js": 'import { money } from "./fmt.js";', "fmt.js": "export const money = 1;\nexport function percent() {}\nexport class Old {}" });
  assert.deepEqual(t, [{ file: "fmt.js", unused: ["percent", "Old"] }]);
});

test("renamed imports (a as b) count as use of a", () => {
  const t = targets({ "index.html": html, "main.js": 'import { money as m } from "./fmt.js";', "fmt.js": "export const money = 1;" });
  assert.deepEqual(t, []);
});

test("a namespace import (import * as) protects the whole module", () => {
  const t = targets({ "index.html": html, "main.js": 'import * as fmt from "./fmt.js";', "fmt.js": "export const a = 1;\nexport const b = 2;" });
  assert.deepEqual(t, []);
});

test("a dynamically imported module is left alone", () => {
  const t = targets({ "index.html": html, "main.js": 'const m = await import("./fmt.js");', "fmt.js": "export const a = 1;" });
  assert.deepEqual(t, []);
});

test("export { a, b } lists are read", () => {
  const t = targets({ "index.html": html, "main.js": 'import { a } from "./x.js";', "x.js": "const a = 1, b = 2;\nexport { a, b };" });
  assert.deepEqual(t, [{ file: "x.js", unused: ["b"] }]);
});
