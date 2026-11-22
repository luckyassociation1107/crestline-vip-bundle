import { chromium } from 'playwright';
const u='https://polygonscan-com.translate.goog/address/0xc2132D05D31c914a87C6611C10748AEb04B58e8F?_x_tr_sl=auto&_x_tr_tl=en&_x_tr_hl=en';
const b=await chromium.launch({headless:true,args:['--no-sandbox','--disable-blink-features=AutomationControlled']});
const c=await b.newContext({userAgent:'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',locale:'en-US',viewport:{width:1440,height:1000}});
await c.addInitScript(()=>Object.defineProperty(navigator,'webdriver',{get:()=>false}));
const p=await c.newPage();let s=null;try{const r=await p.goto(u,{waitUntil:'domcontentloaded',timeout:45000});s=r?.status()}catch(e){console.log('err',String(e).slice(0,120))}
await p.waitForTimeout(6000);
const t=(await p.locator('body').innerText().catch(()=>''))||'';
console.log('status',s,'title',await p.title(),'len',t.length);
console.log(t.slice(0,3000).replace(/\n{2,}/g,'\n'));
await b.close();
