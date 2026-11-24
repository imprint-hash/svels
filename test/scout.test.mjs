import { test } from "node:test";
import assert from "node:assert/strict";
import { toTestMd } from "../src/scout.mjs";

test("scouted journeys are valid Kane test.md with a body under every step heading", () => {
  const md = toTestMd({ title: "Cart", steps: [{ heading: "Add oats", body: ['Click "Add to cart" on "Rolled oats".'] }, { heading: "Check", body: ['Verify the header shows "Cart (1)".'] }] }, "http://127.0.0.1:5180/");
  assert.match(md, /^---\nmode: testing\nurl: http:\/\/127\.0\.0\.1:5180\/\n---/);
  const lines = md.split("\n");
  lines.forEach((l, i) => { if (l.startsWith("## ")) assert.ok(lines[i + 1] && !lines[i + 1].startsWith("#") && lines[i + 1].trim(), `step "${l}" has no body (Kane would skip it)`); });
});

test("a drafted step with no body gets its heading as the instruction (kane-cli#250)", () => {
  const md = toTestMd({ title: "T", steps: [{ heading: 'Verify the page says "Hi"', body: [] }] }, "http://x/");
  assert.match(md, /## Verify the page says "Hi"\nVerify the page says "Hi"/);
});
