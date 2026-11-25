// `svels check`: Kane walks every journey on the project exactly as it is on disk now, and judges
// each sealed evidence pack with the svels-safe-cut policy. This is the independent re-test after a
// human (or Claude Code) approves a change: Claude proposes, you approve, Kane re-checks.
// Exit code 0 = every journey passed and every verdict passed; 1 = something failed.
import fs from "node:fs";
import path from "node:path";
import { loadConfig, DEFAULT_POLICY } from "./run.mjs";
import { startServer } from "./serve.mjs";
import { launchChrome, freshTab } from "./browser.mjs";
import { kaneBin, runJourney, listJourneys } from "./kane.mjs";

export async function check(projectDir, { cdp, log = console.log } = {}) {
  projectDir = path.resolve(projectDir);
  const cfg = loadConfig(projectDir);
  const journeys = listJourneys(path.join(projectDir, cfg.journeys));
  if (!journeys.length) throw new Error(`No *_test.md journeys in ${cfg.journeys}. Run "svels scout" first, or write 1-3 journeys.`);
  const svelsDir = path.join(projectDir, ".svels"); fs.mkdirSync(svelsDir, { recursive: true });
  const policy = cfg.policy ? path.resolve(projectDir, cfg.policy) : DEFAULT_POLICY;
  const bin = kaneBin(projectDir);
  const server = await startServer(cfg.port); server.setRoot(projectDir);
  const chrome = cdp ? { endpoint: cdp, stop: () => {} } : await launchChrome({ profileDir: path.join(svelsDir, "chrome"), port: 9333 });
  const results = [];
  try {
    log(`Kane re-checks ${journeys.length} journey(s) on ${path.basename(projectDir)} as it is now (policy: ${path.basename(policy)}).`);
    for (const j of journeys) {
      const startUrl = (fs.readFileSync(j, "utf8").match(/^url:\s*(\S+)/m) || [])[1];
      if (startUrl) await freshTab(chrome.endpoint, startUrl);
      let r = await runJourney(bin, j, { cdp: chrome.endpoint, heal: false, policy, logDir: path.join(svelsDir, "kane-logs") });
      if (!r.ok && r.automationBug) { if (startUrl) await freshTab(chrome.endpoint, startUrl); r = await runJourney(bin, j, { cdp: chrome.endpoint, heal: false, policy, logDir: path.join(svelsDir, "kane-logs") }); }
      const verdict = r.policyVerdict?.result || "missing";
      const ok = r.ok && verdict === "pass";
      results.push({ journey: r.journey, ok, failedStep: r.failedStep, triage: r.triage, verdict, evidence: r.evidence, resultMd: r.resultMd });
      log(`  ${ok ? "PASS" : "FAIL"}  ${r.journey}${r.failedStep ? ` at "${r.failedStep}"` : ""}  verdict: ${verdict}${r.triage ? `  (Kane's triage: ${r.triage})` : ""}`);
    }
  } finally { await server.close(); chrome.stop(); }
  const out = { at: new Date().toISOString(), project: path.basename(projectDir), passed: results.every((r) => r.ok), results };
  fs.writeFileSync(path.join(svelsDir, "check.json"), JSON.stringify(out, null, 2));
  log(out.passed ? "All journeys pass and Kane's verdicts pass. The change is safe to keep." : "Kane failed the change. Evidence: .svels/check.json");
  return out;
}
