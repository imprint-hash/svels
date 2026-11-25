---
name: svels
description: Safely delete dead code (unused files, packages and exports) from a web app, with Kane CLI proving in a real browser that every user journey still works. Use when the user asks to clean up, remove dead or unused code, slim down an app, or trim what an AI agent left behind.
---

# Svels: delete dead code, with Kane CLI as the referee

Svels finds code that looks unused, cuts it in batches, and keeps a cut only if Kane CLI walks the app's user journeys (`svels/journeys/*_test.md`) in a real browser and they still pass. You (Claude) are the investigator in the loop: when Kane rejects something, you read Kane's evidence, explain it, and propose a fix. **Nothing is applied to the project without the user's approval, and every approved change is re-checked by Kane.**

Run everything from the project root. `svels` is `npx -y github:imprint-hash/svels` if it is not installed. Kane CLI must be logged in (`npx kane-cli login`).

## 1. Look first

```bash
svels scan .
```
Tell the user how many files and packages look unused. Nothing is changed.

## 2. Make sure there are journeys

If `svels/journeys/` has no `*_test.md` files, offer to let Kane write them:
```bash
svels scout .
```
Kane explores the app like a new user and keeps only the journeys it can author and whose evidence policy passes. Show the user the journey files and ask whether they cover what matters (login, checkout, the main page). Add or edit journeys with them if not. Every `## step` needs a line of instruction under the heading: a heading-only step is never run by Kane (kane-cli#250).

## 3. Dry run with Kane

```bash
svels run .
```
This works on a temporary copy. The project is not touched. It writes `.svels/report.json` and `.svels/report.html`.

## 4. Investigate what Kane rejected (your job)

Read `.svels/report.json`:
- `removed`: cuts Kane passed.
- `kept`: items Svels wanted to delete but Kane caught a break. Each has `failures[]` with `journey`, `failedStep`, `triage` (Kane's own diagnosis) and `evidence` (a Kane evidence pack path: open its screenshots and steps if present).
- `review`: files Kane passed but Svels will not delete on its own (loaded at runtime, images, folders built into paths).
- `trims`: the in-file edits, with each attempt and Kane's verdict.

For every `kept` item, open the file and the places that load it (search for its name, dynamic `import()` calls, string paths). Explain to the user in one or two sentences **why the app needs it**, citing Kane's failing step. Then propose one of:
- **keep it** and add a keep rule to `svels.config.json` (`"keep": ["src/themes/"]`) so it is never proposed again, or
- **a safer change** (for example removing only the dead export inside it), shown as a diff.

Do the same for `review` items the user cares about: say what loads them and whether deleting them is safe.

## 5. Ask, then apply

Summarise: files and lines Kane proved safe to remove, what Kane kept and why, and any change you propose. **Ask the user to approve.** Only then:
```bash
svels run . --apply      # writes the cuts Kane passed together in the final check
```
and apply any extra change you proposed (the diff the user approved).

## 6. Kane re-checks, independently

```bash
svels check .
```
Kane walks every journey on the project exactly as it is now and judges each sealed evidence pack with the `svels-safe-cut` policy (every journey passed, no skipped steps, real checks, nothing healed). Exit code 0 means safe to keep. If anything fails, show the failing step and Kane's triage, revert that change (`git checkout -- <file>`), and tell the user.

Finish with `git diff --stat` so the user sees exactly what changed, and suggest committing.

## Rules

- Never delete files yourself outside `svels run --apply` and the diff the user approved.
- Never mark a change safe unless `svels check` passed after it.
- Report Kane's results as they are: a failed journey is a finding, not something to work around.
