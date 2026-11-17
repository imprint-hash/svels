import test from "node:test";
import assert from "node:assert/strict";
import { shrink } from "../src/ddmin.mjs";

test("keeps only the items the verifier needs, removes the rest", async () => {
  const needed = new Set(["b.js", "f.js"]);
  const cands = ["a.js", "b.js", "c.js", "d.js", "e.js", "f.js", "g.js", "h.js"];
  const r = await shrink(cands, async (removed) => ({ ok: !removed.some((x) => needed.has(x)) }));
  assert.deepEqual(r.needed.map((n) => n.item).sort(), ["b.js", "f.js"]);
  assert.deepEqual(r.accepted.sort(), ["a.js", "c.js", "d.js", "e.js", "g.js", "h.js"]);
  assert.ok(r.trials < cands.length * 2);
});

test("everything removable in one trial", async () => {
  const r = await shrink(["x", "y", "z"], async () => ({ ok: true }));
  assert.equal(r.trials, 1); assert.equal(r.accepted.length, 3);
});
