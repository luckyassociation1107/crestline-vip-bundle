import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
const srv=spawn('node',['/home/user/crestline_bundle/serve.mjs','/home/user/crestline_bundle/1-testnet-user/www','4575'],{stdio:'ignore'});
await new Promise(r=>setTimeout(r,1200));
const b=await chromium.launch({headless:true,args:['--no-sandbox']});
const c=await b.newContext({acceptDownloads:true,viewport:{width:1280,height:950}});
const p=await c.newPage(); const errs=[];
p.on('pageerror',e=>errs.push(String(e).slice(0,150)));
await p.goto('http://127.0.0.1:4575/',{waitUntil:'domcontentloaded'});
await p.waitForTimeout(9000);
// go to create account
await p.getByText('Create Account',{exact:false}).first().click().catch(()=>{});
await p.waitForTimeout(1500);
const t1=(await p.locator('body').innerText())||'';
console.log('signup screen:',t1.slice(0,260).replace(/\n+/g,' | '));
// fill the form
const inputs=p.locator('input:visible');
const n=await inputs.count();
console.log('visible inputs:',n);
for(let i=0;i<n;i++){
  const ph=(await inputs.nth(i).getAttribute('placeholder'))||'';
  const ty=(await inputs.nth(i).getAttribute('type'))||'';
  console.log(` input${i}: type=${ty} ph=${ph}`);
}
// typical: username, password, confirm, pin?
const U='qauser_'+Date.now().toString(36);
await inputs.nth(0).fill(U).catch(()=>{});
for(let i=1;i<Math.min(n,4);i++){
  const ty=(await inputs.nth(i).getAttribute('type'))||'';
  const ph=((await inputs.nth(i).getAttribute('placeholder'))||'').toLowerCase();
  if(ty==='password'||/pass/.test(ph)) await inputs.nth(i).fill('QaPass!2345').catch(()=>{});
  else if(/pin/.test(ph)) await inputs.nth(i).fill('246810').catch(()=>{});
}
const dl=p.waitForEvent('download',{timeout:25000}).catch(()=>null);
await p.getByRole('button',{name:/create|sign up|register/i}).first().click().catch(()=>{});
await p.waitForTimeout(12000);
const d=await dl;
const t2=(await p.locator('body').innerText())||'';
console.log('\nafter submit: textLen='+t2.length,'download='+(d?await d.suggestedFilename():'none'));
console.log('UID present:',/UID-[A-Z0-9]+/.test(t2)? (t2.match(/UID-[A-Z0-9]+/)||[])[0] : false);
console.log('excerpt:',t2.slice(0,500).replace(/\n+/g,' | '));
console.log('config error?:',t2.includes('not configured')?'YES-STILL':'none');
console.log('USDC addr visible?:',t2.includes('0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582')||/0x41E9/i.test(t2));
console.log('jsErrors:',errs.length,errs.slice(0,3));
await p.screenshot({path:'/home/user/qa_lab/shots/real_signup.png',fullPage:true}).catch(()=>{});
await b.close(); srv.kill();
