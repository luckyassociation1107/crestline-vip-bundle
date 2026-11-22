import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
const srv=spawn('node',['/home/user/crestline_bundle/serve.mjs','/home/user/crestline_bundle/2-testnet-admin/www','4582'],{stdio:'ignore'});
await new Promise(r=>setTimeout(r,1200));
const b=await chromium.launch({headless:true,args:['--no-sandbox']});
const c=await b.newContext({viewport:{width:1440,height:1100}});
const p=await c.newPage(); const errs=[];
p.on('pageerror',e=>errs.push(String(e).slice(0,150)));
p.on('dialog',d=>d.accept().catch(()=>{}));
await p.goto('http://127.0.0.1:4582/',{waitUntil:'domcontentloaded'});
await p.waitForFunction(()=>document.body.innerText.includes('Sign In to Admin'),{timeout:30000}).catch(()=>{});
await p.getByRole('button',{name:'Sign In',exact:true}).first().click().catch(()=>{});
await p.waitForTimeout(300);
await p.locator('input[type=password]').first().fill('H4DDX6');
await p.getByRole('button',{name:/Sign In to Admin/i}).first().click();
await p.waitForTimeout(8000);

const R=[]; const log=(n,v,d='')=>{R.push([v?'PASS':'FAIL',n,d]);console.log((v?'✅':'❌'),n,d?('— '+d):'')};

let t=await p.locator('body').innerText();
log('Admin unlock with H4DDX6', !t.includes('OWNER 6-CHAR PASSCODE LOCK'));
log('Live chain sync (real Amoy RPC)', /Live #\d+/.test(t), (t.match(/Live #\d+ \(\d+ms\)/)||[''])[0]);
log('Bucket #1 active (pool 0x08EE…)', t.includes('Pool Bucket #1') && t.includes('0x08EE5Cf33C30123A628aC8FF80Ca48Bec8E96Db8'));

// --- AUTO BUCKET CREATION TEST ---
const before=(t.match(/Pool Bucket #\d+/g)||[]).length;
console.log('\n--- GENERATE BUCKET (auto bucket creation) ---');
console.log('buckets before:',before);
await p.getByRole('button',{name:/Generate Bucket/i}).first().click();
await p.waitForTimeout(3000);
t=await p.locator('body').innerText();
let after=(t.match(/Pool Bucket #\d+/g)||[]).length;
console.log('buckets after 1 click:',after);
log('Auto bucket creation works (Generate Bucket)', after>before, `#${before} -> #${after}`);
const newAddr=(t.match(/0x[a-fA-F0-9]{40}/g)||[]);
console.log('bucket addresses now:',[...new Set(newAddr)].slice(0,6).join(', '));
// generate one more
await p.getByRole('button',{name:/Generate Bucket/i}).first().click();
await p.waitForTimeout(2500);
t=await p.locator('body').innerText();
const after2=(t.match(/Pool Bucket #\d+/g)||[]).length;
log('Second bucket generates (deterministic HD chain)', after2>after, `#${after} -> #${after2}`);
log('New buckets have distinct 0x addresses', new Set(t.match(/0x[a-fA-F0-9]{40}/g)||[]).size>=3);
log('$140 cap shown per bucket', (t.match(/\$140\.00/g)||[]).length>=2);
await p.screenshot({path:'/home/user/qa_lab/shots/admin_buckets.png',fullPage:true}).catch(()=>{});

// --- NAVIGATION TABS ---
console.log('\n--- TABS ---');
for(const tab of ['Members','Random','Notices','Settings','Overview']){
  const btn=p.getByRole('button',{name:tab,exact:true}).first();
  if(await btn.count()){ await btn.click().catch(()=>{}); await p.waitForTimeout(1500);
    const tt=await p.locator('body').innerText();
    log(`Tab "${tab}" opens`, tt.length>500, `len=${tt.length}`);
    if(tab==='Members') console.log('  members excerpt:',tt.slice(0,220).replace(/\n+/g,' | '));
    if(tab==='Settings') console.log('  settings excerpt:',(tt.match(/Settings[\s\S]{0,320}/)||[''])[0].replace(/\n+/g,' | '));
    await p.screenshot({path:`/home/user/qa_lab/shots/admin_tab_${tab}.png`,fullPage:true}).catch(()=>{});
  } else log(`Tab "${tab}" opens`, false, 'button not found');
}

// --- lock again ---
const lockBtn=p.getByRole('button',{name:'Lock',exact:true}).first();
if(await lockBtn.count()){ await lockBtn.click().catch(()=>{}); await p.waitForTimeout(1500);
  const lt=await p.locator('body').innerText();
  log('Re-lock works', lt.includes('OWNER 6-CHAR PASSCODE LOCK')||lt.includes('Sign In to Admin'));
}
log('Zero uncaught JS errors in whole session', errs.length===0, errs.slice(0,2).join('|'));
console.log('\nSUMMARY:',R.filter(r=>r[0]==='PASS').length,'PASS /',R.filter(r=>r[0]==='FAIL').length,'FAIL');
await b.close(); srv.kill();
