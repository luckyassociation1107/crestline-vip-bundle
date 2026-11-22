import { chromium } from 'playwright'; import fs from 'node:fs'; import path from 'node:path'; import http from 'node:http';
const LAB='/home/user/qa_lab/dbg';
const srv=http.createServer((q,r)=>{const fp=path.join(LAB,q.url==='/'?'index.html':q.url.split('?')[0]);const ok=fs.existsSync(fp)&&fs.statSync(fp).isFile()?fp:path.join(LAB,'index.html');r.writeHead(200,{'Content-Type':ok.endsWith('.js')?'application/javascript':ok.endsWith('.css')?'text/css':'text/html'});fs.createReadStream(ok).pipe(r)});
await new Promise(r=>srv.listen(4198,'127.0.0.1',r));
const b=await chromium.launch({headless:true,args:['--no-sandbox']});const pg=await b.newPage();
await pg.route('**/*',async rt=>{const u=rt.request().url();if(/rpc|polygon|amoy|matic|publicnode|1rpc|drpc/i.test(u)&&!u.includes('127.0.0.1')){await rt.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify({jsonrpc:'2.0',id:1,result:'0x0'})});return}await rt.continue()});
await pg.goto('http://127.0.0.1:4198/?usdt=0x1111111111111111111111111111111111111111',{waitUntil:'domcontentloaded'});
await pg.waitForFunction(()=>document.body.innerText.includes('USERNAME'),{timeout:25000});
const tabs=await pg.locator('button').allTextContents();console.log('login tabs:',JSON.stringify(tabs));
const rec=pg.getByRole('button',{name:'Recover',exact:true});console.log('Recover button count',await rec.count());
if(await rec.count()){await rec.first().click();await pg.waitForTimeout(500);}
console.log('\nTEXT:\n'+(await pg.locator('body').innerText()).slice(0,1400));
console.log('\nINPUTS:',JSON.stringify(await pg.locator('input,textarea').evaluateAll(e=>e.map(x=>({tag:x.tagName,type:x.type,placeholder:x.placeholder,accept:x.accept})))));
console.log('BUTTONS:',JSON.stringify((await pg.locator('button').allTextContents()).map(x=>x.trim()).filter(Boolean)));
await b.close();srv.close();
