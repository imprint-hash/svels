// report.json (machine-readable) + report.html (one self-contained page: numbers, journey map, kept files, trials).
import fs from "node:fs";
import path from "node:path";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export function writeReport(svelsDir, s) {
  fs.writeFileSync(path.join(svelsDir, "report.json"), JSON.stringify(s, null, 2));
  const removed = new Set(s.removed.filter((x) => x.startsWith("file:")).map((x) => x.slice(5)));
  const kept = new Map(s.kept.filter((k) => k.item.startsWith("file:")).map((k) => [k.item.slice(5), k]));
  const usedBy = (f) => Object.entries(s.journeyMap).filter(([, files]) => files.includes(f) || files.includes(f.replace(/^public\//, ""))).map(([j]) => j);
  const files = s.allFiles.filter((f) => !f.startsWith(".svels/")).sort();
  const groups = {};
  for (const f of files) (groups[path.posix.dirname(f)] ||= []).push(f);
  const state = (f) => removed.has(f) ? "cut" : kept.has(f) ? "saved" : usedBy(f).length ? "walked" : s.reachable.includes(f) ? "linked" : "other";
  const label = { cut: "cut, journeys still pass", saved: "kept, Kane caught a break", walked: "loaded by a journey", linked: "imported", other: "not checked" };
  const tile = (f) => { const st = state(f), j = usedBy(f), k = kept.get(f);
    return `<li class="f ${st}" title="${esc(label[st])}"><span class="name">${esc(path.posix.basename(f))}</span>${j.length ? `<span class="tags">${j.map((x) => `<i>${esc(x)}</i>`).join("")}</span>` : ""}${k ? `<span class="why">${esc(k.why)}</span>` : ""}</li>`; };
  const map = Object.entries(groups).map(([dir, fs_]) => `<section class="dir"><h4>${esc(dir === "." ? "/" : dir + "/")}</h4><ul>${fs_.map(tile).join("")}</ul></section>`).join("");
  const keptRows = s.kept.map((k) => `<tr><td><code>${esc(k.item.replace(/^(file|pkg):/, ""))}</code></td><td>${k.failures.map((f) => `${esc(f.journey)} failed at “${esc(f.failedStep || "?")}”`).join("<br>")}</td><td>${esc(k.why)}</td><td><code>${esc(k.keep_rule)}</code></td></tr>`).join("");
  const trialRows = s.trials.map((t, i) => `<tr><td>${i + 1}</td><td>${t.size}</td><td>${t.journeys.map((j) => `<span class="pill ${j.ok ? "ok" : "bad"}">${esc(j.journey)} ${j.ok ? "pass" : "fail"}${j.replayed ? " · replay" : ""}</span>`).join(" ")}</td><td>${t.ok ? "kept the cut" : "undid the cut"}</td></tr>`).join("");
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Svels report · ${esc(s.project)}</title>
<style>
:root{--bg:#f6f5f1;--ink:#1d1f1c;--soft:#5d625a;--line:#dedbd2;--card:#fffefb;--cut:#c6c3ba;--walk:#2f6f4f;--save:#b3541e;--accent:#2f6f4f;color-scheme:light}
@media (prefers-color-scheme:dark){:root:not([data-theme=light]){--bg:#121411;--ink:#ecebe5;--soft:#a3a79d;--line:#2c302a;--card:#1a1d19;--cut:#4a4d47;--walk:#74c29a;--save:#f0955e;--accent:#74c29a;color-scheme:dark}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.55 "IBM Plex Sans",system-ui,sans-serif}
main{max-width:1080px;margin:0 auto;padding:32px 16px 64px}h1{font:600 30px/1.2 "IBM Plex Mono",ui-monospace,monospace;margin:0 0 4px}h2{font-size:18px;margin:36px 0 12px}
.sub{color:var(--soft);margin:0 0 24px}.nums{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px}
.n{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:14px}.n b{display:block;font:600 26px "IBM Plex Mono",monospace}.n span{color:var(--soft);font-size:13px}
.banner{margin:20px 0;padding:12px 14px;border-radius:10px;border:1px solid var(--line);background:var(--card)}.banner.ok{border-color:var(--walk)}.banner.bad{border-color:var(--save)}
.legend{display:flex;flex-wrap:wrap;gap:14px;color:var(--soft);font-size:13px;margin-bottom:12px}.legend i{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:6px;vertical-align:middle}
.map{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:12px}.dir{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:12px}
.dir h4{margin:0 0 8px;font:600 13px "IBM Plex Mono",monospace;color:var(--soft)}.dir ul{list-style:none;margin:0;padding:0;display:grid;gap:6px}
.f{border-left:4px solid var(--line);padding:4px 8px;border-radius:4px;font:13px "IBM Plex Mono",monospace;overflow-wrap:anywhere}
.f.cut{border-color:var(--cut);color:var(--soft);text-decoration:line-through}.f.walked{border-color:var(--walk)}.f.saved{border-color:var(--save);background:color-mix(in srgb,var(--save) 10%,transparent)}.f.linked{border-color:color-mix(in srgb,var(--walk) 40%,var(--line))}
.tags i{font-style:normal;font-size:11px;margin-left:6px;padding:1px 6px;border-radius:999px;background:color-mix(in srgb,var(--walk) 18%,transparent);color:var(--walk)}
.why{display:block;font-family:"IBM Plex Sans",sans-serif;color:var(--save);font-size:12px;margin-top:2px;text-decoration:none}
.wrap{overflow-x:auto}table{width:100%;border-collapse:collapse;background:var(--card);border:1px solid var(--line);border-radius:10px}th,td{text-align:left;padding:8px 10px;border-bottom:1px solid var(--line);vertical-align:top;font-size:14px}th{font-size:12px;color:var(--soft);text-transform:uppercase;letter-spacing:.06em}
.pill{display:inline-block;font:12px "IBM Plex Mono",monospace;padding:1px 7px;border-radius:999px;border:1px solid var(--line)}.pill.ok{color:var(--walk)}.pill.bad{color:var(--save);border-color:var(--save)}code{font-family:"IBM Plex Mono",monospace;font-size:13px}
</style></head><body><main>
<h1>svels · ${esc(s.project)}</h1><p class="sub">${esc(new Date(s.at).toUTCString())} · ${s.seconds}s · every cut verified by Kane CLI in a real browser</p>
<div class="nums"><div class="n"><b>${removed.size}</b><span>files cut (of ${s.candidates} candidates)</span></div><div class="n"><b>${s.linesRemoved}</b><span>lines removed</span></div>
<div class="n"><b>${s.packagesRemoved.length}</b><span>packages dropped</span></div><div class="n"><b>${s.kept.length}</b><span>kept: Kane caught a break</span></div>
<div class="n"><b>${s.kaneRuns}</b><span>Kane runs (${s.replays} replayed from cache)</span></div><div class="n"><b>${s.credits}</b><span>Kane credits used</span></div></div>
<div class="banner ${s.finalPassed ? "ok" : "bad"}">${s.finalPassed ? `Final check: with every cut applied together, all ${s.journeys.length} journeys pass (${s.journeys.map(esc).join(", ")}).` : "Final check failed: nothing was applied."}${s.applied ? " The cuts were applied to the project." : " Dry run: run <code>svels run --apply</code> to apply."}</div>
<h2>Journey map</h2><div class="legend"><span><i style="background:var(--walk)"></i>loaded while Kane walked a journey</span><span><i style="background:var(--save)"></i>looked unused, but Kane caught a break: kept</span><span><i style="background:var(--cut)"></i>cut, journeys still pass</span></div>
<div class="map">${map}</div>
${s.kept.length ? `<h2>Kept because Kane caught a break</h2><div class="wrap"><table><tr><th>File</th><th>What Kane saw</th><th>Why it's needed (agent)</th><th>Keep rule</th></tr>${keptRows}</table></div>` : ""}
${s.packagesRemoved.length ? `<h2>Packages dropped</h2><p>${s.packagesRemoved.map((p) => `<code>${esc(p)}</code>`).join(", ")}</p>` : ""}
<h2>Trials</h2><div class="wrap"><table><tr><th>#</th><th>Items removed</th><th>Kane</th><th>Result</th></tr>${trialRows}</table></div>
</main></body></html>`;
  const out = path.join(svelsDir, "report.html"); fs.writeFileSync(out, html); return out;
}
