import { chromium } from 'playwright';
const B='https://luckyassociation1107.github.io/crestline-vip-bundle';
const b=await chromium.launch({headless:true,args:['--no-sandbox']});
const c=await b.newContext({viewport:{width:1280,height:900}});
const out=[];
for(const [name,path,expect] of [
  ['hub','/','Crestline VIP'],
  ['testnet-user','/1-testnet-user/','Crestline'],
  ['testnet-admin','/2-testnet-admin/','Crestline'],
  ['mainnet-user','/3-mainnet-user/','Crestline'],
  ['mainnet-admin','/4-mainnet-admin/','Crestline'],
]){
  const p=await c.newPage(); const errs=[];
  p.on('pageerror',e=>errs.push(String(e).slice(0,100)));
  const r=await p.goto(B+path,{waitUntil:'domcontentloaded',timeout:45000});
  await p.waitForTimeout(6000);
  const t=(await p.locator('body').innerText().catch(()=>''))||'';
  const title=await p.title();
  out.push({name,status:r?.status(),title,hasRoot:await p.locator('#root').count(),textLen:t.length,excerpt:t.slice(0,150).replace(/\n+/g,' | '),jsErrors:errs.length});
  await p.screenshot({path:`/home/user/qa_lab/shots/pages_${name}.png`}).catch(()=>{});
  await p.close();
}
console.table ? console.table(out) : null;
for(const o of out) console.log(JSON.stringify(o));
await b.close();
