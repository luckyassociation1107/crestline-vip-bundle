import { chromium } from 'playwright';
import fs from 'node:fs';

const OUT = '/home/user/qa_lab/explore_external.json';
const SHOTS = '/home/user/qa_lab/shots';
fs.mkdirSync(SHOTS, { recursive: true });

const URLS = [
  ['polygonscan-home', 'https://polygonscan.com/'],
  ['amoy-home', 'https://amoy.polygonscan.com/'],
  ['amoy-pool', 'https://amoy.polygonscan.com/address/0x08EE5Cf33C30123A628aC8FF80Ca48Bec8E96Db8'],
  ['amoy-registry', 'https://amoy.polygonscan.com/address/0x9be43bC43b1b3e47f9507696101938EB830cbae8'],
  ['polygon-usdt', 'https://polygonscan.com/token/0xc2132D05D31c914a87C6611C10748AEb04B58e8F'],
  ['polygon-pool', 'https://polygonscan.com/address/0xA14e867C7B4539B776F88FEDA19cf011b88c793b'],
  ['quicknode-faucet', 'https://faucet.quicknode.com/polygon/amoy'],
];

const browser = await chromium.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-blink-features=AutomationControlled', '--disable-dev-shm-usage'],
});
const ctx = await browser.newContext({
  userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  locale: 'en-US',
  timezoneId: 'Asia/Calcutta',
  viewport: { width: 1440, height: 1000 },
  extraHTTPHeaders: { 'Accept-Language': 'en-US,en;q=0.9' },
});
await ctx.addInitScript(() => { Object.defineProperty(navigator, 'webdriver', { get: () => false }); });

const rows = [];
for (const [name, url] of URLS) {
  const page = await ctx.newPage();
  const consoleErrors = [];
  page.on('pageerror', e => consoleErrors.push(String(e).slice(0, 180)));
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push('console: ' + m.text().slice(0, 180)); });
  const responses = [];
  page.on('response', r => { if (responses.length < 8) responses.push(`${r.status()} ${r.url().slice(0, 130)}`); });
  let status = null, err = null;
  try {
    const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    status = resp ? resp.status() : null;
    await page.waitForTimeout(5000);
    try { await page.waitForLoadState('networkidle', { timeout: 8000 }); } catch {}
  } catch (e) { err = String(e).slice(0, 220); }
  const text = (await page.locator('body').innerText().catch(() => '')) || '';
  const title = await page.title().catch(() => '');
  const inputs = await page.locator('input,textarea,select').evaluateAll(els => els.slice(0, 25).map(e => ({
    tag: e.tagName, type: e.type || '', name: e.name || '', id: e.id || '',
    placeholder: e.placeholder || '', aria: e.getAttribute('aria-label') || '',
  }))).catch(() => []);
  const buttons = (await page.locator('button,a[role=button]').allTextContents().catch(() => [])).map(s => s.trim()).filter(Boolean).slice(0, 40);
  const links = await page.locator('a').evaluateAll(els => els.slice(0, 40).map(e => ({ text: e.innerText.trim().slice(0, 60), href: e.href }))).catch(() => []);
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: false }).catch(() => {});
  rows.push({ name, url, finalUrl: page.url(), status, title, err, textLen: text.length,
    text: text.slice(0, 5000), inputs, buttons, links, responses, consoleErrors: consoleErrors.slice(0, 8) });
  console.log(`\n===== ${name} ===== ${status} ${title} @ ${page.url()}`);
  console.log('err:', err, 'textLen:', text.length);
  console.log(text.slice(0, 1400).replace(/\n{2,}/g, '\n'));
  console.log('inputs:', JSON.stringify(inputs.slice(0, 10)));
  console.log('buttons:', JSON.stringify(buttons.slice(0, 20)));
  await page.close();
}
fs.writeFileSync(OUT, JSON.stringify(rows, null, 2));
await browser.close();
console.log('\nwrote', OUT);
