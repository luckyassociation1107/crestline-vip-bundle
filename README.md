# Crestline VIP — Complete Multi-Target Bundle Guide

Welcome to the **Crestline VIP** complete distribution bundle (`crestline-4-apks-bundle.zip`).  
This archive packages **4 Role-Isolated & Network-Isolated Android APK Projects**, the **Encrypted Local On-Device Worker Builder (`build-local-zips.mjs`)**, and complete **User & Admin Architecture Documentation**.

---

## 1. All Available Packages & Their Purpose

| Package / Folder | Role | Network | Format & Usage |
| --- | --- | --- | --- |
| `1-testnet-user/` (`crestline-testnet-user-apk.zip`) | User Only | Polygon Amoy (80002) | Android APK Gradle/Capacitor project (`com.crestline.testnet.user`) |
| `2-testnet-admin/` (`crestline-testnet-admin-apk.zip`) | Admin Only | Polygon Amoy (80002) | Android APK Gradle/Capacitor project (`com.crestline.testnet.admin`) |
| `3-mainnet-user/` (`crestline-mainnet-user-apk.zip`) | User Only | Polygon 137 + Amoy 80002 | Android APK Gradle/Capacitor project (`com.crestline.mainnet.user`) |
| `4-mainnet-admin/` (`crestline-mainnet-admin-apk.zip`) | Admin Only | Polygon 137 + Amoy 80002 | Android APK Gradle/Capacitor project (`com.crestline.mainnet.admin`) |
| `crestline-local-testnet-user.zip` | User Only | Polygon Amoy (80002) | Encrypted RAM-only Local Runner (`vault.sealed` + `payout-bot.sealed` + `runner.cjs`) |
| `crestline-local-testnet-admin.zip` | Admin Only | Polygon Amoy (80002) | Encrypted RAM-only Local Runner (`vault.sealed` + `runner.cjs`) |
| `crestline-local-mainnet-user.zip` | User Only | Polygon 137 + Amoy 80002 | Encrypted RAM-only Local Runner (`vault.sealed` + `payout-bot.sealed` + `runner.cjs`) |
| `crestline-local-mainnet-admin.zip` | Admin Only | Polygon 137 + Amoy 80002 | Encrypted RAM-only Local Runner (`vault.sealed` + `runner.cjs`) |
| `crestline-vip-web3-static.zip` | Web Static | Polygon 137 + Amoy 80002 | Static `public/` web bundle |
| `crestline-vip-testnet.zip` | Web Static | Polygon Amoy (80002) | Static `public/` testnet web bundle |

---

## 2. Helper Scripts Inside This Bundle

* `build-local-zips.mjs`: Packages all 4 targets into encrypted `crestline-local-*.zip` distributions with `vault.sealed` (`CLVSEAL1`), user-only `payout-bot.sealed` (`CLPBOT1`), `runner.cjs`, `START-*.sh`, `START-*.bat`, and tailored `README.md` files.
* `build-signed-apks.sh`: Compiles signed/release Android APKs for all 4 folders when Android SDK 35 & Gradle are present.
* `serve.mjs`: Serves any of the 4 targets locally for testing.

---

## 3. Dual-Plane Decentralized Architecture

* **Currency Plane (Polygon PoS Mainnet `137` / Testnet `80002`):** Handles `$20.00` USDT VIP deposits, `$140` HD Pool Buckets, `1/3rd` Owner Treasury sweeps, and `$13.80` net member payouts.
* **Database & Governance Plane (Polygon Amoy `80002`):** Stores `E2EE2` encrypted user checkpoints, bucket lock/release states (`BUCKET_LOCK` / `BUCKET_RELEASE`), global Admin notices, random stops, and appeals with monotonic `userSeq` anti-rollback + ECDSA `userSig` ownership signatures.
* **Zero Cloud / Zero Hosting:** Both the Android APKs (`WebViewAssetLoader`) and Local Runners (`127.0.0.1`) operate directly against multi-RPC Polygon nodes without any central server.

---

## 4. Responsive Design Across All Devices

Every User and Admin build adapts automatically to screen size:
* **Mobile (`360px–767px`):** Floating bottom dock (5 tabs), single-column cards, compact headers, zero horizontal overflow.
* **Tablet (`768px–1023px`):** Centered bottom dock + multi-column KPI/stat grids.
* **Laptop / Desktop (`1024px+`):** Sticky left sidebar navigation + multi-column `lg:grid-cols-12` workspace layouts for both User Dashboard and Admin Command Console.

---

## 5. Core Protocol Rules Summary

* **Zero-PII Accounts:** `UID-XXXXXXXXXX` + Password (`PBKDF2-SHA256`) + 6-Digit PIN, starting at `$0.00 USDT`.
* **`$140` HD Bucket Concurrency Locks:** Exclusive per-user slot lock prevents concurrent deposit overflows across tabs/devices.
* **Strict Same-Wallet Policy:** First deposit wallet (`0x...`) becomes the permanent locked payout & recovery address.
* **28-Day VIP Math:** `$20.00` Pass $\rightarrow$ `+$1.00/day` check-in for `28` days (`$28.00`), `2 × $15.00` bi-weekly payouts (`8%` fee = `$13.80` net each), unlocked by `1 + 1` valid `REFPROOF3` referrals.
* **2-Way Recovery:** Restore via `.crestline` encrypted backup file OR 3-field Zero-File On-Chain Recovery (`UID/Username` + `Original Deposit Wallet` + `Password`).
* **30s Admin Auto-Watcher & `payout-bot.sealed`:** User withdrawals verify in RAM via `payout-bot.sealed`; Admin Console auto-syncs every 30 seconds to process queued payouts back to Original Deposit Wallets.
