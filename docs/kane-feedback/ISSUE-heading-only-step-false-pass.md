### [major] testmd: a step with a heading but no body is never executed, and the run still reports passed (0 skipped)

**Version:** kane-cli 0.10.8 (also seen on 0.10.3), `testmd run --agent`, attached Chrome via `--cdp-endpoint`, Linux.

**What happens**

In a `*_test.md` file, a `## Step` whose instruction is written only in the heading (no body line under it) is not executed at all. The run still reports the test as passed, counts the step as passed, and reports `skipped: 0`. A false check written that way silently passes.

**Reproduction** (`falsepass_test.md`, 2 steps; the first one is deliberately false):

```markdown
---
mode: testing
url: https://example.com/
---

# Heading-only false claim

## Verify the page heading says "Welcome to Mars"

## Check the real heading
Verify the page heading says "Example Domain".
```

```
kane-cli testmd run falsepass_test.md --cdp-endpoint http://127.0.0.1:9345 --agent --timeout 300
```

**Observed** (full NDJSON attached: `falsepass-kane-0.10.8.ndjson`):

- `step_end` events: `navigate`, then `analyze` and `assert` for **"Example Domain" only**. Nothing is ever analysed or asserted for "Welcome to Mars".
- `test_md_summary`: `overall_status: "passed"`, `steps: {"total": 2, "passed": 2, "failed": 0, "skipped": 0}`.

**Expected** (any one of these):

1. Treat the heading text as the step's instruction when the body is empty (here it would fail, since the heading is "Example Domain"), or
2. Fail or reject the file with a clear message ("step 1 has no instruction"), or
3. At minimum report the step as `skipped` and not count it as passed.

**Why it matters**

Writing a check as a heading is a natural way to write Markdown, and nothing in the output tells the author that the check never ran. A suite can stay green while a stated requirement is false. A coding agent reading `passed: 2/2` would conclude the requirement holds. We first hit this while building [Svels](https://github.com/imprint-hash/svels) (Kane CLI hackathon), where journeys written heading-only looked green but checked nothing.

### Security check
- [x] This issue does not disclose a vulnerability, secret or private data. The attached NDJSON contains no tokens.
