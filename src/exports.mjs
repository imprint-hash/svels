// Unused exports inside files the app DOES use: functions and constants nothing imports.
// These are the agent's targets (the agent edits the file; Kane decides whether the edit stands).
import fs from "node:fs";
import path from "node:path";

const CODE = /\.(m?js|jsx|tsx?)$/;

function exportsOf(text) {
  const names = new Set();
  for (const m of text.matchAll(/\bexport\s+(?:async\s+)?(?:function\*?|class|const|let|var)\s+([A-Za-z_$][\w$]*)/g)) names.add(m[1]);
  for (const m of text.matchAll(/\bexport\s*\{([^}]+)\}(?!\s*from)/g)) for (const part of m[1].split(",")) { const n = part.trim().split(/\s+as\s+/).pop(); if (n) names.add(n); }
  return names;
}

export function unusedExports(root, graph) {
  const files = graph.reachable.filter((f) => CODE.test(f));
  const imported = new Map(files.map((f) => [f, new Set()]));
  const wholeModule = new Set(); // namespace imports, dynamic imports, re-exports: treat every export as used
  for (const f of files) {
    const text = fs.readFileSync(path.join(root, f), "utf8");
    for (const target of graph.edges[f] || []) {
      if (!imported.has(target)) continue;
      const base = path.posix.basename(target).replace(CODE, "");
      // import { a, b as c } from "./x.js"   |   import x, { a } from "./x.js"
      for (const m of text.matchAll(/import\s+([^;]*?)\s+from\s+["']([^"']+)["']/g)) {
        if (!m[2].includes(base)) continue;
        const clause = m[1];
        if (/\*\s+as\s+/.test(clause)) wholeModule.add(target);
        const named = clause.match(/\{([^}]*)\}/);
        if (named) for (const part of named[1].split(",")) { const n = part.trim().split(/\s+as\s+/)[0]; if (n) imported.get(target).add(n); }
      }
      if (new RegExp(`import\\(\\s*[\\"'\`][^\\"'\`]*${base}`).test(text) || new RegExp(`export\\s+(\\*|\\{[^}]*\\})\\s+from\\s+["'][^"']*${base}`).test(text)) wholeModule.add(target);
    }
  }
  const out = [];
  for (const f of files) {
    if (wholeModule.has(f)) continue;
    const text = fs.readFileSync(path.join(root, f), "utf8");
    if (text.split("\n").length > 400) continue; // the agent rewrites whole files; keep them small enough to check
    const unused = [...exportsOf(text)].filter((n) => !imported.get(f).has(n) && n !== "default");
    if (unused.length && !(graph.entryLike || []).includes(f)) out.push({ file: f, unused });
  }
  return out;
}
