import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';

const ROOT = '/home/user/crestline_bundle';
const TARGET = '1-testnet-user';
const LAB = '/home/user/qa_lab/serve';
fs.rmSync(LAB, { recursive: true, force: true });
fs.mkdirSync(LAB, { recursive: true });
fs.cpSync(path.join(ROOT, TARGET, 'www'), LAB, { recursive: true });
const jsName = fs.readdirSync(path.join(LAB, 'assets')).find(f => f.startsWith('index-') && f.endsWith('.js'));
const jsPath = path.join(LAB, 'assets', jsName);
let js = fs.readFileSync(jsPath, 'utf8');
const needle = 'function x_(e,t={}){return a_(e,t)}';
console.log('hook needle found:', js.includes(needle));
js = js.replace(needle, needle + '\nwindow.__CRESTLINE={api:x_,store:_g,session:Cg,cfg:()=>Z,portfolio:u=>kg(_g(),u)};');
fs.writeFileSync(jsPath, js);

const server = http.createServer((req, res) => {
  const p = path.join(LAB, decodeURIComponent(req.url.split('?')[0]) === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0]));
  const fp = fs.existsSync(p) && fs.statSync(p).isFile() ? p : path.join(LAB, 'index.html');
  const ext = path.extname(fp);
  res.writeHead(200, { 'Content-Type': ext === '.js' ? 'application/javascript' : ext === '.css' ? 'text/css' : 'text/html' });
  fs.createReadStream(fp).pipe(res);
});
await new Promise(r => server.listen(4191, '127.0.0.1', r));

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
page.on('pageerror', e => console.log('PAGEERROR', String(e).slice(0, 200)));
await page.route('**/*', async route => {
  const u = route.request().url();
  if (/rpc|polygon|amoy|matic|publicnode|1rpc|drpc/i.test(u) && !u.includes('127.0.0.1')) {
    await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, result: '0x0' }) });
    return;
  }
  await route.continue();
});
await page.goto('http://127.0.0.1:4191/?usdt=0x1111111111111111111111111111111111111111', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__CRESTLINE, { timeout: 15000 }).catch(() => {});
console.log('hook present:', await page.evaluate(() => !!window.__CRESTLINE));
console.log('cfg:', await page.evaluate(() => ({ chain: window.__CRESTLINE.cfg().CHAIN_ID, usdt: window.__CRESTLINE.cfg().USDT_ADDRESS, pool: window.__CRESTLINE.cfg().POOL_DEPOSIT_ADDRESS })));
const out = await page.evaluate(async () => {
  const R = window.__CRESTLINE;
  const call = async (p, b, m = 'POST') => { try { return { ok: true, v: await R.api(p, { method: m, body: b ? JSON.stringify(b) : undefined }) }; } catch (e) { return { ok: false, e: String(e.message || e) }; } };
  const reg = await call('/api/auth/register', { username: 'probe_user', password: 'Probe2026!', pin: '482910' });
  const pf = await call('/api/portfolio', null, 'GET');
  return { reg: { ok: reg.ok, err: reg.e, uid: reg.v?.user?.uid, keys: reg.ok ? Object.keys(reg.v).slice(0, 25) : null },
           pf: { ok: pf.ok, err: pf.e, balance: pf.v?.user?.walletBalance, policy: pf.v?.withdrawalPolicy } };
});
console.log(JSON.stringify(out, null, 2).slice(0, 4000));
await browser.close(); server.close();
