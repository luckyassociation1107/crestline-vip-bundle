import { chromium } from 'playwright';
import fs from 'node:fs';

const URL = 'https://faucet.quicknode.com/polygon/amoy';
const WALLET = '0x000000000000000000000000000000000000dEaD';
const b = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-blink-features=AutomationControlled', '--disable-dev-shm-usage'] });
const ctx = await b.newContext({ userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36', locale: 'en-US', viewport: { width: 1440, height: 1000 } });
await ctx.addInitScript(() => Object.defineProperty(navigator, 'webdriver', { get: () => false }));
const p = await ctx.newPage();
const resps = [], reqs = [];
p.on('request', r => { if (/api|faucet|drip|bonus|recaptcha/i.test(r.url())) reqs.push(`${r.method()} ${r.url().slice(0, 200)}`); });
p.on('response', r => { if (/api|faucet|drip|bonus|recaptcha/i.test(r.url())) resps.push(`${r.status()} ${r.url().slice(0, 200)}`); });
await p.goto(URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
await p.waitForTimeout(2500);
const accept = p.getByRole('button', { name: 'Accept', exact: true }); if (await accept.count()) await accept.click().catch(() => {});
await p.selectOption('#chain', 'polygon'); await p.selectOption('#network', 'amoy'); await p.fill('#wallet', WALLET);
await p.getByRole('button', { name: 'Continue', exact: true }).click({ timeout: 12000 }).catch(e => console.log('step1 click', String(e).slice(0, 140)));
await p.waitForTimeout(5000); try { await p.waitForLoadState('networkidle', { timeout: 8000 }); } catch {}
let text = (await p.locator('body').innerText().catch(() => '')) || '';
console.log('=== STEP 1 === url=', p.url()); console.log(text.slice(0, 1600).replace(/\n{2,}/g, '\n'));
const step2 = p.url().includes('/bonus');
let finalText = '';
if (step2) {
  const send = p.locator('button[name=_action][value=step-two-skip]').first();
  console.log('send button count', await send.count(), 'text', await send.innerText().catch(() => ''));
  const recaptcha = await p.locator('input[name=recaptchaToken]').getAttribute('value').catch(() => null);
  console.log('recaptcha token len', recaptcha?.length || 0);
  if (await send.count()) {
    await send.click({ timeout: 15000 }).catch(e => console.log('step2 click err', String(e).slice(0, 200)));
    await p.waitForTimeout(9000); try { await p.waitForLoadState('networkidle', { timeout: 10000 }); } catch {}
    finalText = (await p.locator('body').innerText().catch(() => '')) || '';
    console.log('=== STEP 2 AFTER CLICK === url=', p.url());
    console.log(finalText.slice(0, 2600).replace(/\n{2,}/g, '\n'));
  }
} else {
  finalText = text;
}
await p.screenshot({ path: '/home/user/qa_lab/shots/faucet_claim_dead.png', fullPage: true }).catch(() => {});
fs.writeFileSync('/home/user/qa_lab/faucet_claim_probe.json', JSON.stringify({ wallet: WALLET, step2, step1Text: text.slice(0, 8000), finalUrl: p.url(), finalText: finalText.slice(0, 10000), reqs: reqs.slice(0, 50), resps: resps.slice(0, 50) }, null, 2));
console.log('RESPS:', JSON.stringify(resps.slice(0, 25)));
await b.close();
