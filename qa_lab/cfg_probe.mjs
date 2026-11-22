import { chromium } from 'playwright'; import fs from 'node:fs'; import path from 'node:path'; import http from 'node:http';
const ROOT='/home/user/crestline_bundle';
const b=await chromium.launch({headless:true,args:['--no-sandbox']});
for (const [t,port] of [['1-testnet-user',4195],['3-mainnet-user',4196]]) {
  const lab=`/home/user/qa_lab/cfg_${t}`; fs.rmSync(lab,{recursive:true,force:true}); fs.mkdirSync(lab,{recursive:true});
  fs.cpSync(path.join(ROOT,t,'www'),lab,{recursive:true});
  const f=fs.readdirSync(path.join(lab,'assets')).find(x=>x.endsWith('.js')); const p=path.join(lab,'assets',f);
  let s=fs.readFileSync(p,'utf8'); const n='function x_(e,t={}){return a_(e,t)}';
  s=s.replace(n,n+'\nwindow.__CRESTLINE={cfg:()=>Z,api:x_};'); fs.writeFileSync(p,s);
  const srv=http.createServer((q,r)=>{const fp=path.join(lab,q.url==='/'?'index.html':q.url.split('?')[0]);const ok=fs.existsSync(fp)&&fs.statSync(fp).isFile()?fp:path.join(lab,'index.html');r.writeHead(200,{'Content-Type':ok.endsWith('.js')?'application/javascript':ok.endsWith('.css')?'text/css':'text/html'});fs.createReadStream(ok).pipe(r)});
  await new Promise(r=>srv.listen(port,'127.0.0.1',r));
  const pg=await b.newPage();
  await pg.route('**/*',async rt=>{const u=rt.request().url();if(/rpc|polygon|amoy|matic|publicnode|1rpc|drpc/i.test(u)&&!u.includes('127.0.0.1')){await rt.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify({jsonrpc:'2.0',id:1,result:'0x0'})});return}await rt.continue()});
  await pg.goto(`http://127.0.0.1:${port}/`,{waitUntil:'domcontentloaded'});
  await pg.waitForFunction(()=>!!window.__CRESTLINE,{timeout:12000}).catch(()=>{});
  console.log(t, JSON.stringify(await pg.evaluate(()=>{const Z=window.__CRESTLINE.cfg();return{CHAIN_ID:Z.CHAIN_ID,GOV_CHAIN_ID:Z.GOV_CHAIN_ID,POLYGON_RPC:Z.POLYGON_RPC,USDT_ADDRESS:Z.USDT_ADDRESS,POOL_DEPOSIT_ADDRESS:Z.POOL_DEPOSIT_ADDRESS,ADMIN_REGISTRY_ADDRESS:Z.ADMIN_REGISTRY_ADDRESS,USE_SMART_CONTRACT:Z.USE_SMART_CONTRACT,CONTRACT_ADDRESS:Z.CONTRACT_ADDRESS}})));
  await pg.close(); srv.close();
}
await b.close();
