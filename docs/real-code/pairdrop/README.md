# Svels on PairDrop: fail, fix, clean pass on code we didn't write

[PairDrop](https://github.com/schlagmichdoch/PairDrop) (11.9k stars, upstream commit `1b0c9c9`) is a real file-sharing web app. Nothing in it was written for Svels. We served its `public/` folder as it is and gave Kane three journeys a user cares about ([`about_test.md`](about_test.md), [`home_test.md`](home_test.md), [`language_test.md`](language_test.md): open About, see the home screen, switch the app to German and back).

PairDrop is a good trap for a dead-code tool. Its scripts load files by paths built at runtime (`fetch(\`lang/${locale}.json\`)`, a deferred stylesheet named in `scripts/main.js`), and a service worker caches every file for offline use.

## 1. The fail: what a plain import scan would ship

A plain import scan says **80 files are dead**, including 37 of PairDrop's 38 translations, `styles/styles-deferred.css` and `service-worker.js`. We deleted exactly those 80 in a copy and asked Kane to re-check the app as it is (`svels check`):

```
Kane re-checks 3 journey(s) on pairdrop-naive as it is now (policy: svels-safe-cut.policy.yaml).
  FAIL  about  verdict: fail
  PASS  home  verdict: pass
  FAIL  language at "Switch the app to German"  verdict: fail  (Kane's triage: The language menu did not become usable after the Set Language control was activated, so Deutsch could not be selected.)
Kane failed the change. Evidence: .svels/check.json
exit 1
```

- **language** is a real break. The language dialog is styled by the "dead" `styles-deferred.css`, and German comes from the "dead" `lang/de.json`. Kane's own triage names the failing step. Raw Kane NDJSON: [`check1-language-FAIL.ndjson`](check1-language-FAIL.ndjson).
- **about** failed Kane's evidence policy (gate `every-test-has-checks`): Kane's replay did not record a real check for that run. We count it as "not proven safe", not as a proven break.
- Full output: [`check1-plain-scan-cut-FAIL.txt`](check1-plain-scan-cut-FAIL.txt), [`check1-FAIL.json`](check1-FAIL.json).

## 2. The fix: two real Svels bugs, found only because this was real code

Our own first run on PairDrop ([`run1-before-fixes.txt`](run1-before-fixes.txt)) did worse than fail: **it passed.** Svels reported 78 files safe to delete, translations included. Two causes, both fixed with tests:

1. **The service worker hid the deletions.** PairDrop's service worker cached every file during Kane's first walk, so later trials were served the deleted files from that cache and Kane saw a working app. Now every Kane journey starts with the site's service worker, offline cache, storage and HTTP cache wiped (`src/browser.mjs`).
2. **Paths inside scripts were read from the wrong folder.** A browser resolves `"styles/styles-deferred.css"` and `` `lang/${locale}.json` `` (written in `scripts/*.js`) from the *page*, not from the script's folder. Svels now does the same, so it sees the stylesheet as used and guards the whole `lang/` folder (`src/graph.mjs`, test: "paths inside a script resolve from the page").

## 3. The clean pass

With both fixes, `svels run` on PairDrop ([`run2-after-fixes.txt`](run2-after-fixes.txt), report: [`report.html`](report.html)):

- **44** files look unused (down from 80).
- **40 cut, Kane-verified:** 37 spare Open Sans font files the CSS never loads (it loads one) and 3 logo images nothing refers to (checked by hand too).
- **4 left for you to review, not cut:** `lang/bn.json`, `fi.json`, `kab.json`, `th.json`. They are translations PairDrop never offers (not in its language list), so they really are unused, but they live in a folder the code builds paths into at runtime, and Svels won't delete there on a green test alone.
- Kane's notary: 3 of 3 sealed evidence packs pass the 5-gate `svels-safe-cut` policy.

Then Kane re-checked the app with exactly those 40 files removed (`svels check`):

```
Kane re-checks 3 journey(s) on pairdrop-svels as it is now (policy: svels-safe-cut.policy.yaml).
  PASS  about  verdict: pass
  PASS  home  verdict: pass
  PASS  language  verdict: pass
All journeys pass and Kane's verdicts pass. The change is safe to keep.
exit 0
```

Full output: [`check2-svels-cut-PASS.txt`](check2-svels-cut-PASS.txt).

## Reproduce

```bash
git clone --depth 1 https://github.com/schlagmichdoch/PairDrop && cd PairDrop/public
# copy svels.config.json and the three *_test.md journeys from this folder into ./svels/journeys
npx -y github:imprint-hash/svels run .      # dry run: report in .svels/report.html
npx -y github:imprint-hash/svels check .    # Kane re-checks the app as it is now
```
