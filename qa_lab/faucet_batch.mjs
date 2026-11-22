import { chromium } from 'playwright';
import fs from 'node:fs';
const BASE='https://faucet.quicknode.com/polygon/amoy';
const ADDRS=[
 '0xc14A64416B1cb392e3b184B35f08e6a15E71c94c',
 '0x117e4be3A0A476dDb729b57dE2b7CF168606F949',
 '0x987Bdf5498F2B2E643D435a37bCA3430beff8507',
 '0xf1eDbaEab4ad5F0d33d7E39D3C390588Ca44d2AE',
 '0x77300C71071eCa35Cb673a0b7571B2907dEB77C7',
 '0x4838B106FCe9647Bdf1E7877BF73cE8B0BAD5f97',
];
const UAS=[
 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
];
const rows=[]; let success=null;
for(let i=0;i<ADDRS.length && !success;i++){
 const wallet=ADDRS[i]; const name=`tx-sender-${i+1}`;
 const b=await chromium.launch({headless:true,args:['--no-sandbox','--disable-blink-features=AutomationControlled','--disable-dev-shm-usage']});
 const ctx=await b.newContext({userAgent:UAS[i%UAS.length],locale:'en-US',timezoneId:i%2?'UTC':'Asia/Calcutta',viewport:{width:1280+i*40,height:800+i*20}});
 await ctx.addInitScript(()=>{try{localStorage.clear();sessionStorage.clear()}catch{};Object.defineProperty(navigator,'webdriver',{get:()=>false});Object.defineProperty(navigator,'hardwareConcurrency',{get:()=>4+(i%5)});});
 const p=await ctx.newPage(); const bodies=[];
 p.on('response',async r=>{if(/bonus\.data|drip|claim/i.test(r.url())){try{bodies.push({u:r.url().slice(0,220),s:r.status(),t:(await r.text()).slice(0,4000)})}catch{}}});
 await p.goto(BASE,{waitUntil:'domcontentloaded',timeout:45000}); await p.waitForTimeout(2200);
 const acc=p.getByRole('button',{name:'Accept',exact:true});if(await acc.count())await acc.click().catch(()=>{});
 await p.selectOption('#chain','polygon');await p.selectOption('#network','amoy');await p.fill('#wallet',wallet);
 await p.getByRole('button',{name:'Continue',exact:true}).click({timeout:12000}).catch(()=>{});
 await p.waitForTimeout(4000);
 const u1=p.url(), t1=(await p.locator('body').innerText().catch(()=>''))||''; const step2=u1.includes('/bonus');
 let t2='',u2=u1,visitor=null,hashes=[];
 if(step2){
   visitor=await p.locator('input[name=visitorId]').getAttribute('value').catch(()=>null);
   await p.waitForFunction(()=>(document.querySelector('input[name=recaptchaToken]')?.value||'').length>20,{timeout:15000}).catch(()=>{});
   const send=p.locator('button[name=_action][value=step-two-skip]').first();
   if(await send.count()){await send.click({timeout:15000}).catch(()=>{});await p.waitForTimeout(12000);}
   u2=p.url();t2=(await p.locator('body').innerText().catch(()=>''))||'';
   const combined=t2+' '+bodies.map(x=>x.t).join(' ');
   hashes=[...new Set(combined.match(/0x[0-9a-fA-F]{64}/g)||[])];
 } else t2=t1;
 const cooldown=/12 hours|come back/i.test(t2), history=/established transaction history/i.test(t1), insufficient=/Insufficient ETH/i.test(t1);
 const ok=hashes.length>0&&/success|sent|received|transaction hash|view on explorer/i.test(t2);
 const e={name,wallet,u1,step2,visitor,u2,cooldown,history,insufficient,ok,hashes,t1:t1.slice(0,3000),t2:t2.slice(0,8000),bodies};
 rows.push(e);
 console.log(`\n=== ${name} ${wallet} === step2=${step2} ok=${ok} cooldown=${cooldown} hist=${history} insuf=${insufficient} hashes=${hashes.length} visitor=${visitor}`);
 console.log(t2.slice(0,1200).replace(/\n{2,}/g,'\n'));
 console.log('err bodies:',JSON.stringify(bodies.filter(x=>/formErrors/.test(x.t)).slice(-2).map(x=>x.t.slice(0,300))));
 await p.screenshot({path:`/home/user/qa_lab/shots/faucet_batch_${name}.png`,fullPage:true}).catch(()=>{});
 if(ok)success=e;
 await b.close();
}
fs.writeFileSync('/home/user/qa_lab/faucet_batch.json',JSON.stringify({success,rows},null,2));
console.log('\nSUCCESS:',success?JSON.stringify({wallet:success.wallet,hashes:success.hashes}):'none');
