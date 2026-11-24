// `svels scout`: Kane CLI's first job. Kane explores the app in a real browser like a new user and
// reports its main journeys with the exact text that proves each worked. The agent turns that report
// into *_test.md drafts, and Kane authors each draft on the untouched app: a draft is kept only if
// it passes and Kane's evidence policy confirms it has real checks and no skipped steps.
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "./run.mjs";
import { startServer } from "./serve.mjs";
import { launchChrome, freshTab } from "./browser.mjs";
import { kaneBin, runJourney } from "./kane.mjs";
import { askJson } from "./agent.mjs";

const POLICY = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../policy/svels-real-journey.policy.yaml");

const OBJECTIVE = `Explore this web app as a new user would. Visit each main page and try its main features (add things, open pages, fill forms with sample data). Then report the 3 most important user journeys of this app. For each one give: a short name, the exact clicks and inputs, and one visible result that proves it worked (exact text on the page).`;

const DRAFT_SYS = `You turn a browser agent's exploration report into end-to-end tests in Kane CLI's test.md format.
Return JSON: {"journeys":[{"name":"kebab-case-name","title":"Short title","steps":[{"heading":"what this step does","body":["instruction line", "..."]}]}]}
Rules:
- One journey per main user journey in the report, at most 3. Each journey runs on its own in a fresh browser: it starts on the home page with nothing saved (empty cart, logged out), so it must include every earlier step it depends on (for example add an item and open the cart before checking out).
- Every step has a heading AND at least one body line (a heading-only step is never executed by Kane).
- Use the exact button and link text from the report. Include any items, names, emails or codes the report used.
- The last body line of every journey is a check: Verify ... with exact visible text from the report.
- Never verify text that changes per run (order numbers, ids, dates, times); verify the stable part instead.`;

export function toTestMd(j, url) {
  return [`---`, `mode: testing`, `url: ${url}`, `---`, ``, `# ${j.title}`, ``,
    // Never write a heading-only step: Kane skips it yet reports it passed (kane-cli#250).
    ...j.steps.flatMap((s) => { const body = (s.body || []).filter((b) => String(b).trim()); return [`## ${s.heading}`, ...(body.length ? body : [s.heading]), ``]; })].join("\n");
}

function kaneRun(bin, objective, url, cdp) {
  return new Promise((resolve) => {
    const p = spawn(bin, ["run", objective, "--url", url, "--cdp-endpoint", cdp, "--agent", "--max-steps", "35", "--timeout", "540"], { env: process.env });
    let out = ""; p.stdout.on("data", (d) => (out += d)); p.stderr.on("data", (d) => (out += d));
    p.on("close", () => {
      const lines = out.split("\n").filter((l) => l.startsWith("{")).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
      const actions = lines.filter((l) => l.step && l.status === "done" && l.remark).map((l) => l.remark);
      const end = lines.find((l) => l.type === "run_end") || {};
      resolve({ actions, summary: end.summary || "", status: end.status, credits: Number(end.credits_consumed) || 0, testUrl: end.test_url || null });
    });
  });
}

export async function scout(projectDir, { cdp, log = console.log } = {}) {
  projectDir = path.resolve(projectDir);
  const cfg = loadConfig(projectDir);
  const jdir = path.join(projectDir, cfg.journeys); fs.mkdirSync(jdir, { recursive: true });
  const svelsDir = path.join(projectDir, ".svels"); fs.mkdirSync(svelsDir, { recursive: true });
  const bin = kaneBin(projectDir);
  const server = await startServer(cfg.port); server.setRoot(projectDir);
  const chrome = cdp ? { endpoint: cdp, stop: () => {} } : await launchChrome({ profileDir: path.join(svelsDir, "chrome"), port: 9333 });
  const url = `http://127.0.0.1:${cfg.port}/`;
  try {
    log(`Kane scouts ${url} like a new user (kane-cli run, real browser)...`);
    await freshTab(chrome.endpoint, url);
    const s = await kaneRun(bin, OBJECTIVE, url, chrome.endpoint);
    for (const a of s.actions) log(`  kane  ${a.slice(0, 140)}`);
    if (s.status !== "passed") throw new Error(`Kane's scout run did not finish (${s.status || "no result"}).`);
    const report = [...s.actions].reverse().find((a) => /journey/i.test(a)) || s.summary;
    log(`Kane's report: ${report.replace(/^wait: Waiting /, "").slice(0, 400)}`);
    const drafts = await askJson(DRAFT_SYS, `App URL: ${url}\n\nKane's actions:\n${s.actions.join("\n")}\n\nKane's report:\n${report}\n\n${s.summary}`);
    if (!drafts?.journeys?.length) throw new Error("The agent could not draft journeys (set GROQ_API_KEY or GEMINI_API_KEY).");
    const kept = [], rejected = [];
    let credits = s.credits;
    for (const j of drafts.journeys.slice(0, 3)) {
      const name = `scout-${String(j.name).replace(/[^a-z0-9-]/gi, "-").toLowerCase()}`;
      const file = path.join(jdir, `${name}_test.md`);
      if (fs.existsSync(file)) { log(`  skip  ${name}: a journey with that name already exists`); continue; }
      fs.writeFileSync(file, toTestMd(j, url));
      await freshTab(chrome.endpoint, url);
      const r = await runJourney(bin, file, { cdp: chrome.endpoint, heal: true, policy: POLICY, logDir: path.join(svelsDir, "kane-logs") });
      credits += r.credits;
      const ok = r.ok && r.policyVerdict?.result === "pass";
      log(`  ${ok ? "KEEP" : "DROP"}  ${name}${ok ? `: Kane authored it, ${r.policyVerdict.policies[0]?.gates} policy gates pass` : `: ${r.failedStep || r.policyVerdict?.policies?.flatMap((p) => p.failedGates).join(", ") || r.status}`}`);
      if (ok) kept.push(name); else { rejected.push({ name, why: r.failedStep }); fs.renameSync(file, path.join(svelsDir, `${name}_test.md.rejected`)); fs.rmSync(path.join(jdir, `output-${name}`), { recursive: true, force: true }); }
    }
    const out = { at: new Date().toISOString(), url, report, kaneActions: s.actions, kaneTestUrl: s.testUrl, kept, rejected, credits: Math.round(credits * 100) / 100 };
    fs.writeFileSync(path.join(svelsDir, "scout.json"), JSON.stringify(out, null, 2));
    log(`\nKane scouted ${s.actions.length} actions and verified ${kept.length} journey(s) in ${cfg.journeys}/ (${out.credits} credits). Next: svels run`);
    return out;
  } finally { await server.close(); chrome.stop(); }
}
