# QA suite

Two independent suites. Both are non-destructive; the browser suite mocks all Polygon RPC calls, so it never touches a real chain or moves funds.

## 1. `verify.py` — static / build / APK checks (131 checks)

```bash
python3 qa/verify.py --json qa/verify-results.json
```

Requires Python 3 only. Optional env vars:

| Var | Purpose |
|---|---|
| `JAVA_HOME` | lets `apksigner` run |
| `ANDROID_SDK_ROOT` / `ANDROID_HOME` | locates `build-tools/35.0.0` (`apksigner`, `zipalign`, `aapt2`) |
| `APK_DIR` | where `crestline-*-release.apk` live (default `../apk_out`) |

Without the SDK vars, the APK-specific checks are skipped/fail; the other ~100 checks still run.

Covers: Gradle config (`namespace`, `applicationId`, SDK levels, `android.useAndroidX`), AndroidManifest + network-security XML, deep link, `FLAG_SECURE`/`WebViewAssetLoader`/`@JavascriptInterface` presence, `index.html` asset references, byte-identical asset copies across `www/` `public/` `android/.../assets/www/`, role isolation (`REFPROOF3`/`BUCKET_LOCK` vs `Admin Console`/`Master Seed`), network isolation (Amoy-only vs Polygon-137), JS/shell/XML syntax, secret scan, APK signature/alignment/badging/embedded web assets/JS-bridge survival after R8, and a local HTTP smoke test of all four static bundles.

## 2. `browser_flow_test.mjs` — real UI flows (24 pass + 2 blocked)

```bash
npm i playwright
npx playwright install chromium          # add --with-deps on Ubuntu
node qa/browser_flow_test.mjs
```

It starts `serve.mjs` for each target on ports 4181–4184, launches Chromium, intercepts every RPC URL and returns synthetic JSON-RPC responses, then:

- **User builds:** renders login/signup → creates an account → asserts a `UID-…` and `.crestline` recovery file → continues to the dashboard → asserts the `$20` VIP pass, reserved deposit bucket and same-wallet lock UI → asserts zero uncaught JS errors.
- **Admin builds:** renders the owner passcode lock → switches `Seed` / `2-of-3 Shares` tabs → asserts an invalid passcode is rejected → asserts zero uncaught JS errors.

The admin console *after* login cannot be tested without the owner secret. Supply only the 6-character code (never the master seed) to enable that check:

```bash
ADMIN_CODE=XXXXXX node qa/browser_flow_test.mjs
```

Results are written to `qa/browser-results.json`. `BLOCK` results are reported separately from `FAIL` and do not fail the run.

## Build notes

The four projects need JDK 17, Android SDK Platform 35 + Build-Tools 35, and Gradle 8.7. The upstream bundle shipped **without `gradle.properties`**, which breaks every build; this repo includes the fix (`android.useAndroidX=true`).

On machines with ~2 GB RAM, use single-worker Gradle or AAPT2 may time out:

```bash
gradle --no-daemon --max-workers=1 -Dorg.gradle.jvmargs=-Xmx1024m \
       -x lintVitalRelease assembleRelease
```

## 3. `full_flow_test.mjs` — exhaustive state-machine + recovery flows (108 checks)

```bash
node qa/full_flow_test.mjs
```

Builds **test-only patched copies** of both user bundles in `/tmp/crestline_qa_lab` (the shipped source is untouched), exposes the internal `/api/...` router on `window.__CRESTLINE`, and drives every endpoint with a stateful mocked Polygon JSON-RPC:

- synthetic ERC-20 `Transfer` logs so `$20` deposit verification can be exercised (including replay protection and "new valid deposit" recognition),
- a controllable chain clock (`eth_getBlockByNumber` timestamp) plus an injected `Date` offset to simulate 15 days of daily check-ins,
- signup / login / logout / PIN & password failures,
- bucket lock & release, strict same-wallet policy, 1-wallet-1-person,
- VIP purchase, 28-day daily claims, referral join + validity gate,
- `$15 → $13.80` withdrawal permission and all rejection paths,
- `.crestline` file export + import on a **wiped device**, and TC1 no-file recovery,
- a `DEFAULT-CONFIG` sub-suite that runs with **no `?usdt=` override** to reveal the shipped-config behaviour.

Results: `qa/full-flow-results.json`. Set `ADMIN_CODE` for `browser_flow_test.mjs` to unlock admin console tests.

## 4. `real_chain_checks.py` — read-only live chain checks (22 checks)

```bash
python3 qa/real_chain_checks.py
```

Key-free public RPC queries only: chain IDs, `eth_getCode` at the addresses baked into the bundles, pool native/USDT balance, recent USDT `Transfer` logs, and DNS resolution of the default testnet RPC. Output: `qa/real-chain-results.json`.

## Results of the runs recorded in `QA_REPORT.md` and `TEST_RESULTS_FULL.md`

| Suite | Pass | Fail | Blocked |
|---|---:|---:|---:|
| `verify.py` | 131 | 0 | — |
| `browser_flow_test.mjs` | 24 | 0 | 2 |
| `full_flow_test.mjs` | 108 | 0 | 6 |
| **Total** | **263** | **0** | **8** |

4 debug + 4 signed release APKs built. Zero failures refers to the **simulated** logic only; real deposit/payout and the admin console remain blocked (see `TEST_RESULTS_FULL.md` §3).
