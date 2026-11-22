import { chromium } from 'playwright';
import fs from 'node:fs';

const BASE = 'https://faucet.quicknode.com/polygon/amoy';
const CANDIDATES = [
  ['fresh-4D68', '0x4D68aaBc891bb2216B5A168Bf6B8305b1a48C460'],
  ['fresh-8844', '0x884498Dd3c238E1DFEd5292c6c5B963593b47398'],
  ['fresh-07fE', '0x07fE8849ad2C1cC9a0621868440c7640A0455781'],
];
const b = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-blink-features=AutomationControlled', '--disable-dev-shm-usage'] });
const ctx = await b.newContext({ userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36', locale: 'en-US', viewport: { width: 1440, height: 1000 } });
await ctx.addInitScript(() => Object.defineProperty(navigator, 'webdriver', { get: () => false }));
const all = []; let success = null;
for (const [name, wallet] of CANDIDATES) {
  if (success) break;
  const p = await ctx.newPage();
  const bodies = [];
  p.on('response', async r => {
    if (/bonus\.data|drip|claim|send/i.test(r.url()) && !/\.(js|css|png|svg|woff)/i.test(r.url())) {
      try { bodies.push({ url: r.url().slice(0, 220), status: r.status(), text: (await r.text()).slice(0, 6000) }); } catch {}
    }
  });
  await p.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await p.waitForTimeout(2200);
  const accept = p.getByRole('button', { name: 'Accept', exact: true }); if (await accept.count()) await accept.click().catch(() => {});
  await p.selectOption('#chain', 'polygon'); await p.selectOption('#network', 'amoy'); await p.fill('#wallet', wallet);
  await p.getByRole('button', { name: 'Continue', exact: true }).click({ timeout: 12000 }).catch(() => {});
  await p.waitForTimeout(4500);
  const step1Url = p.url(); const step1Text = (await p.locator('body').innerText().catch(() => '')) || '';
  const step2 = step1Url.includes('/bonus');
  let finalText = '', finalUrl = step1Url, hashes = [];
  if (step2) {
    await p.waitForFunction(() => (document.querySelector('input[name=recaptchaToken]')?.value || '').length > 20, { timeout: 15000 }).catch(() => {});
    const send = p.locator('button[name=_action][value=step-two-skip]').first();
    if (await send.count()) {
      await send.click({ timeout: 15000 }).catch(() => {});
      await p.waitForTimeout(12000);
      try { await p.waitForLoadState('networkidle', { timeout: 10000 }); } catch {}
      finalUrl = p.url(); finalText = (await p.locator('body').innerText().catch(() => '')) || '';
    }
  } else finalText = step1Text;
  const combined = finalText + ' ' + bodies.map(x => x.text).join(' ');
  hashes = [...new Set(combined.match(/0x[0-9a-fA-F]{64}/g) || [])];
  const cooldown = /12 hours|cooldown|come back/i.test(finalText);
  const ok = hashes.length > 0 && /success|sent|received|transaction hash|view on explorer/i.test(finalText);
  const entry = { name, wallet, step1Url, step2, step1Text: step1Text.slice(0, 5000), finalUrl,
    finalText: finalText.slice(0, 12000), hashes, cooldown, ok, bodies };
  all.push(entry);
  console.log(`\n===== ${name} ===== step2=${step2} ok=${ok} cooldown=${cooldown} hashes=${hashes.length}`);
  console.log('finalUrl:', finalUrl);
  console.log(finalText.slice(0, 2200).replace(/\n{2,}/g, '\n'));
  console.log('hashes:', JSON.stringify(hashes.slice(0, 5)));
  console.log('bodies:', JSON.stringify(bodies.slice(-4).map(x => ({ url: x.url, status: x.status, text: x.text.slice(0, 500) }))));
  await p.screenshot({ path: `/home/user/qa_lab/shots/faucet_fresh_${name}.png`, fullPage: true }).catch(() => {});
  if (ok) success = entry;
  await p.close();
}
fs.writeFileSync('/home/user/qa_lab/faucet_try_fresh.json', JSON.stringify({ success, all }, null, 2));
console.log('\nSUCCESS:', success ? JSON.stringify({ name: success.name, wallet: success.wallet, hashes: success.hashes }) : 'none');
await b.close();
