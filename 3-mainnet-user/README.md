# Crestline VIP — Mainnet User Android APK Project (`3-mainnet-user`)

> **ZIP Package:** `crestline-mainnet-user-apk.zip`  
> **Android Package ID:** `com.crestline.mainnet.user`  
> **Role Isolation:** USER APP ONLY (`VITE_APP_ROLE=user`)  
> **Network:** Polygon PoS Mainnet (Chain ID 137) for USDT Deposits & Payouts + Polygon Amoy (Chain ID 80002) for Encrypted DB & Governance  
> **Build Cost:** $0 / ₹0 — Zero paid plugins or proprietary SDKs required

---

## 1. Folder Structure Inside This ZIP

| Path | Description |
| --- | --- |
| `android/` | Full native Android Gradle + Capacitor WebView project configured for `com.crestline.mainnet.user` with `FLAG_SECURE` screenshot blocking and `WebViewAssetLoader`. |
| `android/app/src/main/assets/www/` | Pre-compiled static frontend bundle loaded offline over `https://appassets.androidplatform.net/assets/www/index.html` (gives WebCrypto AES-256-GCM / PBKDF2 / HMAC-SHA256 a full Secure Context). |
| `public/` & `www/` | Identical compiled static assets ready for Capacitor sync or local static serving. |
| `capacitor.config.json` | Capacitor configuration for `com.crestline.mainnet.user`. |
| `BUILD_APK.txt` | Quick Gradle/Android Studio build notes. |
| `README.md` | This complete build, architecture, and workflow manual. |

---

## 2. How to Compile a Signed `.apk` (Android Studio or CLI)

### Option A: Android Studio
1. Extract `crestline-mainnet-user-apk.zip` and open the `android/` directory in **Android Studio** (SDK 35 installed).
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

## 4. User App Features & Security Rules

* **Zero Admin Exposure:** Compiled with `VITE_APP_ROLE=user`. Admin seed locks, governance broadcasts, and treasury sweeps are excluded from the bundle.
* **Zero-PII Signup & Vault (`DSEAL3`):** Username + Password (`PBKDF2-SHA256`) + 6-digit Security PIN generate a collision-free **`UID-XXXXXXXXXX`** starting strictly at **`$0.00 USDT`**.
* **`$140` HD Bucket Concurrency Lock:** Reserves an exclusive deposit bucket slot (`BUCKET_LOCK`) so concurrent deposits never overflow `$140`.
* **Strict Same-Wallet Policy:** First verified `$20.00 USDT` deposit permanently locks your Original Deposit Wallet (`0x...`). All withdrawals auto-lock to that same address.
* **28-Day VIP Math:** `$20.00` Pass $\rightarrow$ `+$1.00/day` for `28` days (`$28.00`), **`2 × $15.00`** payouts every 14 days (`8%` fee = **`$13.80` Net** each), unlocked by `1 + 1` verified `REFPROOF3` referrals.
* **Dual-Plane Sync & 2-Way Recovery:** Encrypted state syncs via `E2EE2` on Polygon Amoy (80002) with monotonic `userSeq` & `userSig`. Recover anytime via **`.crestline`** file or **Zero-File On-Chain Recovery** (`UID/Username` + `Original Deposit Wallet` + `Password`).
* **`DO NOT DELETE` Guard:** Always export your `.crestline` recovery file from **Profile** before uninstalling the APK or clearing app storage.
