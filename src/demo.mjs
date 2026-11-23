// `svels demo`: see Svels work in about 20 seconds, with no Kane account and nothing to set up.
// Part 1 is live: a real scan of the bundled demo shop. Part 2 replays the log of a real Kane run
// (docs/demo-run.log; Kane's raw NDJSON is in docs/evidence/). Run `svels run` for a live Kane run.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { scan } from "./run.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tty = process.stdout.isTTY && !process.env.NO_COLOR;
const c = (code) => (s) => (tty ? `\x1b[${code}m${s}\x1b[0m` : s);
const bold = c(1), dim = c(2), red = c(31), green = c(32), yellow = c(33), cyan = c(36);
const fast = process.argv.includes("--fast") || !process.stdout.isTTY;
const sleep = (ms) => new Promise((r) => setTimeout(r, fast ? 0 : ms));
const say = async (s = "", ms = 0) => { console.log(s); await sleep(ms); };

function paint(line) {
  return line
    .replace(/\bPASS\b/, green("PASS")).replace(/\bFAIL\b/, red("FAIL")).replace(/\bretry\b/, yellow("retry"))
    .replace(/\(replayed from cache\)/, dim("(replayed from cache)"))
    .replace(/^(Trial \d+:.*)$/, bold("$1")).replace(/^(Agent edit .*)$/, cyan("$1"))
    .replace(/^(\s+Kane rejected it.*)$/, yellow("$1"));
}

export async function demo() {
  const shop = path.join(ROOT, "examples/bloated-shop");
  await say(bold("Svels: delete the code your app doesn't need. Kane CLI proves it was safe.\n"), 600);

  await say(bold("1. Live scan of a bloated demo shop") + dim("  (examples/bloated-shop, running now on your machine)"), 400);
  const { candidates, graph } = scan(shop);
  await say(`   ${graph.reachable.length} files are reachable from the pages.`, 300);
  await say(`   ${yellow(candidates.length)} things look unused: ${candidates.slice(0, 6).map((x) => x.replace(/^(file|pkg):/, "")).join(", ")}, ...`, 500);
  await say(dim("   A dead-code scan would delete all of them. Some are loaded at runtime. Kane decides.\n"), 900);

  await say(bold("2. Kane CLI walks the shop's user journeys after every batch of cuts") + dim("  (replay of a real run: docs/demo-run.log)"), 500);
  const log = fs.readFileSync(path.join(ROOT, "docs/demo-run.log"), "utf8").split("\n").filter((l) => l.trim() && !l.startsWith("Final check: all journeys pass. Kane runs"));
  for (const line of log) {
    const big = /^(Trial|Agent edit|\s+Kane rejected|Final check|Removed)/.test(line);
    await say("   " + paint(line), big ? 260 : 90);
  }

  const report = JSON.parse(fs.readFileSync(path.join(ROOT, "docs/sample-report.json"), "utf8"));
  await say("");
  await say(bold("3. What Kane caught that a static scan would have shipped"), 300);
  await say(`   ${red("x")} delete src/themes/light.js      -> Kane: "Missing theme module prevents product catalog from rendering"`, 250);
  await say(`   ${red("x")} delete src/promos/welcome10.js  -> Kane: "Recorded WELCOME10 promo code is no longer valid"`, 250);
  await say(`   ${red("x")} agent removes badgeText          -> Kane: "the header still displays an empty cart" -> agent tries again -> ${green("pass")}`, 600);

  await say("\n" + bold("4. On real projects nobody wrote for Svels"), 300);
  for (const [name, line] of [
    ["AdminLTE (45k stars)", "1,724 unused files cut (34 MB); dashboard, DataTables, validation, calendar still pass"],
    ["SB Admin 2 (9.8k stars)", "1,659 unused files cut; dashboard menu and DataTables search still pass"],
    ["Argon Dashboard", "75 unused files cut (26 MB); dashboard and tables still pass"],
    ["50projects50days (40k stars)", "found 1 dead stylesheet; Kane confirmed the app still works"],
  ]) await say(`   ${green("+")} ${bold(name)}: ${line}`, 250);

  const out = path.join(os.tmpdir(), "svels-demo-report.html");
  fs.copyFileSync(path.join(ROOT, "docs/sample-report.html"), out);
  await say("");
  await say(`Report from that run: ${cyan(out)}`);
  await say(`Live copy:            ${cyan("https://imprint-hash.github.io/svels/sample-report.html")}`);
  await say(dim(`\nKane runs in that run: ${report.kaneRuns} (${report.replays} replayed from Kane's cache, ${report.credits} credits).`));
  await say(dim("Run it live on your own app: git clone https://github.com/imprint-hash/svels && cd svels && npm install && npx kane-cli login && npm run demo"));
}
