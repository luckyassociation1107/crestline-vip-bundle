import { chromium } from 'playwright';
import fs from 'node:fs';

const BASE = 'https://faucet.quicknode.com/polygon/amoy';
const CANDIDATES = [
  ['binance-hot', '0x28C6c06298d514Db089934071355E5743bf21d60'],
  ['vitalik', '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045'],
];
const b = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-blink-features=AutomationControlled', '--disable-dev-shm-usage'] });
const ctx = await b.newContext({ userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36', locale: 'en-US', viewport: { width: 1440, height: 1000 } });
await ctx.addInitScript(() => Object.defineProperty(navigator, 'webdriver', { get: () => false }));
const all = [];
let success = null;
for (const [name, wallet] of CANDIDATES) {
  if (success) break;
  const p = await ctx.newPage();
  const calls = [];
  p.on('response', async r => {
    const u = r.url();
    if (/drip|claim|bonus|faucet|api/i.test(u) && !/\.(js|css|png|svg|woff)/i.test(u)) {
      let body = '';
      try { body = (await r.text()).slice(0, 2500); } catch {}
      calls.push({ status: r.status(), url: u.slice(0, 220), body: body.replace(/\s+/g, ' ').slice(0, 1200) });
    }
  });
  await p.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await p.waitForTimeout(2500);
  const accept = p.getByRole('button', { name: 'Accept', exact: true }); if (await accept.count()) await accept.click().catch(() => {});
  await p.selectOption('#chain', 'polygon'); await p.selectOption('#network', 'amoy'); await p.fill('#wallet', wallet);
  await p.getByRole('button', { name: 'Continue', exact: true }).click({ timeout: 12000 }).catch(() => {});
  await p.waitForTimeout(5000);
  const step1Url = p.url();
  const step1Text = (await p.locator('body').innerText().catch(() => '')) || '';
  const step2 = step1Url.includes('/bonus');
  let finalText = '', finalUrl = step1Url, txHashes = [];
  if (step2) {
    // wait for invisible reCAPTCHA token to be populated
    await p.waitForFunction(() => {
      const v = document.querySelector('input[name=recaptchaToken]')?.value || '';
      return v.length > 20;
    }, { timeout: 15000 }).catch(() => {});
    const recaptcha = await p.locator('input[name=recaptchaToken]').getAttribute('value').catch(() => null);
    const send = p.locator('button[name=_action][value=step-two-skip]').first();
    if (await send.count()) {
      await send.click({ timeout: 15000 }).catch(e => console.log(name, 'send click err', String(e).slice(0, 160)));
      await p.waitForTimeout(10000);
      try { await p.waitForLoadState('networkidle', { timeout: 10000 }); } catch {}
      finalUrl = p.url(); finalText = (await p.locator('body').innerText().catch(() => '')) || '';
      txHashes = [...new Set((finalText + ' ' + calls.map(c => c.body).join(' ')).match(/0x[0-9a-fA-F]{64}/g) || [])];
    }
  } else finalText = step1Text;
  const ok = /success|sent|transaction|view on|explorer|received/i.test(finalText) && txHashes.length > 0;
  const cooldown = /12 hour|cooldown|already|recently/i.test(finalText);
  const entry = { name, wallet, step1Url, step2, step1Text: step1Text.slice(0, 6000), finalUrl,
    finalText: finalText.slice(0, 10000), txHashes, ok, cooldown, calls: calls.slice(0, 40) };
  all.push(entry);
  console.log(`\n===== ${name} ===== step2=${step2} ok=${ok} cooldown=${cooldown}`);
  console.log('step1Url:', step1Url, '\nfinalUrl:', finalUrl);
  console.log('FINAL:', finalText.slice(0, 2600).replace(/\n{2,}/g, '\n'));
  console.log('txHashes:', JSON.stringify(txHashes.slice(0, 5)));
  console.log('calls:', JSON.stringify(calls.slice(-12)));
  await p.screenshot({ path: `/home/user/qa_lab/shots/faucet_final_${name}.png`, fullPage: true }).catch(() => {});
  if (ok) success = entry;
  await p.close();
}
fs.writeFileSync('/home/user/qa_lab/faucet_final_claim.json', JSON.stringify({ success, all }, null, 2));
console.log('\nSUCCESS:', success ? JSON.stringify({ name: success.name, wallet: success.wallet, txHashes: success.txHashes }) : 'none');
await b.close();
