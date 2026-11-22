import { chromium } from 'playwright';
const b=await chromium.launch({headless:true,args:['--no-sandbox','--disable-blink-features=AutomationControlled']});
const c=await b.newContext({userAgent:'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',viewport:{width:1366,height:900},locale:'en-US'});
await c.addInitScript(()=>Object.defineProperty(navigator,'webdriver',{get:()=>false}));
for(const [name,url] of [
 ['polygon-official','https://faucet.polygon.technology/'],
 ['circle','https://faucet.circle.com/'],
 ['stakely','https://stakely.io/en/faucet/polygon-amoy-matic'],
 ['getblock','https://getblock.io/faucet/matic-amoy/'],
]){
  const p=await c.newPage();
  let st=null; try{const r=await p.goto(url,{waitUntil:'domcontentloaded',timeout:40000});st=r?.status()}catch(e){st='ERR '+String(e).slice(0,60)}
  await p.waitForTimeout(6000);
  const t=(await p.locator('body').innerText().catch(()=>''))||'';
  const inputs=await p.locator('input:visible').evaluateAll(els=>els.slice(0,6).map(e=>({ph:e.placeholder,type:e.type,name:e.name,id:e.id})));
  const btns=(await p.locator('button:visible').allTextContents()).map(x=>x.trim()).filter(Boolean).slice(0,12);
  const cf=/Just a moment|security verification|cloudflare/i.test(t);
  const captcha=await p.locator('iframe[src*=captcha],iframe[src*=turnstile],iframe[src*=recaptcha],[class*=captcha]').count();
  console.log(`\n=== ${name} === status=${st} len=${t.length} cf=${cf} captchaFrames=${captcha}`);
  console.log('inputs:',JSON.stringify(inputs));
  console.log('buttons:',btns.join(' | '));
  console.log('excerpt:',t.slice(0,350).replace(/\n+/g,' | '));
  await p.screenshot({path:`/home/user/qa_lab/shots/fd_${name}.png`,fullPage:false}).catch(()=>{});
  await p.close();
}
await b.close();
