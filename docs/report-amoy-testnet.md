# 🟣 AMOY TESTNET — FULL AUTOMATION REPORT
**Date:** 2026-11-21 · **Network:** Polygon Amoy (chainId 80002) · **RPC:** polygon-amoy-bor-rpc.publicnode.com (REAL chain, no mocks except where marked)
**Live site:** https://luckyassociation1107.github.io/crestline-vip-bundle/

---

## 1) REAL ON-CHAIN PROOFS — meeru direct polygonscan lo verify cheyochu

| Event | Tx Hash | Block | Status |
|---|---|---|---|
| Deposit #1 — 20 USDC → pool (Circle faucet, Playwright automation) | [`0xb3129544…3eb42af7`](https://amoy.polygonscan.com/tx/0xb312954439a4f959cc708a9365ffce13c24376e9d821dd536fb6d1af3eb42af7) | 53436070 | ✅ ON-CHAIN |
| Deposit #2 — 20 USDC → pool (auto-deposit daemon, this run) | [`0x29e04641…a2c4c285`](https://amoy.polygonscan.com/tx/0x29e04641a5a44df80031f1037340a659758ebdfff454fd637c484712a2c4c285) | 53442218 | ✅ ON-CHAIN |

**Pool balance ippudu: $40.00 USDC (live)** — pool `0x08EE5Cf33C30123A628aC8FF80Ca48Bec8E96Db8`
Token: Circle test USDC `0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582`

---

## 2) USER FEATURES — anni working ✅ (Playwright verified)

| # | Feature | Status | Evidence |
|---|---|---|---|
| 1 | Signup (username/password/6-digit PIN/referral) | ✅ WORKING | real-RPC signups: UID-ZHYPV81EZ1 (live Pages), UID-57YRGYJ5K6, UID-654AY5W9E1 +more |
| 2 | Weak PIN reject (111111/123456 block) | ✅ WORKING | three-users suite |
| 3 | Login / logout / re-login | ✅ WORKING | daily-login ×15 in lifecycle suite |
| 4 | `.crestline` recovery file export + import | ✅ WORKING | full_flow 108/0 |
| 5 | **REAL $20 deposit verify (on-chain scan + auto-approve)** | ✅ WORKING | "verified on blockchain & Auto-Approved!" — 2 real txs pai proven |
| 6 | **Ledger lo ORIGINAL txHash (full 66-char)** | ✅ WORKING | "VIP Pass Deposit (On-Chain Verified 0xb312…)" + strict hash match |
| 7 | 1 Wallet = 1 UID lock (real chain) | ✅ WORKING | referral reuse reject: "already locked to another UID" |
| 8 | VIP pass activation ($20 → 28 days) | ✅ WORKING | "VIP Day 0 of 28" real chain clock |
| 9 | Daily check-in +$1.00 | ✅ WORKING | day-0 claim real chain; ×15 days simulated 15/15 |
| 10 | Same-day double claim block | ✅ WORKING | "Already claimed today (+$1.00)" |
| 11 | **Prathi day ki own ledger entry id** | ✅ WORKING | 15 unique `tx-…-claim` ids |
| 12 | Friend invite (referral UID link) | ✅ WORKING | 2 referrals joined under main UID (real RPC) |
| 13 | Referral valid count (deposit+VIP ayithene count) | ✅ WORKING | refs=0 until VIP; mocked path refs=1 after VIP |
| 14 | Withdrawal eligibility engine (Day14+ & referral gate) | ✅ WORKING | correct block reason real chain lo: "1 Valid Referral required…" |
| 15 | $15 gross → $13.80 net · 8% fee policy | ✅ WORKING | net=13.8 fee=1.2 |
| 16 | Same-Wallet withdrawal policy | ✅ WORKING | different wallet reject |
| 17 | **Withdrawal AUTO-APPROVE (no admin step)** | ✅ WORKING | ledger `status: COMPLETED` instant |
| 18 | Wrong amount / wrong PIN withdraw reject | ✅ WORKING | full_flow |
| 19 | Account freeze avvakudadhu full lifecycle lo | ✅ WORKING | frozen:false confirmed |
| 20 | Dedicated seed-phrase wallet per user (BIP-39) | ✅ WORKING | 4 wallets generated, vault outside repo |

## 3) ADMIN RIGHTS — anni working ✅ (code H4DDX6, 16 PASS / 0 FAIL)

| # | Admin Feature | Status | Evidence |
|---|---|---|---|
| 1 | Owner 6-char passcode unlock | ✅ WORKING | sha256 hash match, console opens |
| 2 | Wrong code block + re-lock (Lock button) | ✅ WORKING | passcode gate returns |
| 3 | Live Amoy chain sync | ✅ WORKING | `Live #534426xx ~100ms` |
| 4 | Overview KPIs (users/referrers/withdrawals/frozen) | ✅ WORKING | renders |
| 5 | **AUTO BUCKET CREATION (Generate Bucket)** | ✅ WORKING | new buckets: `0x8B479A6C…`, `0xdbdaaf33…` ($140 cap, QUEUED) |
| 6 | One-time private-key custody prompt | ✅ WORKING | "Shown Once — Admin Custody Only" |
| 7 | Treasury 1/3 ÷ Payouts 2/3 split | ✅ WORKING | renders |
| 8 | Members / Random / Notices / Settings tabs | ✅ WORKING | all render |
| 9 | Publish Buckets / Broadcast Governance buttons | ⚠️ GAS-BLOCKED | signer `0x9be43bC4…cbae8` = 0 POL — Amoy POL vesthey work |
| 10 | Auto bucket rotation in daemon ($140 cap guard) | ✅ WORKING | `buckets 1 → 2` automated |

## 4) WEBSITE — kotha Chain Lab page (20 PASS / 0 FAIL)

- 💰 Profit calculator **NEW RULES**: 2 refs=$30 · 1 ref=$15 · 0 refs=$0; investment = admin-set VIP fee ✅
- 🏷️ VIP fee governance $20→$1 (andariki same fee display; on-chain memo prepared — gas pending) ✅
- 👥 Admin users list (**UID + referrer UID only**) + Ban/Unban · Freeze/Unfreeze · StopDay · Sim30d · Withdraw permissions ✅
- 📒 Per-user **View Ledger** (real tx links to polygonscan) ✅
- 🔐 CLM1 encrypted memo tool (AES-256-GCM; only mana site/app decrypt; node↔browser compatible) ✅
- 🏦 Admin withdrawal % → desired wallet (**address every time adugutundhi, store cheyyadhu**) + live pool balance + ERC-20 calldata ✅
- 🏦 Admin deposit → **$140 bucket split planner** ($500 → 4 buckets: 140+140+140+80) ✅

## 5) AUTOMATION SUITES (ee run lo malli execute chesinavi)

| Suite | PASS | FAIL | BLOCKED |
|---|---|---|---|
| browser_flow (UI flows ×4 apps) | 25 | 0 | 1 |
| full_flow (108 logic checks) | 108 | 0 | 6 |
| real_rpc_boot (real chain, no mocks) | 18 | 0 | 1 |
| seed_wallet_lifecycle (testnet+mainnet) | 34 | 0 | 0 |
| admin_console (H4DDX6) | 16 | 0 | 1 |
| three_users real-chain (main+2 refs) | 13 | 0 | 1 |
| external (live explorer/faucet) | 65 | 0 | 5 |
| faucet_deposit_e2e | 10 | 0 | 1 |
| chain_lab website | 20 | 0 | 0 |
| **TOTAL** | **309** | **0** | **16** |

+ auto_deposit_daemon: 7 cycles logged, 2 REAL faucet claims, auto bucket rotation proven.

## 6) 30-DAY ON-CHAIN SIMULATOR — ready, gas waiting ⚠️

- Admin permission gate ✅ (`qa/sim-permissions.json` — UID+referrer only; UID-G2BBMVCRRX ki allow30DaySim+canWithdraw granted)
- **Oka roju ki oka wallet** (30 wallets, one master seed, `m/44'/60'/0'/0/N`) ✅ — Amoy rate limit problem undadhu
- Prathi day memo lo **patha wallet address encrypted** ga untundhi (linked chain) ✅
- 30 encrypted memos prepared & decrypt-verified ✅
- ❌ Broadcast ki **POL gas kavali** (day-wallet ki ~0.002 POL) — funding plan ready, POL raagane `--broadcast` tho 30 real txs veltayi

## 7) BLOCKED / PENDING (honest)

1. **POL gas** — governance publish, 30-day memos, referral own-wallet deposits anni deeni meeda wait. POL faucets anni automation-blocked (Cloudflare/login/mainnet-balance gates). Meeru manually `0x9be43bC43b1b3e47f9507696101938EB830cbae8` ki POL pampithe antha unlock.
2. Referral real deposits — own funded wallets kavali (wallets vault lo ready).
3. Credentials-on-chain sync — app lo engine built-in, sponsor key+gas raagane active.
4. APKs old config (rebuild ~20 min setup).
