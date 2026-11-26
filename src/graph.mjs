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
  /\b(?:src|href|content|poster|data-src)=["']([^"'#?]+)[^"']*["']/g,
  /\]\(\s*<?([^)\s>#?]+)[^)]*\)/g, // Markdown links and images: ![shot](screenshots/a.png)
  /"(?:src|url|href|icon)"\s*:\s*"([^"#?]+)[^"]*"/g, // manifest.json and other JSON configs
  // A complete file path written as a plain string in code ("/demo/sam/face.jpg", 'products/a.webp').
  // Strings built at runtime (`/demo/${id}/face.jpg`) are left for Kane to settle in the browser.
  /["'`]((?:\.{0,2}\/)?[\w@~.-]+(?:\/[\w@~.-]+)*\.(?:png|jpe?g|webp|gif|svg|ico|css|m?js|json|woff2?|mp4|webm|mp3))["'`]/g,
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
  for (const m of text.matchAll(/\bsrcset=["']([^"']+)["']/g)) for (const part of m[1].split(",")) found.add(part.trim().split(/\s+/)[0]);
  for (const re of SPEC_RE) { re.lastIndex = 0; let m; while ((m = re.exec(text))) found.add(m[1]); }
  return [...found];
}

function resolveFile(root, fromFile, spec, aliases) {
  spec = spec.replace(/[?#].*$/, ""); // "app.min.js?v=2.1.0" and "icons.svg#home" name the same file
  if (!spec) return null;
  let base;
  if (spec.startsWith(".")) base = path.join(path.dirname(path.join(root, fromFile)), spec);
  else if (spec.startsWith("/")) base = [path.join(root, "public", spec), path.join(root, spec)].find((p) => fs.existsSync(p)) || path.join(root, spec);
  else if (!spec.startsWith("@") && /\.[a-z0-9]{2,5}$/i.test(spec) && fs.existsSync(path.join(path.dirname(path.join(root, fromFile)), spec))) {
    base = path.join(path.dirname(path.join(root, fromFile)), spec); // plain relative path in HTML/CSS ("assets/img/a.png")
  } else if (isScript(fromFile) && !spec.startsWith("@") && /\.[a-z0-9]{2,5}$/i.test(spec) && pageDirs(root).some((d) => fs.existsSync(path.join(d, spec)))) {
    // In a browser a path inside a script ("styles/x.css", fetch("lang/de.json")) is resolved from the page, not the script's folder.
    base = path.join(pageDirs(root).find((d) => fs.existsSync(path.join(d, spec))), spec);
  } else {
    const alias = Object.keys(aliases).find((a) => spec === a || spec.startsWith(a + "/"));
    if (!alias) return null;
    base = path.join(root, aliases[alias], spec.slice(alias.length));
  }
  const tries = [base, ...RESOLVE_EXT.map((e) => base + e), ...RESOLVE_EXT.map((e) => path.join(base, "index" + e))];
  const hit = tries.find((p) => fs.existsSync(p) && fs.statSync(p).isFile());
  return hit ? path.relative(root, hit).split(path.sep).join("/") : null;
}

const isScript = (f) => /\.(m?js|cjs|jsx|tsx?)$/i.test(f);
const pageDirs = (root) => [root, path.join(root, "public")].filter((d) => fs.existsSync(d));

const pkgName = (spec) => (spec.startsWith("@") ? spec.split("/").slice(0, 2).join("/") : spec.split("/")[0]);

export function buildGraph(root, opts = {}) {
  const { entries, aliases = { "@": "src" }, keep = [] } = opts;
  const files = listFiles(root);
  const codeLike = (f) => [...CODE_EXT, ".css", ".scss", ".html", ".htm", ".json", ".webmanifest", ".md", ".markdown"].some((e) => f.toLowerCase().endsWith(e));
  const edges = {}, usedPkgs = {};
  // Every HTML page is a way into the site (people open /stats.html directly), so each one is an entry.
  const pages = opts.allPages === false ? [] : files.filter((f) => /\.html?$/i.test(f) && !keep.some((k) => f.startsWith(k.replace(/\/?$/, "/"))) && !/(^|\/)(output-[^/]+|\.testmuai|docs)\//.test(f));
  // Markdown files (README, docs) show images on GitHub: anything they link to is in use, even though no web page loads it.
  const markdown = files.filter((f) => /\.(md|markdown)$/i.test(f) && !/(^|\/)(output-[^/]+|\.testmuai|node_modules)\//.test(f));
  const seen = new Set(), queue = [...new Set([...entries, ...pages, ...markdown])].filter((e) => fs.existsSync(path.join(root, e)));
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
  // Folders the code builds paths into at runtime: `../themes/${name}.js`, `/demo/${id}/face.jpg`.
  const dynamicDirs = new Set();
  for (const f of seen) {
    if (!/\.(m?js|cjs|jsx|tsx?|html?)$/.test(f)) continue;
    // Every path fragment that runs straight into a ${...}: `<img src="/demo/${id}/face.jpg">` -> "/demo/"
    for (const m of fs.readFileSync(path.join(root, f), "utf8").matchAll(/[`"'(=\s>]((?:\.{1,2}\/|\/)?(?:[\w.~@-]+\/)+)\$\{/g)) {
      const tail = m[1];
      if (!tail || /^(https?:|\/\/)/.test(tail) || /^(api|v\d+)\/$/.test(tail.replace(/^\//, ""))) continue;
      const dirPart = tail;
      const abs = dirPart.startsWith("/") ? path.join(root, dirPart) : path.join(path.dirname(path.join(root, f)), dirPart);
      const rel = path.relative(root, abs).split(path.sep).join("/");
      if (!rel.startsWith("..") && rel) dynamicDirs.add(rel.replace(/\/?$/, "/"));
      // A script's runtime path is resolved from the page: `lang/${code}.json` in scripts/i18n.js means /lang/.
      if (isScript(f) && !dirPart.startsWith(".") && !dirPart.startsWith("/")) for (const d of pageDirs(root)) if (fs.existsSync(path.join(d, dirPart))) dynamicDirs.add(path.relative(root, path.join(d, dirPart)).split(path.sep).join("/").replace(/\/?$/, "/"));
      if (dirPart.startsWith("/") && fs.existsSync(path.join(root, "public", dirPart))) dynamicDirs.add(("public" + dirPart).replace(/\/?$/, "/"));
    }
  }
  const pkg = fs.existsSync(path.join(root, "package.json")) ? JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")) : {};
  const declared = Object.keys(pkg.dependencies || {});
  const isKept = (f) => keep.some((k) => f === k || f.startsWith(k.replace(/\/?$/, "/")));
  // Only files a browser could load count as candidates; docs, configs and build sources are left alone.
  const servable = /\.(m?js|cjs|jsx|tsx?|css|html?|svg|png|jpe?g|webp|gif|ico|woff2?|ttf|otf|eot|json)$/i;
  const isConfig = (f) => path.posix.basename(f).startsWith(".") || /^(composer\.json|[\w.-]*\.config\.(m?js|cjs|json|ts)|tsconfig[\w.-]*\.json|jsconfig\.json)$/i.test(path.posix.basename(f)) || f.split("/").some((seg) => seg.startsWith(".") && seg.length > 1);
  const notTooling = (f) => !isConfig(f) && !/(^|\/)(package(-lock)?\.json|svels\.config\.json|tsconfig[^/]*\.json|vercel\.json|manifest\.json|robots\.txt|[gG]ulpfile\.[cm]?js|[gG]runtfile\.[cm]?js|webpack\.[\w.]*js)$/i.test(f) && !/(^|\/)(output-[^/]+|\.testmuai|test|tests|__tests__|scripts|api|docs)\//.test(f);
  const roots = (opts.roots || []).map((r) => r.replace(/\/?$/, "/"));
  const inRoots = (f) => !roots.length || roots.some((r) => f.startsWith(r));
  const unreachableFiles = files.filter((f) => !seen.has(f) && !isKept(f) && inRoots(f) && servable.test(f) && notTooling(f));
  const unusedPkgs = opts.packages === false ? [] : declared.filter((d) => !usedPkgs[d] && !keep.includes(d)); // packages:false when package.json serves build tooling, not the site
  return { files, reachable: [...seen], edges, usedPkgs, unreachableFiles, unusedPkgs, dynamicDirs: [...dynamicDirs] };
}
