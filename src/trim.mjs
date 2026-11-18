// The agent loop inside files: the coding agent removes unused exports from a file, Svels checks the
// edit parses, Kane replays every journey, and a failure goes BACK to the agent with Kane's verdict
// so it can make a safer edit. An edit stands only when Kane passes it.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const SYS = `You are a careful coding agent that removes dead code. You get one JavaScript module and a list of exported names that no other file imports.
Remove those exports and any code that becomes unused because of it (helpers only they used). Do NOT change anything else: same formatting, same behaviour, keep every other export.
If removing a name looks risky (it might be used by code that builds names at runtime, or by the page through a global), keep it and say so.
Reply as JSON: {"content": "<the complete new file>", "removed": ["names removed"], "kept": [{"name": "...", "why": "..."}]}`;

async function ask(messages) {
  const tries = [];
  if (process.env.GROQ_API_KEY) tries.push(async () => {
    const r = await fetch("https://api.groq.com/openai/v1/chat/completions", { method: "POST", signal: AbortSignal.timeout(90000),
      headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: process.env.SVELS_MODEL || "openai/gpt-oss-120b", temperature: 0, response_format: { type: "json_object" }, messages }) });
    const j = await r.json(); return { ...JSON.parse(j.choices[0].message.content), by: "groq" };
  });
  if (process.env.GEMINI_API_KEY) tries.push(async () => {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${process.env.GEMINI_API_KEY}`, { method: "POST", signal: AbortSignal.timeout(90000),
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: messages[0].content }] }, contents: messages.slice(1).map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })), generationConfig: { responseMimeType: "application/json", temperature: 0 } }) });
    const j = await r.json(); return { ...JSON.parse(j.candidates[0].content.parts[0].text), by: "gemini" };
  });
  for (const t of tries) { try { const r = await t(); if (typeof r.content === "string" && r.content.length > 10) return r; } catch {} }
  return null;
}

function parses(content, file) {
  if (!/\.m?js$/.test(file)) return true;
  const tmp = path.join(os.tmpdir(), `svels-check-${process.pid}.mjs`);
  fs.writeFileSync(tmp, content);
  try { execFileSync(process.execPath, ["--check", tmp], { stdio: "pipe" }); return true; } catch { return false; } finally { fs.rmSync(tmp, { force: true }); }
}

/**
 * @param target {file, unused}   from unusedExports()
 * @param verify (editsByFile) => Promise<{ok, evidence}>   applies the file cuts already accepted + these edits, runs Kane
 */
export async function agentTrim(projectDir, target, verify, log, maxAttempts = 2) {
  const original = fs.readFileSync(path.join(projectDir, target.file), "utf8");
  const messages = [{ role: "system", content: SYS }, { role: "user", content: `File: ${target.file}\nExports nothing imports: ${target.unused.join(", ")}\n\n${original}` }];
  const attempts = [];
  for (let n = 1; n <= maxAttempts; n++) {
    const reply = await ask(messages);
    if (!reply) { attempts.push({ n, outcome: "agent unavailable" }); break; }
    const content = reply.content.endsWith("\n") ? reply.content : reply.content + "\n";
    const before = original.split("\n").length, after = content.split("\n").length;
    if (!parses(content, target.file)) {
      attempts.push({ n, by: reply.by, outcome: "edit did not parse", removed: reply.removed || [] });
      messages.push({ role: "assistant", content: JSON.stringify(reply) }, { role: "user", content: "Your file does not parse as a JavaScript module. Return the complete file again, valid this time." });
      continue;
    }
    if (after >= before) { attempts.push({ n, by: reply.by, outcome: "nothing removed", kept: reply.kept || [] }); break; }
    log(`Agent edit ${target.file} (attempt ${n}, ${reply.by}): removes ${(reply.removed || []).join(", ") || "?"} (${before - after} lines)`);
    const res = await verify({ [target.file]: content });
    const a = { n, by: reply.by, removed: reply.removed || [], kept: reply.kept || [], linesRemoved: before - after, ok: res.ok, failures: res.evidence };
    attempts.push(a);
    if (res.ok) return { file: target.file, accepted: true, content, linesRemoved: before - after, attempts };
    // Closed loop: Kane's verdict goes back to the agent.
    const why = res.evidence.map((e) => `journey "${e.journey}" failed at "${e.failedStep || "?"}"${e.triage ? ` (Kane's triage: ${e.triage})` : ""}`).join("; ");
    log(`  Kane rejected it: ${why}. Sending that back to the agent.`);
    messages.push({ role: "assistant", content: JSON.stringify({ removed: reply.removed, kept: reply.kept }) },
      { role: "user", content: `Kane CLI replayed the app's user journeys in a real browser with your edit, and they failed: ${why}. Something you removed is still needed. Return a safer complete file that keeps whatever that journey needs.` });
  }
  return { file: target.file, accepted: false, attempts };
}
