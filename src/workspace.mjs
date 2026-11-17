// A throwaway copy of the project per trial, so the real code is never touched until the end.
import fs from "node:fs";
import path from "node:path";

const SKIP = new Set(["node_modules", ".git", ".svels"]);

export function freshCopy(src, dest) {
  fs.rmSync(dest, { recursive: true, force: true });
  fs.cpSync(src, dest, { recursive: true, filter: (p) => !SKIP.has(path.basename(p)) || p === src });
}

// Candidates are "file:<path>" or "pkg:<name>".
export function applyRemovals(dir, items) {
  const pkgs = items.filter((i) => i.startsWith("pkg:")).map((i) => i.slice(4));
  for (const i of items.filter((x) => x.startsWith("file:"))) fs.rmSync(path.join(dir, i.slice(5)), { force: true });
  const pj = path.join(dir, "package.json");
  if (pkgs.length && fs.existsSync(pj)) {
    const pkg = JSON.parse(fs.readFileSync(pj, "utf8"));
    for (const n of pkgs) { if (pkg.dependencies) delete pkg.dependencies[n]; if (pkg.devDependencies) delete pkg.devDependencies[n]; }
    fs.writeFileSync(pj, JSON.stringify(pkg, null, 2) + "\n");
  }
}

export const lineCount = (file) => { try { return fs.readFileSync(file, "utf8").split("\n").length; } catch { return 0; } };
export const byteSize = (file) => { try { return fs.statSync(file).size; } catch { return 0; } };
