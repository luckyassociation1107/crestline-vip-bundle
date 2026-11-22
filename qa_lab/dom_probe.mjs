import { chromium } from 'playwright';
import fs from 'node:fs';

const P = '?_x_tr_sl=auto&_x_tr_tl=en&_x_tr_hl=en';
const urls = [
  ['amoy-home', `https://amoy-polygonscan-com.translate.goog/${P}`],
  ['amoy-pool', `https://amoy-polygonscan-com.translate.goog/address/0x08EE5Cf33C30123A628aC8FF80Ca48Bec8E96Db8${P}`],
  ['poly-home', `https://polygonscan-com.translate.goog/${P}`],
  ['poly-usdt-token', `https://polygonscan-com.translate.goog/token/0xc2132D05D31c914a87C6611C10748AEb04B58e8F${P}`],
  ['poly-usdt-filtered', `https://polygonscan-com.translate.goog/token/0xc2132D05D31c914a87C6611C10748AEb04B58e8F?a=0xA14e867C7B4539B776F88FEDA19cf011b88c793b&_x_tr_sl=auto&_x_tr_tl=en&_x_tr_hl=en`],
  ['faucet', 'https://faucet.quicknode.com/polygon/amoy'],
];
const b = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-blink-features=AutomationControlled', '--disable-dev-shm-usage'] });
const ctx = await b.newContext({ userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36', locale: 'en-US', viewport: { width: 1440, height: 1000 } });
await ctx.addInitScript(() => Object.defineProperty(navigator, 'webdriver', { get: () => false }));
for (const [name, url] of urls) {
  const p = await ctx.newPage();
  let status = null, err = null;
  try { const r = await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 }); status = r?.status(); } catch (e) { err = String(e).slice(0, 120); }
  await p.waitForTimeout(6000);
  try { await p.waitForLoadState('networkidle', { timeout: 8000 }); } catch {}
  const text = (await p.locator('body').innerText().catch(() => '')) || '';
  const inputs = await p.locator('input,textarea,select').evaluateAll(els => els.slice(0, 30).map(e => ({ tag: e.tagName, type: e.type || '', id: e.id, name: e.name, placeholder: e.placeholder, aria: e.getAttribute('aria-label') || '', value: (e.value || '').slice(0, 60) }))).catch(() => []);
  const selects = await p.locator('select').evaluateAll(els => els.map(e => ({ id: e.id, name: e.name, options: Array.from(e.options).map(o => ({ value: o.value, text: o.text.trim() })).slice(0, 30) }))).catch(() => []);
  const buttons = (await p.locator('button,input[type=submit],a[role=button]').allTextContents().catch(() => [])).map(s => s.trim()).filter(Boolean).slice(0, 50);
  console.log(`\n===== ${name} ===== ${status} err=${err} len=${text.length}`);
  console.log('TEXT:', text.slice(0, 2200).replace(/\n{2,}/g, '\n'));
  console.log('INPUTS:', JSON.stringify(inputs.slice(0, 15)));
  console.log('SELECTS:', JSON.stringify(selects));
  console.log('BUTTONS:', JSON.stringify(buttons.slice(0, 30)));
  fs.writeFileSync(`/home/user/qa_lab/dom_${name}.json`, JSON.stringify({ url, status, title: await p.title().catch(() => ''), text: text.slice(0, 30000), inputs, selects, buttons }, null, 2));
  await p.screenshot({ path: `/home/user/qa_lab/shots/dom_${name}.png` }).catch(() => {});
  await p.close();
}
await b.close();
