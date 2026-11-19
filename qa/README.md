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

## Results of the run recorded in `QA_REPORT.md`

- `verify.py`: 131/131 pass
- `browser_flow_test.mjs`: 24 pass, 0 fail, 2 blocked (admin console behind owner code)
- 4 debug + 4 signed release APKs built
