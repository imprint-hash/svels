// The scanner: every real-world lesson from running Svels on real code is pinned down here.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildGraph } from "../src/graph.mjs";

function project(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "svels-graph-"));
  for (const [f, body] of Object.entries(files)) { fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true }); fs.writeFileSync(path.join(dir, f), body); }
  return dir;
}
const scan = (dir, opts = {}) => buildGraph(dir, { entries: ["index.html"], aliases: {}, keep: ["svels/"], ...opts });

test("a file imported from the entry is used; an orphan is not", () => {
  const g = scan(project({ "index.html": '<script type="module" src="/src/main.js"></script>', "src/main.js": 'import { a } from "./a.js";', "src/a.js": "export const a = 1;", "src/orphan.js": "export const b = 2;" }));
  assert.ok(g.reachable.includes("src/a.js"));
  assert.deepEqual(g.unreachableFiles, ["src/orphan.js"]);
});

test("srcset, meta content and manifest icons count as use", () => {
  const g = scan(project({
    "index.html": '<img srcset="img/a-800.webp 800w, img/a-1600.webp 1600w"><meta property="og:image" content="/og.png"><link rel="manifest" href="/manifest.json">',
    "manifest.json": '{"icons":[{"src":"/icon-192.png"}]}',
    "img/a-800.webp": "x", "img/a-1600.webp": "x", "og.png": "x", "icon-192.png": "x", "img/unused.png": "x",
  }));
  for (const f of ["img/a-800.webp", "img/a-1600.webp", "og.png", "icon-192.png"]) assert.ok(g.reachable.includes(f), f);
  assert.deepEqual(g.unreachableFiles, ["img/unused.png"]);
});

test("a complete file path written as a string in JavaScript counts as use", () => {
  const g = scan(project({ "index.html": '<script src="/app.js"></script>', "app.js": 'const photos = ["/demo/face.jpg", "data/list.json"];', "demo/face.jpg": "x", "data/list.json": "[]" }));
  assert.ok(g.reachable.includes("demo/face.jpg"));
  assert.ok(g.reachable.includes("data/list.json"));
  assert.equal(g.unreachableFiles.length, 0);
});

test("every HTML page is an entry point (people open /stats.html directly)", () => {
  const g = scan(project({ "index.html": "<p>home</p>", "stats.html": '<script src="/stats.js"></script>', "stats.js": "1" }));
  assert.ok(g.reachable.includes("stats.js"));
  assert.equal(g.unreachableFiles.length, 0);
});

test("plain relative paths in HTML resolve (assets/img/x.jpg, no ./)", () => {
  const g = scan(project({ "index.html": '<img src="assets/img/x.jpg">', "assets/img/x.jpg": "x" }));
  assert.ok(g.reachable.includes("assets/img/x.jpg"));
});

test("css url() and @import are followed", () => {
  const g = scan(project({ "index.html": '<link rel="stylesheet" href="css/a.css">', "css/a.css": '@import "b.css"; body{background:url("../img/bg.png")}', "css/b.css": "", "img/bg.png": "x" }));
  for (const f of ["css/a.css", "css/b.css", "img/bg.png"]) assert.ok(g.reachable.includes(f), f);
});

test("folders the code builds paths into at runtime are guarded", () => {
  const g = scan(project({
    "index.html": '<script type="module" src="/src/main.js"></script>',
    "src/main.js": "const t = await import(`./themes/${name}.js`); el.innerHTML = `<img src=\"/demo/${id}/face.jpg\">`;",
    "src/themes/light.js": "", "demo/sam/face.jpg": "x",
  }));
  assert.ok(g.dynamicDirs.includes("src/themes/"));
  assert.ok(g.dynamicDirs.includes("demo/"));
});

test("HTML inside a template literal is not mistaken for a runtime folder", () => {
  const g = scan(project({ "index.html": '<script src="/a.js"></script>', "a.js": "el.innerHTML = `<h1>Your cart</h1><p>${n} items</p>`;" }));
  assert.deepEqual(g.dynamicDirs, []);
});

test("unused packages are found; imported ones are not", () => {
  const g = scan(project({ "index.html": '<script type="module" src="/a.js"></script>', "a.js": 'import x from "lodash"; import "@scope/pkg/sub";', "package.json": '{"dependencies":{"lodash":"1","@scope/pkg":"1","moment":"1"}}' }));
  assert.deepEqual(g.unusedPkgs, ["moment"]);
});

test("tooling, docs and Kane's own files are never candidates", () => {
  const g = scan(project({ "index.html": "<p></p>", "package.json": "{}", "docs/shot.png": "x", "svels/journeys/a_test.md": "x", "svels/journeys/output-a/Result.md": "x", "scripts/build.js": "1", "README.md": "x" }));
  assert.deepEqual(g.unreachableFiles, []);
});

test("keep list protects a folder", () => {
  const g = scan(project({ "index.html": "<p></p>", "vendor/lib.js": "1" }), { keep: ["vendor/"] });
  assert.deepEqual(g.unreachableFiles, []);
});
