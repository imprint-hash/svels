// Run one plain-English journey (*_test.md) with Kane CLI and read its NDJSON verdict.
// First run authors the journey (costs credits) and caches it; later runs replay for free.
// During trials adaptive heal is off: if a cut breaks the page, the replay fails instead of
// silently re-learning the step around the damage.
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export function kaneBin(projectDir) {
  const local = [path.join(projectDir, "node_modules/.bin/kane-cli"), path.join(process.cwd(), "node_modules/.bin/kane-cli")].find((p) => fs.existsSync(p));
  return process.env.SVELS_KANE || local || "kane-cli";
}

export function runJourney(bin, file, { cdp, heal = false, timeout = 300, logDir = null }) {
  const args = ["testmd", "run", file, "--cdp-endpoint", cdp, "--agent", "--timeout", String(timeout)];
  if (!heal) args.push("--no-adaptive-heal");
  return new Promise((resolve) => {
    const p = spawn(bin, args, { cwd: path.dirname(file), env: process.env });
    let out = "";
    p.stdout.on("data", (d) => (out += d)); p.stderr.on("data", (d) => (out += d));
    const kill = setTimeout(() => p.kill("SIGKILL"), (timeout + 60) * 1000);
    p.on("close", () => {
      clearTimeout(kill);
      const lines = out.split("\n").filter((l) => l.startsWith("{")).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
      const summary = lines.find((l) => l.type === "test_md_summary");
      const credits = lines.reduce((a, l) => a + (Number(l.credits_consumed) || 0), 0);
      const evidence = (out.match(/evidence serve (\S+\.evidence)/) || [])[1] || summary?.artifacts?.evidence || null;
      const stem = path.basename(file).replace(/_test\.md$/, "");
      const resultMd = path.join(path.dirname(file), `output-${stem}`, "Result.md");
      const result = fs.existsSync(resultMd) ? fs.readFileSync(resultMd, "utf8") : "";
      let failedStep = (result.match(/^## (.+?) [✗x] (?:failed|broken)/m) || [])[1] || null;
      if (!failedStep && summary?.overall_status !== "passed") {
        const bad = [...lines].reverse().find((l) => /fail|broken|error/i.test(l.status || l.event || "") && (l.remark || l.objective || l.detail));
        failedStep = bad ? String(bad.objective || bad.remark || bad.detail).slice(0, 140) : null;
      }
      // Kane triages its own failures: an "automation_bug" means the test/replay misfired, not the app.
      const verdict = lines.find((l) => l.type === "test_md_bug_verdict");
      const automationBug = !!verdict && verdict.family === "automation_bug";
      if (logDir) { fs.mkdirSync(logDir, { recursive: true }); fs.writeFileSync(path.join(logDir, `${Date.now()}-${stem}.ndjson`), out); }
      resolve({ journey: stem, ok: summary?.overall_status === "passed", status: summary?.overall_status || "error",
        steps: summary?.steps || null, replayed: summary?.steps?.replay_decisions || 0, credits: Math.round(credits * 1000) / 1000,
        failedStep, automationBug, triage: verdict?.one_liner || null, evidence, resultMd: fs.existsSync(resultMd) ? resultMd : null, raw: summary ? null : out.slice(-600) });
    });
  });
}

export function listJourneys(dir) {
  return fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith("_test.md")).sort().map((f) => path.join(dir, f)) : [];
}
