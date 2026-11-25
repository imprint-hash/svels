#!/usr/bin/env node
// svels: delete the code your app doesn't need. Kane CLI proves your user journeys still pass after every cut.
import path from "node:path";
import { scan, run } from "../src/run.mjs";
import { demo } from "../src/demo.mjs";
import { scout } from "../src/scout.mjs";
import { check } from "../src/check.mjs";
import fs from "node:fs";
import os from "node:os";
import { fileURLToPath } from "node:url";

const [cmd = "help", ...rest] = process.argv.slice(2);
const flag = (n) => rest.includes(n);
const opt = (n) => { const i = rest.indexOf(n); return i >= 0 ? rest[i + 1] : undefined; };
const dir = path.resolve(rest.find((a, i) => !a.startsWith("--") && !rest[i - 1]?.startsWith("--cdp")) || ".");

if (cmd === "scan") {
  const { candidates, graph } = scan(dir);
  console.log(`${graph.reachable.length} files reachable from the entry points.`);
  console.log(`${candidates.length} look unused (Svels will only cut what Kane proves is safe):`);
  for (const c of candidates) console.log("  " + c);
} else if (cmd === "demo") {
  await demo();
} else if (cmd === "scout") {
  await scout(dir, { cdp: opt("--cdp") });
} else if (cmd === "check") {
  const r = await check(dir, { cdp: opt("--cdp") });
  process.exitCode = r.passed ? 0 : 1;
} else if (cmd === "install-skill") {
  // Adds the Svels skill to Claude Code (personal skills folder), so "clean up dead code" runs this workflow.
  const src = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../skill/svels/SKILL.md");
  const dest = path.join(os.homedir(), ".claude/skills/svels");
  fs.mkdirSync(dest, { recursive: true }); fs.copyFileSync(src, path.join(dest, "SKILL.md"));
  console.log(`Svels skill installed for Claude Code: ${path.join(dest, "SKILL.md")}\nIn Claude Code, ask: "clean up the dead code in this app".`);
} else if (cmd === "run") {
  await run(dir, { cdp: opt("--cdp"), apply: flag("--apply") });
} else {
  console.log(`svels: cut the code your app doesn't need, with proof.

  svels demo                          see it work in ~20 s (no Kane account needed)
  svels scout [dir] [--cdp <url>]     Kane explores your app and writes its main journeys; each is kept
                                      only if Kane authors it and its evidence policy passes
  svels check [dir] [--cdp <url>]     Kane re-tests every journey on the project as it is now (after an
                                      approved change); exit 0 only if every journey and verdict passes
  svels install-skill                 add the Svels skill to Claude Code
  svels scan [dir]                    list files and packages that look unused
  svels run  [dir] [--apply] [--cdp <url>]
                                      Kane walks your journeys (svels/journeys/*_test.md), Svels cuts in
                                      batches, keeps every cut Kane passes, undoes every cut Kane fails,
                                      and writes .svels/report.html. --apply writes the proven cuts.
Env: SVELS_CHROME (Chrome binary), SVELS_KANE (kane-cli path), GROQ_API_KEY / GEMINI_API_KEY (agent).`);
}
