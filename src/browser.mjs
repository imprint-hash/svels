// The Chrome that Kane drives. Svels owns it, so it can (1) turn the cache off and (2) record every
// file the app loads while Kane walks a journey: that is the journey map.
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function launchChrome({ port = 9333, chromePath = process.env.SVELS_CHROME, profileDir }) {
  const bin = chromePath || ["/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser"].find((p) => fs.existsSync(p));
  if (!bin) throw new Error("No Chrome found. Set SVELS_CHROME to a Chrome binary, or pass --cdp to an existing one.");
  fs.mkdirSync(profileDir, { recursive: true });
  const proc = spawn(bin, ["--headless=new", "--no-sandbox", "--disable-gpu", "--no-first-run", `--remote-debugging-port=${port}`, `--user-data-dir=${profileDir}`, "about:blank"],
    { stdio: "ignore", detached: false, env: process.env });
  const endpoint = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 60; i++) { try { await fetch(endpoint + "/json/version"); return { endpoint, stop: () => proc.kill() }; } catch { await sleep(250); } }
  proc.kill(); throw new Error("Chrome did not open its debugging port");
}

// Browser-level CDP session: auto-attach to every page Kane opens, disable cache, log requests.
export async function recordLoads(endpoint, origin) {
  const { webSocketDebuggerUrl } = await (await fetch(endpoint + "/json/version")).json();
  const ws = new WebSocket(webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let id = 0; const pending = new Map(); const loaded = new Set();
  const send = (method, params = {}, sessionId) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params, sessionId })); });
  ws.onmessage = async (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg.result); pending.delete(msg.id); return; }
    if (msg.method === "Target.attachedToTarget") {
      const sid = msg.params.sessionId;
      send("Network.enable", {}, sid); send("Network.setCacheDisabled", { cacheDisabled: true }, sid);
      send("Target.setAutoAttach", { autoAttach: true, waitForDebuggerOnStart: false, flatten: true }, sid);
      send("Runtime.runIfWaitingForDebugger", {}, sid);
    }
    if (msg.method === "Network.responseReceived") {
      const u = msg.params.response.url;
      if (u.startsWith(origin) && msg.params.response.status < 400) loaded.add(new URL(u).pathname.replace(/^\//, "") || "index.html");
    }
  };
  await send("Target.setDiscoverTargets", { discover: true });
  await send("Target.setAutoAttach", { autoAttach: true, waitForDebuggerOnStart: false, flatten: true });
  return { take: () => { const s = [...loaded]; loaded.clear(); return s; }, close: () => ws.close() };
}

export const relPathForUrlPath = (p, files) => files.find((f) => f === p) || files.find((f) => f === path.posix.join("public", p)) || p;
