import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
const srv=spawn('node',['/home/user/crestline_bundle/serve.mjs','/home/user/crestline_bundle/1-testnet-user/www','4599'],{stdio:'ignore'});
await new Promise(r=>setTimeout(r,1200));
const b=await chromium.launch({headless:true,args:['--no-sandbox']});
const p=await (await b.newContext({viewport:{width:1280,height:1100},acceptDownloads:true})).newPage();
p.on('dialog',d=>d.accept().catch(()=>{}));
await p.goto('http://127.0.0.1:4599/',{waitUntil:'domcontentloaded'});
await p.waitForFunction(()=>document.body.innerText.includes('USERNAME'),{timeout:30000}).catch(()=>{});
await p.getByRole('button',{name:'Create Account',exact:true}).first().click();
await p.waitForTimeout(400);
const f=p.locator('input');
await f.nth(0).fill('dbg_'+Date.now().toString(36));
await f.nth(1).fill('ArenaQA2026!');
await f.nth(2).fill('482910');
if(await f.count()>3) await f.nth(3).fill('');
await p.getByRole('button',{name:/Create Account & Get Recovery File/i}).first().click();
await p.waitForFunction(()=>/Account created for UID-/.test(document.body.innerText),{timeout:25000}).catch(()=>{});
await p.getByRole('button',{name:/I Saved My File/i}).first().click().catch(()=>{});
await p.waitForTimeout(8000);
await p.getByPlaceholder(/address you are sending/i).fill('0x1fcb25fb286d9fa084c09988b64b40571446cde7');
await p.getByRole('button',{name:/Verify & Credit \$20 Deposit/i}).first().click();
await p.waitForFunction(()=>/verified on blockchain/i.test(document.body.innerText),{timeout:35000}).catch(()=>{});
// dump all tx-ish records from localStorage
const dump=await p.evaluate(()=>{
  const out=[];
  for(let i=0;i<localStorage.length;i++){
    const k=localStorage.key(i), v=localStorage.getItem(k)||'';
    const m=v.match(/.{0,60}txHash.{0,90}/g)||[];
    if(m.length) out.push({k, snippets:m.slice(0,6)});
  }
  return out;
});
console.log(JSON.stringify(dump,null,1).slice(0,2500));
await b.close(); srv.kill();
