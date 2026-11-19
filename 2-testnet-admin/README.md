# Crestline VIP — Testnet Admin Android APK Project (`2-testnet-admin`)

> **ZIP Package:** `crestline-testnet-admin-apk.zip`  
> **Android Package ID:** `com.crestline.testnet.admin`  
> **Role Isolation:** ADMIN COMMAND CONSOLE ONLY (`VITE_APP_ROLE=admin`)  
> **Network:** Polygon Amoy Testnet (Chain ID 80002) for Test USDT Deposits/Payouts & Encrypted DB/Governance  
> **Build Cost:** $0 / ₹0 — Zero paid plugins or proprietary SDKs required

---

## 1. Folder Structure Inside This ZIP

| Path | Description |
| --- | --- |
| `android/` | Full native Android Gradle + Capacitor WebView project configured for `com.crestline.testnet.admin` with `FLAG_SECURE` screenshot blocking and `WebViewAssetLoader`. |
| `android/app/src/main/assets/www/` | Pre-compiled static frontend bundle loaded offline over `https://appassets.androidplatform.net/assets/www/index.html` (gives WebCrypto AES-256-GCM / PBKDF2 / HMAC-SHA256 a full Secure Context). |
| `public/` & `www/` | Identical compiled static assets ready for Capacitor sync or local static serving. |
| `capacitor.config.json` | Capacitor configuration for `com.crestline.testnet.admin`. |
| `BUILD_APK.txt` | Quick Gradle/Android Studio build notes. |
| `README.md` | This complete build, architecture, and workflow manual. |

---

## 2. How to Compile a Signed `.apk` (Android Studio or CLI)

### Option A: Android Studio
1. Extract `crestline-testnet-admin-apk.zip` and open the `android/` directory in **Android Studio** (SDK 35 installed).
2. Let Gradle sync complete.
3. Click **Build → Generate Signed Bundle / APK → APK** (or **Build → Build Bundle(s) / APK(s) → Build APK(s)** for debug testing).

### Option B: Command Line (Gradle)
```bash
cd android
./gradlew assembleDebug     # Unsigned/debug APK for quick phone sideload testing
./gradlew assembleRelease   # Release APK (sign with your keystore or apksigner)
```
Output APKs appear under `android/app/build/outputs/apk/`.

---

## 3. Responsive UI Across Phones, Tablets & Large Screens

* **Phones & Tablets (`< 1024px`):** Floating bottom navigation dock (5 tabs), single-column stacked cards, `overflow-x: clip`, and touch-safe modals (`360px+`).
* **Tablets (landscape) & Large Displays (`>= 1024px`):** Sticky left navigation sidebar (`lg:w-60` / `lg:w-56`) + multi-column grids (`lg:grid-cols-12`) for side-by-side plan details, forms, ledger entries, and controls.

---

## 4. Admin APK Features & Security Rules

* **Strict Role Isolation:** Compiled with `VITE_APP_ROLE=admin` and baked `VITE_ADMIN_SEED_HASH` / `VITE_ADMIN_CODE_HASH` verification.
* **Deterministic Master Seed Lock:** Unlock via your 12-word Master Seed (or 6-char access code). The seed stays strictly in RAM and derives deterministic HD bucket wallets (`m/44'/60'/0'/0/i`), signs Amoy `E2EE2` broadcasts, and authorizes sweeps/payouts.
* **30-Second Auto-Payout Watcher:** Active whenever the Admin Seed is unlocked (`Auto-Sync · Active (30s)`), continuously processing verified `$13.80` net payouts from HD buckets back to members' Original Deposit Wallets.
* **`$140` Self-Generating Buckets + Treasury Guard:** Generates new HD deposit buckets, supports `Fund Bucket Gas (0.02 POL)`, and enforces the **`1/3rd` Owner Treasury Allowance** vs **`2/3rd` Reserved Payout Pool**.
* **5 Command Tabs:** `Overview` (KPIs, Live Member & Unlock Ledger, Buckets, Amoy Governance Signer), `Members` (Inspect, Freeze/Ban, Resolve Encrypted Appeals), `Random` (0–2 daily unique stops), `Notices` (Signed global broadcasts), and `Settings` (Profit Calculator, Sweep Targets, Gas helper).
