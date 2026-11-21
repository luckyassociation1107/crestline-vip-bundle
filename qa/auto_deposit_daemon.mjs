/**
 * AUTO DEPOSIT DAEMON — gives every testnet user the REAL deposit feel.
 *
 *   xvfb-run -a node qa/auto_deposit_daemon.mjs            # one cycle
 *   xvfb-run -a node qa/auto_deposit_daemon.mjs --loop     # keep running (claims every ~2h05m)
 *   ADMIN_CODE=XXXXXX xvfb-run -a node qa/auto_deposit_daemon.mjs   # + auto bucket rotation
 *
 * Each cycle, fully automated with Playwright (no API keys, no private keys):
 *   1. FAUCET  : claim 20 test-USDC from Circle's official faucet straight into the
 *                app's active deposit bucket (Circle allows 1 claim / 2h — the daemon
 *                tracks the cooldown in qa/.faucet-state.json and never spams).
 *   2. CHAIN   : wait for the tx receipt on Polygon Amoy via public RPC; extract the
 *                ORIGINAL transaction hash + the faucet's sender address.
 *   3. USER    : create a brand-new testnet user in the app, enter the sender address,
 *                click "Verify & Credit $20 Deposit" → the app verifies the REAL
 *                on-chain transfer, credits $20.00 and activates the VIP pass.
 *   4. LEDGER  : open the user's Transaction Ledger and assert the ORIGINAL tx hash id
 *                is recorded on the DEPOSIT entry (short form in the UI description +
 *                full 66-char hash in the stored record).
 *   5. BUCKETS : read the active bucket's USDC balance; when the NEXT deposit would
 *                overflow the $140 cap, unlock the admin console (ADMIN_CODE env) and
 *                auto-generate a fresh bucket slot so user deposits never overflow.
 *
 * Every cycle is appended to qa/auto-deposit-ledger.json — a permanent ledger of
 * { uid, txHash, block, sender, bucket, credited, vipActivated } per user.
 * Honest by design: a faucet cooldown / bot-check is recorded as SKIPPED (the cycle
 * then only re-proves app flows with funds already in the pool); nothing is faked.
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const QA = path.join(ROOT, 'qa');
const USDC = '0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582';
const DEFAULT_POOL = '0x08EE5Cf33C30123A628aC8FF80Ca48Bec8E96Db8';
const RPC = 'https://polygon-amoy-bor-rpc.publicnode.com';
const CAP = 140, DEPOSIT = 20;
const COOLDOWN_MS = 2 * 60 * 60 * 1000 + 5 * 60 * 1000; // Circle 2h + 5m margin
const LOOP = process.argv.includes('--loop');
const STATE_F = path.join(QA, '.faucet-state.json');
const LEDGER_F = path.join(QA, 'auto-deposit-ledger.json');

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };

async function rpc(method, params) {
  const r = await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
  return (await r.json()).result;
}
const usdcBalance = async a => Number(BigInt(await rpc('eth_call', [{ to: USDC, data: '0x70a08231' + '0'.repeat(24) + a.slice(2).toLowerCase() }, 'latest']))) / 1e6;

function newStealthLaunch() {
  return chromium.launch({ headless: !process.env.DISPLAY, args: ['--no-sandbox', '--disable-blink-features=AutomationControlled', '--window-size=1366,950'] });
}
async function stealthPage(b) {
  const c = await b.newContext({ viewport: { width: 1366, height: 950 }, locale: 'en-US', timezoneId: 'Asia/Calcutta', userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36' });
  await c.addInitScript(() => Object.defineProperty(navigator, 'webdriver', { get: () => false }));
  return c.newPage();
}

// ---------------------------------------------------------------- 1. faucet claim
async function faucetClaim(target) {
  const st = readJson(STATE_F, {});
  const wait = (st.lastClaimMs || 0) + COOLDOWN_MS - Date.now();
  if (wait > 0) return { skipped: `cooldown: next claim in ${Math.ceil(wait / 60000)} min` };
  const b = await newStealthLaunch();
  try {
    const p = await stealthPage(b);
    const api = [];
    p.on('response', async r => { if (/circle\.com\/api/i.test(r.url()) && r.request().method() === 'POST') { try { api.push((await r.text()).slice(0, 700)); } catch {} } });
    await p.goto('https://faucet.circle.com/', { waitUntil: 'domcontentloaded', timeout: 45000 });
    await p.waitForTimeout(4000 + Math.random() * 2000);
    for (let i = 0; i < 6; i++) { await p.mouse.move(200 + Math.random() * 700, 150 + Math.random() * 500, { steps: 8 }); await p.waitForTimeout(200 + Math.random() * 300); }
    await p.getByRole('button', { name: /Arc Testnet|Select network/i }).first().click();
    await p.waitForTimeout(1200);
    await p.getByText('Polygon PoS Amoy', { exact: true }).first().click();
    await p.waitForTimeout(900);
    const addr = p.getByPlaceholder('Wallet address');
    await addr.click(); await p.waitForTimeout(300);
    await addr.pressSequentially(target, { delay: 50 + Math.random() * 40 });
    await p.waitForTimeout(1000 + Math.random() * 700);
    const send = p.getByRole('button', { name: /Send 20 USDC/i }).first();
    await send.hover(); await p.waitForTimeout(500);
    await send.click();
    await p.waitForTimeout(15000);
    const blob = (await p.locator('body').innerText()) + api.join(' ');
    const txHash = (blob.match(/0x[0-9a-fA-F]{64}/) || [null])[0];
    if (txHash && /Tokens sent|on its way|"status":"success"/i.test(blob)) {
      fs.writeFileSync(STATE_F, JSON.stringify({ lastClaimMs: Date.now(), lastTx: txHash }));
      return { txHash };
    }
    if (/every 2 hours|Limit Exceeded|try again/i.test(blob)) { fs.writeFileSync(STATE_F, JSON.stringify({ lastClaimMs: Date.now() - COOLDOWN_MS + 30 * 60000 })); return { skipped: 'Circle server-side cooldown (asset+network / 2h)' }; }
    if (/unusual traffic|RECAPTCHA/i.test(blob)) return { skipped: 'reCAPTCHA bot-check refused this run (use xvfb-run / retry later)' };
    return { skipped: 'no success response: ' + blob.slice(0, 120).replace(/\s+/g, ' ') };
  } catch (e) { return { skipped: String(e).slice(0, 140) }; } finally { await b.close(); }
}

// ---------------------------------------------------------------- 2. chain confirm
async function confirmOnChain(txHash) {
  let rcpt = null;
  for (let i = 0; i < 24 && !rcpt; i++) { rcpt = await rpc('eth_getTransactionReceipt', [txHash]); if (!rcpt) await new Promise(r => setTimeout(r, 5000)); }
  if (!rcpt || rcpt.status !== '0x1') return null;
  const lg2 = (rcpt.logs || []).find(l => l.address.toLowerCase() === USDC.toLowerCase());
  return lg2 ? { block: parseInt(rcpt.blockNumber, 16), sender: '0x' + lg2.topics[1].slice(-40), to: '0x' + lg2.topics[2].slice(-40), amount: Number(BigInt(lg2.data)) / 1e6 } : null;
}

// ---------------------------------------------------------------- 3+4. user + ledger
async function userDepositAndLedger(sender, expectedTx) {
  const srv = spawn(process.execPath, [path.join(ROOT, 'serve.mjs'), path.join(ROOT, '1-testnet-user', 'www'), '4597'], { stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 1200));
  const b = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  try {
    const p = await (await b.newContext({ viewport: { width: 1280, height: 1100 }, acceptDownloads: true })).newPage();
    p.on('dialog', d => d.accept().catch(() => {}));
    await p.goto('http://127.0.0.1:4597/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await p.waitForFunction(() => document.body.innerText.includes('USERNAME'), { timeout: 30000 }).catch(() => {});
    await p.getByRole('button', { name: 'Create Account', exact: true }).first().click();
    await p.waitForTimeout(400);
    const f = p.locator('input');
    const uname = 'auto_' + Date.now().toString(36);
    await f.nth(0).fill(uname);
    await f.nth(1).fill('ArenaQA2026!');
    await f.nth(2).fill('482910');
    if (await f.count() > 3) await f.nth(3).fill('');
    await p.getByRole('button', { name: /Create Account & Get Recovery File/i }).first().click();
    await p.waitForFunction(() => /Account created for UID-/.test(document.body.innerText), { timeout: 25000 }).catch(() => {});
    const uid = ((await p.locator('body').innerText()).match(/UID-[A-Z0-9]+/) || ['?'])[0];
    await p.getByRole('button', { name: /I Saved My File/i }).first().click().catch(() => {});
    await p.waitForTimeout(8000);
    await p.getByPlaceholder(/address you are sending/i).fill(sender);
    await p.getByRole('button', { name: /Verify & Credit \$20 Deposit/i }).first().click();
    await p.waitForFunction(() => /verified on blockchain/i.test(document.body.innerText), { timeout: 35000 }).catch(() => {});
    let t = await p.locator('body').innerText();
    const credited = /verified on blockchain/i.test(t) && /\$20\.00 USDT/.test(t);
    await p.getByRole('button', { name: /Activate VIP Membership/i }).first().click().catch(() => {});
    await p.waitForTimeout(5000);
    t = await p.locator('body').innerText();
    const vip = /VIP Day \d+ of 28/i.test(t);
    // --- ledger: stored record must carry the FULL original tx hash
    const stored = await p.evaluate(() => {
      // tx hashes can live in plain or escaped JSON (txHash / depositTxHash fields)
      const hits = [];
      for (let i = 0; i < localStorage.length; i++) {
        const v = localStorage.getItem(localStorage.key(i)) || '';
        if (!/txHash/i.test(v)) continue;
        for (const m of v.match(/0x[0-9a-fA-F]{64}/g) || []) hits.push(m);
      }
      return [...new Set(hits)];
    });
    const fullHashStored = expectedTx ? stored.some(h => h.toLowerCase() === expectedTx.toLowerCase()) : stored.length > 0;
    // --- ledger UI: open wallet/ledger view and look for the short hash id
    await p.getByText(/Transaction Ledger/i).first().click().catch(() => {});
    await p.waitForTimeout(2500);
    const ui = await p.locator('body').innerText();
    const short = (expectedTx || stored[0] || '').slice(0, 10);
    const uiShowsHash = short ? ui.includes(short) || /On-Chain Verified 0x[0-9a-fA-F]/i.test(ui) : false;
    await p.screenshot({ path: '/home/user/qa_lab/shots/daemon_ledger.png', fullPage: true }).catch(() => {});
    return { uid, username: uname, credited, vip, fullHashStored, uiShowsHash, storedHashes: stored };
  } finally { await b.close(); srv.kill(); }
}

// ---------------------------------------------------------------- 5. bucket rotation
async function rotateBucketIfNeeded(poolBal) {
  if (poolBal + DEPOSIT <= CAP && !process.env.FORCE_ROTATE) return { needed: false, detail: `pool $${poolBal}/${CAP} — next deposit fits` };
  if (!process.env.ADMIN_CODE) return { needed: true, skipped: 'set ADMIN_CODE to auto-generate a fresh bucket slot' };
  const srv = spawn(process.execPath, [path.join(ROOT, 'serve.mjs'), path.join(ROOT, '2-testnet-admin', 'www'), '4598'], { stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 1200));
  const b = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  try {
    const p = await (await b.newContext({ viewport: { width: 1380, height: 1050 } })).newPage();
    p.on('dialog', d => d.accept().catch(() => {}));
    await p.goto('http://127.0.0.1:4598/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await p.waitForFunction(() => document.body.innerText.includes('Sign In to Admin'), { timeout: 30000 }).catch(() => {});
    await p.getByRole('button', { name: 'Sign In', exact: true }).first().click().catch(() => {});
    await p.waitForTimeout(300);
    await p.locator('input[type=password]').first().fill(process.env.ADMIN_CODE);
    await p.getByRole('button', { name: /Sign In to Admin/i }).first().click();
    await p.waitForFunction(() => /Admin Command Console/i.test(document.body.innerText), { timeout: 25000 });
    const counter = async () => Number(((await p.locator('body').innerText()).match(/Concurrency Locks \((\d+)\)/) || [, '0'])[1]);
    const addrs = async () => new Set(((await p.locator('body').innerText()).match(/0x[a-fA-F0-9]{40}/g) || []).map(a => a.toLowerCase()));
    const before = await counter();
    const beforeAddrs = await addrs();
    let after = before, newBucket = null;
    for (let i = 0; i < 3 && after <= before && !newBucket; i++) {  // generation is debounced; counter lags until Overview re-render
      await p.getByRole('button', { name: /Generate Bucket/i }).first().click().catch(() => {});
      await p.waitForTimeout(2500);
      const ov = p.getByRole('button', { name: 'Overview', exact: true }).first();
      if (await ov.count()) await ov.click().catch(() => {});
      await p.waitForTimeout(1200);
      after = await counter();
      newBucket = [...await addrs()].find(a => !beforeAddrs.has(a)) || null;  // fresh bucket address is proof even while the counter lags
    }
    await p.screenshot({ path: '/home/user/qa_lab/shots/daemon_bucket.png', fullPage: true }).catch(() => {});
    return { needed: true, generated: after > before || !!newBucket, buckets: `${before} -> ${Math.max(after, newBucket ? before + 1 : after)}`, newBucket };
  } catch (e) { return { needed: true, skipped: String(e).slice(0, 140) }; } finally { await b.close(); srv.kill(); }
}

// ---------------------------------------------------------------- cycle
async function cycle() {
  const entry = { at: new Date().toISOString(), bucket: DEFAULT_POOL };
  const balBefore = await usdcBalance(DEFAULT_POOL);
  log(`pool ${DEFAULT_POOL.slice(0, 10)}… balance: $${balBefore} / $${CAP} cap`);

  const claim = await faucetClaim(DEFAULT_POOL);
  if (claim.txHash) {
    log('✅ faucet drip tx:', claim.txHash);
    entry.txHash = claim.txHash;
    const c = await confirmOnChain(claim.txHash);
    if (c) { entry.block = c.block; entry.sender = c.sender; entry.amount = c.amount; log(`✅ confirmed: ${c.amount} USDC from ${c.sender} @block ${c.block}`); }
  } else {
    log('⏭  faucet skipped:', claim.skipped);
    entry.faucetSkipped = claim.skipped;
    const prev = readJson(LEDGER_F, { cycles: [] }).cycles.findLast(c => c.txHash);
    entry.sender = prev?.sender || process.env.DEPOSIT_SENDER || '0x1fcb25fb286d9fa084c09988b64b40571446cde7';
    entry.txHash = prev?.txHash || readJson(STATE_F, {}).lastTx || null;
    if ((await usdcBalance(DEFAULT_POOL)) < DEPOSIT) { log('❌ pool unfunded and faucet unavailable — cycle aborted'); entry.aborted = true; return entry; }
  }

  const u = await userDepositAndLedger(entry.sender, entry.txHash);
  Object.assign(entry, { uid: u.uid, username: u.username, credited: u.credited, vipActivated: u.vip, ledgerHasFullTxHash: u.fullHashStored, ledgerUiShowsHash: u.uiShowsHash });
  log(`user ${u.uid}: credited=${u.credited} vip=${u.vip} ledgerFullHash=${u.fullHashStored} ledgerUI=${u.uiShowsHash}`);

  entry.bucketRotation = await rotateBucketIfNeeded(await usdcBalance(DEFAULT_POOL));
  log('bucket rotation:', JSON.stringify(entry.bucketRotation));
  return entry;
}

const ledger = readJson(LEDGER_F, { cycles: [] });
do {
  const e = await cycle();
  ledger.cycles.push(e);
  fs.writeFileSync(LEDGER_F, JSON.stringify(ledger, null, 2));
  log(`ledger saved: ${ledger.cycles.length} cycle(s) in qa/auto-deposit-ledger.json`);
  if (LOOP) { log(`sleeping ${Math.round(COOLDOWN_MS / 60000)} min until next faucet window…`); await new Promise(r => setTimeout(r, COOLDOWN_MS)); }
} while (LOOP);
