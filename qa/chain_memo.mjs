/**
 * CHAIN MEMO — encrypted custom messages on Polygon Amoy (real chain).
 *
 * Every lifecycle event (deposit, daily check-in, referral, withdrawal, admin
 * action) can be written to the chain as a 0-value self-transaction whose
 * calldata is an AES-256-GCM encrypted JSON memo. Anyone can SEE the tx on
 * amoy.polygonscan.com (txHash, wallet, timestamp — your direct verification),
 * but only our app/website can DECRYPT the message body.
 *
 * Key derivation (app-bound):  sha256("CRESTLINE-CHAINLAB-E2EE-V1:" + poolAddress)
 * Optional owner layer:        --pass <admin code> → sha256(base || ":" || pass)
 *
 * CLI:
 *   node qa/chain_memo.mjs encrypt '{"uid":"UID-X","day":3,"action":"DAILY_CHECKIN"}'
 *   node qa/chain_memo.mjs decrypt-payload CLM1:<hex> [--pass CODE]
 *   node qa/chain_memo.mjs send --pk 0x<privkey> --memo CLM1:<hex>      (needs POL gas)
 *   node qa/chain_memo.mjs read 0x<txHash> [--pass CODE]                (decrypt from chain)
 */
import crypto from 'node:crypto';
import { Wallet, JsonRpcProvider } from 'ethers';

export const RPC = 'https://polygon-amoy-bor-rpc.publicnode.com';
const POOL = '0x08EE5Cf33C30123A628aC8FF80Ca48Bec8E96Db8';
const MAGIC = 'CLM1:';

export function memoKey(pass = '') {
  const base = 'CRESTLINE-CHAINLAB-E2EE-V1:' + POOL.toLowerCase();
  return crypto.createHash('sha256').update(pass ? base + ':' + pass : base).digest();
}
export function encryptMemo(obj, pass = '') {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', memoKey(pass), iv);
  const ct = Buffer.concat([c.update(Buffer.from(JSON.stringify(obj), 'utf8')), c.final()]);
  return MAGIC + Buffer.concat([iv, ct, c.getAuthTag()]).toString('hex');
}
export function decryptMemo(payload, pass = '') {
  if (!payload.startsWith(MAGIC)) throw new Error('not a CLM1 memo');
  const raw = Buffer.from(payload.slice(MAGIC.length), 'hex');
  const iv = raw.subarray(0, 12), tag = raw.subarray(raw.length - 16), ct = raw.subarray(12, raw.length - 16);
  const d = crypto.createDecipheriv('aes-256-gcm', memoKey(pass), iv);
  d.setAuthTag(tag);
  return JSON.parse(Buffer.concat([d.update(ct), d.final()]).toString('utf8'));
}
export async function sendMemo(pk, payload, to = null) {
  const w = new Wallet(pk, new JsonRpcProvider(RPC));
  const tx = await w.sendTransaction({ to: to || w.address, value: 0n, data: '0x' + Buffer.from(payload, 'utf8').toString('hex') });
  const rcpt = await tx.wait();
  return { txHash: tx.hash, block: rcpt.blockNumber, from: w.address, explorer: `https://amoy.polygonscan.com/tx/${tx.hash}` };
}
export async function readMemo(txHash, pass = '') {
  const p = new JsonRpcProvider(RPC);
  const tx = await p.getTransaction(txHash);
  if (!tx) throw new Error('tx not found');
  const text = Buffer.from(tx.data.slice(2), 'hex').toString('utf8');
  return { from: tx.from, to: tx.to, memo: decryptMemo(text, pass), explorer: `https://amoy.polygonscan.com/tx/${txHash}` };
}

// ---------------------------------------------------------------- CLI
const [cmd, ...rest] = process.argv.slice(2);
if (cmd) {
  const flag = n => { const i = rest.indexOf('--' + n); return i >= 0 ? rest[i + 1] : ''; };
  const pass = flag('pass');
  try {
    if (cmd === 'encrypt') console.log(encryptMemo(JSON.parse(rest[0]), pass));
    else if (cmd === 'decrypt-payload') console.log(JSON.stringify(decryptMemo(rest[0], pass), null, 2));
    else if (cmd === 'send') console.log(JSON.stringify(await sendMemo(flag('pk'), flag('memo'), flag('to') || null), null, 2));
    else if (cmd === 'read') console.log(JSON.stringify(await readMemo(rest[0], pass), null, 2));
    else console.log('commands: encrypt | decrypt-payload | send | read');
  } catch (e) { console.error('ERROR:', e.message); process.exit(1); }
}
