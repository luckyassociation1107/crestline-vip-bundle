# Crestline VIP — Exhaustive Flow Test Results

**Run:** 2026-11-20 · **Scope:** signup, login, logout, deposits, daily check-in, referrals, join history, 1st claim, new-deposit recognition, $13.80 withdrawal permission, `.crestline` import, admin operations, testnet + mainnet.

## ⚠️ Short answer to "testnet antha bagane undha? bagunte mainnet okay na?"

**No, testnet is NOT all good** — and **no, testnet passing does not make mainnet okay.**

1. **Testnet builds ship with `USDT_ADDRESS = ""`.** The $20 deposit verifier (`i_()` → `Lg()`) immediately returns *"USDT token contract address is not configured for this network."* **Deposit recognition is impossible out of the box.** I had to inject `?usdt=0x…` via URL to test the rest of the flow.
2. **The default testnet RPC `https://rpc-amoy.polygon.technology` does not resolve** (DNS `No address associated with hostname`). Both user apps then sit on "Loading Crestline VIP…" indefinitely; there is no timeout, retry counter or offline error state. Admin apps render fine.
3. **Mainnet is a different program, not a promoted testnet build:** different chain (137 vs 80002), different pool address, **the real Polygon USDT contract**, and real money. Governance still runs on Amoy (80002). Testnet results say nothing about mainnet settlement risk.

Everything below was run with a **stateful mocked JSON-RPC** (synthetic USDT `Transfer` logs + controllable chain clock) and a **test-only instrumented bundle** exposing the app's internal `/api/...` router. **No real funds moved and no transaction was broadcast.** Separate real, read-only chain checks are listed in §5.

---

## 1. Scoreboard

| Suite | PASS | FAIL | BLOCKED | INFO |
|---|---:|---:|---:|---:|
| `qa/verify.py` — static/build/APK/isolation/secrets/server | 131 | 0 | — | — |
| `qa/browser_flow_test.mjs` — real Chromium UI smoke flows | 24 | 0 | 2 | — |
| `qa/full_flow_test.mjs` — exhaustive state-machine + recovery flows | **108** | **0** | 6 | 2 |
| **Total** | **263** | **0** | **8** | **2** |

BLOCKED ≠ PASS. Zero failures means the *simulated* logic is correct; it does **not** prove real money flows work.

---

## 2. Your checklist, item by item

| You asked for | Result | Evidence |
|---|---|---|
| **SIGN UP** | ✅ PASS | Valid signup → `UID-XXXXXXXXXX`, PBKDF2 password hash, 6-digit PIN, `.crestline` recovery payload. Rejects short username, short password, weak/sequential PIN, duplicate username. |
| **LOGIN** | ✅ PASS | Correct credentials restore session; wrong password → `Invalid username or password`; wrong PIN → `Incorrect 6-digit Security PIN (N attempts before cooldown)`; after logout `/api/portfolio` → `Session expired`. Daily-login counter increments and writes a `DAILY_LOGIN` tx. |
| **LOGOUT** | ✅ PASS | `/api/auth/logout` clears `sessionStorage`; portfolio denied afterwards. |
| **DEPOSIT / DEPOSITING** | ⚠️ CONDITIONAL | Logic works **only when `USDT_ADDRESS` is configured**: exact $20 enforced, sender wallet bound permanently, `$140` bucket reserved (`BUCKET_LOCK`), `DEPOSIT` tx in history, `BUCKET_RELEASE` resolves the lock. **Shipped testnet config fails** (see §4 defect 1). |
| **NEW VALID DEPOSIT RECOGNITION** | ✅ PASS | A fresh tx hash is recognised, credits +$20, records `usedTxHashes`. Re-using the same hash is rejected (`No unspent $20.00 USDT Transfer found…`) — replay protection works. A second, genuinely new hash is accepted. |
| **Same-wallet / 1-wallet-1-person** | ✅ PASS | Different sender → `Account is permanently locked to 0x2222…2222. Send from that wallet only.` Another UID using the same wallet → `already locked to another UID`. |
| **DAILY LOGIN / CHECK-IN** | ✅ PASS | `/api/vip/claim` → +$1.00, `daysClaimed` 1, `DAILY_CLAIM` tx. Same-day double claim rejected. 15 further claims across 15 simulated days (device + chain clocks advanced in lockstep) all succeeded. |
| **JOIN / VIP purchase + HISTORY** | ✅ PASS | `$20 → 28-day pass`, `activeMembership.status = ACTIVE`, investment record, `VIP_PURCHASE` tx; duplicate purchase rejected; `membershipHistory`, `transactions`, `investments` all populated. |
| **REFERRAL / REFERRAL JOIN** | ✅ PASS | Second account registered with `referralCode = <UID>`; referral counts as **valid only after the referred user activates VIP** (`sessionReferralsCount = 1`). Referral gate then lifts. `REFPROOF3` HMAC/AES-GCM proof logic present in user builds, absent in admin builds. |
| **1ST CLAIM / $15 → $13.80** | ✅ PASS (local ledger) | `withdrawalPolicy`: gross 15, fee 1.20 (8%), **net 13.80**. With all gates satisfied, `/api/wallet/withdraw` succeeds; balance −$15, `sessionWithdrawalsCount = 1`, `sessionWithdrawnUsdt = 15`. |
| **$13.80 WITHDRAWAL PERMISSION** | ✅ PASS (policy) | `canWithdrawNow` false → `"1 Valid Referral required to unlock 1st payout…"`; after referral + 14-day window + balance ≥ $15 → true. Rejects: amount ≠ 15, wrong destination wallet (strict same-wallet), wrong PIN, 2nd payout inside the 14-day window, max 2 payouts per cycle. On-chain clock (`eth_getBlockByNumber` timestamp) is checked to block device-clock spoofing. |
| **`.crestline` FILE IMPORT** | ✅ PASS | Exported file is valid `CRESTLINE-VIP-RECOVERY-V2` / `PBKDF2-SHA256-250K+AES-256-GCM` JSON (`salt`, `iv`, `cipher`, `uid`, `username`). After wiping `localStorage` + `sessionStorage` (simulated lost device), uploading the file + password restored the account. |
| **TC1 / no-file recovery** | ✅ PASS | Pasting the `TC1:…` time-cipher payload + password also restored the account on a fresh device. |
| **Recover screen** | ✅ PASS | Offers `.crestline` upload, UID/username + original deposit wallet, TC1 payload, sync-link import. |
| **ADMIN OPERATIONS / FUNCTIONS** | ⛔ BLOCKED | Console is locked behind a hardcoded owner seed hash (`f1b599…`) + code hash (`9ae027…`). No 6-char passcode / 12-word seed supplied. Only the auth gate was executed (renders, tab switching, invalid passcode & invalid seed rejection). See §6 for the static audit of every admin operation. |
| **Mainnet** | ⚠️ MOCKED ONLY | Same 108-check suite run against `3-mainnet-user` with chain `0x89` and mocked RPC: **all passed**. But mainnet uses the real USDT contract and real pool address — no conclusion can be drawn about real settlement. No real funds were touched. |

---

## 3. What "everything working" would still require (the 6 BLOCKED items)

| # | Blocked | What is needed |
|---|---|---|
| 1–2 | Real on-chain $20 USDT deposit (testnet + mainnet) | A funded Amoy wallet, the testnet USDT token address, a real tx hash, and `?usdt=` (or bridge config). A real mainnet deposit would spend real money — not done. |
| 3–4 | Real $13.80 USDT payout (testnet + mainnet) | A deployed `CrestlineMasterVault` contract + owner signer + funded buckets. Currently `USE_SMART_CONTRACT=false` and `CONTRACT_ADDRESS=0x000…000`. |
| 5–6 | Admin console post-login (testnet + mainnet) | The owner 6-character passcode: `ADMIN_CODE=XXXXXX node qa/browser_flow_test.mjs`. **Never share the 12-word master seed.** |

Also **not tested**: native Android WebView runtime (no emulator/device). APKs are structurally valid, signed, aligned and contain the web assets, but were never launched on Android.

> You selected "I have a real Amoy testnet setup", but no wallet address, contract address or funded tx hash came through. Send those (wallet + tx hash are fine; keep private keys to yourself) and I can add genuine on-chain assertions.

---

## 4. Config differences — why testnet ≠ mainnet

| Setting | `1-testnet-user` | `3-mainnet-user` |
|---|---|---|
| `CHAIN_ID` | 80002 (Amoy) | **137 (Polygon PoS)** |
| `GOV_CHAIN_ID` | 80002 | 80002 (Amoy) — dual-plane |
| `POOL_DEPOSIT_ADDRESS` | `0x08EE5Cf3…E96Db8` | `0xA14e867C…8c793b` |
| `ADMIN_REGISTRY_ADDRESS` | `0x9be43bC4…cbae8` | `0xA14e867C…8c793b` (same as pool) |
| `POLYGON_RPC` | `rpc-amoy.polygon.technology` (**DNS dead here**) | `polygon-bor-rpc.publicnode.com` |
| **`USDT_ADDRESS`** | **`` (empty)** | **`0xc2132D05…B58e8F` (real Polygon USDT)** |
| `CONTRACT_ADDRESS` | `0x000…000` | `0x000…000` |
| `USE_SMART_CONTRACT` | `false` | `false` |

### Defects found (new ones in **bold**)

1. **🔴 CRITICAL — testnet `USDT_ADDRESS` is empty.** `Lg()` returns `usdtAddress: null`; `i_()` aborts with *"USDT token contract address is not configured for this network."* Every `$20` deposit attempt on the shipped testnet APK fails. Workaround used in tests: append `?usdt=0x…` to the launch URL (or set `crestline_bridge_config` in localStorage).
2. **🔴 Startup hangs forever if RPC is unreachable.** User builds stay on "Loading Crestline VIP…" with no timeout/error UI when `rpc-amoy.polygon.technology` fails. Recommend a boot deadline + offline banner + retry.
3. **🔴 No smart contract is wired up.** `USE_SMART_CONTRACT=false`, `CONTRACT_ADDRESS=0x000…000`, `AMOY_SPONSOR_KEY=""`. The entire "on-chain verified" deposit/withdrawal path is a **local encrypted ledger** (`crestline_phase1_store_v1`) plus read-only RPC calls for block timestamps and optional USDT `Transfer` log scans. Withdrawal produces a local `CRESTLINE-WD-…` receipt; it does not move USDT. This is a design fact, not a test failure — but it must not be described as on-chain settlement.
4. **Mainnet build points at real money** (real USDT contract + real pool EOA). Read-only checks: pool address is an EOA with `0` native and **0 USDT balance**, and **0 USDT Transfers to it in the last ~50k blocks**. No deployed vault contract exists at the configured address.
5. `gradle.properties` missing upstream → **fixed and committed** (`android.useAndroidX=true`).
6. AGP 8.5.2 warns it was only tested to `compileSdk 34` while projects use 35; auto-installs Build-Tools 34. Release builds need `--max-workers=1 -Xmx1024m` on a 2 GB host.
7. No automated tests shipped originally → `qa/` added.

---

## 5. Real read-only chain checks (no keys, no funds)

| Check | Result |
|---|---|
| `polygon-amoy-bor-rpc.publicnode.com` → `eth_chainId` | `0x13882` ✅ |
| `polygon-bor-rpc.publicnode.com` → `eth_chainId` | `0x89` ✅ |
| `rpc-amoy.polygon.technology` DNS | ❌ **unresolved** |
| Amoy pool `0x08EE…` `eth_getCode` / balance | EOA (`0x`), 0 native |
| Amoy registry `0x9be4…` `eth_getCode` / balance | EOA (`0x`), 0 native |
| Mainnet pool `0xA14e…` `eth_getCode` | EOA (`0x`), 0 native |
| Polygon USDT `0xc2132…` `eth_getCode` | **real contract** (~5,900 hex chars) ✅ |
| USDT `balanceOf(mainnet pool)` | **0 USDT** |
| USDT `Transfer` logs → mainnet pool, last 50k blocks | **0** |

Interpretation: the real mainnet USDT contract exists, but the configured pool has no contract, no balance and no recent deposits. The system is currently running entirely in Phase-1 local mode.

---

## 6. Admin operations — static audit (all BLOCKED at runtime)

The admin bundles contain **no `/api/…` endpoints**; operations are direct store/chain mutations behind the owner passcode lock. Presence audit (occurrences in the minified bundle):

| Operation | Admin-only marker | User build | Admin build | Runtime test |
|---|---|---:|---:|---|
| Owner 6-char passcode lock | `Admin Passcode` | 0 | 2 | ✅ gate renders, invalid code rejected |
| 12-word master seed / 2-of-3 guardians | `Master Seed`, `2-of-3` | 0 | 2 / 8 | ✅ tabs render, invalid seed rejected |
| Freeze / unfreeze / unban members | `Unban` | 0 | 3 | ⛔ BLOCKED |
| Random stop / appeals | `Random Stop` | 0 | 6 | ⛔ BLOCKED |
| Announcements / notices | `Announcement` | 28 | 52 | ⛔ BLOCKED |
| Treasury sweep / one-third cap | `Sweep` | 1 | 9 | ⛔ BLOCKED |
| Approve payout / withdrawal request | `Approve Payout`, `Withdrawal Request` | 0 | 1 | ⛔ BLOCKED |
| Bucket lock governance | `BUCKET_LOCK` | 1 | 0 | user-side ✅ |
| E2EE2 Amoy checkpoints / `userSeq` | `E2EE2` | 5 | 8 | ⛔ BLOCKED |
| Master vault / pool liquidity | `Master Vault` | 1 | 2 | ⛔ BLOCKED |
| Kill switch / guardian emergency pause | `Kill Switch` | 1 | 2 | ⛔ BLOCKED |
| Audit log export | `Audit Log`, `Export Audit` | 0 | 1 | ⛔ BLOCKED |

Role isolation holds: admin console, master-seed and guardian UI are absent from user bundles; `REFPROOF3` / `BUCKET_LOCK` user logic is absent from admin bundles. To actually execute the admin rows, run with `ADMIN_CODE=XXXXXX node qa/browser_flow_test.mjs` — I will not ask for the master seed.

---

## 7. Reproducing

```bash
# 1. static / build / APK verification (131 checks)
python3 qa/verify.py --json qa/verify-results.json

# 2. Chromium UI smoke flows (24 checks, 2 blocked)
npm i playwright && npx playwright install chromium
node qa/browser_flow_test.mjs
ADMIN_CODE=XXXXXX node qa/browser_flow_test.mjs   # unlocks admin console

# 3. exhaustive state-machine + recovery flows (108 checks)
node qa/full_flow_test.mjs
```

All three suites write JSON results into `qa/`. `full_flow_test.mjs` builds **test-only patched bundle copies in `/tmp`**; it never modifies the shipped source. It mocks every RPC call, injects a controllable `Date` offset to simulate 15 days, and uses synthetic USDT `Transfer` logs — nothing reaches a live chain.

See also `QA_REPORT.md` (build/APK report), `qa/admin_audit.json`, and the signed APKs in the `v1.0.0-qa` GitHub release.
