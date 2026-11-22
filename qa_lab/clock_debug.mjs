import { chromium } from 'playwright'; import fs from 'node:fs'; import path from 'node:path'; import http from 'node:http';
const ROOT='/home/user/crestline_bundle', T='1-testnet-user', LAB='/home/user/qa_lab/dbg';
fs.rmSync(LAB,{recursive:true,force:true}); fs.mkdirSync(LAB,{recursive:true}); fs.cpSync(path.join(ROOT,T,'www'),LAB,{recursive:true});
const f=fs.readdirSync(path.join(LAB,'assets')).find(x=>x.endsWith('.js')), p=path.join(LAB,'assets',f);
let s=fs.readFileSync(p,'utf8'); const n='function x_(e,t={}){return a_(e,t)}';
s=s.replace(n,n+'\nwindow.__CRESTLINE={api:x_,chainClock:Lm,cfg:()=>Z};'); fs.writeFileSync(p,s);
const srv=http.createServer((q,r)=>{const fp=path.join(LAB,q.url==='/'?'index.html':q.url.split('?')[0]);const ok=fs.existsSync(fp)&&fs.statSync(fp).isFile()?fp:path.join(LAB,'index.html');r.writeHead(200,{'Content-Type':ok.endsWith('.js')?'application/javascript':ok.endsWith('.css')?'text/css':'text/html'});fs.createReadStream(ok).pipe(r)});
await new Promise(r=>srv.listen(4197,'127.0.0.1',r));
const b=await chromium.launch({headless:true,args:['--no-sandbox']}); const pg=await b.newPage();
const calls=[];
await pg.route('**/*',async rt=>{const u=rt.request().url();
 if(/rpc|polygon|amoy|matic|publicnode|1rpc|drpc/i.test(u)&&!u.includes('127.0.0.1')){
   let body={};try{body=JSON.parse(rt.request().postData()||'{}')}catch{}
   const items=Array.isArray(body)?body:[body];
   for(const x of items) calls.push(x.method+' '+(x.params||[]).map(y=>typeof y==='object'?JSON.stringify(y).slice(0,80):String(y)).join('|').slice(0,140));
   const ts='0x'+Math.floor(Date.now()/1000).toString(16);
   const block={number:'0x2dc6c0',hash:'0x'+'11'.repeat(32),parentHash:'0x'+'00'.repeat(32),nonce:'0x0000000000000000',timestamp:ts,difficulty:'0x0',gasLimit:'0x1c9c380',gasUsed:'0x0',miner:'0x'+'00'.repeat(20),extraData:'0x',baseFeePerGas:'0x7',transactions:[],sha3Uncles:'0x'+'00'.repeat(32),logsBloom:'0x'+'00'.repeat(256),totalDifficulty:'0x0',size:'0x0',mixHash:'0x'+'00'.repeat(32),stateRoot:'0x'+'00'.repeat(32),transactionsRoot:'0x'+'00'.repeat(32),receiptsRoot:'0x'+'00'.repeat(32),uncles:[]};
   const pl=items.map(x=>({jsonrpc:'2.0',id:x.id??1,result:x.method==='eth_getBlockByNumber'?block:(x.method==='eth_chainId'?'0x13882':'0x0')}));
   await rt.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(Array.isArray(body)?pl:pl[0])});return}
 await rt.continue()});
await pg.goto('http://127.0.0.1:4197/?usdt=0x1111111111111111111111111111111111111111',{waitUntil:'domcontentloaded'});
await pg.waitForFunction(()=>!!window.__CRESTLINE,{timeout:12000});
console.log('Lm(80002) =',await pg.evaluate(async()=>await window.__CRESTLINE.chainClock(80002)));
console.log('Lm(137)   =',await pg.evaluate(async()=>await window.__CRESTLINE.chainClock(137)));
console.log('\nRPC calls:');calls.forEach((c,i)=>console.log(' ',i,c));
await b.close();srv.close();
