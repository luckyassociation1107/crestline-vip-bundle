import { chromium } from 'playwright';
const b=await chromium.launch({headless:true,args:['--no-sandbox','--disable-blink-features=AutomationControlled']});
const c=await b.newContext({viewport:{width:1440,height:1000}});const p=await c.newPage();
await p.goto('https://faucet.quicknode.com/polygon/amoy',{waitUntil:'domcontentloaded',timeout:45000});await p.waitForTimeout(2500);
console.log('buttons:',JSON.stringify(await p.locator('button').evaluateAll(els=>els.slice(0,10).map(e=>({outer:e.outerHTML.slice(0,300),name:e.name,value:e.value,text:e.innerText.trim()})))));
console.log('role count:',await p.getByRole('button',{name:'Continue',exact:true}).count());
console.log('search attrs:',JSON.stringify(await p.locator('#search-panel').evaluateAll(els=>els.map(e=>({outer:e.outerHTML.slice(0,300),visible:!!(e.offsetWidth||e.offsetHeight||e.getClientRects().length)})))));
await b.close();
