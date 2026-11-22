/**
 * FAUCET WALLET FACTORY — creates dedicated testnet wallets in bulk.
 *
 *   node qa/make_faucet_wallets.mjs --count 5                 # 5 standalone wallets
 *   node qa/make_faucet_wallets.mjs --days 30 --uid UID-XXXX  # 30-day wallet chain (one wallet per day)
 *   xvfb-run -a node qa/make_faucet_wallets.mjs --count 3 --claim   # + try one Circle USDC claim (cooldown-aware)
 *
 * • Standalone wallets: fresh BIP-39 mnemonic each (dedicated per user).
 * • Day-chain wallets: ONE master mnemonic, day N = m/44'/60'/0'/0/N — so a
 *   30-day on-chain simulation uses a DIFFERENT wallet every day (beats
 *   per-wallet rate limits) while every day's encrypted memo records the
 *   PREVIOUS day's wallet, chaining them into one verifiable identity.
 * • Vault (mnemonics + private keys) is saved OUTSIDE the repo:
 *   /home/user/qa_lab/faucet_wallets.json — never committed, never logged.
 * • --claim drives the Circle faucet once (respects the 2h server cooldown via
 *   qa/.faucet-state.json) sending 20 USDC to --claim-to (default: the pool).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Wallet, HDNodeWallet, Mnemonic } from 'ethers';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VAULT = '/home/user/qa_lab/faucet_wallets.json';
const POOL = '0x08EE5Cf33C30123A628aC8FF80Ca48Bec8E96Db8';
const arg = (n, d = '') => { const i = process.argv.indexOf('--' + n); return i >= 0 ? (process.argv[i + 1] || 'true') : d; };

const vault = fs.existsSync(VAULT) ? JSON.parse(fs.readFileSync(VAULT, 'utf8')) : { wallets: [], dayChains: [] };

const count = Number(arg('count', '0'));
for (let i = 0; i < count; i++) {
  const w = Wallet.createRandom();
  vault.wallets.push({ createdAt: new Date().toISOString(), address: w.address, mnemonic: w.mnemonic.phrase, privateKey: w.privateKey });
  console.log(`wallet ${i + 1}/${count}: ${w.address}`);
}

const days = Number(arg('days', '0'));
if (days > 0) {
  const uid = arg('uid', 'UID-UNSET');
  const master = Wallet.createRandom().mnemonic.phrase;
  const chain = { uid, createdAt: new Date().toISOString(), masterMnemonic: master, days: [] };
  for (let d = 1; d <= days; d++) {
    const w = HDNodeWallet.fromMnemonic(Mnemonic.fromPhrase(master), `m/44'/60'/0'/0/${d}`);
    chain.days.push({ day: d, address: w.address });
  }
  vault.dayChains.push(chain);
  console.log(`day-chain for ${uid}: ${days} wallets  day1=${chain.days[0].address}  day${days}=${chain.days[days - 1].address}`);
  console.log('(private keys derive from the master mnemonic in the vault — one wallet per day)');
}

fs.mkdirSync(path.dirname(VAULT), { recursive: true });
fs.writeFileSync(VAULT, JSON.stringify(vault, null, 2));
console.log(`vault: ${VAULT} — ${vault.wallets.length} wallets, ${vault.dayChains.length} day-chains (NOT in repo)`);

// ---------------------------------------------------------------- optional Circle claim
if (arg('claim')) {
  const target = arg('claim-to', POOL);
  const stF = path.join(ROOT, 'qa', '.faucet-state.json');
  const st = fs.existsSync(stF) ? JSON.parse(fs.readFileSync(stF, 'utf8')) : {};
  const wait = (st.lastClaimMs || 0) + 125 * 60000 - Date.now();
  if (wait > 0) { console.log(`claim skipped: Circle cooldown, next window in ${Math.ceil(wait / 60000)} min`); process.exit(0); }
  const { chromium } = await import('playwright');
  const b = await chromium.launch({ headless: !process.env.DISPLAY, args: ['--no-sandbox', '--disable-blink-features=AutomationControlled', '--window-size=1366,950'] });
  try {
    const c = await b.newContext({ viewport: { width: 1366, height: 950 }, locale: 'en-US', timezoneId: 'Asia/Calcutta', userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36' });
    await c.addInitScript(() => Object.defineProperty(navigator, 'webdriver', { get: () => false }));
    const p = await c.newPage();
    const api = [];
    p.on('response', async r => { if (/circle\.com\/api/i.test(r.url()) && r.request().method() === 'POST') { try { api.push((await r.text()).slice(0, 700)); } catch {} } });
    await p.goto('https://faucet.circle.com/', { waitUntil: 'domcontentloaded', timeout: 45000 });
    await p.waitForTimeout(4500);
    for (let i = 0; i < 6; i++) { await p.mouse.move(200 + Math.random() * 700, 150 + Math.random() * 500, { steps: 8 }); await p.waitForTimeout(250); }
    await p.getByRole('button', { name: /Arc Testnet|Select network/i }).first().click();
    await p.waitForTimeout(1200);
    await p.getByText('Polygon PoS Amoy', { exact: true }).first().click();
    await p.waitForTimeout(900);
    const addr = p.getByPlaceholder('Wallet address');
    await addr.click(); await addr.pressSequentially(target, { delay: 60 });
    await p.waitForTimeout(1200);
    const send = p.getByRole('button', { name: /Send 20 USDC/i }).first();
    await send.hover(); await p.waitForTimeout(500); await send.click();
    await p.waitForTimeout(15000);
    const blob = (await p.locator('body').innerText()) + api.join(' ');
    const tx = (blob.match(/0x[0-9a-fA-F]{64}/) || [null])[0];
    if (tx && /Tokens sent|on its way|"status":"success"/i.test(blob)) {
      fs.writeFileSync(stF, JSON.stringify({ lastClaimMs: Date.now(), lastTx: tx }));
      console.log(`CLAIM OK → ${target}: https://amoy.polygonscan.com/tx/${tx}`);
    } else console.log('claim refused:', /every 2 hours|Limit/i.test(blob) ? 'server cooldown' : blob.slice(0, 120).replace(/\s+/g, ' '));
  } finally { await b.close(); }
}
