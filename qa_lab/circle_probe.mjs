import { chromium } from 'playwright';
const b=await chromium.launch({headless:true,args:['--no-sandbox','--disable-blink-features=AutomationControlled']});
const c=await b.newContext({userAgent:'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',viewport:{width:1366,height:950},locale:'en-US'});
await c.addInitScript(()=>Object.defineProperty(navigator,'webdriver',{get:()=>false}));
const p=await c.newPage();
const resp=[];
p.on('response',async r=>{if(/faucet|api|graphql/i.test(r.url())&&r.request().method()==='POST'){try{resp.push({u:r.url().slice(0,150),s:r.status(),t:(await r.text()).slice(0,500)})}catch{}}});
await p.goto('https://faucet.circle.com/',{waitUntil:'domcontentloaded',timeout:40000});
await p.waitForTimeout(5000);
// open network dropdown
const netBtn=p.getByRole('button',{name:/Arc Testnet/i}).first();
await netBtn.click().catch(e=>console.log('netbtn err'));
await p.waitForTimeout(1500);
const opts=(await p.locator('[role=option],[role=menuitem],li').allTextContents()).map(x=>x.trim()).filter(Boolean);
console.log('network options:',opts.slice(0,30).join(' | '));
// pick Polygon Amoy
const amoy=p.getByText(/Polygon.*Amoy|Amoy/i).first();
if(await amoy.count()){await amoy.click().catch(()=>{});await p.waitForTimeout(1200);}
const t=(await p.locator('body').innerText())||'';
console.log('selected state excerpt:',t.slice(0,400).replace(/\n+/g,' | '));
// fill address
await p.getByPlaceholder('Wallet address').fill('0x08EE5Cf33C30123A628aC8FF80Ca48Bec8E96Db8');
await p.waitForTimeout(800);
const sendBtn=p.getByRole('button',{name:/Send 20 USDC/i}).first();
console.log('send button enabled?',await sendBtn.isEnabled().catch(()=>'ERR'));
await p.screenshot({path:'/home/user/qa_lab/shots/circle_form.png',fullPage:false}).catch(()=>{});
// click send
await sendBtn.click({timeout:10000}).catch(e=>console.log('click err',String(e).slice(0,80)));
await p.waitForTimeout(12000);
const t2=(await p.locator('body').innerText())||'';
console.log('\nAFTER SEND excerpt:',t2.slice(0,500).replace(/\n+/g,' | '));
console.log('responses:',JSON.stringify(resp.slice(-4)));
const hashes=[...new Set((t2+JSON.stringify(resp)).match(/0x[0-9a-fA-F]{64}/g)||[])];
console.log('tx hashes:',hashes);
await p.screenshot({path:'/home/user/qa_lab/shots/circle_after.png',fullPage:false}).catch(()=>{});
await b.close();
