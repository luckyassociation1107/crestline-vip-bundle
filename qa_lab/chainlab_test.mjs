import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
const srv=spawn('python3',['-m','http.server','4731','-d','/home/user/crestline_bundle/docs'],{stdio:'ignore'});
await new Promise(r=>setTimeout(r,1500));
const b=await chromium.launch({headless:true,args:['--no-sandbox']});
const p=await (await b.newContext()).newPage();
const errs=[]; p.on('pageerror',e=>errs.push(String(e).slice(0,150)));
let pass=0,fail=0; const ok=(n,c,d='')=>{c?pass++:fail++;console.log(`  ${c?'PASS':'FAIL'}  ${n}${d?' :: '+d:''}`)};
await p.goto('http://127.0.0.1:4731/chain-lab.html',{waitUntil:'domcontentloaded'});
await p.waitForTimeout(4000);
// live chain header
const blk=await p.locator('#blockNow').innerText(); const bal=await p.locator('#poolBal').innerText();
ok('live Amoy block loads', /#\d{6,}/.test(blk), blk);
ok('live pool USDC balance loads', /\$\d/.test(bal), bal);
// profit calculator rules
const set=async(id,v)=>{await p.locator('#'+id).fill(String(v)).catch(async()=>{await p.locator('#'+id).selectOption(String(v))});await p.waitForTimeout(150);};
await set('pcRefs',2); await set('pcFee',20); await set('pcDays',28);
ok('2 refs → $24 gross / $22.08 net ($20 + $4)', (await p.locator('#pcGross').innerText())==='$24.00' && (await p.locator('#pcNet').innerText())==='$22.08');
await set('pcRefs',1);
ok('1 ref → $20 deposit-back', (await p.locator('#pcGross').innerText())==='$20.00');
await set('pcRefs',0);
ok('0 refs → $10 back', (await p.locator('#pcGross').innerText())==='$10.00');
// VIP fee governance $20 → $1
await set('feeNew',1); await p.locator('button:has-text("Set fee")').click(); await p.waitForTimeout(400);
ok('admin sets VIP fee $1 → shown to everyone', (await p.locator('#feeNow').innerText())==='$1');
ok('governance memo built (CLM1)', (await p.locator('#feeMemo').inputValue()).startsWith('CLM1:'));
ok('profit calc uses admin fee as investment', (await p.locator('#pcFee').inputValue())==='1');
// users & permissions
const rows=await p.locator('#usersTbl tbody tr').count();
ok('users list (uid + referrer only) renders', rows>=3, rows+' users');
await p.locator('#usersTbl tbody tr >> nth=1 >> button:has-text("Ban")').first().click(); await p.waitForTimeout(400);
ok('ban action → status BANNED + memo', (await p.locator('#usersTbl').innerText()).includes('BANNED') && (await p.locator('#permsMemo').inputValue()).startsWith('CLM1:'));
await p.locator('#usersTbl tbody tr >> nth=1 >> button:has-text("Unban")').first().click(); await p.waitForTimeout(300);
ok('unban restores ACTIVE', !(await p.locator('#usersTbl tbody tr >> nth=1').innerText()).includes('BANNED'));
// view ledger
await p.locator('#usersTbl tbody tr >> nth=0 >> button:has-text("View")').click(); await p.waitForTimeout(600);
const led=await p.locator('#ledOut').innerText();
ok('view ledger shows real deposit tx link', led.includes('DEPOSIT') && led.includes('0xb3129544'));
await p.locator('#ledUid').fill('UID-G2BBMVCRRX'); await p.locator('button:has-text("Load ledger")').click(); await p.waitForTimeout(500);
ok('sim-user 30-day ledger rows load', (await p.locator('#ledOut').innerText()).includes('Day 30'));
// memo tool roundtrip
await p.locator('button:has-text("Encrypt")').click(); await p.waitForTimeout(500);
const memo=await p.locator('#memoOut').inputValue();
ok('encrypt produces CLM1', memo.startsWith('CLM1:'));
await p.locator('button:has-text("Decrypt payload")').click(); await p.waitForTimeout(500);
ok('decrypt roundtrip works in-browser', (await p.locator('#memoRes').innerText()).includes('DAILY_CHECKIN'));
// node<->browser compat: decrypt payload produced by qa/chain_memo.mjs
const nodePayload=process.env.NODE_MEMO||'';
if(nodePayload){ await p.locator('#memoOut').fill(nodePayload); await p.locator('button:has-text("Decrypt payload")').click(); await p.waitForTimeout(400);
ok('NODE↔BROWSER memo compatibility', (await p.locator('#memoRes').innerText()).includes('UID-TEST')); }
// admin treasury
await p.locator('#awAddr').fill('0x9be43bC43b1b3e47f9507696101938EB830cbae8'); await p.locator('button:has-text("Build withdrawal plan")').click(); await p.waitForTimeout(1500);
const aw=await p.locator('#awOut').innerText();
ok('withdrawal % plan built (live balance + calldata)', aw.includes('ADMIN WITHDRAWAL PLAN') && aw.includes('0xa9059cbb'));
ok('wallet field cleared after plan (asked every time)', (await p.locator('#awAddr').inputValue())==='');
await set('spAmt',500); await p.locator('button:has-text("Build $140 split plan")').click(); await p.waitForTimeout(300);
const sp=await p.locator('#spOut').innerText();
ok('$500 → 4-bucket $140 split plan', sp.includes('4 bucket') && sp.includes('$140.00') && sp.includes('$80.00'));
ok('zero JS errors', errs.length===0, errs.join('|')||'none');
console.log(`\nCHAIN LAB: PASS ${pass} · FAIL ${fail}`);
await b.close(); srv.kill();
process.exit(fail?1:0);
