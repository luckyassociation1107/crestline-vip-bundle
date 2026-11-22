# QA signing key — KEEP PRIVATE, DO NOT COMMIT

Generated 2026-11-20 solely to produce the four `crestline-*-release.apk` builds in this workspace and on the GitHub release.

| | |
|---|---|
| Keystore | `/home/user/toolchain/crestline-qa-release.jks` |
| Alias | `crestline` |
| Store / key password | `3biNHqaR4TeiwJ41qBSgGcqs` |
| Key | RSA 4096, valid 10 years |
| Certificate SHA-256 | `3998c52ba6e0ce85ad126f3f608e0ac6d3c10ba3f68d06ea921e33edb715a2a5` |
| DN | `CN=Crestline QA, O=Arena QA, C=IN` |

**Important**
- This keystore is **not** in the public GitHub repo. Download it from the workspace and store it in a password manager / secure vault.
- Anyone who installs an APK signed with this key is bound to this certificate. If you lose the keystore you cannot publish updates for those installs.
- For a real production release, generate your own keystore, re-sign the APKs, and keep this QA key out of circulation.
- `build-signed-apks.sh` expects `STORE_PASS` in the environment and `crestline-release.jks` in the working directory; this QA key can be copied there if you want to reuse the script.
