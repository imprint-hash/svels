// The Svels loop: baseline journeys (and the journey map) -> batched cuts verified by Kane ->
// failures explained by the agent -> report, and optionally apply the proven cuts to the project.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildGraph } from "./graph.mjs";
import { shrink } from "./ddmin.mjs";
import { startServer } from "./serve.mjs";
import { launchChrome, recordLoads } from "./browser.mjs";
import { kaneBin, runJourney, listJourneys } from "./kane.mjs";
import { freshCopy, applyRemovals, lineCount, byteSize } from "./workspace.mjs";
import { explainNeeded } from "./agent.mjs";
import { writeReport } from "./report.mjs";
import { unusedExports } from "./exports.mjs";
import { agentTrim } from "./trim.mjs";

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
  const work = path.join(os.tmpdir(), `svels-work-${path.basename(projectDir)}-${process.pid}`);
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
      let r = await runJourney(bin, j, { cdp: chrome.endpoint, heal, logDir: path.join(svelsDir, "kane-logs") });
      if (!r.ok && r.automationBug) { // Kane says the test misfired, not the app: retry once before believing it
        log(`  retry  ${r.journey}: Kane triaged the failure as a test problem ("${(r.triage || "").slice(0, 80)}")`);
        credits += r.credits; rec.take();
        r = { ...(await runJourney(bin, j, { cdp: chrome.endpoint, heal, logDir: path.join(svelsDir, "kane-logs") })), retried: true };
      }
      r.loaded = rec.take(); r.label = label; credits += r.credits; runs.push(r); res.push(r);
      log(`  ${r.ok ? "PASS" : "FAIL"}  ${r.journey}${r.replayed ? " (replayed from cache)" : ""}${r.failedStep ? ` at "${r.failedStep}"` : ""}  ${r.credits ? r.credits + " credits" : ""}`);
      if (!r.ok && !heal) break; // one failing journey is enough to reject a cut
    }
    return res;
  };
  try {
    log(`Guarded folders (paths built at runtime): ${graph.dynamicDirs.join(", ") || "none"}`);
    log(`Svels: ${candidates.length} candidates (${graph.unreachableFiles.length} files, ${graph.unusedPkgs.length} packages) look unused to the import scan.`);
    log(`Baseline: Kane walks ${journeys.length} journeys on the untouched app.`);
    freshCopy(projectDir, work); server.setRoot(work);
    const base = await runAll("baseline", true);
    if (!base.every((r) => r.ok)) throw new Error("Baseline journeys must pass before Svels cuts anything. Fix the app or the journeys first.");
    const journeyMap = Object.fromEntries(base.map((r) => [r.journey, r.loaded]));
    const loadedIn = (rel) => base.filter((r) => r.loaded.includes(rel) || r.loaded.includes(rel.replace(/^public\//, ""))).map((r) => r.journey);
    // Files the browser loaded during a journey are suspicious: try them one at a time, last.
    // "Guarded" candidates: loaded by the browser during a journey, or inside a folder the code builds
    // paths into at runtime. Kane can prove they're needed, but never that they're safe to delete.
    const inDynamic = (rel) => graph.dynamicDirs.some((d) => rel.startsWith(d));
    const runtimeSeen = candidates.filter((c) => c.startsWith("file:") && (loadedIn(c.slice(5)).length || inDynamic(c.slice(5))));
    const quiet = candidates.filter((c) => !runtimeSeen.includes(c));
    const trials = [];
    let edits = {}; // agent edits inside files that Kane has accepted
    const tryRemove = async (set, extraEdits = {}) => {
      freshCopy(projectDir, work); applyRemovals(work, set); server.setRoot(work);
      for (const [f, c] of Object.entries({ ...edits, ...extraEdits })) fs.writeFileSync(path.join(work, f), c);
      log(`Trial ${trials.length + 1}: without ${set.length} item(s)`);
      const res = await runAll(`trial ${trials.length + 1}`, false);
      const ok = res.every((r) => r.ok);
      trials.push({ size: set.length, ok, set, journeys: res.map(({ journey, ok, failedStep, replayed, credits }) => ({ journey, ok, failedStep, replayed, credits })) });
      return { ok, evidence: res.filter((r) => !r.ok).map(({ journey, failedStep, triage, resultMd, evidence }) => ({ journey, failedStep, triage, resultMd, evidence })) };
    };
    // Memory from earlier runs: files Kane already proved are needed are not cut again.
    const learnedPath = path.join(svelsDir, "learned.json");
    const learned = fs.existsSync(learnedPath) ? JSON.parse(fs.readFileSync(learnedPath, "utf8")) : [];
    const isLearned = (c) => learned.some((l) => l.item === c);
    if (learned.length) log(`Memory: ${learned.length} file(s) Kane proved needed in an earlier run are kept without re-testing.`);
    const a = await shrink(quiet.filter((c) => !isLearned(c)), tryRemove);
    // Files the browser really loaded are tried one at a time. If Kane fails, they're kept with proof.
    // If Kane still passes, they are NOT cut: Kane checks behaviour, not looks (an image or font can
    // vanish without failing a journey). They go on a review list instead.
    const g = await shrink(runtimeSeen.filter((c) => !isLearned(c)), async (set) => tryRemove([...a.accepted, ...set]));
    const b = { needed: g.needed, review: g.accepted.map((item) => ({ item, journeys: loadedIn(item.slice(5)), dynamic: inDynamic(item.slice(5)) })) };
    const accepted = [...a.accepted], needed = [...a.needed, ...b.needed];
    // Agent loop inside files: unused exports in files the app uses. The agent edits, Kane verifies,
    // failures go back to the agent for a safer edit. Only Kane-passed edits stand.
    const trims = [];
    const targets = unusedExports(projectDir, graph).filter((t) => !accepted.includes("file:" + t.file));
    if (targets.length) log(`Agent: ${targets.length} used file(s) still export things nothing imports.`);
    for (const t of targets) {
      const r = await agentTrim(projectDir, t, (newEdits) => tryRemove(accepted, newEdits), log);
      if (r.accepted) edits = { ...edits, [r.file]: r.content };
      trims.push({ ...r, unused: t.unused, content: undefined });
    }
    // Closed loop: Kane's failures go to the agent, which explains each kept file and proposes a keep rule.
    const referencers = graph.reachable.filter((f) => /\.(m?js|ts|tsx|jsx)$/.test(f));
    for (const n of needed) n.explain = await explainNeeded(projectDir, n.item, n.evidence || [], { journeys: loadedIn(n.item.slice(5)), referencers });
    // Final confirmation run with every accepted cut applied together.
    freshCopy(projectDir, work); applyRemovals(work, accepted); server.setRoot(work);
    for (const [f, c] of Object.entries(edits)) fs.writeFileSync(path.join(work, f), c);
    log(`Final check: all ${accepted.length} cuts and ${Object.keys(edits).length} agent edits together.`);
    const final = await runAll("final", false);
    const removedFiles = accepted.filter((x) => x.startsWith("file:")).map((x) => x.slice(5));
    const summary = {
      project: path.basename(projectDir), at: new Date().toISOString(), seconds: Math.round((Date.now() - t0) / 1000),
      candidates: candidates.length, removed: accepted, review: b.review,
      remembered: learned.filter((l) => candidates.includes(l.item)), kept: [...needed.map((n) => ({ item: n.item, failures: n.evidence, ...n.explain })),
        ...learned.filter((l) => candidates.includes(l.item)).map((l) => ({ item: l.item, failures: [{ journey: "earlier run", failedStep: "Kane proved it needed on " + l.at.slice(0, 10) }], why: l.why, keep_rule: l.keep_rule, remembered: true }))],
      linesRemoved: removedFiles.reduce((s, f) => s + lineCount(path.join(projectDir, f)), 0),
      bytesRemoved: removedFiles.reduce((s, f) => s + byteSize(path.join(projectDir, f)), 0),
      packagesRemoved: accepted.filter((x) => x.startsWith("pkg:")).map((x) => x.slice(4)),
      finalPassed: final.every((r) => r.ok), journeys: base.map((r) => r.journey), journeyMap,
      kaneRuns: runs.length, replays: runs.filter((r) => r.replayed).length, credits: Math.round(credits * 100) / 100,
      trials, runs: runs.map(({ journey, label, ok, failedStep, replayed, credits, evidence }) => ({ journey, label, ok, failedStep, replayed, credits, evidence })),
      allFiles: graph.files, reachable: graph.reachable, applied: false,
      trims, linesTrimmed: trims.filter((t) => t.accepted).reduce((n, t) => n + t.linesRemoved, 0),
      learned: learned.length,
    };
    const newLearned = [...learned, ...needed.filter((n) => !isLearned(n.item)).map((n) => ({ item: n.item, why: n.explain?.why, keep_rule: n.explain?.keep_rule, at: new Date().toISOString() }))];
    fs.writeFileSync(learnedPath, JSON.stringify(newLearned, null, 2));
    if (apply && summary.finalPassed) { applyRemovals(projectDir, accepted); for (const [f, c] of Object.entries(edits)) fs.writeFileSync(path.join(projectDir, f), c); summary.applied = true; }
    const out = writeReport(svelsDir, summary);
    log(`\nRemoved ${removedFiles.length} files (${summary.linesRemoved} lines), trimmed ${summary.linesTrimmed} lines inside ${trims.filter((t) => t.accepted).length} used files, and dropped ${summary.packagesRemoved.length} packages. Kept ${needed.length} that Kane proved are needed.`);
    log(`Final check: ${summary.finalPassed ? "all journeys pass" : "FAILED, nothing applied"}. Kane runs: ${summary.kaneRuns} (${summary.replays} replayed free). Report: ${out}`);
    return summary;
  } finally { rec.close(); await server.close(); chrome.stop(); fs.rmSync(work, { recursive: true, force: true }); }
}
