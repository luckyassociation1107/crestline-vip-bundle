import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
const srv=spawn('node',['/home/user/crestline_bundle/serve.mjs','/home/user/crestline_bundle/2-testnet-admin/www','4581'],{stdio:'ignore'});
await new Promise(r=>setTimeout(r,1200));
const b=await chromium.launch({headless:true,args:['--no-sandbox']});
const c=await b.newContext({viewport:{width:1440,height:1000}});
const p=await c.newPage(); const errs=[];
p.on('pageerror',e=>errs.push(String(e).slice(0,150)));
await p.goto('http://127.0.0.1:4581/',{waitUntil:'domcontentloaded'});
await p.waitForFunction(()=>document.body.innerText.includes('Sign In to Admin'),{timeout:30000}).catch(()=>{});
await p.getByRole('button',{name:'Sign In',exact:true}).first().click().catch(()=>{});
await p.waitForTimeout(300);
await p.locator('input[type=password]').first().fill('H4DDX6');
await p.getByRole('button',{name:/Sign In to Admin/i}).first().click();
await p.waitForTimeout(10000); // real RPC load
const t=await p.locator('body').innerText();
console.log('UNLOCKED:',!t.includes('OWNER 6-CHAR PASSCODE LOCK'));
console.log('len:',t.length,'jsErrors:',errs.length);
console.log('\n--- FULL CONSOLE TEXT (first 3000) ---');
console.log(t.slice(0,3000));
// enumerate buttons & tabs
const btns=await p.locator('button:visible').allTextContents();
console.log('\n--- BUTTONS ---'); console.log(btns.filter(x=>x.trim()).join(' | '));
await p.screenshot({path:'/home/user/qa_lab/shots/admin_console_1.png',fullPage:true}).catch(()=>{});
await b.close(); srv.kill();
