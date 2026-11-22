// Local reconstruction of LimeWire's anonymous-share decryption chain.
// Inputs come from the SSR payload on the share page + the fragment key in the URL.
import { webcrypto as crypto } from 'node:crypto';
import { createDecipheriv } from 'node:crypto';
import fs from 'node:fs';

const passphrase = '0v3vXP736Q';                              // URL fragment
const saltB64    = 'wvsoOvbI854RHQMiSiPmnw==';               // config: sharingPassphraseEncryptionDetails.saltBase64
const wrappedB64 = 'klm3VNFaXWW2/bxalP3/ONLtm0y6g3TFIUD75GNjhPbiJsiddWozpw=='; // passphraseWrappedPrivateKey
const primaryPubB64 = 'BDBtNSGSeSfORxbyMZXbQYc6KjujVKRLDrhQk57Vc6ecxq5Hh+lEzdlMmBPqFI1yk1fT/wKEcsctANAA8/Ufl6w='; // fileEncryptionKey.publicKey
const ephemeralPubB64 = 'BNk5Frh9/Da3dJn3zKyujaDkcSfv/zY6Ox+rUYTPp2yGesw+bR3ZuzR+6bE5eNgbSuviHHDRku4KPbRecvGQUqk='; // contentItem.ephemeralPublicKey
const nameEncB64  = 'DXEzrOajrKR7xM5IqZ5oaOxjgai8eYDl/9SWn5MvwqENEPNlQmlu34Nthw==';
const sha1EncB64  = 'xfuAn8pXHxRAdkEzToIKKCocOeZPjw0bHBGxnvYx7vpoASfU';
const IV_MAIN     = 'C8aZG384/qPpBzg=';   // 11-byte AES-CTR nonce
const IV_NAME     = 'EtrUFVLIRAW8aUCd';   // 12-byte AES-GCM iv
const IV_SHA1     = '6Q+YlJkg8RFR/FHN';   // 12-byte AES-GCM iv

const b64 = s => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
const b64url = b => Buffer.from(b).toString('base64url');
const enc = new TextEncoder();

// 1. PBKDF2(passphrase, salt) -> AES-KW 256 wrapping key
const km = await crypto.subtle.importKey('raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
const kwKey = await crypto.subtle.deriveKey(
  { name: 'PBKDF2', salt: b64(saltB64), iterations: 100000, hash: 'SHA-256' },
  km, { name: 'AES-KW', length: 256 }, true, ['wrapKey', 'unwrapKey']);

// 2. AES-KW unwrap -> raw 32-byte P-256 private scalar
const wrappedKey = await crypto.subtle.unwrapKey(
  'raw', b64(wrappedB64), kwKey, 'AES-KW', { name: 'AES-CTR' }, true, ['wrapKey']);
const scalar = Buffer.from(await crypto.subtle.exportKey('raw', wrappedKey));
console.log('private scalar bytes:', scalar.length);

// 3. Rebuild the ECDH private JWK using the bucket's primary public point
const pub = b64(primaryPubB64);
if (pub.length !== 65 || pub[0] !== 4) throw new Error('unexpected public key point');
const jwk = {
  kty: 'EC', crv: 'P-256',
  d: b64url(scalar),
  x: b64url(pub.subarray(1, 33)),
  y: b64url(pub.subarray(33, 65)),
  key_ops: ['deriveBits', 'deriveKey'], ext: true,
};
const privKey = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits', 'deriveKey']);

// 4. ECDH(private, content item ephemeral public) -> 32-byte shared secret = AES key
const eph = await crypto.subtle.importKey('raw', b64(ephemeralPubB64), { name: 'ECDH', namedCurve: 'P-256' }, true, []);
const shared = Buffer.from(await crypto.subtle.deriveBits({ name: 'ECDH', public: eph }, privKey, 256));
console.log('ECDH shared secret bytes:', shared.length, shared.toString('hex'));

// 5. Sanity: AES-GCM decrypt the encrypted file name and sha1 with static IVs
const aesKey = await crypto.subtle.importKey('raw', shared, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
for (const [label, data, iv] of [['name', nameEncB64, IV_NAME], ['sha1', sha1EncB64, IV_SHA1]]) {
  try {
    const out = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64(iv) }, aesKey, b64(data));
    console.log(`decrypted ${label}:`, label === 'sha1' ? Buffer.from(out).toString('hex') : new TextDecoder().decode(out));
  } catch (e) { console.log(`decrypted ${label}: FAILED (${e.message})`); }
}

// 6. AES-256-CTR decrypt the main file. counter = 11-byte IV || 5-byte big-endian 0
const ctr = Buffer.concat([b64(IV_MAIN), Buffer.alloc(5)]);
const cipher = Buffer.from(fs.readFileSync('/tmp/crestline_encrypted.bin'));
const decipher = createDecipheriv('aes-256-ctr', shared, ctr);
const plain = Buffer.concat([decipher.update(cipher), decipher.final()]);
fs.writeFileSync('/home/user/downloads/crestline-4-apks-bundle.zip', plain);
console.log('plaintext bytes:', plain.length, 'magic:', plain.subarray(0, 4).toString('hex'), JSON.stringify(plain.subarray(0, 4).toString('latin1')));
