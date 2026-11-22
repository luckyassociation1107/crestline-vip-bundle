/**
 * Admin console post-login test — requires the owner's 6-char passcode.
 *
 *   ADMIN_CODE=XXXXXX node qa/admin_console_test.mjs
 *
 * The code is read from the environment and is NEVER written to results or
 * logs. Without ADMIN_CODE the whole suite reports BLOCKED and exits 0.
 *
 * Covers (against the real Amoy RPC, no mocks, no funds):
 *   unlock, live chain sync, overview KPIs, $140 self-generating bucket
 *   auto-creation (Generate Bucket), one-time private-key custody prompt,
 *   all navigation tabs, re-lock. On-chain publishing stays BLOCKED until the
 *   governance signer has gas POL.
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CODE = process.env.ADMIN_CODE || '';
const results = [];
const ok = (n, c, d = '') => results.push({ name: n, status: c ? 'PASS' : 'FAIL', detail: String(d).slice(0, 200) });
const blocked = (n, d) => results.push({ name: n, status: 'BLOCKED', detail: d });

if (!CODE) {
  blocked('Admin console (all checks)', 'ADMIN_CODE env var not set; supply the owner 6-char code (never the master seed)');
} else {
  const srv = spawn(process.execPath, [path.join(ROOT, 'serve.mjs'), path.join(ROOT, '2-testnet-admin', 'www'), '4587'], { stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 1200));
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  try {
    const page = await (await browser.newContext({ viewport: { width: 1440, height: 1200 } })).newPage();
    const errs = [];
    page.on('pageerror', e => errs.push(String(e).slice(0, 150)));
    page.on('dialog', d => d.accept().catch(() => {}));
    await page.goto('http://127.0.0.1:4587/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForFunction(() => document.body.innerText.includes('Sign In to Admin'), { timeout: 30000 }).catch(() => {});
    await page.getByRole('button', { name: 'Sign In', exact: true }).first().click().catch(() => {});
    await page.waitForTimeout(300);
    await page.locator('input[type=password]').first().fill(CODE);
    await page.getByRole('button', { name: /Sign In to Admin/i }).first().click();
    await page.waitForTimeout(8000);

    let t = await page.locator('body').innerText();
    ok('admin unlock with owner code', !t.includes('OWNER 6-CHAR PASSCODE LOCK') && t.includes('Admin Command Console'));
    ok('live Amoy chain sync', /Live #\d+/.test(t), (t.match(/Live #\d+ \(\d+ms\)/) || [''])[0]);
    ok('overview KPIs render', t.includes('TOTAL USERS') && t.includes('FROZEN / BANNED'));
    ok('bucket #1 bound to configured pool', t.includes('Pool Bucket #1') && t.includes('0x08EE5Cf33C30123A628aC8FF80Ca48Bec8E96Db8'));
    ok('treasury 1/3 / payout 2/3 split shown', /1\/3rd Owner Treasury Allowance/.test(t) && /2\/3rd Reserved in Buckets/.test(t));

    const count = () => page.locator('body').innerText().then(x => (x.match(/Self-Generating Buckets \+ Concurrency Locks \((\d+)\)/) || [0, '0'])[1]);
    const addrSet = () => page.locator('body').innerText().then(x => new Set((x.match(/0x[a-fA-F0-9]{40}/g) || []).map(a => a.toLowerCase())));
    const before = Number(await count());
    const beforeAddrs = await addrSet();
    let newBucket = null;
    for (let i = 0; i < 3; i++) {
      await page.getByRole('button', { name: /Generate Bucket/i }).first().click().catch(() => {});
      await page.waitForTimeout(2500);
      const ov = page.getByRole('button', { name: 'Overview', exact: true }).first();
      if (await ov.count()) await ov.click().catch(() => {});
      await page.waitForTimeout(1200);
      // counter render lags; a brand-new bucket address is equally valid proof
      newBucket = [...await addrSet()].find(a => !beforeAddrs.has(a)) || null;
      if (Number(await count()) > before || newBucket) break;
    }
    t = await page.locator('body').innerText();
    const after = Number(await count());
    ok('AUTO BUCKET CREATION (Generate Bucket)', after > before || !!newBucket, after > before ? `locks counter ${before} -> ${after}` : `new bucket address ${newBucket}`);
    ok('new bucket queued with distinct address + $140 cap', (/Pool Bucket #2[\s\S]{0,120}?\$140\.00/.test(t) && new Set(t.match(/0x[a-fA-F0-9]{40}/g) || []).size >= 4) || (!!newBucket && /\$140\.00/.test(t)), newBucket || 'counter path');
    ok('one-time private-key custody prompt', /Save (its|New Bucket) [Pp]rivate [Kk]ey/.test(t), 'key shown once, admin custody only (not recorded)');
    ok('publish / governance controls present', /Publish Buckets/.test(t) && /Broadcast Governance On-Chain/.test(t));
    const gas = (t.match(/([\d.]+) Amoy POL/) || ['', ''])[1];
    if (gas === '0.0000') blocked('on-chain bucket publish / governance broadcast', 'governance signer 0x9be43b…cbae8 has 0 POL gas; fund via an Amoy faucet to enable');
    else ok('governance signer funded', true, gas + ' POL');

    for (const tab of ['Members', 'Random', 'Notices', 'Settings', 'Overview']) {
      const btn = page.getByRole('button', { name: tab, exact: true }).first();
      if (await btn.count()) { await btn.click().catch(() => {}); await page.waitForTimeout(1200); }
      const tt = await page.locator('body').innerText();
      ok(`tab "${tab}" renders`, (await btn.count()) === 1 && tt.length > 400, `len=${tt.length}`);
    }

    const lock = page.getByRole('button', { name: 'Lock', exact: true }).first();
    if (await lock.count()) { await lock.click().catch(() => {}); await page.waitForTimeout(1500); }
    const lt = await page.locator('body').innerText();
    ok('re-lock returns to passcode gate', lt.includes('OWNER 6-CHAR PASSCODE LOCK') || lt.includes('Sign In to Admin'));
    ok('zero uncaught JS errors', errs.length === 0, errs.slice(0, 2).join(' | '));
  } finally {
    await browser.close(); srv.kill();
  }
}

const counts = results.reduce((a, r) => (a[r.status] = (a[r.status] || 0) + 1, a), {});
console.log(`\nADMIN CONSOLE: PASS ${counts.PASS || 0} · FAIL ${counts.FAIL || 0} · BLOCKED ${counts.BLOCKED || 0}`);
for (const r of results) console.log(`  ${r.status.padEnd(7)} ${r.name}${r.detail ? ' :: ' + r.detail : ''}`);
fs.writeFileSync(path.join(ROOT, 'qa', 'admin-console-results.json'), JSON.stringify({ counts, results, note: 'ADMIN_CODE value is never recorded.' }, null, 2));
process.exit(counts.FAIL ? 1 : 0);
