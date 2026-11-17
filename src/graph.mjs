// Static import graph: which files and packages can be reached from the app's entry points.
// Anything unreachable is a *candidate* for removal. Svels never trusts this alone:
// every candidate is only removed after Kane proves the user journeys still pass.
import fs from "node:fs";
import path from "node:path";

const CODE_EXT = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".vue", ".svelte"];
const ASSET_EXT = [".css", ".scss", ".json", ".svg", ".png", ".jpg", ".jpeg", ".webp", ".gif"];
const RESOLVE_EXT = [...CODE_EXT, ...ASSET_EXT];
const IGNORE_DIRS = new Set(["node_modules", ".git", "dist", "build", ".next", ".svels", "coverage", ".vercel"]);

// import x from "y" | import "y" | export ... from "y" | import("y") | require("y") | url("y") in css | src="/y" in html
const SPEC_RE = [
  /\bimport\s+(?:[\s\S]*?\s+from\s+)?["']([^"']+)["']/g,
  /\bexport\s+[\s\S]*?\s+from\s+["']([^"']+)["']/g,
  /\bimport\(\s*["']([^"']+)["']\s*\)/g,
  /\brequire\(\s*["']([^"']+)["']\s*\)/g,
  /@import\s+["']([^"']+)["']/g,
  /url\(\s*["']?([^"')]+)["']?\s*\)/g,
  /\b(?:src|href)=["']([^"'#?]+)["']/g,
];

export function listFiles(root, dir = root, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith(".") && e.name !== ".") { if (IGNORE_DIRS.has(e.name) || e.isDirectory()) continue; }
    if (IGNORE_DIRS.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) listFiles(root, p, out);
    else out.push(path.relative(root, p).split(path.sep).join("/"));
  }
  return out;
}

function specifiers(text) {
  const found = new Set();
  for (const re of SPEC_RE) { re.lastIndex = 0; let m; while ((m = re.exec(text))) found.add(m[1]); }
  return [...found];
}

function resolveFile(root, fromFile, spec, aliases) {
  let base;
  if (spec.startsWith(".")) base = path.join(path.dirname(path.join(root, fromFile)), spec);
  else if (spec.startsWith("/")) base = [path.join(root, "public", spec), path.join(root, spec)].find((p) => fs.existsSync(p)) || path.join(root, spec);
  else {
    const alias = Object.keys(aliases).find((a) => spec === a || spec.startsWith(a + "/"));
    if (!alias) return null;
    base = path.join(root, aliases[alias], spec.slice(alias.length));
  }
  const tries = [base, ...RESOLVE_EXT.map((e) => base + e), ...RESOLVE_EXT.map((e) => path.join(base, "index" + e))];
  const hit = tries.find((p) => fs.existsSync(p) && fs.statSync(p).isFile());
  return hit ? path.relative(root, hit).split(path.sep).join("/") : null;
}

const pkgName = (spec) => (spec.startsWith("@") ? spec.split("/").slice(0, 2).join("/") : spec.split("/")[0]);

export function buildGraph(root, { entries, aliases = { "@": "src" }, keep = [] } = {}) {
  const files = listFiles(root);
  const codeLike = (f) => [...CODE_EXT, ".css", ".scss", ".html"].some((e) => f.endsWith(e));
  const edges = {}, usedPkgs = {};
  const seen = new Set(), queue = [...entries.filter((e) => fs.existsSync(path.join(root, e)))];
  while (queue.length) {
    const f = queue.shift(); if (seen.has(f)) continue; seen.add(f);
    edges[f] = [];
    if (!codeLike(f)) continue;
    for (const spec of specifiers(fs.readFileSync(path.join(root, f), "utf8"))) {
      if (/^(https?:|data:|mailto:|#)/.test(spec)) continue;
      const hit = resolveFile(root, f, spec, aliases);
      if (hit) { edges[f].push(hit); if (!seen.has(hit)) queue.push(hit); }
      else if (!spec.startsWith(".") && !spec.startsWith("/")) (usedPkgs[pkgName(spec)] ||= []).push(f);
    }
  }
  const pkg = fs.existsSync(path.join(root, "package.json")) ? JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")) : {};
  const declared = Object.keys(pkg.dependencies || {});
  const isKept = (f) => keep.some((k) => f === k || f.startsWith(k.replace(/\/?$/, "/")));
  const sourceRoots = ["src/", "app/", "pages/", "components/", "lib/", "public/"];
  const unreachableFiles = files.filter((f) => !seen.has(f) && !isKept(f) && sourceRoots.some((r) => f.startsWith(r)));
  const unusedPkgs = declared.filter((d) => !usedPkgs[d] && !keep.includes(d));
  return { files, reachable: [...seen], edges, usedPkgs, unreachableFiles, unusedPkgs };
}
