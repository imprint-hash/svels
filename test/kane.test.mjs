// Reading Kane CLI's NDJSON. A fake kane-cli replays REAL output captured from our runs
// (docs/evidence/*.ndjson), so the parser is tested against what Kane actually prints.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runJourney } from "../src/kane.mjs";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
function fakeKane(output) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "svels-kane-"));
  fs.writeFileSync(path.join(dir, "out.txt"), output);
  const bin = path.join(dir, "kane-cli");
  fs.writeFileSync(bin, `#!/bin/sh\ncat "${path.join(dir, "out.txt")}"\necho "$@" > "${path.join(dir, "args.txt")}"\n`); fs.chmodSync(bin, 0o755);
  const journey = path.join(dir, "browse_test.md"); fs.writeFileSync(journey, "---\nurl: http://x/\n---\n# x\n## y\nVerify z.\n");
  return { bin, journey, args: () => fs.readFileSync(path.join(dir, "args.txt"), "utf8") };
}

test("a real Kane failure: verdict, failing step and Kane's own triage", async () => {
  const k = fakeKane(fs.readFileSync(path.join(root, "docs/evidence/light-js-removed-browse.ndjson"), "utf8"));
  const r = await runJourney(k.bin, k.journey, { cdp: "http://127.0.0.1:9", timeout: 30 });
  assert.equal(r.ok, false);
  assert.equal(r.journey, "browse");
  assert.ok(r.triage && /module|catalog|product/i.test(r.triage), r.triage);
  assert.equal(r.automationBug, false, "a missing file is a real app bug, not a test problem");
});

test("trials run with adaptive heal off, so a broken page fails instead of being re-learned", async () => {
  const k = fakeKane("");
  await runJourney(k.bin, k.journey, { cdp: "http://127.0.0.1:9", timeout: 30 });
  assert.match(k.args(), /--no-adaptive-heal/);
  assert.match(k.args(), /--agent/);
  assert.match(k.args(), /--cdp-endpoint http:\/\/127\.0\.0\.1:9/);
});

test("the baseline run may heal (heal: true leaves the flag out)", async () => {
  const k = fakeKane("");
  await runJourney(k.bin, k.journey, { cdp: "http://x", heal: true, timeout: 30 });
  assert.doesNotMatch(k.args(), /--no-adaptive-heal/);
});

test("a pass replayed from Kane's cache", async () => {
  const k = fakeKane('{"type":"test_md_summary","overall_status":"passed","steps":{"total":1,"passed":1,"failed":0,"replay_decisions":1,"author_decisions":0}}\n');
  const r = await runJourney(k.bin, k.journey, { cdp: "http://x", timeout: 30 });
  assert.equal(r.ok, true); assert.equal(r.replayed, 1); assert.equal(r.credits, 0);
});

test("Kane's 'automation_bug' triage is surfaced so Svels can retry", async () => {
  const k = fakeKane('{"type":"test_md_bug_verdict","family":"automation_bug","one_liner":"The replay misfired"}\n{"type":"test_md_summary","overall_status":"failed","steps":{}}\n');
  const r = await runJourney(k.bin, k.journey, { cdp: "http://x", timeout: 30 });
  assert.equal(r.ok, false); assert.equal(r.automationBug, true); assert.equal(r.triage, "The replay misfired");
});

test("a recording from another Kane account is detected", async () => {
  const k = fakeKane("Error: this test belongs to org 111; you are logged in as org 222.\n");
  const r = await runJourney(k.bin, k.journey, { cdp: "http://x", timeout: 30 });
  assert.equal(r.ok, false); assert.equal(r.foreignRecording, true);
});

test("credits are summed from Kane's run_end lines", async () => {
  const k = fakeKane('{"type":"run_end","credits_consumed":4.5}\n{"type":"run_end","credits_consumed":1.25}\n{"type":"test_md_summary","overall_status":"passed","steps":{}}\n');
  const r = await runJourney(k.bin, k.journey, { cdp: "http://x", timeout: 30 });
  assert.equal(r.credits, 5.75);
});
