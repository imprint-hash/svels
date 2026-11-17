#!/usr/bin/env node
// svels: delete the code your app doesn't need. Kane CLI proves your user journeys still pass after every cut.
import path from "node:path";
import { scan, run } from "../src/run.mjs";

const [cmd = "help", ...rest] = process.argv.slice(2);
const flag = (n) => rest.includes(n);
const opt = (n) => { const i = rest.indexOf(n); return i >= 0 ? rest[i + 1] : undefined; };
const dir = path.resolve(rest.find((a, i) => !a.startsWith("--") && !rest[i - 1]?.startsWith("--cdp")) || ".");

if (cmd === "scan") {
  const { candidates, graph } = scan(dir);
  console.log(`${graph.reachable.length} files reachable from the entry points.`);
  console.log(`${candidates.length} look unused (Svels will only cut what Kane proves is safe):`);
  for (const c of candidates) console.log("  " + c);
} else if (cmd === "run") {
  await run(dir, { cdp: opt("--cdp"), apply: flag("--apply") });
} else {
  console.log(`svels: cut the code your app doesn't need, with proof.

  svels scan [dir]                    list files and packages that look unused
  svels run  [dir] [--apply] [--cdp <url>]
                                      Kane walks your journeys (svels/journeys/*_test.md), Svels cuts in
                                      batches, keeps every cut Kane passes, undoes every cut Kane fails,
                                      and writes .svels/report.html. --apply writes the proven cuts.
Env: SVELS_CHROME (Chrome binary), SVELS_KANE (kane-cli path), GROQ_API_KEY / GEMINI_API_KEY (agent).`);
}
