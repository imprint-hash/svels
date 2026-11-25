# Svels in Claude Code: a real run of the loop

25 Nov 2026, Claude Code (Claude Opus) following [`skill/svels/SKILL.md`](../../skill/svels/SKILL.md) on a copy of `examples/bloated-shop`, Kane CLI 0.10.3 driving Chrome. Kane's output below is copied from the terminal, not edited.

## 1. A change Kane must judge

The promo file looks unused to an import scan (nothing imports it by name), so it is the kind of cut an agent would make:

```
rm src/promos/welcome10.js
```

## 2. Kane re-checks the app as it is (`svels check`)

```
Kane re-checks 3 journey(s) on skillshop as it is now (policy: svels-safe-cut.policy.yaml).
  PASS  browse  verdict: pass
  PASS  cart  verdict: pass
  FAIL  checkout at "Reading the charged amount and applied promo from the checkout confirmation mess"  verdict: fail
Kane failed the change. Evidence: .svels/check.json
exit 1
```

Kane's own triage in the run's NDJSON (`test_md_bug_verdict`): *"The checkout rejects the recorded WELCOME10 promo code, so the order cannot be placed or confirmed."*

## 3. Claude investigates Kane's evidence

Claude read `.svels/check.json`, the failing step, Kane's triage, and then the code that handles promo codes:

```js
// src/components/Checkout.js
16    if (data.promo) {
17      try { const promo = (await import(`../promos/${data.promo.toLowerCase()}.js`)).default; ...
18      catch { document.getElementById("msg").textContent = "That promo code isn't valid."; return; }
```

**Finding (Claude):** `welcome10.js` is not dead. The checkout builds the module path from whatever the shopper types (`../promos/${code}.js`) and imports it at runtime, so no static import ever names the file. Without it, `WELCOME10` hits the `catch` and the shopper sees "That promo code isn't valid", which is exactly where Kane's journey failed. Every file in `src/promos/` is reachable this way.

**Proposal (Claude):** restore the file, and add a keep rule so Svels never proposes anything in that folder again:

```json
// svels.config.json
"keep": ["svels/", "src/promos/"]
```

## 4. The developer approves

Approved. The file is restored (`git checkout -- src/promos/welcome10.js`).

## 5. Kane re-checks, independently

```
Kane re-checks 3 journey(s) on skillshop as it is now (policy: svels-safe-cut.policy.yaml).
  PASS  browse  verdict: pass
  PASS  cart  verdict: pass
  PASS  checkout  verdict: pass
All journeys pass and Kane's verdicts pass. The change is safe to keep.
exit 0
```

Each `verdict: pass` is Kane judging the run's sealed evidence pack against `policy/svels-safe-cut.policy.yaml` (every journey passed, no skipped steps, real checks, nothing healed, nothing broken).

## Found while building this

`svels check` first hung after its last journey: the local server waited for Chrome to close its keep-alive connections. Fixed in `src/serve.mjs` (close all connections on shutdown).
