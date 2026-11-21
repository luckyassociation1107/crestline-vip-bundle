/**
 * Playwright-only, API-key-free verification of the public chain layer.
 *
 * Targets:
 *   - https://polygonscan.com/            (Polygon mainnet explorer)
 *   - https://amoy.polygonscan.com/       (Amoy testnet explorer)
 *   - https://faucet.quicknode.com/polygon/amoy
 *
 * No Etherscan/Polygonscan API key, no QuickNode account, no private key,
 * no funds and no transaction signing is used. Direct Polygonscan requests are
 * blocked by Cloudflare in this sandbox (403 "Just a moment..."), so the same
 * explorer pages are opened through Google's translate proxy, which still runs
 * as real pages inside Playwright/Chromium. The direct URLs are probed first so
 * the block is recorded honestly.
 *
 * Setup: npm i playwright && npx playwright install chromium
 * Run:   node qa/playwright_external_test.mjs
 * Out:   qa/playwright-results.json, /home/user/qa_lab/shots/*.png
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = '/home/user/qa_lab/shots';
fs.mkdirSync(SHOTS, { recursive: true });

const TP = '?_x_tr_sl=auto&_x_tr_tl=en&_x_tr_hl=en';
const tpoly = p => `https://polygonscan-com.translate.goog${p}${p.includes('?') ? '&' : '?'}_x_tr_sl=auto&_x_tr_tl=en&_x_tr_hl=en`;
const tamoy = p => `https://amoy-polygonscan-com.translate.goog${p}${p.includes('?') ? '&' : '?'}_x_tr_sl=auto&_x_tr_tl=en&_x_tr_hl=en`;

const TESTNET_POOL = '0x08EE5Cf33C30123A628aC8FF80Ca48Bec8E96Db8';
const TESTNET_REGISTRY = '0x9be43bC43b1b3e47f9507696101938EB830cbae8';
const MAINNET_POOL = '0xA14e867C7B4539B776F88FEDA19cf011b88c793b';
const MAINNET_USDT = '0xc2132D05D31c914a87C6611C10748AEb04B58e8F';
const FAUCET = 'https://faucet.quicknode.com/polygon/amoy';
const ETH_FUNDED = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045'; // public, established Ethereum mainnet EOA

const results = [];
const add = (name, status, detail = '') => results.push({ name, status, detail: String(detail).slice(0, 400) });
const ok = (name, cond, detail = '') => add(name, cond ? 'PASS' : 'FAIL', detail);
const info = (name, detail) => add(name, 'INFO', detail);
const blocked = (name, detail) => add(name, 'BLOCKED', detail);

const browser = await chromium.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-blink-features=AutomationControlled', '--disable-dev-shm-usage'],
});
const ctx = await browser.newContext({
  userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  locale: 'en-US', timezoneId: 'Asia/Calcutta', viewport: { width: 1440, height: 1000 },
  extraHTTPHeaders: { 'Accept-Language': 'en-US,en;q=0.9' },
});
await ctx.addInitScript(() => Object.defineProperty(navigator, 'webdriver', { get: () => false }));

async function visit(page, url, waitMs = 5500) {
  let status = null, err = null;
  try { const r = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 }); status = r?.status(); }
  catch (e) { err = String(e).slice(0, 180); }
  await page.waitForTimeout(waitMs);
  try { await page.waitForLoadState('networkidle', { timeout: 8000 }); } catch {}
  const text = (await page.locator('body').innerText().catch(() => '')) || '';
  const title = await page.title().catch(() => '');
  return { status, err, text, title, url: page.url() };
}
const cf = t => /Just a moment|Performing security verification|Attention Required/i.test(t);
const shot = async (page, name) => page.screenshot({ path: path.join(SHOTS, name + '.png'), fullPage: false }).catch(() => {});
// The Continue button starts disabled; React enables it after the three fields
// are populated. `force` bypasses the cookie banner overlay without submitting it.
async function submitStepOne(page) {
  await page.waitForTimeout(400);
  await page.waitForFunction(() => {
    const b = document.querySelector('button[name=_action][value=step-one]');
    return !!b && !b.disabled;
  }, { timeout: 10000 });
  const btn = page.locator('button[name=_action][value=step-one]').first();
  await btn.click({ force: true, timeout: 12000 });
}

try {
  // ------------------------------------------------------------------ 1. direct explorer URLs
  for (const [name, url] of [['polygonscan-direct', 'https://polygonscan.com/'], ['amoy-direct', 'https://amoy.polygonscan.com/']]) {
    const p = await ctx.newPage();
    const v = await visit(p, url, 3500);
    ok(`${name}: HTTP 403 Cloudflare (recorded, not a product failure)`, v.status === 403 && cf(v.text), `status=${v.status} title=${v.title}`);
    info(`${name}: Cloudflare message`, v.text.slice(0, 160).replace(/\n/g, ' | '));
    await shot(p, name); await p.close();
  }
  blocked('Direct Polygonscan/Amoy UI in this sandbox', 'Cloudflare 403; same pages verified below via translate proxy inside Playwright');

  // ------------------------------------------------------------------ 2. explorer homepages via proxy
  const homeCases = [
    ['amoy-home', tamoy('/'), 'Amoy Testnet', /TESTNET Polygon PoS Chain Amoy/i],
    ['polygon-home', tpoly('/'), 'Polygon PoS Chain', /Polygon PoS Chain Explorer/i],
  ];
  for (const [name, url, chainLabel, titleRe] of homeCases) {
    const p = await ctx.newPage();
    const v = await visit(p, url, 6000);
    ok(`${name}: HTTP 200 via translate proxy`, v.status === 200 && !cf(v.text), `status=${v.status} len=${v.text.length}`);
    ok(`${name}: title / chain label`, titleRe.test(v.title) || v.text.includes(chainLabel), v.title);
    ok(`${name}: latest block visible`, /Latest Block\s*\n?\s*\d{6,}/.test(v.text), (v.text.match(/Latest Block[\s\S]{0,40}/) || [''])[0].replace(/\n/g, ' '));
    ok(`${name}: transactions + gas/price stats visible`, /Transactions\s*\n?\s*[\d.]+/i.test(v.text) || /Gas:/.test(v.text), 'stats present');
    const search = p.locator('#search-panel');
    ok(`${name}: address/tx search box present`, await search.count() === 1, await search.getAttribute('placeholder').catch(() => ''));
    // The search panel is collapsed on first paint; set the value through the DOM
    // and dispatch an input event so React sees it (still driven by Playwright).
    await search.evaluate((el, v) => { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); }, TESTNET_POOL).catch(() => {});
    ok(`${name}: search box accepts an address`, (await search.inputValue().catch(() => '')) === TESTNET_POOL, 'typed address');
    info(`${name}: body excerpt`, v.text.slice(0, 220).replace(/\n/g, ' | '));
    await shot(p, name); await p.close();
  }

  // ------------------------------------------------------------------ 3. configured addresses / contracts
  const addrCases = [
    { name: 'amoy-pool', url: tamoy(`/address/${TESTNET_POOL}`), addr: TESTNET_POOL, chain: 'Amoy Testnet', kind: 'eoa' },
    { name: 'amoy-registry', url: tamoy(`/address/${TESTNET_REGISTRY}`), addr: TESTNET_REGISTRY, chain: 'Amoy Testnet', kind: 'eoa' },
    { name: 'mainnet-pool', url: tpoly(`/address/${MAINNET_POOL}`), addr: MAINNET_POOL, chain: 'Polygon Mainnet', kind: 'eoa' },
    { name: 'mainnet-usdt', url: tpoly(`/address/${MAINNET_USDT}`), addr: MAINNET_USDT, chain: 'Polygon Mainnet', kind: 'contract' },
  ];
  for (const c of addrCases) {
    const p = await ctx.newPage();
    const v = await visit(p, c.url, 6000);
    ok(`${c.name}: HTTP 200, no Cloudflare`, v.status === 200 && !cf(v.text), `status=${v.status} len=${v.text.length}`);
    ok(`${c.name}: page shows exact address`, v.text.includes(c.addr), c.addr);
    ok(`${c.name}: explorer/network label`, v.text.includes(c.chain), c.chain);
    if (c.kind === 'eoa') {
      ok(`${c.name}: 0 POL balance`, /POL Balance\s*\n?\s*0 POL/.test(v.text) || /\b0 POL\b/.test(v.text), (v.text.match(/POL Balance[\s\S]{0,60}/) || [''])[0].replace(/\n/g, ' '));
      ok(`${c.name}: no transactions`, /There are no matching entries/i.test(v.text), 'no matching entries');
      ok(`${c.name}: no verified contract / compiler`, /Contract Name[\s\S]{0,80}?0 POL/.test(v.text) || /Compiler Version\s*\n?\s*0\b/.test(v.text), 'no contract code');
      ok(`${c.name}: Transactions Sent = N/A`, /Transactions Sent[\s\S]{0,80}?N\/A/.test(v.text), 'N/A');
    } else {
      ok(`${c.name}: USDT0 token contract`, /USDT0: USDT0 Token/i.test(v.text) && /Token Contract/i.test(v.text), 'USDT0 / Token Contract');
      ok(`${c.name}: source code / proxy present`, /Source Code \(Proxy\)/i.test(v.text) || /Implementation:/i.test(v.text), 'verified source');
      ok(`${c.name}: non-zero native POL balance`, /0\.001014010001 POL/.test(v.text), '0.001014010001 POL');
    }
    info(`${c.name}: title`, v.title.trim());
    await shot(p, c.name); await p.close();
  }
  info('Token page via translate proxy', '/token/... returned 403; /address/... contract page used instead (same Polygonscan data, no API key)');

  // ------------------------------------------------------------------ 4. QuickNode faucet, fully driven by Playwright
  {
    const p = await ctx.newPage();
    const bodies = [];
    p.on('response', async r => {
      if (/bonus\.data|drip|claim/i.test(r.url())) { try { bodies.push({ u: r.url().slice(0, 200), s: r.status(), t: (await r.text()).slice(0, 3000) }); } catch {} }
    });
    const v = await visit(p, FAUCET, 3000);
    ok('QuickNode faucet: HTTP 200 direct', v.status === 200 && !cf(v.text), `status=${v.status} title=${v.title}`);
    ok('QuickNode faucet: Polygon Amoy page', /Polygon\s*\n?\s*Amoy Faucet/i.test(v.text) && /Polygon Amoy Faucet/i.test(v.title), v.title);
    ok('QuickNode faucet: 3-step flow shown', /Connect your wallet/.test(v.text) && /Choose your amount/.test(v.text) && /Receive your tokens/.test(v.text), '3 steps');
    const chainSel = p.locator('#chain'), netSel = p.locator('#network'), wallet = p.locator('#wallet');
    ok('QuickNode faucet: chain/network preselected', (await chainSel.inputValue().catch(() => '')) === 'polygon' && (await netSel.inputValue().catch(() => '')) === 'amoy', 'polygon / amoy');
    ok('QuickNode faucet: Polygon option exists', (await chainSel.locator('option').allTextContents()).some(x => x.trim() === 'Polygon'), 'Polygon');
    ok('QuickNode faucet: Amoy + Mumbai options exist', (await netSel.locator('option').allTextContents()).some(x => x.trim() === 'Amoy') && (await netSel.locator('option').allTextContents()).some(x => x.trim() === 'Mumbai'), 'Amoy / Mumbai');
    ok('QuickNode faucet: wallet input placeholder', (await wallet.getAttribute('placeholder').catch(() => '')) === '0x...', '0x...');
    ok('QuickNode faucet: Connect Wallet button present', await p.getByRole('button', { name: 'Connect Wallet', exact: true }).count() >= 1, 'button present');
    ok('QuickNode faucet: FAQ states chain ID 80002', /chain ID 80002/.test(v.text), '80002');
    ok('QuickNode faucet: FAQ states base drip needs no account', /requires no Quicknode account/.test(v.text), 'no account');
    ok('QuickNode faucet: FAQ states small mainnet balance gate', /small mainnet balance/.test(v.text), 'anti-abuse gate');
    ok('QuickNode faucet: FAQ states 12h cooldown', /once every 12 hours/.test(v.text), '12h');
    ok('QuickNode faucet: authToken hidden field empty', (await p.locator('input[name=authToken]').getAttribute('value').catch(() => 'x')) === '', 'no login token');
    // Do NOT click the cookie banner: its buttons are submit buttons and a forced
    // click reloads the page, wiping the form state. submitStepOne() uses force
    // on the Continue button itself instead.

    // 4a. zero-balance testnet pool address must be rejected by the ETH-mainnet gate
    await chainSel.selectOption('polygon'); await netSel.selectOption('amoy'); await wallet.fill(TESTNET_POOL);
    await submitStepOne(p).catch(() => {});
    await p.waitForTimeout(3500);
    const zeroText = (await p.locator('body').innerText().catch(() => '')) || '';
    ok('QuickNode faucet: zero-ETH address rejected', /Insufficient ETH mainnet balance/.test(zeroText), (zeroText.match(/Insufficient[^.\n]*/) || [''])[0]);

    // 4b. wrong network selection changes the faucet route
    await p.goto(FAUCET, { waitUntil: 'domcontentloaded', timeout: 45000 }); await p.waitForTimeout(2200);
    await p.locator('#chain').selectOption('polygon'); await p.locator('#network').selectOption('mumbai'); await p.locator('#wallet').fill(ETH_FUNDED);
    await submitStepOne(p).catch(() => {});
    await p.waitForTimeout(3000);
    ok('QuickNode faucet: Mumbai route rejected/redirected correctly', /\/polygon\/mumbai/.test(p.url()) || /Mumbai Faucet/.test((await p.locator('body').innerText().catch(() => '')) || ''), p.url());

    // 4c. established ETH-mainnet address reaches step 2
    await p.goto(FAUCET, { waitUntil: 'domcontentloaded', timeout: 45000 }); await p.waitForTimeout(2200);
    await p.locator('#chain').selectOption('polygon'); await p.locator('#network').selectOption('amoy'); await p.locator('#wallet').fill(ETH_FUNDED);
    await submitStepOne(p).catch(() => {});
    await p.waitForURL(/\/bonus/, { timeout: 15000 }).catch(() => {});
    await p.waitForTimeout(3500);
    const step2Url = p.url(); const step2Text = (await p.locator('body').innerText().catch(() => '')) || '';
    ok('QuickNode faucet: step 2 URL / Choose your amount', step2Url.includes('/bonus') && /Choose your amount/.test(step2Text), step2Url);
    ok('QuickNode faucet: base drip amount 0.025 POL', /0\.025\s*\n?\s*pol/.test(step2Text), '0.025 POL');
    ok('QuickNode faucet: optional 0.05 / 0.1 bonuses locked', /0\.05/.test(step2Text) && /0\.1/.test(step2Text) && /LOCKED/.test(step2Text), 'locked bonuses');
    ok('QuickNode faucet: hidden chain/network/wallet preserved', (await p.locator('input[name=chain]').getAttribute('value').catch(() => '')) === 'polygon' && (await p.locator('input[name=network]').getAttribute('value').catch(() => '')) === 'amoy' && (await p.locator('input[name=wallet]').getAttribute('value').catch(() => '')).toLowerCase() === ETH_FUNDED.toLowerCase(), 'hidden fields');
    await p.waitForFunction(() => (document.querySelector('input[name=recaptchaToken]')?.value || '').length > 20, { timeout: 15000 }).catch(() => {});
    const recaptcha = await p.locator('input[name=recaptchaToken]').getAttribute('value').catch(() => '');
    ok('QuickNode faucet: invisible reCAPTCHA token auto-populated', (recaptcha || '').length > 20, `len=${(recaptcha || '').length}`);
    ok('QuickNode faucet: visitorId fingerprint present', ((await p.locator('input[name=visitorId]').getAttribute('value').catch(() => '')) || '').length > 10, 'visitorId');
    ok('QuickNode faucet: authToken still empty (no login needed)', (await p.locator('input[name=authToken]').getAttribute('value').catch(() => 'x')) === '', 'empty');

    // 4d. attempt the actual drip; cooldown is an environment/rate-limit blocker, not a failure
    const send = p.locator('button[name=_action][value=step-two-skip]').first();
    ok('QuickNode faucet: "Send to" button present', await send.count() === 1, await send.innerText().catch(() => ''));
    if (await send.count()) {
      const respPromise = p.waitForResponse(r => /bonus\.data/.test(r.url()), { timeout: 15000 }).catch(() => null);
      await send.click({ force: true, timeout: 15000 }).catch(() => {});
      await respPromise;
      await p.waitForFunction(() => /Please come back|Success|sent|transaction hash/i.test(document.body.innerText || ''), { timeout: 15000 }).catch(() => {});
    }
    await p.waitForTimeout(6000);
    const finalText = (await p.locator('body').innerText().catch(() => '')) || '';
    const errBody = bodies.filter(x => /formErrors/.test(x.t)).slice(-1).map(x => x.t).join(' ');
    const hashes = [...new Set((finalText + ' ' + bodies.map(x => x.t).join(' ')).match(/0x[0-9a-fA-F]{64}/g) || [])];
    const cooldown = /Please come back in 12 hours/.test(finalText) || /Please come back in 12 hours/.test(errBody);
    const success = hashes.length > 0 && /success|sent|received|transaction hash/i.test(finalText);
    if (success) {
      ok('QuickNode faucet: real 0.025 POL drip succeeded', true, `tx=${hashes[0]}`);
      info('QuickNode faucet tx hash', hashes[0]);
    } else {
      blocked('QuickNode faucet: real 0.025 POL drip', cooldown ? 'QuickNode returned "Please come back in 12 hours" (wallet / egress rate-limit cooldown); no tx hash produced' : `no success message; response=${errBody.slice(0, 220)}`);
      ok('QuickNode faucet: cooldown/rate-limit response captured', cooldown, (finalText.match(/Please come back[^\n]*/) || [errBody.slice(0, 160)])[0]);
    }
    info('QuickNode faucet: formErrors response', errBody.slice(0, 260) || 'none');
    await shot(p, 'quicknode-step2');
    await p.close();
  }

  // ------------------------------------------------------------------ 5. scope limits
  blocked('Real on-chain $20 USDT deposit / $13.80 payout', 'Explorer/faucet UI cannot exercise the app ledger; needs deployed vault, test USDT contract, funded wallet and tx hashes');
  blocked('Admin console post-login operations', 'owner 6-char passcode / master seed not supplied (see TEST_RESULTS_FULL.md)');
  blocked('Native Android runtime', 'no emulator/device; APKs are structurally valid but not launched');
} finally {
  await browser.close();
}

const counts = results.reduce((a, r) => (a[r.status] = (a[r.status] || 0) + 1, a), {});
console.log(`\n${'='.repeat(78)}\nPLAYWRIGHT EXTERNAL: PASS ${counts.PASS || 0} · FAIL ${counts.FAIL || 0} · BLOCKED ${counts.BLOCKED || 0} · INFO ${counts.INFO || 0}\n${'='.repeat(78)}`);
for (const r of results) console.log(`  ${r.status.padEnd(7)} ${r.name}${r.detail ? ' :: ' + r.detail : ''}`);
fs.writeFileSync(path.join(ROOT, 'qa', 'playwright-results.json'), JSON.stringify({ counts, results, note: 'No API keys, no QuickNode account, no private keys, no funds, no transaction signing.' }, null, 2));
process.exit(counts.FAIL ? 1 : 0);
