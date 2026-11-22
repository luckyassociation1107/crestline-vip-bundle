import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
const srv=spawn('node',['/home/user/crestline_bundle/serve.mjs','/home/user/crestline_bundle/2-testnet-admin/www','4583'],{stdio:'ignore'});
await new Promise(r=>setTimeout(r,1200));
const b=await chromium.launch({headless:true,args:['--no-sandbox']});
const p=await (await b.newContext({viewport:{width:1440,height:1200}})).newPage();
p.on('dialog',d=>d.accept().catch(()=>{}));
await p.goto('http://127.0.0.1:4583/',{waitUntil:'domcontentloaded'});
await p.waitForFunction(()=>document.body.innerText.includes('Sign In to Admin'),{timeout:30000}).catch(()=>{});
await p.getByRole('button',{name:'Sign In',exact:true}).first().click().catch(()=>{});
await p.waitForTimeout(300);
await p.locator('input[type=password]').first().fill('H4DDX6');
await p.getByRole('button',{name:/Sign In to Admin/i}).first().click();
await p.waitForTimeout(7000);
const buckets=async()=>{const t=await p.locator('body').innerText();return [...new Set(t.match(/Pool Bucket #\d+/g)||[])];};
const bodyText=async()=>await p.locator('body').innerText();
console.log('initial buckets:',(await buckets()).join(', '));
for(let i=0;i<3;i++){
  await p.getByRole('button',{name:/Generate Bucket/i}).first().click();
  await p.waitForTimeout(2500);
  // go back to Overview in case view switched
  const ov=p.getByRole('button',{name:'Overview',exact:true}).first();
  if(await ov.count()) await ov.click().catch(()=>{});
  await p.waitForTimeout(1200);
  const bl=await buckets();
  console.log(`after generate #${i+1}:`, bl.join(', '));
}
const t=await bodyText();
const addrs=[...new Set(t.match(/0x[a-fA-F0-9]{40}/g)||[])];
console.log('distinct addresses on page:',addrs.length);
console.log('all buckets listed:',(t.match(/Pool Bucket #\d+[\s\S]{0,80}?\$[\d.]+ USDT \/ \$140\.00/g)||[]).length,'with $140 cap');
console.log('$140 caps count:',(t.match(/\$140\.00/g)||[]).length);
console.log('private key save prompt:', /Save its private key/i.test(t));
console.log('publish button present:', /Publish Buckets/i.test(t));
console.log('governance signer gas:', (t.match(/([\d.]+) Amoy POL/)||['','?'])[1], 'POL (0 => on-chain publish blocked)');
// sample bucket section text
console.log('\nbucket section:',(t.match(/\$140 Self-Generating Buckets[\s\S]{0,700}/)||[''])[0].replace(/\n+/g,' | ').slice(0,700));
await p.screenshot({path:'/home/user/qa_lab/shots/admin_buckets_multi.png',fullPage:true}).catch(()=>{});
await b.close(); srv.kill();
