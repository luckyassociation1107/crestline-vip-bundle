import { chromium } from 'playwright';
import fs from 'node:fs';

const targets = [
  ['direct-amoy', 'https://amoy.polygonscan.com/address/0x08EE5Cf33C30123A628aC8FF80Ca48Bec8E96Db8'],
  ['translate-amoy', 'https://amoy-polygonscan-com.translate.goog/address/0x08EE5Cf33C30123A628aC8FF80Ca48Bec8E96Db8?_x_tr_sl=auto&_x_tr_tl=en&_x_tr_hl=en'],
  ['translate-poly', 'https://polygonscan-com.translate.goog/address/0xA14e867C7B4539B776F88FEDA19cf011b88c793b?_x_tr_sl=auto&_x_tr_tl=en&_x_tr_hl=en'],
  ['translate-amoy-home', 'https://amoy-polygonscan-com.translate.goog/?_x_tr_sl=auto&_x_tr_tl=en&_x_tr_hl=en'],
  ['translate-poly-home', 'https://polygonscan-com.translate.goog/?_x_tr_sl=auto&_x_tr_tl=en&_x_tr_hl=en'],
];

const modes = [
  { name: 'headless-shell', opts: { headless: true, executablePath: '/home/user/.cache/ms-playwright/chromium_headless_shell-1148/chrome-linux/headless_shell', args: ['--no-sandbox', '--disable-blink-features=AutomationControlled', '--disable-dev-shm-usage'] } },
  { name: 'chromium', opts: { headless: true, args: ['--no-sandbox', '--disable-blink-features=AutomationControlled', '--disable-dev-shm-usage'] } },
];

for (const mode of modes) {
  let b;
  try { b = await chromium.launch(mode.opts); }
  catch (e) { console.log(mode.name, 'launch failed', String(e).slice(0, 150)); continue; }
  const ctx = await b.newContext({ userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36', locale: 'en-US', viewport: { width: 1440, height: 1000 }, extraHTTPHeaders: { 'Accept-Language': 'en-US,en;q=0.9' } });
  await ctx.addInitScript(() => Object.defineProperty(navigator, 'webdriver', { get: () => false }));
  for (const [name, url] of targets) {
    const p = await ctx.newPage();
    let status = null;
    try { const r = await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 40000 }); status = r?.status(); } catch (e) { status = 'ERR ' + String(e).slice(0, 80); }
    // wait up to 25s for a Cloudflare challenge to clear
    let cleared = false;
    for (let i = 0; i < 10; i++) {
      await p.waitForTimeout(2500);
      const t = (await p.locator('body').innerText().catch(() => '')) || '';
      if (!/Just a moment|Performing security verification|Attention Required/i.test(t) && t.length > 300) { cleared = true; break; }
    }
    const text = (await p.locator('body').innerText().catch(() => '')) || '';
    const title = await p.title().catch(() => '');
    console.log(`${mode.name.padEnd(15)} ${name.padEnd(22)} status=${String(status).padEnd(6)} cleared=${cleared} len=${String(text.length).padEnd(6)} title=${title.slice(0, 70)}`);
    console.log('   ', text.slice(0, 260).replace(/\n/g, ' | '));
    if (cleared && text.length > 300) {
      fs.writeFileSync(`/home/user/qa_lab/cf_${mode.name}_${name}.txt`, text.slice(0, 20000));
      await p.screenshot({ path: `/home/user/qa_lab/shots/cf_${mode.name}_${name}.png` }).catch(() => {});
    }
    await p.close();
  }
  await b.close();
}
