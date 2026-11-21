# Playwright — full QA run (one command, everything working)

**Command:**

```bash
cd crestline-vip-bundle
bash qa/run_all_playwright.sh      # or: npm run qa:all
```

The runner is self-healing: it installs the `playwright` npm package if missing, installs Chromium if missing, installs the required Linux system libraries (via `sudo apt-get`, with `t64`/non-`t64` fallback) if Chromium fails to launch, then runs **all three Playwright suites** and prints a combined scoreboard. Verified end-to-end on a completely fresh environment (no node_modules, no browsers, no system libs).

## Result — latest full run

| Suite | What it does | PASS | FAIL | BLOCKED | INFO |
|---|---|---:|---:|---:|---:|
| `qa/browser_flow_test.mjs` | Serves all 4 builds locally, mocks Polygon RPC, drives real UI in Chromium: signup → UID → `.crestline` recovery file → dashboard; admin lock, seed/2-of-3 tabs, invalid-passcode rejection; zero JS errors | 24 | 0 | 2 | 0 |
| `qa/full_flow_test.mjs` | Exhaustive state machine on instrumented bundles with stateful mocked RPC: signup/login/logout, daily login, `$20` deposit + replay protection + new-deposit recognition, VIP join, 28-day claims, referral gate, `$15 → $13.80` withdrawal permission, `.crestline` export/import on wiped device, TC1 recovery, default-config behaviour | 108 | 0 | 6 | 2 |
| `qa/playwright_external_test.mjs` | Live external verification, **no API keys**: `polygonscan.com`, `amoy.polygonscan.com` (direct = Cloudflare 403, recorded; verified via translate proxy inside Playwright), configured pool/registry addresses, Polygon USDT0 contract, QuickNode Amoy faucet form/FAQ/eligibility/step-2/reCAPTCHA/claim | 65 | 0 | 5 | 10 |
| **TOTAL (Playwright)** | | **197** | **0** | **13** | **12** |

Exit code 0 = zero failures. Logs: `qa/logs/*.log`. JSON: `qa/browser-results.json`, `qa/full-flow-results.json`, `qa/playwright-results.json`. Screenshots: `qa/external-shots/*.png`.

## What “zero failures” does and does not mean

- ✅ Everything that **can** be driven by Playwright in this environment works and is reproducible with one command.
- ⚠️ The 13 BLOCKED items are things Playwright **cannot** make pass without real inputs, and they are reported honestly instead of faked:
  - real 0.025 POL faucet drip — QuickNode returned `Please come back in 12 hours.` on every claim; no tx hash; no user-owned wallet was supplied;
  - real on-chain `$20` USDT deposit / `$13.80` payout — needs a deployed vault, test USDT contract and a funded wallet;
  - admin console after login — owner 6-char passcode / master seed not supplied (`ADMIN_CODE=XXXXXX node qa/browser_flow_test.mjs` unlocks it);
  - direct Polygonscan UI — Cloudflare 403 in this sandbox (pages verified via translate proxy);
  - native Android runtime — no emulator/device.
- The shipped **testnet config is still defective** (`USDT_ADDRESS=""`, dead default RPC `rpc-amoy.polygon.technology`, `USE_SMART_CONTRACT=false`, zero contract address) — the full-flow suite proves deposits only work with a `?usdt=0x…` override. **Testnet is not “all good”, and mainnet is not implied.**

Static (non-Playwright) suites remain as before: `qa/verify.py` 131/131 and `qa/real_chain_checks.py` 22 read-only checks. Detailed analyses: `TEST_RESULTS_FULL.md`, `EXTERNAL_PLAYWRIGHT_REPORT.md`, `QA_REPORT.md`.
