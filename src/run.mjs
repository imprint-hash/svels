// The Svels loop: baseline journeys (and the journey map) -> batched cuts verified by Kane ->
// failures explained by the agent -> report, and optionally apply the proven cuts to the project.
import fs from "node:fs";
import path from "node:path";
import { buildGraph } from "./graph.mjs";
import { shrink } from "./ddmin.mjs";
import { startServer } from "./serve.mjs";
import { launchChrome, recordLoads } from "./browser.mjs";
import { kaneBin, runJourney, listJourneys } from "./kane.mjs";
import { freshCopy, applyRemovals, lineCount, byteSize } from "./workspace.mjs";
import { explainNeeded } from "./agent.mjs";
import { writeReport } from "./report.mjs";

export function loadConfig(projectDir) {
  const p = path.join(projectDir, "svels.config.json");
  const c = fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : {};
  return { entries: ["index.html"], aliases: { "@": "src" }, port: 5180, journeys: "svels/journeys", keep: ["svels/"], ...c };
}

export function scan(projectDir) {
  const cfg = loadConfig(projectDir);
  const g = buildGraph(projectDir, cfg);
  return { cfg, graph: g, candidates: [...g.unreachableFiles.map((f) => "file:" + f), ...g.unusedPkgs.map((n) => "pkg:" + n)] };
}

export async function run(projectDir, { cdp, apply = false, log = console.log } = {}) {
  projectDir = path.resolve(projectDir);
  const t0 = Date.now();
  const { cfg, graph, candidates } = scan(projectDir);
  const svelsDir = path.join(projectDir, ".svels"); fs.mkdirSync(svelsDir, { recursive: true });
  const work = path.join(svelsDir, "work");
  const journeys = listJourneys(path.join(projectDir, cfg.journeys));
  if (!journeys.length) throw new Error(`No *_test.md journeys in ${cfg.journeys}. Write 1-3 plain-English journeys first.`);
  const bin = kaneBin(projectDir);
  const server = await startServer(cfg.port);
  const chrome = cdp ? { endpoint: cdp, stop: () => {} } : await launchChrome({ profileDir: path.join(svelsDir, "chrome"), port: 9333 });
  const origin = `http://127.0.0.1:${cfg.port}`;
  const rec = await recordLoads(chrome.endpoint, origin);
  const runs = []; let credits = 0;
  const runAll = async (label, heal) => {
    const res = [];
    for (const j of journeys) {
      rec.take();
      const r = await runJourney(bin, j, { cdp: chrome.endpoint, heal });
      r.loaded = rec.take(); r.label = label; credits += r.credits; runs.push(r); res.push(r);
      log(`  ${r.ok ? "PASS" : "FAIL"}  ${r.journey}${r.replayed ? " (replayed from cache)" : ""}${r.failedStep ? ` at "${r.failedStep}"` : ""}  ${r.credits ? r.credits + " credits" : ""}`);
      if (!r.ok && !heal) break; // one failing journey is enough to reject a cut
    }
    return res;
  };
  try {
    log(`Svels: ${candidates.length} candidates (${graph.unreachableFiles.length} files, ${graph.unusedPkgs.length} packages) look unused to the import scan.`);
    log(`Baseline: Kane walks ${journeys.length} journeys on the untouched app.`);
    freshCopy(projectDir, work); server.setRoot(work);
    const base = await runAll("baseline", true);
    if (!base.every((r) => r.ok)) throw new Error("Baseline journeys must pass before Svels cuts anything. Fix the app or the journeys first.");
    const journeyMap = Object.fromEntries(base.map((r) => [r.journey, r.loaded]));
    const loadedIn = (rel) => base.filter((r) => r.loaded.includes(rel) || r.loaded.includes(rel.replace(/^public\//, ""))).map((r) => r.journey);
    // Files the browser loaded during a journey are suspicious: try them one at a time, last.
    const runtimeSeen = candidates.filter((c) => c.startsWith("file:") && loadedIn(c.slice(5)).length);
    const quiet = candidates.filter((c) => !runtimeSeen.includes(c));
    const trials = [];
    const tryRemove = async (set) => {
      freshCopy(projectDir, work); applyRemovals(work, set); server.setRoot(work);
      log(`Trial ${trials.length + 1}: without ${set.length} item(s)`);
      const res = await runAll(`trial ${trials.length + 1}`, false);
      const ok = res.every((r) => r.ok);
      trials.push({ size: set.length, ok, set, journeys: res.map(({ journey, ok, failedStep, replayed, credits }) => ({ journey, ok, failedStep, replayed, credits })) });
      return { ok, evidence: res.filter((r) => !r.ok).map(({ journey, failedStep, resultMd, evidence }) => ({ journey, failedStep, resultMd, evidence })) };
    };
    const a = await shrink(quiet, tryRemove);
    const b = await shrink(runtimeSeen, async (set) => tryRemove([...a.accepted, ...set]));
    const accepted = [...a.accepted, ...b.accepted], needed = [...a.needed, ...b.needed];
    // Closed loop: Kane's failures go to the agent, which explains each kept file and proposes a keep rule.
    const referencers = graph.reachable.filter((f) => /\.(m?js|ts|tsx|jsx)$/.test(f));
    for (const n of needed) n.explain = await explainNeeded(projectDir, n.item, n.evidence || [], { journeys: loadedIn(n.item.slice(5)), referencers });
    // Final confirmation run with every accepted cut applied together.
    freshCopy(projectDir, work); applyRemovals(work, accepted); server.setRoot(work);
    log(`Final check: all ${accepted.length} cuts together.`);
    const final = await runAll("final", false);
    const removedFiles = accepted.filter((x) => x.startsWith("file:")).map((x) => x.slice(5));
    const summary = {
      project: path.basename(projectDir), at: new Date().toISOString(), seconds: Math.round((Date.now() - t0) / 1000),
      candidates: candidates.length, removed: accepted, kept: needed.map((n) => ({ item: n.item, failures: n.evidence, ...n.explain })),
      linesRemoved: removedFiles.reduce((s, f) => s + lineCount(path.join(projectDir, f)), 0),
      bytesRemoved: removedFiles.reduce((s, f) => s + byteSize(path.join(projectDir, f)), 0),
      packagesRemoved: accepted.filter((x) => x.startsWith("pkg:")).map((x) => x.slice(4)),
      finalPassed: final.every((r) => r.ok), journeys: base.map((r) => r.journey), journeyMap,
      kaneRuns: runs.length, replays: runs.filter((r) => r.replayed).length, credits: Math.round(credits * 100) / 100,
      trials, runs: runs.map(({ journey, label, ok, failedStep, replayed, credits, evidence }) => ({ journey, label, ok, failedStep, replayed, credits, evidence })),
      allFiles: graph.files, reachable: graph.reachable, applied: false,
    };
    if (apply && summary.finalPassed) { applyRemovals(projectDir, accepted); summary.applied = true; }
    const out = writeReport(svelsDir, summary);
    log(`\nRemoved ${removedFiles.length} files (${summary.linesRemoved} lines) and ${summary.packagesRemoved.length} packages. Kept ${needed.length} that Kane proved are needed.`);
    log(`Final check: ${summary.finalPassed ? "all journeys pass" : "FAILED, nothing applied"}. Kane runs: ${summary.kaneRuns} (${summary.replays} replayed free). Report: ${out}`);
    return summary;
  } finally { rec.close(); await server.close(); chrome.stop(); }
}
