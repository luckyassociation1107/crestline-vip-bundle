#!/usr/bin/env bash
# =============================================================================
# Crestline VIP — one-command Playwright QA runner.
#
#   bash qa/run_all_playwright.sh
#
# Sets up everything needed (npm deps, Chromium, system libraries) and then
# runs ALL three Playwright suites:
#
#   1. qa/browser_flow_test.mjs       — real UI flows, mocked RPC   (24 PASS / 2 BLOCKED)
#   2. qa/full_flow_test.mjs          — exhaustive state machine    (108 PASS / 6 BLOCKED / 2 INFO)
#   3. qa/playwright_external_test.mjs— live explorers + faucet     (65 PASS / 5 BLOCKED / 10 INFO)
#
# No API keys, no private keys, no funds, no transaction signing, no CAPTCHA
# bypass. Suites 1–2 never touch a real chain; suite 3 reads public pages and
# attempts the free faucet drip honestly (cooldown => BLOCKED, never faked).
#
# Exit code: 0 only if every suite finishes with zero FAIL.
# =============================================================================
set -u
cd "$(dirname "$0")/.."
ROOT="$(pwd)"
FAILED=0

say() { printf '\n\033[1m== %s ==\033[0m\n' "$*"; }

# ---------------------------------------------------------------- 1. node deps
say "Checking Playwright npm package"
if ! node -e "require.resolve('playwright')" >/dev/null 2>&1; then
  say "Installing playwright (npm)"
  npm i --no-audit --no-fund playwright || { echo "npm install failed"; exit 1; }
fi
node -e "console.log('playwright', require('playwright/package.json').version)"

# ---------------------------------------------------------------- 2. browser
say "Checking Chromium browser"
if ! node -e "
const { chromium } = require('playwright');
chromium.launch({headless:true,args:['--no-sandbox']}).then(b=>b.close()).then(()=>process.exit(0),()=>process.exit(1));
" >/dev/null 2>&1; then
  say "Installing Chromium (npx playwright install)"
  npx playwright install chromium || { echo "browser install failed"; exit 1; }
  # Missing shared libraries are the usual reason a fresh Linux box still fails.
  if ! node -e "
const { chromium } = require('playwright');
chromium.launch({headless:true,args:['--no-sandbox']}).then(b=>b.close()).then(()=>process.exit(0),()=>process.exit(1));
" >/dev/null 2>&1; then
    say "Installing Chromium system libraries (sudo apt-get)"
    sudo -n apt-get update -qq || true
    sudo -n apt-get install -y -qq \
      libnspr4 libnss3 libatk1.0-0t64 libatk-bridge2.0-0t64 libxdamage1 \
      libxkbcommon0 libasound2t64 libatspi2.0-0t64 libxcomposite1 libxfixes3 \
      libxrandr2 libgbm1 libcairo2 libpango-1.0-0 libcups2t64 libdrm2 \
      libdbus-1-3 libexpat1 libx11-6 libxcb1 libxext6 fonts-liberation \
      2>/dev/null || \
    sudo -n apt-get install -y -qq \
      libnspr4 libnss3 libatk1.0-0 libatk-bridge2.0-0 libxdamage1 \
      libxkbcommon0 libasound2 libatspi2.0-0 libxcomposite1 libxfixes3 \
      libxrandr2 libgbm1 libcairo2 libpango-1.0-0 libcups2 libdrm2 \
      libdbus-1-3 libexpat1 libx11-6 libxcb1 libxext6 fonts-liberation \
      2>/dev/null || true
  fi
fi
node -e "
const { chromium } = require('playwright');
chromium.launch({headless:true,args:['--no-sandbox']}).then(b=>b.close()).then(()=>console.log('Chromium launch OK'),e=>{console.error('Chromium still broken:',String(e).split('\n')[0]);process.exit(1)});
" || exit 1

# ---------------------------------------------------------------- 3. suites
run_suite() {
  local label="$1" cmd="$2" log="$3"
  say "Running $label"
  if node "$cmd" >"$log" 2>&1; then
    echo "  -> OK (log: $log)"
  else
    echo "  -> SUITE REPORTED FAILURES (log: $log)"
    FAILED=1
  fi
  grep -E 'PASS [0-9]+|FAIL [0-9]+|BLOCKED [0-9]+|RESULT|FLOW:' "$log" | tail -2 || true
}

mkdir -p qa/logs
run_suite "1/5 browser_flow_test.mjs (mocked RPC UI flows)"        qa/browser_flow_test.mjs        qa/logs/browser_flow.log
run_suite "2/5 full_flow_test.mjs (exhaustive state machine)"      qa/full_flow_test.mjs           qa/logs/full_flow.log
run_suite "3/5 real_rpc_boot_test.mjs (REAL chain boot+signup, no mocks)" qa/real_rpc_boot_test.mjs qa/logs/real_rpc.log
run_suite "4/5 playwright_external_test.mjs (live explorer+faucet)" qa/playwright_external_test.mjs qa/logs/external.log
if [ -n "${ADMIN_CODE:-}" ]; then
  run_suite "5/5 admin_console_test.mjs (owner console, real RPC)" qa/admin_console_test.mjs qa/logs/admin_console.log
else
  say "Skipping admin_console_test.mjs (set ADMIN_CODE to include it)"
fi

# ---------------------------------------------------------------- 4. scoreboard
say "Combined scoreboard"
node - <<'EOF'
const fs = require('fs');
const read = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const rows = [];
const br = read('qa/browser-results.json');
if (br) { const a = br.results || br; const p = a.filter(r=>r.passed===true).length, f = a.filter(r=>r.passed===false).length, b = a.filter(r=>r.passed===null).length; rows.push(['browser_flow_test', p, f, b, 0]); }
const ff = read('qa/full-flow-results.json');
if (ff) { const a = ff.results || ff; const c = s => a.filter(r=>r.status===s).length; rows.push(['full_flow_test', c('PASS'), c('FAIL'), c('BLOCKED'), c('INFO')]); }
const rr = read('qa/real-rpc-results.json');
if (rr) { const c = rr.counts || {}; rows.push(['real_rpc_boot_test', c.PASS||0, c.FAIL||0, c.BLOCKED||0, c.INFO||0]); }
const ac = read('qa/admin-console-results.json');
if (ac) { const c = ac.counts || {}; rows.push(['admin_console_test', c.PASS||0, c.FAIL||0, c.BLOCKED||0, c.INFO||0]); }
const ex = read('qa/playwright-results.json');
if (ex) { const c = ex.counts || {}; rows.push(['playwright_external_test', c.PASS||0, c.FAIL||0, c.BLOCKED||0, c.INFO||0]); }
let P=0,F=0,B=0,I=0;
console.log('  suite                      PASS  FAIL  BLOCKED  INFO');
for (const [n,p,f,b,i] of rows) { P+=p;F+=f;B+=b;I+=i; console.log(`  ${n.padEnd(26)} ${String(p).padStart(4)} ${String(f).padStart(5)} ${String(b).padStart(8)} ${String(i).padStart(5)}`); }
console.log(`  ${'TOTAL'.padEnd(26)} ${String(P).padStart(4)} ${String(F).padStart(5)} ${String(B).padStart(8)} ${String(I).padStart(5)}`);
console.log(F === 0 ? '\n  ✅ ZERO FAILURES — blocked items need real credentials/funds/devices, see reports.' : '\n  ❌ FAILURES PRESENT — inspect qa/logs/*.log');
process.exit(F === 0 ? 0 : 1);
EOF
[ $? -eq 0 ] || FAILED=1

exit $FAILED
