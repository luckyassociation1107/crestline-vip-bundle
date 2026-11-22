import { chromium } from 'playwright';
import fs from 'node:fs';

const URL = 'https://faucet.quicknode.com/polygon/amoy';
const ADDRS = [
  ['vitalik', '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045'],
  ['binance-hot', '0x28C6c06298d514Db089934071355E5743bf21d60'],
  ['zero-address', '0x0000000000000000000000000000000000000000'],
];
const b = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-blink-features=AutomationControlled', '--disable-dev-shm-usage'] });
const ctx = await b.newContext({ userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36', locale: 'en-US', viewport: { width: 1440, height: 1000 } });
await ctx.addInitScript(() => Object.defineProperty(navigator, 'webdriver', { get: () => false }));

const rows = [];
for (const [name, wallet] of ADDRS) {
  const p = await ctx.newPage();
  const resps = [];
  p.on('response', r => { if (/api|faucet|drip|auth|challenge|turnstile|hcaptcha|cloudflare/i.test(r.url())) resps.push(`${r.status()} ${r.url().slice(0, 190)}`); });
  await p.goto(URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await p.waitForTimeout(2500);
  const accept = p.getByRole('button', { name: 'Accept', exact: true }); if (await accept.count()) await accept.click().catch(() => {});
  await p.selectOption('#chain', 'polygon'); await p.selectOption('#network', 'amoy'); await p.fill('#wallet', wallet);
  let clickErr = null;
  try { await p.getByRole('button', { name: 'Continue', exact: true }).click({ timeout: 12000 }); } catch (e) { clickErr = String(e).slice(0, 160); }
  await p.waitForTimeout(6000); try { await p.waitForLoadState('networkidle', { timeout: 8000 }); } catch {}
  const text = (await p.locator('body').innerText().catch(() => '')) || '';
  const frames = p.frames().map(f => ({ name: f.name(), url: f.url().slice(0, 220) }));
  const inputs = await p.locator('input,textarea,select,button').evaluateAll(els => els.slice(0, 35).map(e => ({ tag: e.tagName, id: e.id, name: e.name, type: e.type || '', value: (e.value || '').slice(0, 60), text: (e.innerText || '').trim().slice(0, 70) }))).catch(() => []);
  const authToken = await p.locator('input[name=authToken]').getAttribute('value').catch(() => null);
  await p.screenshot({ path: `/home/user/qa_lab/shots/faucet2_${name}.png`, fullPage: true }).catch(() => {});
  rows.push({ name, wallet, afterUrl: p.url(), clickErr, text: text.slice(0, 9000), frames, inputs, authToken, resps: resps.slice(0, 30) });
  console.log(`\n===== ${name} ===== url=${p.url()} clickErr=${clickErr}`);
  console.log(text.slice(0, 2200).replace(/\n{2,}/g, '\n'));
  console.log('authToken:', authToken, 'frames:', JSON.stringify(frames.slice(0, 6)));
  console.log('resps:', JSON.stringify(resps.slice(0, 12)));
  await p.close();
}

// Connect Wallet modal probe
const p = await ctx.newPage();
await p.goto(URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
await p.waitForTimeout(2500);
const accept = p.getByRole('button', { name: 'Accept', exact: true }); if (await accept.count()) await accept.click().catch(() => {});
await p.getByRole('button', { name: 'Connect Wallet', exact: true }).first().click().catch(e => console.log('connect click err', String(e).slice(0, 120)));
await p.waitForTimeout(2500);
const modalText = (await p.locator('body').innerText().catch(() => '')) || '';
const frames = p.frames().map(f => f.url().slice(0, 220));
console.log('\n===== connect-wallet modal =====');
console.log(modalText.slice(0, 2200).replace(/\n{2,}/g, '\n'));
console.log('frames:', JSON.stringify(frames.slice(0, 8)));
await p.screenshot({ path: '/home/user/qa_lab/shots/faucet2_connect.png', fullPage: true }).catch(() => {});
rows.push({ name: 'connect-wallet-modal', text: modalText.slice(0, 9000), frames });
fs.writeFileSync('/home/user/qa_lab/faucet_probe2.json', JSON.stringify(rows, null, 2));
await p.close(); await b.close();
