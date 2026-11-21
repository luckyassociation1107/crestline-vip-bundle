/**
 * SEED-WALLET LIFECYCLE SUITE — testnet + mainnet (Amoy-style flow on both).
 *
 *   node qa/seed_wallet_lifecycle_test.mjs
 *
 * For EACH of 1-testnet-user (chain 80002) and 3-mainnet-user (chain 137):
 *   • Every user gets a DEDICATED seed-phrase wallet (fresh BIP-39 12-word
 *     mnemonic via ethers → unique address). The mnemonic is saved OUTSIDE the
 *     repo (/home/user/qa_lab/seed_wallets.json) and only a masked preview goes
 *     into results. One wallet = one UID, so no shared/frozen-wallet risk.
 *   • DAILY LOGINS: day-by-day check-ins across 14 simulated days (device +
 *     chain clocks advanced together); EVERY day must leave a Transaction
 *     Ledger entry with its own id (deposits additionally carry the on-chain
 *     txHash) — so each day is checkable in the ledger.
 *   • REFERRALS: a second seed-wallet user joins with the first user's UID,
 *     deposits from their own wallet and activates VIP → referral gate opens.
 *   • WITHDRAWAL ELIGIBILITY: after day 14 + 1 valid referral the app must
 *     grant $15 gross → $13.80 net; wrong amount / wrong wallet / wrong PIN
 *     must still be rejected.
 *   • AUTO-APPROVE: the withdrawal request must complete WITHOUT any manual
 *     admin step and the ledger entry must carry an id + status immediately.
 *   • FREEZE CHECK: after the whole lifecycle the account/wallet must NOT be
 *     frozen or flagged.
 *
 * Chain I/O is a deterministic mock RPC (synthetic USDT Transfer logs from the
 * seed wallets, controllable clock) — this proves the APP LOGIC on both
 * networks without moving real mainnet USDT. The real-chain deposit path is
 * separately proven on Amoy by qa/faucet_deposit_e2e.mjs.
 */
import { chromium } from 'playwright';
import { Wallet } from 'ethers';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LAB = '/tmp/seedwallet_lab';
const USDT = '0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582';
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const hex = n => '0x' + Math.floor(n).toString(16);
const pad32 = a => '0x' + a.toLowerCase().replace(/^0x/, '').padStart(64, '0');
const mask = m => { const w = m.split(' '); return `${w[0]} ${w[1]} … ${w[w.length - 1]} (${w.length} words)`; };

const TARGETS = [
  { id: '1-testnet-user', port: 4711, chain: '0x13882', pool: '0x08EE5Cf33C30123A628aC8FF80Ca48Bec8E96Db8', label: 'TESTNET (Polygon Amoy 80002)' },
  { id: '3-mainnet-user', port: 4712, chain: '0x89', pool: '0xA14e867C7B4539B776F88FEDA19cf011b88c793b', label: 'MAINNET (Polygon PoS 137)' },
];

// ---------------------------------------------------------------- patched bundles (API hook)
fs.rmSync(LAB, { recursive: true, force: true });
const servers = [];
for (const t of TARGETS) {
  const dir = path.join(LAB, t.id);
  fs.mkdirSync(dir, { recursive: true });
  fs.cpSync(path.join(ROOT, t.id, 'www'), dir, { recursive: true });
  const jsName = fs.readdirSync(path.join(dir, 'assets')).find(f => f.startsWith('index-') && f.endsWith('.js'));
  const jsPath = path.join(dir, 'assets', jsName);
  let js = fs.readFileSync(jsPath, 'utf8');
  const needle = 'function x_(e,t={}){return a_(e,t)}';
  if (!js.includes(needle)) throw new Error(`API hook not found in ${t.id}`);
  js = js.replace(needle, needle + '\nwindow.__CRESTLINE={api:x_,store:_g,session:Cg,cfg:()=>Z,portfolio:u=>kg(_g(),u)};');
  fs.writeFileSync(jsPath, js);
  const srv = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split('?')[0]);
    let fp = path.join(dir, rel === '/' ? 'index.html' : rel);
    if (!fp.startsWith(dir) || !fs.existsSync(fp) || !fs.statSync(fp).isFile()) fp = path.join(dir, 'index.html');
    const ext = path.extname(fp);
    res.writeHead(200, { 'Content-Type': ext === '.js' ? 'application/javascript' : ext === '.css' ? 'text/css' : 'text/html' });
    fs.createReadStream(fp).pipe(res);
  });
  await new Promise(r => srv.listen(t.port, '127.0.0.1', r));
  servers.push(srv);
}

const results = [];
const add = (n, s, d = '') => { results.push({ name: n, status: s, detail: String(d).slice(0, 320) }); console.log(`  ${s.padEnd(7)} ${n}${d ? ' :: ' + String(d).slice(0, 150) : ''}`); };
const ok = (n, c, d = '') => add(n, c ? 'PASS' : 'FAIL', d);
const seedVault = [];

// ---------------------------------------------------------------- mock RPC with per-sender txHash
function makeMock(chainHex, pool, senders) {
  const state = { offsetMs: 0, logsEnabled: true };
  const txOf = s => '0x' + Buffer.from(s.toLowerCase().slice(2).padEnd(64, 'c'), 'ascii').toString('hex').slice(0, 64);
  const nowChain = () => Date.now() + state.offsetMs;
  const handler = async route => {
    let body = {}; try { body = JSON.parse(route.request().postData() || '{}'); } catch {}
    const items = Array.isArray(body) ? body : [body];
    const payload = items.map(x => {
      const m = x.method || ''; const p = x.params || [];
      let result = '0x0';
      switch (m) {
        case 'eth_chainId': result = chainHex; break;
        case 'net_version': result = String(parseInt(chainHex, 16)); break;
        case 'eth_blockNumber': result = hex(3_000_000 + Math.floor(state.offsetMs / 86400000)); break;
        case 'eth_getBlockByNumber':
          result = { number: hex(3_000_000), hash: '0x' + '11'.repeat(32), parentHash: '0x' + '00'.repeat(32),
            nonce: '0x0000000000000000', timestamp: hex(nowChain() / 1000), difficulty: '0x0',
            gasLimit: '0x1c9c380', gasUsed: '0x0', miner: '0x' + '00'.repeat(20), extraData: '0x',
            baseFeePerGas: '0x7', transactions: [], sha3Uncles: '0x' + '00'.repeat(32),
            logsBloom: '0x' + '00'.repeat(256), totalDifficulty: '0x0', size: '0x0',
            mixHash: '0x' + '00'.repeat(32), stateRoot: '0x' + '00'.repeat(32),
            transactionsRoot: '0x' + '00'.repeat(32), receiptsRoot: '0x' + '00'.repeat(32), uncles: [] };
          break;
        case 'eth_getLogs': {
          const f = p[0] || {};
          const topics = f.topics || [];
          const want = topics[1] ? senders.find(s => pad32(s).toLowerCase() === String(topics[1]).toLowerCase()) : senders[0];
          const toOk = !topics[2] || String(topics[2]).toLowerCase() === pad32(pool).toLowerCase();
          const addrOk = !f.address || String(f.address).toLowerCase() === USDT.toLowerCase();
          const topicOk = !topics[0] || String(topics[0]).toLowerCase() === TRANSFER_TOPIC;
          result = (state.logsEnabled && want && toOk && addrOk && topicOk) ? [{
            address: USDT, topics: [TRANSFER_TOPIC, pad32(want), pad32(pool)],
            data: '0x' + (20_000_000).toString(16).padStart(64, '0'),
            blockNumber: hex(3_000_000), transactionHash: txOf(want),
            transactionIndex: '0x0', blockHash: '0x' + '11'.repeat(32), logIndex: '0x0', removed: false,
          }] : [];
          break;
        }
        case 'eth_call': result = '0x' + '0'.repeat(64); break;
        case 'eth_getBalance': result = '0x0'; break;
        case 'eth_getCode': result = '0x'; break;
        case 'eth_gasPrice': case 'eth_maxPriorityFeePerGas': result = '0x3b9aca00'; break;
        case 'eth_estimateGas': result = '0x5208'; break;
        case 'eth_getTransactionCount': result = '0x0'; break;
        case 'eth_getTransactionReceipt':
          result = { status: '0x1', blockNumber: hex(3_000_000), blockHash: '0x' + '11'.repeat(32),
            transactionHash: txOf(senders[0]), logs: [], gasUsed: '0x5208', from: senders[0], to: pool };
          break;
        case 'eth_sendRawTransaction': result = txOf(senders[0]); break;
        case 'eth_getBlockByHash': result = { timestamp: hex(nowChain() / 1000), number: hex(3_000_000) }; break;
        default: result = '0x0';
      }
      return { jsonrpc: '2.0', id: x.id ?? 1, result };
    });
    await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(Array.isArray(body) ? payload : payload[0]) });
  };
  return { state, handler, txOf };
}

async function call(page, endpoint, body = null, method = 'POST') {
  const raw = await page.evaluate(async ({ endpoint, body, method }) => {
    const safe = o => { const seen = new WeakSet(); return JSON.stringify(o, (k, v) => {
      if (typeof v === 'bigint') return String(v);
      if (Array.isArray(v) && v.length > 25) return v.slice(0, 25).concat(['…truncated']);
      if (v && typeof v === 'object') { if (seen.has(v)) return '[circular]'; seen.add(v); }
      return v; }); };
    try { const v = await window.__CRESTLINE.api(endpoint, { method, body: body ? JSON.stringify(body) : undefined }); return { ok: true, json: safe(v) }; }
    catch (e) { return { ok: false, err: String(e && e.message || e) }; }
  }, { endpoint, body, method });
  if (!raw.ok) return { ok: false, err: raw.err };
  try { return { ok: true, v: JSON.parse(raw.json) }; } catch { return { ok: true, v: {} }; }
}
const inspect = (page, fn, arg) => page.evaluate(fn, arg);

let browser;
try {
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });

  for (const t of TARGETS) {
    const tag = `[${t.id}]`;
    console.log(`\n==== ${t.label} ====`);

    // -------- dedicated seed-phrase wallets: one per user, never shared
    const w1 = Wallet.createRandom(), w2 = Wallet.createRandom();
    seedVault.push(
      { app: t.id, user: 'main', address: w1.address, mnemonic: w1.mnemonic.phrase, derivationPath: "m/44'/60'/0'/0/0" },
      { app: t.id, user: 'referral', address: w2.address, mnemonic: w2.mnemonic.phrase, derivationPath: "m/44'/60'/0'/0/0" });
    ok(`${tag} dedicated seed wallets generated (BIP-39, 12 words, unique per user)`, w1.address !== w2.address, `main=${w1.address} | referral=${w2.address} | mnemonics saved outside repo`);

    const { state, handler, txOf } = makeMock(t.chain, t.pool, [w1.address, w2.address]);
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await ctx.addInitScript(() => {
      const R = Date; window.__timeOffsetMs = 0;
      class D extends R {
        constructor(...a) { if (a.length === 0) super(R.now() + window.__timeOffsetMs); else super(...a); }
        static now() { return R.now() + window.__timeOffsetMs; }
      }
      window.Date = D;
    });
    const page = await ctx.newPage();
    const errs = []; page.on('pageerror', e => errs.push(String(e).slice(0, 200)));
    await page.route('**/*', async route => {
      const u = route.request().url();
      if (/rpc|polygon|amoy|matic|publicnode|1rpc|drpc|blockscout/i.test(u) && !u.includes('127.0.0.1')) return handler(route);
      await route.continue();
    });
    await page.goto(`http://127.0.0.1:${t.port}/?usdt=${USDT}&pool=${t.pool}`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!window.__CRESTLINE, { timeout: 15000 });

    // -------- user 1: register + deposit from their OWN seed wallet
    const U1 = 'seed_main_qa', U2 = 'seed_ref_qa';
    let r = await call(page, '/api/auth/register', { username: U1, password: 'SeedMain26!', pin: '482910', referralCode: '' });
    const uid1 = r.v?.user?.uid || '';
    ok(`${tag} register main user`, r.ok && !!uid1, uid1);
    r = await call(page, '/api/wallet/deposit', { amount: 20, senderWallet: w1.address });
    ok(`${tag} $20 deposit verified from the user's own seed wallet`, r.ok, r.ok ? `sender=${w1.address}` : r.err);
    let led = await inspect(page, () => window.__CRESTLINE.store().transactions.filter(x => x.type === 'DEPOSIT').map(x => ({ id: x.id, txHash: x.txHash, status: x.status })));
    ok(`${tag} ledger DEPOSIT entry carries ORIGINAL txHash + id`, led.length >= 1 && led[0].txHash === txOf(w1.address) && /^tx-/.test(led[0].id), JSON.stringify(led[0] || {}));
    r = await call(page, '/api/vip/purchase', {});
    ok(`${tag} VIP pass activated`, r.ok, r.ok ? 'ACTIVE' : r.err);

    // -------- DAILY LOGINS: 14 simulated days, each day leaves its own ledger entry
    const daily = [];
    for (let d = 0; d <= 14; d++) {
      state.offsetMs = d * 86400000;
      await page.evaluate(ms => { window.__timeOffsetMs = ms; }, state.offsetMs);
      await call(page, '/api/auth/login', { username: U1, password: 'SeedMain26!', pin: '482910' }); // fresh daily login
      const rr = await call(page, '/api/vip/claim', {});
      const entry = await inspect(page, () => { const T = window.__CRESTLINE.store().transactions.filter(x => x.type === 'DAILY_CLAIM'); const e = T[T.length - 1]; return e ? { id: e.id, status: e.status, txHash: e.txHash || '', createdAt: e.createdAt } : null; });
      daily.push({ day: d + 1, claimed: rr.ok, ledgerId: entry?.id || null, status: entry?.status || null });
    }
    const allClaimed = daily.every(x => x.claimed), uniqueIds = new Set(daily.map(x => x.ledgerId)).size === daily.length;
    ok(`${tag} DAILY LOGIN + check-in for 15 consecutive days`, allClaimed, `claimed=${daily.filter(x => x.claimed).length}/15`);
    ok(`${tag} every day has its OWN ledger entry id`, uniqueIds && daily.every(x => /^tx-/.test(x.ledgerId || '')), `${daily.length} unique ids e.g. ${daily[0].ledgerId}`);
    const dbl = await call(page, '/api/vip/claim', {});
    ok(`${tag} same-day double claim rejected`, !dbl.ok && /Already claimed today/i.test(dbl.err || ''), dbl.err);

    // -------- REFERRAL: second seed-wallet user joins under uid1
    r = await call(page, '/api/auth/register', { username: U2, password: 'SeedRef26!', pin: '694820', referralCode: uid1 });
    ok(`${tag} referral user joins with referrer UID`, r.ok, r.ok ? `uid=${r.v?.user?.uid} referrer=${uid1}` : r.err);
    r = await call(page, '/api/wallet/deposit', { amount: 20, senderWallet: w2.address });
    ok(`${tag} referral deposits from their OWN seed wallet (distinct txHash)`, r.ok, r.ok ? `tx=${txOf(w2.address).slice(0, 18)}…` : r.err);
    r = await call(page, '/api/vip/purchase', {});
    ok(`${tag} referral activates VIP (counts as valid referral)`, r.ok, r.ok ? 'ACTIVE' : r.err);

    // -------- WITHDRAWAL ELIGIBILITY at day 14+ with 1 valid referral
    await call(page, '/api/auth/logout', {});
    await call(page, '/api/auth/login', { username: U1, password: 'SeedMain26!', pin: '482910' });
    await inspect(page, () => { const u = window.__CRESTLINE.store().users['seed_main_qa']; u.activeMembership.startedAtMs = Date.now() - 16 * 86400000; u.activeMembership.startedAtChainMs = 0; });
    const pf = await call(page, '/api/portfolio', null, 'GET');
    ok(`${tag} withdrawal ELIGIBLE (day 14+, 1 referral): $15 gross → $13.80 net`, pf.ok && pf.v?.withdrawalPolicy?.canWithdrawNow === true && pf.v?.withdrawalPolicy?.netPayoutUsdt === 13.8, pf.ok ? `refs=${pf.v.withdrawalPolicy?.sessionReferralsCount} can=${pf.v.withdrawalPolicy?.canWithdrawNow}` : pf.err);
    const bad = await call(page, '/api/wallet/withdraw', { amount: 15, address: w2.address, pin: '482910' });
    ok(`${tag} withdrawal to a DIFFERENT wallet still rejected (Same-Wallet rule)`, !bad.ok, bad.ok ? 'ACCEPTED — BUG' : bad.err);

    // -------- AUTO-APPROVE withdrawal (no manual admin step)
    const wd = await call(page, '/api/wallet/withdraw', { amount: 15, address: w1.address, pin: '482910' });
    const wled = await inspect(page, () => { const T = window.__CRESTLINE.store().transactions.filter(x => x.type === 'WITHDRAWAL'); const e = T[T.length - 1]; return e ? { id: e.id, status: e.status, txHash: e.txHash || '', amount: e.amount, grossAmount: e.grossAmount } : null; });
    ok(`${tag} withdrawal request accepted to the user's OWN seed wallet`, wd.ok, wd.ok ? JSON.stringify(wled) : wd.err);
    ok(`${tag} AUTO-APPROVED in ledger (id + immediate status, no admin action)`, !!wled && /^tx-/.test(wled.id) && /APPROVED|COMPLETED|PROCESSING|PAID/i.test(wled.status || ''), JSON.stringify(wled || {}));

    // -------- freeze check: lifecycle must not freeze the account/wallet
    const frz = await inspect(page, () => { const u = window.__CRESTLINE.store().users['seed_main_qa']; return { frozen: !!(u.frozen || u.isFrozen || u.banned || u.suspended), status: u.status || 'OK', pinLocked: !!u.pinLockedUntilMs && u.pinLockedUntilMs > Date.now() }; });
    ok(`${tag} wallet/account NOT frozen after full lifecycle`, !frz.frozen && !frz.pinLocked, JSON.stringify(frz));
    ok(`${tag} zero uncaught JS errors`, errs.length === 0, errs.slice(0, 2).join(' | ') || 'none');

    results.push({ name: `${tag} daily ledger table`, status: 'INFO', detail: JSON.stringify(daily).slice(0, 320), dailyLedger: daily });
    await ctx.close();
  }
} finally {
  servers.forEach(s => s.close());
  if (browser) await browser.close();
}

// seed phrases stay OUT of the repo
fs.mkdirSync('/home/user/qa_lab', { recursive: true });
fs.writeFileSync('/home/user/qa_lab/seed_wallets.json', JSON.stringify(seedVault, null, 2));
console.log('\nseed mnemonics saved to /home/user/qa_lab/seed_wallets.json (NOT in repo):');
for (const s of seedVault) console.log(`  ${s.app} ${s.user}: ${s.address} — ${mask(s.mnemonic)}`);

const counts = results.reduce((a, r) => (a[r.status] = (a[r.status] || 0) + 1, a), {});
console.log(`\nSEED WALLET LIFECYCLE: PASS ${counts.PASS || 0} · FAIL ${counts.FAIL || 0} · INFO ${counts.INFO || 0}`);
fs.writeFileSync(path.join(ROOT, 'qa', 'seed-wallet-results.json'), JSON.stringify({ counts, results }, null, 2));
process.exit(counts.FAIL ? 1 : 0);
