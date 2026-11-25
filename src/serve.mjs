// Tiny static server whose root can be swapped between trials. Every response is no-store,
// so a deleted file can never be served from the browser cache and fake a pass.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const MIME = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif", ".ico": "image/x-icon" };

export function startServer(port) {
  let root = null;
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent(new URL(req.url, "http://x").pathname);
    const rel = url === "/" ? "/index.html" : url;
    const candidates = [path.join(root, rel), path.join(root, "public", rel)];
    const file = candidates.find((p) => p.startsWith(root) && fs.existsSync(p) && fs.statSync(p).isFile());
    const headers = { "Cache-Control": "no-store, max-age=0", "Pragma": "no-cache" };
    if (!root || !file) { res.writeHead(404, { ...headers, "Content-Type": "text/plain" }); return res.end("not found"); }
    res.writeHead(200, { ...headers, "Content-Type": MIME[path.extname(file)] || "application/octet-stream" });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve({
    setRoot: (dir) => { root = path.resolve(dir); },
    close: () => new Promise((r) => { server.close(r); server.closeAllConnections?.(); }), // the browser keeps connections alive
  })));
}
