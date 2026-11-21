/**
 * Real-RPC boot & signup test — NO mocks, NO keys, NO funds.
 *
 * Serves the patched user bundles locally and drives them in Chromium against
 * the real public Polygon RPCs baked into the config:
 *   - testnet: https://polygon-amoy-bor-rpc.publicnode.com (chain 80002)
 *   - mainnet: https://polygon-bor-rpc.publicnode.com      (chain 137)
 *
 * Proves: app boots past the splash on a live chain, signup produces a UID and
 * recovery file, the dashboard renders the $20 deposit UI, and the shipped
 * testnet config no longer throws "USDT token contract address is not
 * configured" (fixed to Circle's official Amoy USDC, 6 decimals:
 * 0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582).
 *
 * It does NOT move funds: a real $20 deposit still needs a funded wallet.
 *
 * Run: node qa/real_rpc_boot_test.mjs   → qa/real-rpc-results.json
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TARGETS = [
  { id: '1-testnet-user', port: 4571, rpcHost: 'polygon-amoy-bor-rpc.publicnode.com' },
  { id: '3-mainnet-user', port: 4573, rpcHost: 'polygon-bor-rpc.publicnode.com' },
];
const results = [];
const ok = (name, cond, detail = '') => { results.push({ name, status: cond ? 'PASS' : 'FAIL', detail: String(detail).slice(0, 240) }); };
const blocked = (name, detail) => results.push({ name, status: 'BLOCKED', detail });

const servers = TARGETS.map(t => spawn(process.execPath, [path.join(ROOT, 'serve.mjs'), path.join(ROOT, t.id, 'www'), String(t.port)], { stdio: 'ignore' }));
await new Promise(r => setTimeout(r, 1200));
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });

try {
  for (const t of TARGETS) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 950 }, acceptDownloads: true });
    const page = await ctx.newPage();
    const errs = []; const rpcHosts = new Set();
    page.on('pageerror', e => errs.push(String(e).slice(0, 150)));
    page.on('request', r => { try { const u = new URL(r.url()); if (r.method() === 'POST' && /publicnode|drpc|1rpc/.test(u.hostname)) rpcHosts.add(u.hostname); } catch {} });

    await page.goto(`http://127.0.0.1:${t.port}/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForFunction(() => document.body.innerText.includes('USERNAME'), { timeout: 30000 }).catch(() => {});
    const boot = await page.locator('body').innerText();
    ok(`${t.id}: boots past splash on REAL RPC`, boot.includes('Sign In') && boot.includes('Create Account'), `len=${boot.length}`);
    ok(`${t.id}: real RPC host contacted`, [...rpcHosts].some(h => h === t.rpcHost), [...rpcHosts].join(','));

    await page.getByRole('button', { name: 'Create Account', exact: true }).first().click();
    await page.waitForTimeout(400);
    const form = page.locator('input');
    await form.nth(0).fill('qa_real_' + Date.now().toString(36));
    await form.nth(1).fill('ArenaQA2026!');
    await form.nth(2).fill('482910');
    if (await form.count() > 3) await form.nth(3).fill('');
    await page.getByRole('button', { name: /Create Account & Get Recovery File/i }).first().click();
    await page.waitForFunction(() => /Account created for UID-/.test(document.body.innerText), { timeout: 25000 }).catch(() => {});
    const created = await page.locator('body').innerText();
    ok(`${t.id}: signup on real chain produces UID`, /UID-[A-Z0-9]+/.test(created), (created.match(/UID-[A-Z0-9]+/) || [''])[0]);
    ok(`${t.id}: .crestline recovery + Time-Cipher offered`, created.includes('.crestline') && created.includes('Time-Cipher'));

    await page.getByRole('button', { name: /I Saved My File/i }).first().click().catch(() => {});
    await page.waitForTimeout(9000);
    const dash = await page.locator('body').innerText();
    ok(`${t.id}: dashboard renders on real chain`, dash.includes('Join VIP Membership') || dash.includes('Activate Membership'));
    ok(`${t.id}: $20 deposit / bucket / wallet-lock UI`, dash.includes('$20.00') && dash.includes('RESERVED DEPOSIT BUCKET'));
    ok(`${t.id}: NO "not configured" config error`, !dash.includes('not configured'));
    ok(`${t.id}: deposit QR / verify button present`, /Verify & Credit \$20 Deposit/.test(dash) && /OFFICIAL \$20\.00 USDT DEPOSIT QR/.test(dash));
    ok(`${t.id}: zero uncaught JS errors`, errs.length === 0, errs.slice(0, 2).join(' | '));
    await ctx.close();
  }
  blocked('Real $20 deposit credit on live chain', 'needs a funded wallet sending real tokens to the pool; no funds/keys are used by this suite');
} finally {
  await browser.close();
  servers.forEach(s => s.kill());
}

const counts = results.reduce((a, r) => (a[r.status] = (a[r.status] || 0) + 1, a), {});
console.log(`\nREAL-RPC BOOT: PASS ${counts.PASS || 0} · FAIL ${counts.FAIL || 0} · BLOCKED ${counts.BLOCKED || 0}`);
for (const r of results) console.log(`  ${r.status.padEnd(7)} ${r.name}${r.detail ? ' :: ' + r.detail : ''}`);
fs.writeFileSync(path.join(ROOT, 'qa', 'real-rpc-results.json'), JSON.stringify({ counts, results }, null, 2));
process.exit(counts.FAIL ? 1 : 0);
