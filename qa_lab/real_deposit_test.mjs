import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
const srv=spawn('node',['/home/user/crestline_bundle/serve.mjs','/home/user/crestline_bundle/1-testnet-user/www','4591'],{stdio:'ignore'});
await new Promise(r=>setTimeout(r,1200));
const b=await chromium.launch({headless:true,args:['--no-sandbox']});
const p=await (await b.newContext({viewport:{width:1280,height:1100},acceptDownloads:true})).newPage();
const errs=[]; p.on('pageerror',e=>errs.push(String(e).slice(0,120)));
p.on('dialog',d=>d.accept().catch(()=>{}));
await p.goto('http://127.0.0.1:4591/',{waitUntil:'domcontentloaded'});
await p.waitForFunction(()=>document.body.innerText.includes('USERNAME'),{timeout:30000}).catch(()=>{});
await p.getByRole('button',{name:'Create Account',exact:true}).first().click();
await p.waitForTimeout(400);
const f=p.locator('input');
await f.nth(0).fill('realdep_'+Date.now().toString(36));
await f.nth(1).fill('ArenaQA2026!');
await f.nth(2).fill('482910');
if(await f.count()>3) await f.nth(3).fill('');
await p.getByRole('button',{name:/Create Account & Get Recovery File/i}).first().click();
await p.waitForFunction(()=>/Account created for UID-/.test(document.body.innerText),{timeout:25000}).catch(()=>{});
await p.getByRole('button',{name:/I Saved My File/i}).first().click().catch(()=>{});
await p.waitForTimeout(8000);
let t=await p.locator('body').innerText();
console.log('UID:',(t.match(/UID-[A-Z0-9]+/)||['?'])[0]);
console.log('bucket shown:',(t.match(/0x[a-fA-F0-9]{40}/g)||[]).slice(0,2));
// is there a wallet input needed before verify?
const vis=await p.locator('input:visible').evaluateAll(els=>els.map(e=>({ph:e.placeholder,type:e.type})));
console.log('visible inputs:',JSON.stringify(vis));
// fill sending wallet if asked (Circle distributor address)
const SENDER='0x1fcb25fb286d9fa084c09988b64b40571446cde7';
for(const [i,inp] of vis.entries()){
  if(/wallet|0x|sending/i.test(inp.ph||'')){ await p.locator('input:visible').nth(i).fill(SENDER); console.log('filled sender in input',i,inp.ph); }
}
await p.waitForTimeout(500);
await p.getByRole('button',{name:/Verify & Credit \$20 Deposit/i}).first().click();
console.log('clicked verify… waiting for chain scan');
await p.waitForTimeout(20000);
t=await p.locator('body').innerText();
console.log('\n--- AFTER VERIFY ---');
console.log('balance:',(t.match(/\$[\d.]+ USDT/g)||[]).slice(0,4).join(', '));
console.log('membership active?:',/ACTIVE|Day 1|Check-?In|membership active/i.test(t));
console.log('locked wallet?:',t.toLowerCase().includes(SENDER.slice(2,10).toLowerCase())||/LOCKED/.test(t));
console.log('tx recognized?:',t.includes('b3129544')||/credited|verified|success/i.test(t));
console.log('error msgs:',(t.match(/[^|\n]*(error|failed|not found|no deposit)[^|\n]*/gi)||[]).slice(0,3));
console.log('\nexcerpt:',t.slice(0,1300).replace(/\n+/g,' | '));
console.log('jsErrors:',errs.length);
await p.screenshot({path:'/home/user/qa_lab/shots/real_deposit_result.png',fullPage:true}).catch(()=>{});
await b.close(); srv.kill();
