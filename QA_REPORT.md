# Crestline VIP — Build & Flow Test Report

**Run:** 2026-11-20 · **Targets:** `1-testnet-user`, `2-testnet-admin`, `3-mainnet-user`, `4-mainnet-admin`
**Verdict:** ⚠️ **Builds and the user flow work. The admin flow is only verified up to the login gate. Full "everything working" is NOT proven** — see the blocked/not-tested rows below.

> **Updated:** a much deeper exhaustive run (263 passes, 8 blocked) is in **[TEST_RESULTS_FULL.md](TEST_RESULTS_FULL.md)**. Its headline finding: the shipped **testnet build has an empty `USDT_ADDRESS`, so $20 deposit verification fails out of the box**, and the default testnet RPC does not resolve. Testnet passing does **not** imply mainnet is okay — mainnet uses the real Polygon USDT contract.

## Scoreboard

| Suite | Result |
|---|---|
| `qa/verify.py` — static, build-config, APK, asset, isolation, secrets, local server | **131 / 131 PASS** |
| `qa/browser_flow_test.mjs` — real Chromium UI flows (RPC mocked) | **24 PASS · 0 FAIL · 2 BLOCKED** |
| Gradle `assembleDebug` + `assembleRelease` × 4 targets | **8 / 8 builds succeed** |
| Signed release APKs produced | **4** (v1+v2 signed, zip-aligned, verified) |

## What was actually verified

| Area | Status | Evidence |
|---|---|---|
| Source/manifest/Gradle config | ✅ PASS | 4 manifests well-formed, cleartext off, `crestline://sync` deep link, minSdk 26 / targetSdk 35 / Java 17, correct package IDs |
| Compiled APK integrity | ✅ PASS | `apksigner verify` (v1+v2), `zipalign -c 4`, `aapt2 dump badging`, 3 `assets/www/*` files + `CrestlineAndroid` / `getAppSigningSha256` bridge survive R8 minification |
| Role isolation | ✅ PASS | User bundles contain `REFPROOF3` / `BUCKET_LOCK` and **no** `Admin Console` / `Master Seed`. Admin bundles contain the console and **no** user referral/bucket logic |
| Network isolation | ✅ PASS | Testnet builds pin Amoy RPCs only; mainnet builds pin Polygon 137 + Amoy |
| Asset parity | ✅ PASS | `www/`, `public/`, `android/.../assets/www/` copies are byte-identical in all 4 targets |
| Syntax / secrets | ✅ PASS | All JS/MJS parse with `node --check`, shell with `bash -n`, XML parses; no private keys, mnemonics or API keys in source |
| Static serving | ✅ PASS | All 4 `www/` bundles serve HTTP 200 with correct MIME |
| **USER flow** (testnet + mainnet) | ✅ PASS | Login screen → Create Account → `UID-XXXXXXXXXX` generated → encrypted `.crestline` recovery file + Time-Cipher backup → dashboard → `$20 VIP Pass`, reserved deposit bucket, same-wallet lock UI. **Zero uncaught JS errors** |
| **ADMIN auth gate** (testnet + mainnet) | ✅ PASS | Owner passcode lock renders, `Seed` and `2-of-3 Shares` tabs work, invalid passcode rejected, invalid BIP-39 seed rejected. **Zero uncaught JS errors** |
| **ADMIN console AFTER login** | ⛔ BLOCKED | The bundles contain hardcoded owner hashes (`f1b599…` seed hash, `9ae027…` code hash). Unlocking requires the owner's 6-char passcode or 12-word master seed, which is **not** in the bundle. Run with `ADMIN_CODE=XXXXXX node qa/browser_flow_test.mjs` to finish this test. |
| On-chain deposit / payout / referral / treasury / appeals | ⛔ NOT TESTED | JSON-RPC was mocked. Real verification needs funded wallets, deployed contracts, live RPC and real USDT. No claim is made about money movement. |
| Native Android WebView runtime | ⛔ NOT TESTED | No emulator/device here. APKs are structurally valid and installable, but were not launched on Android. |
| Real RPC availability | ⚠️ PARTIAL | `polygon-amoy-bor-rpc.publicnode.com` and `1rpc.io/matic` respond; `rpc-amoy.polygon.technology` does **not resolve** from this environment. |

## Defects found

1. **Build was broken out of the box (FIXED).** All four projects shipped without `gradle.properties`; AGP failed with *"Configuration contains AndroidX dependencies, but `android.useAndroidX` is not enabled"*. Added `android.useAndroidX=true` to each project — committed in this repo.
2. **User apps hang forever on "Loading Crestline VIP…" when every RPC is unreachable.** With live DNS the admin apps render immediately; both user builds stay on the splash screen with no timeout, retry counter or offline/error UI. Recommend a boot timeout + explicit "RPC unavailable" state with a retry button.
3. **AGP 8.5.2 warns it was only tested up to compileSdk 34** while the projects use `compileSdk 35`. Either upgrade AGP or add `android.suppressUnsupportedCompileSdk=35` after validating.
4. **AGP 8.5.2 auto-installs Build-Tools 34 even though 35 is declared** — harmless, but pin `buildToolsVersion '35.0.0'` for reproducible builds.
5. **Release build is fragile on low-memory machines.** On a 2 GB host, AAPT2's daemon timed out during `bundleReleaseResources`; `--max-workers=1 -Xmx1024m -x lintVitalRelease` builds cleanly. Add those flags to CI.
6. **No tests shipped originally.** Added `qa/verify.py`, `qa/browser_flow_test.mjs` and `qa/README.md`.
7. `build-signed-apks.sh` needs `STORE_PASS` and a keystore. A **separate QA keystore** was generated for these builds; it is deliberately **not** in this public repo. See `SIGNING_INFO.md` in the workspace.

## The APKs

| File | Package | Network | Role |
|---|---|---|---|
| `crestline-1-testnet-user-release.apk` | `com.crestline.testnet.user` | Amoy 80002 | User |
| `crestline-2-testnet-admin-release.apk` | `com.crestline.testnet.admin` | Amoy 80002 | Admin |
| `crestline-3-mainnet-user-release.apk` | `com.crestline.mainnet.user` | Polygon 137 + Amoy | User |
| `crestline-4-mainnet-admin-release.apk` | `com.crestline.mainnet.admin` | Polygon 137 + Amoy | Admin |

All four are `assembleRelease` builds (R8 minified), zip-aligned and signed with the QA keystore (cert SHA-256 `3998c52b…a2a5`). Debug APKs were also built and verified but are not distributed.

> ⚠️ These are QA builds signed with a **newly generated key**, not your production signing key. Anyone who installs one is bound to that certificate. For a real release, re-sign with your own keystore and keep it safe — losing it blocks all future updates.

> ⚠️ This codebase implements a USDT deposit / referral / payout program with an admin treasury sweep. Before distributing installable APKs or making the repo public, get an independent security audit and legal review of the scheme. Publishing binaries here makes them directly installable by anyone.

## Reproducing

```bash
# static / build / APK suite (no extra packages)
python3 qa/verify.py --json qa/verify-results.json

# headless browser flows
npm i playwright && npx playwright install chromium
node qa/browser_flow_test.mjs
ADMIN_CODE=XXXXXX node qa/browser_flow_test.mjs   # adds the post-login admin console test

# rebuild (JDK 17, Android SDK 35, Gradle 8.7)
export ANDROID_SDK_ROOT=/path/to/sdk
gradle --no-daemon --max-workers=1 -Dorg.gradle.jvmargs=-Xmx1024m \
       -x lintVitalRelease assembleRelease
```

See `qa/README.md` for details.
