import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
const srv=spawn('node',['/home/user/crestline_bundle/serve.mjs','/home/user/crestline_bundle/1-testnet-user/www','4592'],{stdio:'ignore'});
await new Promise(r=>setTimeout(r,1200));
const b=await chromium.launch({headless:true,args:['--no-sandbox']});
const p=await (await b.newContext({viewport:{width:1280,height:1100},acceptDownloads:true})).newPage();
const errs=[]; p.on('pageerror',e=>errs.push(String(e).slice(0,120)));
p.on('dialog',d=>d.accept().catch(()=>{}));
await p.goto('http://127.0.0.1:4592/',{waitUntil:'domcontentloaded'});
await p.waitForFunction(()=>document.body.innerText.includes('USERNAME'),{timeout:30000}).catch(()=>{});
await p.getByRole('button',{name:'Create Account',exact:true}).first().click();
await p.waitForTimeout(400);
const f=p.locator('input');
await f.nth(0).fill('vip_'+Date.now().toString(36));
await f.nth(1).fill('ArenaQA2026!');
await f.nth(2).fill('482910');
if(await f.count()>3) await f.nth(3).fill('');
await p.getByRole('button',{name:/Create Account & Get Recovery File/i}).first().click();
await p.waitForFunction(()=>/Account created for UID-/.test(document.body.innerText),{timeout:25000}).catch(()=>{});
await p.getByRole('button',{name:/I Saved My File/i}).first().click().catch(()=>{});
await p.waitForTimeout(8000);
// deposit verify with real sender
const SENDER='0x1fcb25fb286d9fa084c09988b64b40571446cde7';
await p.getByPlaceholder(/address you are sending/i).fill(SENDER);
await p.getByRole('button',{name:/Verify & Credit \$20 Deposit/i}).first().click();
await p.waitForFunction(()=>/verified on blockchain/i.test(document.body.innerText),{timeout:30000}).catch(()=>{});
let t=await p.locator('body').innerText();
console.log('deposit verified:',/verified on blockchain/i.test(t),'| balance:',(t.match(/\$[\d.]+ USDT/)||['?'])[0]);
// ACTIVATE VIP
await p.getByRole('button',{name:/Activate VIP Membership/i}).first().click();
await p.waitForTimeout(6000);
t=await p.locator('body').innerText();
console.log('\n--- AFTER VIP ACTIVATION ---');
console.log('VIP active:',/VIP ACTIVE|Day \d+ of 28|Check-In|ACTIVE PASS/i.test(t));
console.log('excerpt:',(t.match(/(VIP|Day|Check|Claim)[^|\n]{0,80}/gi)||[]).slice(0,8).join(' || '));
// FIRST DAILY CLAIM
const claim=p.getByRole('button',{name:/check.?in|claim/i}).first();
if(await claim.count()){
  console.log('claim button:',await claim.innerText());
  await claim.click().catch(()=>{});
  await p.waitForTimeout(5000);
  t=await p.locator('body').innerText();
  console.log('after claim balance:',(t.match(/\$[\d.]+ USDT/g)||[]).slice(0,3).join(', '));
  console.log('claim success:',/\$21\.00|claimed|Day 1 ✓|collected/i.test(t));
}
console.log('withdrawal section:',(t.match(/[^|\n]{0,60}(withdraw|payout)[^|\n]{0,80}/gi)||[]).slice(0,3).join(' || '));
console.log('jsErrors:',errs.length);
await p.screenshot({path:'/home/user/qa_lab/shots/real_vip_active.png',fullPage:true}).catch(()=>{});
await b.close(); srv.kill();
