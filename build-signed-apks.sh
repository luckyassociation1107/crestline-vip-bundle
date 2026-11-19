#!/usr/bin/env bash
set -euo pipefail
# Builds and signs all 4 Crestline release APKs on any machine with Android SDK + Java 17 + Gradle.
KEYSTORE_PATH="${KEYSTORE_PATH:-$PWD/crestline-release.jks}"
KEY_ALIAS="${KEY_ALIAS:-crestline}"
STORE_PASS="${STORE_PASS:-}"
KEY_PASS="${KEY_PASS:-$STORE_PASS}"

if [ -z "$STORE_PASS" ]; then
  echo "Usage: STORE_PASS='strong-pass' ./build-signed-apks.sh"
  exit 1
fi

if [ ! -f "$KEYSTORE_PATH" ]; then
  keytool -genkeypair -v -keystore "$KEYSTORE_PATH" -alias "$KEY_ALIAS" \
    -keyalg RSA -keysize 4096 -validity 3650 \
    -storepass "$STORE_PASS" -keypass "$KEY_PASS" \
    -dname "CN=Crestline, O=Crestline, C=US"
fi

mkdir -p signed-apks
for DIR in 1-testnet-user 2-testnet-admin 3-mainnet-user 4-mainnet-admin; do
  echo "=== Building & Signing $DIR ==="
  pushd "$DIR/android" >/dev/null
  gradle assembleRelease --no-daemon
  UNSIGNED="app/build/outputs/apk/release/app-release-unsigned.apk"
  OUT="../../signed-apks/${DIR}-release-signed.apk"
  apksigner sign --ks "$KEYSTORE_PATH" --ks-key-alias "$KEY_ALIAS" \
    --ks-pass "pass:$STORE_PASS" --key-pass "pass:$KEY_PASS" \
    --out "$OUT" "$UNSIGNED"
  apksigner verify "$OUT"
  popd >/dev/null
done
ls -lh signed-apks/
