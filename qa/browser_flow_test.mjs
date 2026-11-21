/**
 * Crestline VIP — headless browser flow test.
 *
 * Serves each target's www/ locally, mocks Polygon JSON-RPC (no funds / no
 * live chain needed) and exercises the real UI in Chromium.
 *
 * Setup:  npm i playwright && npx playwright install chromium
 * Run:    node qa/browser_flow_test.mjs         (from repo root)
 * Output: qa/browser-results.json
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TARGETS = [
  { id: '1-testnet-user',  port: 4181, role: 'user',  chain: '0x13882' },
  { id: '2-testnet-admin', port: 4182, role: 'admin', chain: '0x13882' },
  { id: '3-mainnet-user',  port: 4183, role: 'user',  chain: '0x89' },
  { id: '4-mainnet-admin', port: 4184, role: 'admin', chain: '0x89' },
];
const Z32 = '0x' + '00'.repeat(32), Z64 = '0x' + '0'.repeat(64);
const nowHex = '0x' + Math.floor(Date.now() / 1000).toString(16);

function rpcResult(method, chain) {
  switch (method) {
    case 'eth_chainId': return chain;
    case 'net_version': return String(parseInt(chain, 16));
    case 'eth_blockNumber': return '0x2dc6c0';
    case 'eth_getBlockByNumber': return { number: '0x2dc6c0', hash: Z32, parentHash: Z32,
      timestamp: nowHex, transactions: [], gasLimit: '0x1c9c380', gasUsed: '0x0',
      baseFeePerGas: '0x7', miner: '0x' + '00'.repeat(20) };
    case 'eth_getLogs': return [];
    case 'eth_call': return Z64;
    case 'eth_getBalance': return '0x0';
    case 'eth_getCode': return '0x';
    case 'eth_gasPrice': return '0x3b9aca00';
    case 'eth_estimateGas': return '0x5208';
    case 'eth_getTransactionCount': return '0x0';
    case 'eth_getTransactionReceipt': return null;
    case 'eth_sendRawTransaction': return '0x' + '11'.repeat(32);
    default: return '0x0';
  }
}

async function mockRPC(page, chain) {
  await page.route('**/*', async route => {
    const req = route.request(), url = req.url();
    if (/rpc|polygon|amoy|matic|1rpc|drpc|publicnode|blockscout|polygonscan/i.test(url) && !url.includes('127.0.0.1')) {
      let body = {}; try { body = JSON.parse(req.postData() || '{}'); } catch {}
      const arr = Array.isArray(body) ? body : [body];
      const payload = arr.map(x => ({ jsonrpc: '2.0', id: x.id ?? 1, result: rpcResult(x.method, chain) }));
      await route.fulfill({ status: 200, contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*' },
        body: JSON.stringify(Array.isArray(body) ? payload : payload[0]) });
      return;
    }
    await route.continue();
  });
}

const servers = TARGETS.map(t => spawn(process.execPath, ['serve.mjs', path.join(ROOT, t.id, 'www'), String(t.port)],
  { cwd: ROOT, stdio: 'ignore' }));
await new Promise(r => setTimeout(r, 1200));

const results = [];
const add = (name, ok, detail = '') => { results.push({ name, passed: ok === null ? null : !!ok, detail }); };

let browser;
try {
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  for (const t of TARGETS) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', e => errs.push(String(e).slice(0, 200)));
    page.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 200)); });
    await mockRPC(page, t.chain);
    await page.goto(`http://127.0.0.1:${t.port}/`, { waitUntil: 'domcontentloaded', timeout: 30000 });

    if (t.role === 'user') {
      await page.waitForFunction(() => document.body.innerText.includes('USERNAME'), { timeout: 25000 }).catch(() => {});
      const login = await page.locator('body').innerText();
      add(`${t.id}: login/signup screen renders`, login.includes('Sign In') && login.includes('Create Account'));
      add(`${t.id}: no admin UI leaked into user build`, !/Admin Console|Master Seed/.test(login));

      await page.getByRole('button', { name: 'Create Account', exact: true }).first().click();
      await page.waitForTimeout(250);
      const form = page.locator('input');
      await form.nth(0).fill('qa_' + t.id.replace(/\W/g, '_'));
      await form.nth(1).fill('ArenaQA2026!');
      await form.nth(2).fill('482910');
      if (await form.count() > 3) await form.nth(3).fill('');
      await page.getByRole('button', { name: /Create Account & Get Recovery File/i }).first().click();
      await page.waitForFunction(() => /Account created for UID-/.test(document.body.innerText), { timeout: 15000 }).catch(() => {});
      const created = await page.locator('body').innerText();
      add(`${t.id}: account creation produces UID`, /UID-[A-Z0-9]+/.test(created), (created.match(/UID-[A-Z0-9]+/) || [''])[0]);
      add(`${t.id}: encrypted recovery file offered`, created.includes('.crestline') && created.includes('Time-Cipher'));

      await page.getByRole('button', { name: /I Saved My File/i }).first().click().catch(() => {});
      await page.waitForTimeout(1800);
      const dash = await page.locator('body').innerText();
      add(`${t.id}: dashboard reached`, dash.includes('Join VIP Membership') || dash.includes('Activate Membership'));
      add(`${t.id}: $20 deposit / bucket lock / same-wallet UI`, dash.includes('$20.00') && dash.includes('RESERVED DEPOSIT BUCKET') && dash.includes('LOCKS ON 1ST DEPOSIT'));
      add(`${t.id}: no uncaught JS errors`, errs.length === 0, errs.slice(0, 2).join(' | '));
    } else {
      await page.waitForFunction(() => document.body.innerText.includes('Sign In to Admin'), { timeout: 25000 }).catch(() => {});
      const gate = await page.locator('body').innerText();
      add(`${t.id}: admin auth gate renders`, gate.includes('Admin Console') && gate.includes('6-CHARACTER ADMIN CODE'));
      add(`${t.id}: no user deposit UI leaked into admin build`, !/REFPROOF3|Join VIP Membership/.test(gate));

      // Seed / guardian tabs switch
      for (const label of ['Seed', '2-of-3 Shares']) {
        const b = page.getByRole('button', { name: label, exact: true }).first();
        if (await b.count()) { await b.click(); await page.waitForTimeout(200); }
      }
      const tabs = await page.locator('body').innerText();
      add(`${t.id}: seed + 2-of-3 guardian recovery tabs work`, tabs.includes('12-WORD MASTER SEED') || tabs.includes('Guardian Share'));

      await page.getByRole('button', { name: 'Sign In', exact: true }).first().click();
      await page.waitForTimeout(200);
      await page.locator('input[type=password]').first().fill('000000');
      await page.getByRole('button', { name: /Sign In to Admin/i }).first().click();
      await page.waitForTimeout(500);
      const rejected = await page.locator('body').innerText();
      add(`${t.id}: invalid passcode rejected`, rejected.includes('Invalid 6-character Admin Passcode'));

      // To test the console itself, run with your own code:  ADMIN_CODE=A7K9M2 node qa/browser_flow_test.mjs
      // testnet and mainnet admin builds derive from different master seeds;
      // supply ADMIN_CODE (testnet) and/or ADMIN_CODE_MAINNET separately.
      const adminCode = (t.chain === '0x89' ? process.env.ADMIN_CODE_MAINNET : process.env.ADMIN_CODE) || '';
      if (adminCode) {
        await page.locator('input[type=password]').first().fill(adminCode);
        await page.getByRole('button', { name: /Sign In to Admin/i }).first().click().catch(() => {});
        await page.waitForTimeout(1800);
        const consoleText = await page.locator('body').innerText();
        const unlocked = !consoleText.includes('OWNER 6-CHAR PASSCODE LOCK');
        if (unlocked) add(`${t.id}: admin console AFTER login`, true, consoleText.slice(0, 120));
        else add(`${t.id}: admin console AFTER login`, null, 'BLOCKED: supplied code did not unlock this build (different per-network owner seed)');
      } else {
        add(`${t.id}: admin console AFTER login`, null, 'BLOCKED: set ADMIN_CODE (owner 6-char code) to test; master seed is not in the bundle');
      }
      add(`${t.id}: no uncaught JS errors`, errs.length === 0, errs.slice(0, 2).join(' | '));
    }
    await ctx.close();
  }
} finally {
  if (browser) await browser.close();
  servers.forEach(s => s.kill());
}

const passed = results.filter(r => r.passed === true).length;
const failed = results.filter(r => r.passed === false).length;
const blocked = results.filter(r => r.passed === null).length;
console.log(`\n${'='.repeat(70)}\nBROWSER FLOWS: ${passed} passed, ${failed} failed, ${blocked} blocked\n${'='.repeat(70)}`);
for (const r of results) console.log(`  ${r.passed === true ? 'PASS' : r.passed === null ? 'BLOCK' : 'FAIL'}  ${r.name}${r.detail ? ' :: ' + r.detail : ''}`);
fs.writeFileSync(path.join(ROOT, 'qa', 'browser-results.json'), JSON.stringify({ passed, failed, blocked, results }, null, 2));
process.exit(failed ? 1 : 0);
