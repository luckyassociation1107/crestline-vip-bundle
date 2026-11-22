# Merge report — LimeWire workspace bundle → `crestline-vip-bundle`

**Date:** 2026-11-22 (IST) · **Branch:** `main`

## Source
- LimeWire share `https://limewire.com/d/fQzhl#0v3vXP736Q`
- Archive `workspace-01a201c5-edda-74ef-8c75-3b1a072fd6c4.zip` — 75,711,841 bytes, CRC clean, 758 entries (~75.5 MB uncompressed)

## What was merged
| From bundle | Destination | Notes |
|---|---|---|
| `crestline_bundle/qa_lab/**` (169 files) | `qa_lab/` | QA lab: Playwright probe scripts, DOM dumps, stdout logs, 80 screenshots (18 MB) |
| `tools/limewire_decrypt.mjs` | `tools/limewire_decrypt.mjs` | LimeWire E2E decryption helper |
| — | `.github/workflows/build-apks.yml` | New CI: builds + signs the 4 APKs, attaches to release on `v*` tags |

## What was intentionally **not** merged
- **App source (`1-testnet-user`, `2-testnet-admin`, `3-mainnet-user`, `4-mainnet-admin`) and `docs/`** — the repo is identical to the bundle here **except 6 JS files (×3 copies) + 2 docs copies** that commit `b50febe` ("Update workflow: /bin/bash fee, no daily check-ins, 0 instant withdraw, +0 on 1st ref, +/ref from 2nd ref") deliberately changed *after* the bundle was made. The repo version (newer) was kept.
- **Root reports** (`README.md`, `QA_REPORT.md`, `TEST_RESULTS_FULL.md`, `PLAYWRIGHT_ALL_REPORT.md`, `EXTERNAL_PLAYWRIGHT_REPORT.md`) — already identical in repo.
- **`apk_out/` (4 signed APKs)** — `.gitignore` excludes `*.apk` (they'd bloat the repo by ~4.4 MB per version). Build them via the new workflow instead.
- **`toolchain/` (incl. `crestline-qa-release.jks`), `android-sdk/`, `.config/`, `downloads/`, `.sudo_as_admin_successful`** — build tooling and a signing keystore; never commit to a public repo.
- **`crestline_bundle/qa/logs/`** — already ignored by the repo's `.gitignore`.

## 🔒 Secrets redacted before upload (IMPORTANT)
This repo is **public**. Two files in `qa_lab/` contained live testnet wallet material:
- `qa_lab/faucet_wallets.json` — `privateKey` + `mnemonic` fields
- `qa_lab/seed_wallets.json` — `mnemonic` fields

Every value was replaced with the literal string `[REDACTED_BY_MERGE]`; field structure was preserved so scripts still parse. **Originals exist only in the local extracted copy** — if you need those wallets, recover them from the bundle, not GitHub.

`crestline-qa-release.jks` + its store password (`SIGNING_INFO.md`) were **not** uploaded. A deeper scan found no other 64-hex private keys — the remaining `0x…` strings are public block-explorer tx hashes.

## APK signing — next step
The workflow expects two repo secrets:
1. `CRESTLINE_KEYSTORE_B64` — `base64 -w0 crestline-qa-release.jks`
2. `CRESTLINE_STORE_PASS` — the QA store password

Set them at: `Settings → Secrets and variables → Actions`.

## Source drift note
The bundle's nested `.git` was still pointed at the old `GAMBLING-PRO-AI/crestline-vip-bundle` (now 404) at commit `313d9cd`, while this repo's `main` is at `b50febe` (repo-only workflow change). The bundle is otherwise a superset.
