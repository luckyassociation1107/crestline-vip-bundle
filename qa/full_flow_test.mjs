/**
 * Crestline VIP — exhaustive end-to-end flow test (Phase-1 local state machine).
 *
 * Instruments a TEST-ONLY copy of each user bundle to expose its internal
 * /api/... router, then drives every endpoint with a stateful mocked Polygon
 * JSON-RPC (synthetic USDT Transfer logs, controllable chain clock). No real
 * chain, no keys, no funds are touched.
 *
 * Setup: npm i playwright && npx playwright install chromium
 * Run:   node qa/full_flow_test.mjs
 * Out:   qa/full-flow-results.json
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LAB = '/tmp/crestline_qa_lab';
const USDT = '0x1111111111111111111111111111111111111111';
const SENDER = '0x2222222222222222222222222222222222222222';
const SENDER2 = '0x3333333333333333333333333333333333333333';
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const pad32 = a => '0x' + '0'.repeat(24) + a.slice(2).toLowerCase();
const hex = n => '0x' + Math.floor(n).toString(16);

const TARGETS = [
  { id: '1-testnet-user', port: 4191, chain: '0x13882', pool: '0x08EE5Cf33C30123A628aC8FF80Ca48Bec8E96Db8', usdtDefault: '' },
  { id: '3-mainnet-user', port: 4193, chain: '0x89',    pool: '0xA14e867C7B4539B776F88FEDA19cf011b88c793b', usdtDefault: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F' },
];

// ---------------------------------------------------------------- test-only patched bundles
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
  if (!js.includes(needle)) throw new Error(`API hook not found in ${t.id} — bundle changed`);
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

// ---------------------------------------------------------------- results plumbing
const results = [];
const add = (name, status, detail = '') => { results.push({ name, status, detail: String(detail).slice(0, 320) }); };
const ok = (name, cond, detail = '') => add(name, cond ? 'PASS' : 'FAIL', detail);
const blocked = (name, detail) => add(name, 'BLOCKED', detail);

// ---------------------------------------------------------------- stateful mock RPC
function makeMock(chainHex, pool, usdtAddr = USDT) {
  const state = { offsetMs: 0, txHash: '0x' + 'ab'.repeat(32), logsEnabled: true, usedTx: new Set(), callCount: 0 };
  const nowChain = () => Date.now() + state.offsetMs;
  const handler = async (route) => {
    let body = {}; try { body = JSON.parse(route.request().postData() || '{}'); } catch {}
    const items = Array.isArray(body) ? body : [body];
    const payload = items.map(x => {
      const m = x.method || ''; const p = x.params || [];
      state.callCount++;
      let result = '0x0';
      switch (m) {
        case 'eth_chainId': result = chainHex; break;
        case 'net_version': result = String(parseInt(chainHex, 16)); break;
        case 'eth_blockNumber': result = hex(3_000_000 + Math.floor(state.offsetMs / 86400000)); break;
        case 'eth_getBlockByNumber':
          // ethers' JsonRpcProvider validates every block field; a partial block makes
          // the app's on-chain clock (Lm) return null and blocks claims/withdrawals.
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
          const fromOk = !topics[1] || String(topics[1]).toLowerCase() === pad32(SENDER).toLowerCase() || String(topics[1]).toLowerCase() === pad32(SENDER2).toLowerCase();
          const toOk = !topics[2] || String(topics[2]).toLowerCase() === pad32(pool).toLowerCase();
          const addrOk = !f.address || String(f.address).toLowerCase() === usdtAddr.toLowerCase();
          const topicOk = !topics[0] || String(topics[0]).toLowerCase() === TRANSFER_TOPIC;
          result = (state.logsEnabled && fromOk && toOk && addrOk && topicOk) ? [{
            address: usdtAddr, topics: [TRANSFER_TOPIC, pad32(SENDER), pad32(pool)],
            data: '0x' + (20_000_000).toString(16).padStart(64, '0'),
            blockNumber: hex(3_000_000), transactionHash: state.txHash,
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
            transactionHash: state.txHash, logs: [], gasUsed: '0x5208', from: SENDER, to: pool };
          break;
        case 'eth_sendRawTransaction': result = state.txHash; break;
        case 'eth_getBlockByHash': result = { timestamp: hex(nowChain() / 1000), number: hex(3_000_000) }; break;
        default: result = '0x0';
      }
      return { jsonrpc: '2.0', id: x.id ?? 1, result };
    });
    await route.fulfill({ status: 200, contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(Array.isArray(body) ? payload : payload[0]) });
  };
  return { state, handler };
}

async function call(page, endpoint, body = null, method = 'POST') {
  const raw = await page.evaluate(async ({ endpoint, body, method }) => {
    const safe = o => { const seen = new WeakSet(); return JSON.stringify(o, (k, v) => {
      if (typeof v === 'bigint') return String(v);
      if (Array.isArray(v) && v.length > 25) return v.slice(0, 25).concat(['…truncated']);
      if (v && typeof v === 'object') { if (seen.has(v)) return '[circular]'; seen.add(v); }
      return v; }); };
    try {
      const v = await window.__CRESTLINE.api(endpoint, { method, body: body ? JSON.stringify(body) : undefined });
      return { ok: true, json: safe(v) };
    } catch (e) { return { ok: false, err: String(e && e.message || e) }; }
  }, { endpoint, body, method });
  if (!raw.ok) return { ok: false, err: raw.err };
  try { return { ok: true, v: JSON.parse(raw.json) }; } catch { return { ok: true, v: {} }; }
}
const inspect = (page, fn) => page.evaluate(fn);

let browser;
try {
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });

  for (const t of TARGETS) {
    const tag = `[${t.id}]`;
    const { state, handler } = makeMock(t.chain, t.pool);
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
    await ctx.addInitScript(() => {
      const R = Date; window.__timeOffsetMs = 0;
      class D extends R {
        constructor(...a) { if (a.length === 0) super(R.now() + window.__timeOffsetMs); else super(...a); }
        static now() { return R.now() + window.__timeOffsetMs; }
      }
      window.Date = D;
    });
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', e => errs.push(String(e).slice(0, 200)));
    await page.route('**/*', async route => {
      const u = route.request().url();
      if (/rpc|polygon|amoy|matic|publicnode|1rpc|drpc|blockscout/i.test(u) && !u.includes('127.0.0.1')) return handler(route);
      await route.continue();
    });
    const url = `http://127.0.0.1:${t.port}/?usdt=${USDT}&pool=${t.pool}`;
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!window.__CRESTLINE, { timeout: 15000 });
    const cfg = await inspect(page, () => ({ chain: window.__CRESTLINE.cfg().CHAIN_ID, usdt: window.__CRESTLINE.cfg().USDT_ADDRESS, pool: window.__CRESTLINE.cfg().POOL_DEPOSIT_ADDRESS }));
    ok(`${tag} config: chain + USDT + pool`, cfg.chain === parseInt(t.chain, 16) && cfg.usdt.toLowerCase() === USDT.toLowerCase() && cfg.pool.toLowerCase() === t.pool.toLowerCase(), JSON.stringify(cfg));
    add(`${tag} shipped USDT_ADDRESS default`, 'INFO', t.usdtDefault || '(EMPTY — deposit verification impossible out of the box)');

    // ---------------------------------------------------------- auth
    let r = await call(page, '/api/auth/register', { username: 'ab', password: 'Pass2026!', pin: '482910' });
    ok(`${tag} register rejects short username`, !r.ok && /at least 3 characters/.test(r.err), r.err);
    r = await call(page, '/api/auth/register', { username: 'shortpw', password: '123', pin: '482910' });
    ok(`${tag} register rejects short password`, !r.ok && /at least 6 characters/.test(r.err), r.err);
    r = await call(page, '/api/auth/register', { username: 'weakpin', password: 'Pass2026!', pin: '123456' });
    ok(`${tag} register rejects weak PIN`, !r.ok && /stronger|6-digit/i.test(r.err), r.err);

    r = await call(page, '/api/auth/register', { username: 'alice_qa', password: 'Alice2026!', pin: '482910' });
    ok(`${tag} SIGNUP succeeds`, r.ok && /^UID-[A-Z0-9]+$/.test(r.v?.user?.uid || ''), r.ok ? `${r.v.user.uid} / token=${!!r.v.token}` : r.err);
    const aliceUid = r.v?.user?.uid;
    ok(`${tag} signup emits .crestline / TC1 recovery payload`, r.ok && !!(r.v?.recoveryPayload || r.v?.portfolio), r.ok ? Object.keys(r.v).join(',') : r.err);
    r = await call(page, '/api/auth/register', { username: 'alice_qa', password: 'Alice2026!', pin: '482910' });
    ok(`${tag} duplicate username rejected`, !r.ok && /already taken/i.test(r.err), r.err);

    r = await call(page, '/api/portfolio', null, 'GET');
    ok(`${tag} portfolio: zero balance, 13.80 net payout policy`, r.ok && r.v?.withdrawalPolicy?.netPayoutUsdt === 13.8 && r.v?.withdrawalPolicy?.feeUsdt === 1.2, r.ok ? `net=${r.v.withdrawalPolicy.netPayoutUsdt} fee=${r.v.withdrawalPolicy.feeUsdt} canWithdraw=${r.v.withdrawalPolicy.canWithdrawNow}` : r.err);
    ok(`${tag} withdrawal blocked by referral gate`, r.ok && r.v?.withdrawalPolicy?.canWithdrawNow === false && /Referral/.test(r.v?.withdrawalPolicy?.withdrawBlockReason || ''), r.v?.withdrawalPolicy?.withdrawBlockReason);

    r = await call(page, '/api/auth/logout', {});
    ok(`${tag} LOGOUT clears session`, r.ok && (await inspect(page, () => window.__CRESTLINE.session() === null)), r.ok ? 'session cleared' : r.err);
    r = await call(page, '/api/portfolio', null, 'GET');
    ok(`${tag} portfolio after logout is denied`, !r.ok, r.err);
    r = await call(page, '/api/auth/login', { username: 'alice_qa', password: 'WrongPass1', pin: '482910' });
    ok(`${tag} LOGIN rejects wrong password`, !r.ok && /Invalid username or password/i.test(r.err), r.err);
    r = await call(page, '/api/auth/login', { username: 'alice_qa', password: 'Alice2026!', pin: '482910' });
    ok(`${tag} LOGIN succeeds`, r.ok && r.v?.user?.uid === aliceUid, r.ok ? `uid=${r.v.user?.uid} dailyLoginCount=${r.v.user?.dailyLoginCount}` : r.err);
    r = await call(page, '/api/auth/login', { username: 'alice_qa', password: 'Alice2026!', pin: '999999' });
    ok(`${tag} LOGIN rejects wrong PIN`, !r.ok && /PIN/i.test(r.err), r.ok ? 'ACCEPTED — BUG' : r.err);
    // reset the PIN failure counter so later withdrawal checks start clean
    await inspect(page, () => { const u = window.__CRESTLINE.store().users['alice_qa']; u.failedPinAttempts = 0; u.pinLockedUntilMs = 0; });

    // ---------------------------------------------------------- deposit preconditions
    r = await call(page, '/api/wallet/deposit', { amount: 19, senderWallet: SENDER });
    ok(`${tag} deposit rejects non-$20 amount`, !r.ok && /exact \$20/.test(r.err), r.err);
    r = await call(page, '/api/wallet/deposit', { amount: 20 });
    ok(`${tag} deposit requires sender wallet`, !r.ok && /0x\.\.\. USDT wallet/.test(r.err), r.err);
    r = await call(page, '/api/wallet/deposit-lock', {});
    ok(`${tag} BUCKET_LOCK reserves $140 slot`, r.ok && r.v?.depositLock?.status === 'RESERVED' && r.v?.depositLock?.amount === 20, r.ok ? JSON.stringify(r.v.depositLock).slice(0, 200) : r.err);

    // ---------------------------------------------------------- deposit recognition
    state.logsEnabled = true; state.txHash = '0x' + 'ab'.repeat(32);
    r = await call(page, '/api/wallet/deposit', { amount: 20, method: 'Polygon USDT', senderWallet: SENDER });
    const dep = r.ok;
    ok(`${tag} NEW VALID DEPOSIT recognized ($20)`, dep && r.v?.blockchainCheck?.verified === true, dep ? `tx=${r.v.blockchainCheck?.txHash} amt=${r.v.blockchainCheck?.amountUsdt}` : r.err);
    ok(`${tag} deposit credits wallet + binds sender wallet`, dep && r.v?.summary?.walletBalance === 20 && String(r.v?.user?.walletAddress || '').toLowerCase() === SENDER.toLowerCase(), dep ? `balance=${r.v.summary?.walletBalance} wallet=${r.v.user?.walletAddress}` : r.err);
    const txCount1 = await inspect(page, () => window.__CRESTLINE.store().transactions.filter(x => x.type === 'DEPOSIT').length);
    ok(`${tag} DEPOSIT tx recorded in history`, txCount1 >= 1, `count=${txCount1}`);

    // replay protection: same tx hash must not be re-creditable
    r = await call(page, '/api/wallet/deposit', { amount: 20, senderWallet: SENDER });
    ok(`${tag} deposit replay protection (same tx rejected)`, !r.ok && /transfer found|No \$20/i.test(r.err || ''), r.err || (r.ok ? 'ACCEPTED AGAIN — BUG' : ''));

    // a genuinely new tx hash must be recognized
    state.txHash = '0x' + 'cd'.repeat(32);
    r = await call(page, '/api/wallet/deposit', { amount: 20, senderWallet: SENDER });
    ok(`${tag} second NEW deposit recognized`, r.ok && r.v?.blockchainCheck?.verified === true, r.ok ? `tx=${r.v.blockchainCheck?.txHash}` : r.err);
    r = await call(page, '/api/wallet/deposit', { amount: 20, senderWallet: SENDER2 });
    ok(`${tag} strict same-wallet policy enforced`, !r.ok && /permanently locked/i.test(r.err), r.err);
    r = await call(page, '/api/wallet/deposit-release', { reason: 'FAILED', txHash: '0x' + 'ee'.repeat(32) });
    ok(`${tag} BUCKET_RELEASE resolves lock`, r.ok, r.ok ? JSON.stringify(r.v?.releasedLock).slice(0, 160) : r.err);

    // 1 wallet = 1 person
    r = await call(page, '/api/auth/register', { username: 'bob_qa', password: 'Bob2026!!', pin: '583920' });
    ok(`${tag} second account (referral target) registered`, r.ok, r.ok ? r.v.user?.uid : r.err);
    r = await call(page, '/api/wallet/deposit', { amount: 20, senderWallet: SENDER });
    ok(`${tag} 1-wallet-1-person enforced`, !r.ok && /already locked to another UID/i.test(r.err), r.err);

    // ---------------------------------------------------------- VIP + daily check-in
    await call(page, '/api/auth/login', { username: 'alice_qa', password: 'Alice2026!', pin: '482910' });
    r = await call(page, '/api/vip/purchase', {});
    const vipState = await inspect(page, () => { const u = window.__CRESTLINE.store().users['alice_qa']; return { status: u.activeMembership?.status, days: u.activeMembership?.daysClaimed, bal: u.walletBalance, inv: (u.investments || []).length }; });
    ok(`${tag} VIP JOIN / purchase activates 28-day membership`, r.ok && vipState.status === 'ACTIVE' && vipState.inv >= 1, r.ok ? JSON.stringify(vipState) : r.err);
    r = await call(page, '/api/vip/purchase', {});
    ok(`${tag} duplicate VIP purchase rejected`, !r.ok && /already active/i.test(r.err), r.err);
    const balBeforeClaim = await inspect(page, () => window.__CRESTLINE.store().users['alice_qa'].walletBalance);
    r = await call(page, '/api/vip/claim', {});
    const claimState = await inspect(page, () => { const u = window.__CRESTLINE.store().users['alice_qa']; return { days: u.activeMembership?.daysClaimed, bal: u.walletBalance }; });
    ok(`${tag} DAILY CHECK-IN claim +$1.00`, r.ok && claimState.days === 1 && Math.abs(claimState.bal - (balBeforeClaim + 1)) < 0.01, r.ok ? JSON.stringify(claimState) : r.err);
    r = await call(page, '/api/vip/claim', {});
    ok(`${tag} double claim same day rejected`, !r.ok && /Already claimed today/i.test(r.err), r.err);

    // simulate 15 days of check-ins by advancing device + chain clocks
    let claims = 0;
    for (let d = 1; d <= 15; d++) {
      state.offsetMs = d * 86400000;
      await page.evaluate(ms => { window.__timeOffsetMs = ms; }, state.offsetMs);
      const rr = await call(page, '/api/vip/claim', {});
      if (rr.ok) claims++;
    }
    ok(`${tag} 15 more daily check-ins across simulated days`, claims === 15, `successful=${claims}/15`);
    const st = await inspect(page, () => {
      const S = window.__CRESTLINE.store(); const u = S.users['alice_qa'];
      return { balance: u.walletBalance, daysClaimed: u.activeMembership?.daysClaimed, startedAtMs: u.activeMembership?.startedAtMs,
               history: (u.membershipHistory || []).length, txTypes: [...new Set(S.transactions.map(x => x.type))] };
    });
    ok(`${tag} join/check-in history recorded`, st.daysClaimed >= 16 && st.txTypes.includes('DAILY_CLAIM') && st.txTypes.includes('VIP_PURCHASE'), JSON.stringify(st).slice(0, 260));

    // ---------------------------------------------------------- referral validity
    // bob must activate VIP to count as a valid referral for alice
    const bobReg = await call(page, '/api/auth/register', { username: 'charlie_qa', password: 'Charlie26!', pin: '694820', referralCode: aliceUid });
    ok(`${tag} REFERRAL JOIN with referrer UID`, bobReg.ok, bobReg.ok ? `uid=${bobReg.v.user?.uid} referrer=${aliceUid}` : bobReg.err);
    state.txHash = '0x' + 'ef'.repeat(32);
    let d2 = await call(page, '/api/wallet/deposit', { amount: 20, senderWallet: SENDER2 });
    ok(`${tag} referred user can deposit`, d2.ok, d2.ok ? 'ok' : d2.err);
    let p2 = await call(page, '/api/vip/purchase', {});
    ok(`${tag} referred user activates VIP`, p2.ok, p2.ok ? 'ok' : p2.err);
    // back to alice
    await call(page, '/api/auth/logout', {});
    await call(page, '/api/auth/login', { username: 'alice_qa', password: 'Alice2026!', pin: '482910' });
    // make alice's cycle old enough and rich enough
    await inspect(page, () => { const u = window.__CRESTLINE.store().users['alice_qa']; u.activeMembership.startedAtMs = Date.now() - 16 * 86400000; u.activeMembership.startedAtChainMs = 0; });
    let pf = await call(page, '/api/portfolio', null, 'GET');
    ok(`${tag} referral gate counts VIP-activated referrals`, pf.ok && (pf.v?.withdrawalPolicy?.sessionReferralsCount || 0) >= 1, pf.ok ? `refs=${pf.v.withdrawalPolicy?.sessionReferralsCount} canWithdraw=${pf.v.withdrawalPolicy?.canWithdrawNow} reason=${pf.v.withdrawalPolicy?.withdrawBlockReason}` : pf.err);
    ok(`${tag} $13.80 WITHDRAWAL permission granted`, pf.ok && pf.v?.withdrawalPolicy?.canWithdrawNow === true, pf.ok ? `net=${pf.v.withdrawalPolicy?.netPayoutUsdt} reason=${pf.v.withdrawalPolicy?.withdrawBlockReason}` : pf.err);

    // ---------------------------------------------------------- withdrawal
    for (const [label, body, expectOk, pattern] of [
      ['wrong amount', { amount: 14, address: SENDER, pin: '482910' }, false, /fixed at \$15/],
      ['wrong destination wallet', { amount: 15, address: SENDER2, pin: '482910' }, false, /Same-Wallet/i],
      ['wrong PIN', { amount: 15, address: SENDER, pin: '111111' }, false, /PIN/i],
    ]) {
      const rr = await call(page, '/api/wallet/withdraw', body);
      ok(`${tag} withdraw rejects ${label}`, (rr.ok === expectOk) && (!pattern.test(rr.err || '') ? false : true), rr.ok ? 'ACCEPTED — BUG' : rr.err);
    }
    let wd = await call(page, '/api/wallet/withdraw', { amount: 15, address: SENDER, pin: '482910' });
    ok(`${tag} 1st CLAIM / $15 gross → $13.80 net withdrawal`, wd.ok, wd.ok ? `keys=${Object.keys(wd.v).slice(0, 12).join(',')}` : wd.err);
    const after = await inspect(page, () => { const u = window.__CRESTLINE.store().users['alice_qa']; return { bal: u.walletBalance, cnt: u.sessionWithdrawalsCount, sess: u.sessionWithdrawnUsdt, total: u.totalWithdrawnUsdt }; });
    ok(`${tag} withdrawal state: balance -$15, payout #1`, after.cnt === 1 && after.sess === 15 && Math.abs(after.bal - (st.balance - 15)) < 0.01, JSON.stringify(after));
    let wd2 = await call(page, '/api/wallet/withdraw', { amount: 15, address: SENDER, pin: '482910' });
    ok(`${tag} 2nd payout blocked within 14-day window`, !wd2.ok, wd2.ok ? 'ACCEPTED — BUG' : wd2.err);

    add(`${tag} JS errors`, errs.length === 0 ? 'PASS' : 'FAIL', errs.slice(0, 3).join(' | ') || 'none');
    await ctx.close();

    // ---------------------------------------------------------- UI .crestline export/import
    const uictx = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
    // Headless Chromium has no file-system picker UI; force the app's plain
    // <a download> fallback so Playwright can capture the .crestline file.
    await uictx.addInitScript(() => { Object.defineProperty(window, 'showSaveFilePicker', { value: undefined, configurable: true }); });
    const upage = await uictx.newPage();
    const uerrs = []; upage.on('pageerror', e => uerrs.push(String(e).slice(0, 180)));
    await upage.route('**/*', async route => {
      const u = route.request().url();
      if (/rpc|polygon|amoy|matic|publicnode|1rpc|drpc|blockscout/i.test(u) && !u.includes('127.0.0.1')) return handler(route);
      await route.continue();
    });
    await upage.goto(url, { waitUntil: 'domcontentloaded' });
    await upage.waitForFunction(() => document.body.innerText.includes('USERNAME'), { timeout: 25000 }).catch(() => {});
    await upage.getByRole('button', { name: 'Create Account', exact: true }).first().click();
    await upage.waitForTimeout(250);
    const f = upage.locator('input');
    await f.nth(0).fill('import_qa'); await f.nth(1).fill('Import2026!'); await f.nth(2).fill('482910');
    if (await f.count() > 3) await f.nth(3).fill('');
    await upage.getByRole('button', { name: /Create Account & Get Recovery File/i }).first().click();
    await upage.waitForFunction(() => /Account created for UID-/.test(document.body.innerText), { timeout: 15000 }).catch(() => {});
    const created = await upage.locator('body').innerText();
    const importUid = (created.match(/UID-[A-Z0-9]+/) || [''])[0];
    const tc1 = (created.match(/TC1:[^\s]+/) || [''])[0];
    ok(`${tag} UI signup shows UID + TC1 backup code`, !!importUid && !!tc1, `uid=${importUid} tc1len=${tc1.length}`);

    // The recovery file is downloaded only when the explicit button is pressed.
    const dlPromise = upage.waitForEvent('download', { timeout: 15000 }).catch(() => null);
    const dlBtn = upage.getByRole('button', { name: /Download .crestline Recovery File/i }).first();
    if (await dlBtn.count()) await dlBtn.click().catch(() => {});
    const dl = await dlPromise;
    let dlBytes = 0; const dlPath = `/tmp/crestline_recovery_${t.id}.crestline`;
    if (dl) { await dl.saveAs(dlPath); dlBytes = fs.statSync(dlPath).size; }
    ok(`${tag} .crestline recovery file exported`, dlBytes > 100, `${dlBytes} bytes`);
    let recMeta = {};
    try {
      const d = JSON.parse(fs.readFileSync(dlPath, 'utf8'));
      recMeta = { format: d.format, alg: d.alg, uid: d.uid, username: d.username,
                  cipher: !!d.cipher, salt: !!d.salt, iv: !!d.iv };
    } catch {}
    ok(`${tag} .crestline file is valid E2EE recovery JSON`, recMeta.format === 'CRESTLINE-VIP-RECOVERY-V2' && recMeta.cipher && recMeta.salt && recMeta.iv && /PBKDF2.*AES-256-GCM/.test(recMeta.alg || ''), JSON.stringify(recMeta));

    // Helper: wipe the device (simulate a lost phone) and open the Recover tab.
    const freshRecover = async () => {
      await upage.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
      await upage.goto(url, { waitUntil: 'domcontentloaded' });
      await upage.waitForFunction(() => document.body.innerText.includes('Recover'), { timeout: 25000 }).catch(() => {});
      await upage.getByRole('button', { name: 'Recover', exact: true }).first().click().catch(() => {});
      await upage.waitForTimeout(400);
    };
    await freshRecover();
    const recText = await upage.locator('body').innerText();
    ok(`${tag} Recover screen offers file + TC1 import`, /Upload .crestline/i.test(recText) && /TIME-CIPHER/i.test(recText), recText.slice(0, 220).replace(/\n/g, ' '));
    const decrypt = () => upage.getByRole('button', { name: /Decrypt & Recover Account/i }).first();
    const pwField = () => upage.locator('input[type=password]').first();
    const restored = async label => {
      await upage.waitForTimeout(1600);
      const txt = await upage.locator('body').innerText();
      const success = txt.includes(importUid) || (txt.includes('@import_qa') && /Activate Membership|Join VIP Membership|Daily Check-In/.test(txt));
      ok(`${tag} ${label}`, success, txt.slice(0, 220).replace(/\n/g, ' '));
    };

    // A) import the exported .crestline file
    const fileInput = upage.locator('input[type=file]').first();
    if (await fileInput.count() && dlBytes > 100) {
      // The app reads the File into state and clears input.value immediately,
      // so correctness is proven by the restore result below, not by input.files.
      await fileInput.setInputFiles(dlPath);
      await upage.waitForTimeout(500);
      if (await pwField().count()) await pwField().fill('Import2026!');
      if (await decrypt().count()) await decrypt().click().catch(() => {});
      await restored('.crestline FILE IMPORT restores account (fresh device)');
    } else {
      blocked(`${tag} .crestline FILE IMPORT restores account`, 'no file input or no exported file');
    }

    // B) no-file recovery using the TC1 time-cipher payload
    await freshRecover();
    const ta = upage.locator('textarea').first();
    if (await ta.count() && tc1) {
      await ta.fill(tc1);
      if (await pwField().count()) await pwField().fill('Import2026!');
      if (await decrypt().count()) await decrypt().click().catch(() => {});
      await restored('TC1 time-cipher IMPORT restores account (no file)');
    } else {
      blocked(`${tag} TC1 time-cipher import`, 'no TC1 payload captured');
    }
    add(`${tag} UI JS errors`, uerrs.length === 0 ? 'PASS' : 'FAIL', uerrs.slice(0, 2).join(' | ') || 'none');
    await uictx.close();

    // ---------------------------------------------------------- honest blockers
    blocked(`${tag} real on-chain USDT deposit`, 'mocked Transfer log used; needs funded wallet + live tx hash');
    blocked(`${tag} real $13.80 USDT payout on chain`, 'no funds moved; local Phase-1 ledger only');
  }

  // ---------------------------------------------------------------- shipped default config (what a real user gets)
  for (const t of TARGETS) {
    const tag = `[${t.id} DEFAULT-CONFIG]`;
    const { state, handler } = makeMock(t.chain, t.pool, t.usdtDefault || USDT);
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    await page.route('**/*', async route => {
      const u = route.request().url();
      if (/rpc|polygon|amoy|matic|publicnode|1rpc|drpc|blockscout/i.test(u) && !u.includes('127.0.0.1')) return handler(route);
      await route.continue();
    });
    await page.goto(`http://127.0.0.1:${t.port}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!window.__CRESTLINE, { timeout: 15000 });
    const cfg = await inspect(page, () => window.__CRESTLINE.cfg());
    ok(`${tag} USDT_ADDRESS as shipped`, (cfg.USDT_ADDRESS || '') === t.usdtDefault, `USDT_ADDRESS=${cfg.USDT_ADDRESS || '(EMPTY)'}`);
    let r = await call(page, '/api/auth/register', { username: 'default_qa', password: 'Default26!', pin: '482910' });
    ok(`${tag} signup works`, r.ok, r.ok ? r.v.user?.uid : r.err);
    r = await call(page, '/api/wallet/deposit', { amount: 20, senderWallet: SENDER });
    if (!t.usdtDefault) {
      ok(`${tag} deposit verification FAILS out of the box`, !r.ok && /USDT token contract address is not configured/i.test(r.err || ''), r.err || (r.ok ? 'UNEXPECTEDLY ACCEPTED' : ''));
    } else {
      ok(`${tag} deposit works with shipped USDT contract`, r.ok && r.v?.blockchainCheck?.verified === true, r.ok ? `tx=${r.v.blockchainCheck?.txHash}` : r.err);
    }
    await ctx.close();
  }

  // ---------------------------------------------------------------- admin console (no passcode)
  for (const t of ['2-testnet-admin', '4-mainnet-admin']) {
    blocked(`[${t}] admin console post-login operations`, 'owner 6-char passcode / 12-word master seed not supplied; hardcoded seed hash in bundle');
  }
} finally {
  if (browser) await browser.close();
  servers.forEach(s => s.close());
}

const counts = results.reduce((a, r) => (a[r.status] = (a[r.status] || 0) + 1, a), {});
console.log(`\n${'='.repeat(78)}\nFULL FLOW: PASS ${counts.PASS || 0} · FAIL ${counts.FAIL || 0} · BLOCKED ${counts.BLOCKED || 0} · INFO ${counts.INFO || 0}\n${'='.repeat(78)}`);
for (const r of results) console.log(`  ${r.status.padEnd(7)} ${r.name}${r.detail ? ' :: ' + r.detail : ''}`);
fs.writeFileSync(path.join(ROOT, 'qa', 'full-flow-results.json'), JSON.stringify({ counts, results }, null, 2));
process.exit(counts.FAIL ? 1 : 0);
