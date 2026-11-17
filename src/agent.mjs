// The closed loop's reasoning step. When Kane catches a cut that breaks a journey, the agent reads
// the file, Kane's failing step and what the browser loaded, and explains in one sentence why the
// file is needed, plus a code-level rule to stop proposing it. Free models only (Groq, then Gemini).
import fs from "node:fs";
import path from "node:path";

const SYS = `You maintain a code-deletion tool. A file looked unused to a static import scan, but deleting it made a browser test fail.
Explain in ONE plain sentence (max 30 words) why the app needs this file, naming the mechanism (for example a dynamic import built from a variable).
Then give a keep rule: the folder or glob that should never be auto-deleted for the same reason.
Reply as JSON: {"why": "...", "keep_rule": "..."}`;

async function groq(user) {
  const key = process.env.GROQ_API_KEY; if (!key) return null;
  const r = await fetch("https://api.groq.com/openai/v1/chat/completions", { method: "POST", signal: AbortSignal.timeout(60000),
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: process.env.SVELS_MODEL || "openai/gpt-oss-120b", temperature: 0, response_format: { type: "json_object" },
      messages: [{ role: "system", content: SYS }, { role: "user", content: user }] }) });
  const j = await r.json(); return JSON.parse(j.choices[0].message.content);
}
async function gemini(user) {
  const key = process.env.GEMINI_API_KEY; if (!key) return null;
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${key}`, { method: "POST", signal: AbortSignal.timeout(60000),
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ systemInstruction: { parts: [{ text: SYS }] }, contents: [{ parts: [{ text: user }] }], generationConfig: { responseMimeType: "application/json", temperature: 0 } }) });
  const j = await r.json(); return JSON.parse(j.candidates[0].content.parts[0].text);
}

export async function explainNeeded(projectDir, item, failures, loadedBy) {
  const rel = item.slice(item.indexOf(":") + 1);
  const file = path.join(projectDir, rel);
  const src = item.startsWith("file:") && fs.existsSync(file) ? fs.readFileSync(file, "utf8").slice(0, 2500) : "(package)";
  // Who references it by a computed path? Give the agent the lines that build paths at runtime.
  const hints = [];
  for (const f of loadedBy.referencers || []) {
    const t = fs.readFileSync(path.join(projectDir, f), "utf8");
    for (const line of t.split("\n")) if (/import\(`|require\(`|\$\{/.test(line) && /import|require/.test(line)) hints.push(`${f}: ${line.trim()}`);
  }
  const user = [`Deleted: ${rel}`, `File content:\n${src}`,
    `Kane failures without it:\n${failures.map((f) => `- journey "${f.journey}" failed at step "${f.failedStep || "?"}"`).join("\n")}`,
    `During the passing baseline, the browser loaded this file in journeys: ${(loadedBy.journeys || []).join(", ") || "none recorded"}`,
    `Lines that load modules by a computed path:\n${hints.slice(0, 12).join("\n") || "(none found)"}`].join("\n\n");
  for (const call of [groq, gemini]) { try { const r = await call(user); if (r?.why) return { ...r, by: call.name }; } catch {} }
  return { why: `Deleting it broke ${failures.map((f) => f.journey).join(", ")}; it is loaded at runtime, not by a static import.`, keep_rule: path.posix.dirname(rel) + "/", by: "fallback" };
}
