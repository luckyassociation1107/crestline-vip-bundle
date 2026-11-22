import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
const srv1=spawn('node',['/home/user/crestline_bundle/serve.mjs','/home/user/crestline_bundle/1-testnet-user/www','4571'],{stdio:'ignore'});
const srv3=spawn('node',['/home/user/crestline_bundle/serve.mjs','/home/user/crestline_bundle/3-mainnet-user/www','4573'],{stdio:'ignore'});
await new Promise(r=>setTimeout(r,1200));
const b=await chromium.launch({headless:true,args:['--no-sandbox']});
for(const [name,url] of [['testnet-REAL-RPC','http://127.0.0.1:4571/'],['mainnet-REAL-RPC','http://127.0.0.1:4573/']]){
  const p=await b.newPage(); const errs=[]; const rpcCalls=[];
  p.on('pageerror',e=>errs.push(String(e).slice(0,120)));
  p.on('request',r=>{ if(/publicnode|drpc|1rpc|polygon/i.test(r.url()) && r.method()==='POST') rpcCalls.push(r.url().replace(/https?:\/\//,'').split('/')[0]); });
  await p.goto(url,{waitUntil:'domcontentloaded',timeout:30000});
  await p.waitForTimeout(15000);
  const t=(await p.locator('body').innerText().catch(()=>''))||'';
  const stuck=/Loading Crestline VIP/.test(t)&&t.length<200;
  console.log(`\n=== ${name} === textLen=${t.length} stuckOnSplash=${stuck} jsErrors=${errs.length}`);
  console.log('rpc hosts used:',[...new Set(rpcCalls)].join(', ')||'none');
  console.log('excerpt:',t.slice(0,300).replace(/\n+/g,' | '));
  console.log('usdtConfigured check:', t.includes('not configured')?'STILL-ERROR':'no-config-error-visible');
  await p.screenshot({path:`/home/user/qa_lab/shots/realboot_${name}.png`}).catch(()=>{});
  await p.close();
}
await b.close(); srv1.kill(); srv3.kill();
