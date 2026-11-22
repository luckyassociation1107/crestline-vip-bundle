import { chromium } from 'playwright';
const WALLET=process.env.WALLET||'0x08EE5Cf33C30123A628aC8FF80Ca48Bec8E96Db8';
const b=await chromium.launch({headless:false,args:['--no-sandbox','--disable-blink-features=AutomationControlled','--window-size=1366,950']});
const c=await b.newContext({viewport:{width:1366,height:950},locale:'en-US',timezoneId:'Asia/Calcutta',
  userAgent:'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'});
await c.addInitScript(()=>{Object.defineProperty(navigator,'webdriver',{get:()=>false});});
const p=await c.newPage();
const resp=[];
p.on('response',async r=>{if(/circle\.com\/api/i.test(r.url())&&r.request().method()==='POST'){try{resp.push({s:r.status(),t:(await r.text()).slice(0,600)})}catch{}}});
await p.goto('https://faucet.circle.com/',{waitUntil:'domcontentloaded',timeout:45000});
await p.waitForTimeout(4000+Math.random()*2000);
// human-ish mouse wiggle
for(let i=0;i<6;i++){await p.mouse.move(200+Math.random()*700,150+Math.random()*500,{steps:8});await p.waitForTimeout(250+Math.random()*400);}
await p.getByRole('button',{name:/Arc Testnet/i}).first().click();
await p.waitForTimeout(1200);
await p.getByText('Polygon PoS Amoy',{exact:true}).first().click();
await p.waitForTimeout(1000);
const addr=p.getByPlaceholder('Wallet address');
await addr.click(); await p.waitForTimeout(400);
await addr.pressSequentially(WALLET,{delay:55+Math.random()*40});
await p.waitForTimeout(1200+Math.random()*800);
await p.mouse.move(600,700,{steps:10});
const send=p.getByRole('button',{name:/Send 20 USDC/i}).first();
await send.hover(); await p.waitForTimeout(600);
await send.click();
await p.waitForTimeout(15000);
const t=(await p.locator('body').innerText())||'';
const seg=t.slice(0,600).replace(/\n+/g,' | ');
console.log('AFTER:',seg);
console.log('api responses:',JSON.stringify(resp.slice(-3)));
const hashes=[...new Set((t+JSON.stringify(resp)).match(/0x[0-9a-fA-F]{64}/g)||[])];
console.log('hashes:',hashes);
console.log('VERDICT:',/unusual traffic|not a bot|RECAPTCHA/i.test(t+JSON.stringify(resp))?'BOT-BLOCKED':(hashes.length||/success|sent|on its way/i.test(t)?'LIKELY-SENT':'UNKNOWN'));
await p.screenshot({path:'/home/user/qa_lab/shots/circle_headed.png'}).catch(()=>{});
await b.close();
