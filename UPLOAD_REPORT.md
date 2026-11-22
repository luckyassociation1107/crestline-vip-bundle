# LimeWire → GitHub upload report

**Date:** 2026-11-20 (IST)

## Result

| | |
|---|---|
| Repository | **[GAMBLING-PRO-AI/crestline-vip-bundle](https://github.com/GAMBLING-PRO-AI/crestline-vip-bundle)** |
| Visibility | Public (as requested) |
| Branch | `main` |
| Commit | `1cee7730` — *Add Crestline VIP 4-target Android source bundle* |
| Files pushed | **101** (verified via Git Trees API, `truncated: false`) |
| Push | `git push` succeeded; remote reset to the clean HTTPS URL (no credential stored) |

## Source

- LimeWire link: `https://limewire.com/d/fQzhl#0v3vXP736Q`
- File: `crestline-4-apks-bundle.zip`, 3,823,895 bytes
- The share is end-to-end encrypted; the fragment (`#0v3vXP736Q`) is the passphrase. Decrypted locally with PBKDF2 → AES-KW → ECDH/P-256 → AES-256-CTR.
- Integrity: plaintext SHA-1 `ce3c2a74acd7bb139003a8f98d39248d3a85a618` matches the SHA-1 LimeWire stored (decrypted from `sha1Encrypted`). ZIP CRC check: clean.

## What was uploaded

The **extracted source tree** (100 files), plus a generated `.gitignore`:

```
1-testnet-user/    2-testnet-admin/    3-mainnet-user/    4-mainnet-admin/
README.md   build-local-zips.mjs   build-signed-apks.sh   serve.mjs   .gitignore
```

The four folders are Android/Capacitor **source projects** (`com.crestline.*`), each with Java sources, Gradle files, resources and prebuilt JS/CSS web bundles.

⚠️ Despite the filename, **there are no compiled `.apk` files** in the archive — the APKs have to be built with `build-signed-apks.sh` (needs Android SDK 35 + Java 17 + Gradle and a keystore password).

The original ZIP was **not** uploaded (you chose source-tree only). It remains at `downloads/crestline-4-apks-bundle.zip`; the extracted tree is at `crestline_bundle/`.

## Notes / cautions

1. **Revoke the token now.** The reused classic PAT has `delete_repo`, `admin:org`, `admin:enterprise`, `workflow`, `write:packages` and more, and was pasted into chat. It was used only for `POST /user/repos`, the push, and verification. The `/tmp` copy was shredded and `.git/config` contains no token. Revoke at <https://github.com/settings/tokens>.
2. **Public repo:** the bundle documents a USDT deposit / referral / payout scheme with an admin console, treasury sweeps and a "payout bot". Publishing it makes all of that world-readable. If this wasn't intentional, flip the repo to private (or tell me and I'll do it).
3. **Secret scan:** no obvious private keys, seed phrases or API keys were found in the source. `.gitignore` now excludes `*.jks`, `*.apk`, `build/`, `.env*`, `*.sealed` and generated local-runner zips so future commits don't leak signing keys.
4. Want the static web bundle deployed instead? Turn the **Vercel** app on in this conversation first — it's currently off — and I can deploy `*/www/` or `*/public/`.
