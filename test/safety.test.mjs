// The safety rules and the agent loop.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { partition } from "../src/run.mjs";
import { freshCopy, applyRemovals } from "../src/workspace.mjs";
import { agentTrim } from "../src/trim.mjs";
import { writeReport } from "../src/report.mjs";

test("guarded: files the browser loaded during a journey", () => {
  const { guarded, quiet } = partition(["file:img/hero.png", "file:old.js"], [], (f) => (f === "img/hero.png" ? ["browse"] : []));
  assert.deepEqual(guarded, ["file:img/hero.png"]); assert.deepEqual(quiet, ["file:old.js"]);
});

test("guarded: files inside a folder the code builds paths into at runtime", () => {
  const { guarded, quiet } = partition(["file:src/themes/dark.js", "file:src/legacy.js", "pkg:lodash"], ["src/themes/"], () => []);
  assert.deepEqual(guarded, ["file:src/themes/dark.js"]); assert.deepEqual(quiet, ["file:src/legacy.js", "pkg:lodash"]);
});

test("a dry run never touches the real project", () => {
  const src = fs.mkdtempSync(path.join(os.tmpdir(), "svels-src-")), work = src + "-work";
  fs.writeFileSync(path.join(src, "a.js"), "1"); fs.writeFileSync(path.join(src, "b.js"), "2");
  fs.writeFileSync(path.join(src, "package.json"), '{"dependencies":{"lodash":"1","react":"1"}}');
  freshCopy(src, work); applyRemovals(work, ["file:a.js", "pkg:lodash"]);
  assert.ok(!fs.existsSync(path.join(work, "a.js"))); assert.ok(fs.existsSync(path.join(src, "a.js")));
  assert.deepEqual(Object.keys(JSON.parse(fs.readFileSync(path.join(work, "package.json"))).dependencies), ["react"]);
  assert.deepEqual(Object.keys(JSON.parse(fs.readFileSync(path.join(src, "package.json"))).dependencies), ["lodash", "react"]);
});

// The agent loop, with the model stubbed: attempt 1 over-deletes, Kane fails it, attempt 2 is right.
function stubModel(replies) {
  const sent = []; let i = 0;
  globalThis.fetch = async (_url, init) => { sent.push(JSON.parse(init.body)); const content = JSON.stringify(replies[Math.min(i++, replies.length - 1)]);
    return { json: async () => ({ choices: [{ message: { content } }] }) }; };
  return sent;
}
function agentProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "svels-agent-"));
  fs.writeFileSync(path.join(dir, "fmt.js"), "export const money = (n) => n;\nexport const badge = (n) => n;\nexport const percent = (n) => n;\n");
  fs.writeFileSync(path.join(dir, "index.html"), '<script type="module">import { badge } from "/fmt.js";</script>');
  return dir;
}

test("agent loop: Kane rejects an edit, the verdict and where the name is used go back, attempt 2 stands", async () => {
  process.env.GROQ_API_KEY = "test"; delete process.env.GEMINI_API_KEY;
  const sent = stubModel([
    { content: "export const money = (n) => n;\n", removed: ["badge", "percent"] },
    { content: "export const money = (n) => n;\nexport const badge = (n) => n;\n", removed: ["percent"] },
  ]);
  const dir = agentProject();
  const verify = async (edits) => ({ ok: edits["fmt.js"].includes("badge"), evidence: [{ journey: "browse", failedStep: 'the header shows "Cart (1)"', triage: "header still empty" }] });
  const r = await agentTrim(dir, { file: "fmt.js", unused: ["badge", "percent"] }, verify, () => {});
  assert.equal(r.accepted, true);
  assert.equal(r.attempts.length, 2); assert.equal(r.attempts[0].ok, false); assert.equal(r.attempts[1].ok, true);
  const retry = sent[1].messages.at(-1).content;
  assert.match(retry, /Cart \(1\)/); assert.match(retry, /header still empty/); assert.match(retry, /index\.html:1/);
});

test("agent loop: an edit Kane never passes is thrown away", async () => {
  process.env.GROQ_API_KEY = "test";
  stubModel([{ content: "export const money = (n) => n;\n", removed: ["badge", "percent"] }]);
  const r = await agentTrim(agentProject(), { file: "fmt.js", unused: ["badge", "percent"] }, async () => ({ ok: false, evidence: [] }), () => {}, 2);
  assert.equal(r.accepted, false); assert.equal(r.content, undefined);
});

test("agent loop: an edit that doesn't parse never reaches Kane", async () => {
  process.env.GROQ_API_KEY = "test"; let kaneCalls = 0;
  stubModel([{ content: "export const money = (n) => {\n", removed: ["badge"] }]);
  const r = await agentTrim(agentProject(), { file: "fmt.js", unused: ["badge", "percent"] }, async () => { kaneCalls++; return { ok: true }; }, () => {}, 2);
  assert.equal(kaneCalls, 0); assert.equal(r.accepted, false);
});

test("no model key: no agent edits at all", async () => {
  delete process.env.GROQ_API_KEY; delete process.env.GEMINI_API_KEY;
  const r = await agentTrim(agentProject(), { file: "fmt.js", unused: ["percent"] }, async () => ({ ok: true }), () => {});
  assert.equal(r.accepted, false); assert.equal(r.attempts[0].outcome, "agent unavailable");
});

test("the report shows cut, kept and guarded files", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "svels-rep-"));
  const out = writeReport(dir, { project: "demo", at: new Date().toISOString(), seconds: 1, candidates: 3, removed: ["file:old.js"], review: [{ item: "file:themes/dark.js", journeys: [], dynamic: true }],
    kept: [{ item: "file:themes/light.js", failures: [{ journey: "browse", failedStep: "open the shop", triage: "catalog is blank" }], why: "loaded by name", keep_rule: "themes/" }],
    linesRemoved: 10, bytesRemoved: 100, packagesRemoved: [], finalPassed: true, journeys: ["browse"], journeyMap: { browse: ["index.html"] },
    kaneRuns: 2, replays: 2, credits: 0, trials: [], runs: [], allFiles: ["index.html", "old.js", "themes/dark.js", "themes/light.js"], reachable: ["index.html"], applied: false, trims: [], linesTrimmed: 0 });
  const html = fs.readFileSync(out, "utf8");
  assert.match(html, /catalog is blank/); assert.match(html, /themes\/dark\.js/); assert.match(html, /all 1 journeys pass/);
  assert.ok(fs.existsSync(path.join(dir, "report.json")));
});
