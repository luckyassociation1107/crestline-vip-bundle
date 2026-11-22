import { chromium } from 'playwright';
import fs from 'node:fs';

const URL = 'https://faucet.quicknode.com/polygon/amoy';
const CASES = [
  { name: 'invalid-address', wallet: 'not-an-address', chain: 'polygon', network: 'amoy' },
  { name: 'zero-balance', wallet: '0x08EE5Cf33C30123A628aC8FF80Ca48Bec8E96Db8', chain: 'polygon', network: 'amoy' },
  { name: 'mainnet-funded', wallet: '0x71e29E128c5483bEB61fE87ADDc934B514Ca4476', chain: 'polygon', network: 'amoy' },
  { name: 'wrong-network', wallet: '0x71e29E128c5483bEB61fE87ADDc934B514Ca4476', chain: 'polygon', network: 'mumbai' },
];
const b = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-blink-features=AutomationControlled', '--disable-dev-shm-usage'] });
const ctx = await b.newContext({ userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36', locale: 'en-US', viewport: { width: 1440, height: 1000 } });
await ctx.addInitScript(() => Object.defineProperty(navigator, 'webdriver', { get: () => false }));
const rows = [];
for (const c of CASES) {
  const p = await ctx.newPage();
  const reqs = [], resps = [], errs = [];
  p.on('request', r => { if (/api|faucet|drip|auth|challenge|turnstile|hcaptcha/i.test(r.url())) reqs.push(`${r.method()} ${r.url().slice(0, 180)}`); });
  p.on('response', r => { if (/api|faucet|drip|auth|challenge|turnstile|hcaptcha/i.test(r.url())) resps.push(`${r.status()} ${r.url().slice(0, 180)}`); });
  p.on('pageerror', e => errs.push(String(e).slice(0, 180)));
  await p.goto(URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await p.waitForTimeout(2500);
  // dismiss cookie banner if present
  const accept = p.getByRole('button', { name: 'Accept', exact: true });
  if (await accept.count()) await accept.click().catch(() => {});
  const initial = await p.locator('#chain,#network,#wallet').evaluateAll(els => els.map(e => ({ id: e.id, value: e.value }))).catch(() => []);
  await p.selectOption('#chain', c.chain).catch(() => {});
  await p.selectOption('#network', c.network).catch(() => {});
  await p.fill('#wallet', c.wallet).catch(() => {});
  const before = await p.locator('body').innerText().catch(() => '');
  const btn = p.getByRole('button', { name: 'Continue', exact: true });
  let clicked = false, clickErr = null;
  try { await btn.click({ timeout: 10000 }); clicked = true; } catch (e) { clickErr = String(e).slice(0, 160); }
  await p.waitForTimeout(5000);
  try { await p.waitForLoadState('networkidle', { timeout: 8000 }); } catch {}
  const after = (await p.locator('body').innerText().catch(() => '')) || '';
  const inputs = await p.locator('input,textarea,select,button').evaluateAll(els => els.slice(0, 40).map(e => ({ tag: e.tagName, type: e.type || '', id: e.id, name: e.name, placeholder: e.placeholder, value: (e.value || '').slice(0, 50), text: (e.innerText || '').trim().slice(0, 60) }))).catch(() => []);
  const frames = p.frames().map(f => ({ name: f.name(), url: f.url().slice(0, 200) }));
  await p.screenshot({ path: `/home/user/qa_lab/shots/faucet_${c.name}.png`, fullPage: true }).catch(() => {});
  rows.push({ ...c, initial, clicked, clickErr, beforeUrl: URL, afterUrl: p.url(),
    before: before.slice(0, 3000), after: after.slice(0, 8000), inputs, frames,
    reqs: reqs.slice(0, 30), resps: resps.slice(0, 30), errs: errs.slice(0, 8) });
  console.log(`\n===== ${c.name} ===== clicked=${clicked} err=${clickErr}`);
  console.log('initial:', JSON.stringify(initial));
  console.log('afterUrl:', p.url());
  console.log('AFTER TEXT:', after.slice(0, 1800).replace(/\n{2,}/g, '\n'));
  console.log('INPUTS:', JSON.stringify(inputs.slice(0, 18)));
  console.log('FRAMES:', JSON.stringify(frames.slice(0, 8)));
  console.log('RESPS:', JSON.stringify(resps.slice(0, 12)));
  await p.close();
}
fs.writeFileSync('/home/user/qa_lab/faucet_probe.json', JSON.stringify(rows, null, 2));
await b.close();
