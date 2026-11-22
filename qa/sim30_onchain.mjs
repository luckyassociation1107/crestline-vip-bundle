/**
 * 30-DAY ON-CHAIN SIMULATOR — every simulated day leaves a REAL Amoy transaction.
 *
 *   node qa/sim30_onchain.mjs --uid UID-XXXX [--days 30] [--broadcast]
 *
 * Design (per the owner's spec):
 *   • ADMIN PERMISSION GATE: only users granted "allow30DaySim" (and optional
 *     "canWithdraw") in qa/sim-permissions.json may run the simulator. The admin
 *     edits that file (or uses the Chain Lab website panel) — user id + referrer
 *     id is all it keeps.
 *   • ONE WALLET PER DAY: day N uses derivation m/44'/60'/0'/0/N from the user's
 *     day-chain master mnemonic (created by qa/make_faucet_wallets.mjs --days 30
 *     --uid …). Amoy per-wallet rate limits never bite, and the chain still
 *     counts as ONE identity because…
 *   • …EVERY DAY'S ENCRYPTED MEMO RECORDS THE PREVIOUS DAY'S WALLET:
 *     { uid, day, action: DAILY_CHECKIN, prevWallet, reward: +$1, ts } encrypted
 *     with the app-bound key (chain_memo.mjs) → the 30 check-ins form one
 *     verifiable linked list on the public chain. You can open every txHash on
 *     amoy.polygonscan.com yourself; only our app/website decrypts the body.
 *   • GAS HONESTY: each day-wallet needs a dust of POL to send its memo tx.
 *     Without --broadcast (or without balance) the simulator runs a DRY RUN:
 *     it derives all wallets, builds + encrypts all 30 memos, verifies they
 *     decrypt, and writes the funding plan (which addresses need POL).
 *     With funded wallets + --broadcast it sends for real and records every
 *     txHash in qa/sim30-ledger-<uid>.json.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HDNodeWallet, Mnemonic, JsonRpcProvider, formatEther } from 'ethers';
import { encryptMemo, decryptMemo, sendMemo, RPC } from './chain_memo.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VAULT = '/home/user/qa_lab/faucet_wallets.json';
const arg = (n, d = '') => { const i = process.argv.indexOf('--' + n); return i >= 0 ? (process.argv[i + 1] || 'true') : d; };
const uid = arg('uid');
const DAYS = Number(arg('days', '30'));
const broadcast = !!arg('broadcast');
if (!uid) { console.error('usage: node qa/sim30_onchain.mjs --uid UID-XXXX [--days 30] [--broadcast]'); process.exit(1); }

// ---- admin permission gate (user id + referrer id only, as specified)
const permF = path.join(ROOT, 'qa', 'sim-permissions.json');
if (!fs.existsSync(permF)) {
  fs.writeFileSync(permF, JSON.stringify({ note: 'Admin grants per-user simulation & withdrawal access here (or via Chain Lab). Keys: uid.', users: { 'UID-EXAMPLE': { referrerUid: '', allow30DaySim: true, canWithdraw: true, banned: false, frozen: false, stoppedForDay: '' } } }, null, 2));
}
const perms = JSON.parse(fs.readFileSync(permF, 'utf8'));
const me = perms.users?.[uid];
if (!me || !me.allow30DaySim) { console.error(`BLOCKED: admin has not granted allow30DaySim for ${uid} — edit qa/sim-permissions.json`); process.exit(2); }
if (me.banned || me.frozen) { console.error(`BLOCKED: ${uid} is ${me.banned ? 'BANNED' : 'FROZEN'} by admin`); process.exit(2); }
console.log(`permission OK: ${uid} (referrer: ${me.referrerUid || 'none'}) allow30DaySim=true canWithdraw=${!!me.canWithdraw}`);

// ---- day-chain wallets
const vault = fs.existsSync(VAULT) ? JSON.parse(fs.readFileSync(VAULT, 'utf8')) : { dayChains: [] };
const chain = (vault.dayChains || []).find(c => c.uid === uid);
if (!chain) { console.error(`no day-chain for ${uid} — run: node qa/make_faucet_wallets.mjs --days ${DAYS} --uid ${uid}`); process.exit(3); }
const m = Mnemonic.fromPhrase(chain.masterMnemonic);
const dayWallet = d => HDNodeWallet.fromMnemonic(m, `m/44'/60'/0'/0/${d}`);

const provider = new JsonRpcProvider(RPC);
const ledgerF = path.join(ROOT, 'qa', `sim30-ledger-${uid}.json`);
const ledger = fs.existsSync(ledgerF) ? JSON.parse(fs.readFileSync(ledgerF, 'utf8')) : { uid, referrerUid: me.referrerUid || '', days: [] };
const doneDays = new Set(ledger.days.filter(d => d.txHash).map(d => d.day));

let sent = 0, dry = 0, needGas = [];
for (let d = 1; d <= DAYS; d++) {
  if (doneDays.has(d)) { continue; }
  const w = dayWallet(d), prev = d > 1 ? dayWallet(d - 1).address : null;
  const memoObj = { v: 1, app: 'crestline-testnet', uid, referrerUid: me.referrerUid || '', day: d, action: 'DAILY_CHECKIN', reward: 1, prevWallet: prev, wallet: w.address, ts: new Date().toISOString() };
  const payload = encryptMemo(memoObj);
  decryptMemo(payload); // roundtrip sanity — must decrypt with the app key
  const bal = await provider.getBalance(w.address);
  if (broadcast && bal > 0n) {
    try {
      const r = await sendMemo(w.privateKey, payload);
      ledger.days.push({ day: d, wallet: w.address, prevWallet: prev, txHash: r.txHash, block: r.block, explorer: r.explorer, memoPreview: { action: memoObj.action, day: d } });
      console.log(`day ${d}: ✅ ON-CHAIN ${r.txHash} (wallet ${w.address.slice(0, 10)}…, gas left ${formatEther(await provider.getBalance(w.address))} POL)`);
      sent++;
    } catch (e) { console.log(`day ${d}: send failed — ${String(e.message).slice(0, 90)}`); needGas.push(w.address); }
  } else {
    dry++;
    if (bal === 0n) needGas.push(w.address);
    ledger.days.push({ day: d, wallet: w.address, prevWallet: prev, txHash: null, preparedMemo: payload.slice(0, 48) + '…', status: bal === 0n ? 'NEEDS_GAS' : 'READY (use --broadcast)' });
  }
}
ledger.days.sort((a, b) => a.day - b.day);
fs.writeFileSync(ledgerF, JSON.stringify(ledger, null, 2));
console.log(`\nSIM30 ${uid}: ${sent} day(s) written ON-CHAIN, ${dry} prepared (dry), ledger → ${path.relative(ROOT, ledgerF)}`);
if (needGas.length) {
  console.log(`\nFUNDING PLAN — send ~0.002 POL to each day-wallet (any Amoy POL faucet / one funded wallet fan-out):`);
  needGas.slice(0, DAYS).forEach((a, i) => console.log(`  ${a}`));
}
