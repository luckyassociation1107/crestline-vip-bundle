#!/usr/bin/env python3
"""
Crestline VIP 4-target bundle — repeatable verification suite.

Runs static/build/asset/network-isolation/local-server checks. No external
Python packages required. Browser flow tests live in browser_flow_test.mjs.

Usage:
    python3 qa/verify.py                 # from repo root
    python3 qa/verify.py --json out.json
Env (optional):
    JAVA_HOME, ANDROID_SDK_ROOT  -> enables apksigner/aapt2/zipalign APK checks
    APK_DIR                      -> dir containing crestline-*-release.apk (default: ../apk_out)
"""
import argparse, hashlib, json, os, re, subprocess, sys, zipfile
import urllib.request, urllib.error, xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
APK_DIR = Path(os.environ.get("APK_DIR", ROOT.parent / "apk_out"))
JAVA_HOME = os.environ.get("JAVA_HOME", "")
SDK = os.environ.get("ANDROID_SDK_ROOT", os.environ.get("ANDROID_HOME", ""))
BT = Path(SDK) / "build-tools" / "35.0.0" if SDK else None

TARGETS = {
    "1-testnet-user":  dict(pkg="com.crestline.testnet.user",  role="user",  net="testnet"),
    "2-testnet-admin": dict(pkg="com.crestline.testnet.admin", role="admin", net="testnet"),
    "3-mainnet-user":  dict(pkg="com.crestline.mainnet.user",  role="user",  net="mainnet"),
    "4-mainnet-admin": dict(pkg="com.crestline.mainnet.admin", role="admin", net="mainnet"),
}
results = []

def check(name, ok, detail=""):
    results.append(dict(name=name, passed=bool(ok), detail=str(detail)[:300]))
    return ok

def run(cmd, timeout=90):
    try:
        p = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout, shell=isinstance(cmd, str))
        return p.returncode, (p.stdout or "") + (p.stderr or "")
    except Exception as e:
        return -1, str(e)

def sha(b): return hashlib.sha256(b).hexdigest()

# ---------------------------------------------------------------- 1. project files
for tid, meta in TARGETS.items():
    t = ROOT / tid
    check(f"[{tid}] project dir exists", t.is_dir(), t)
    gradle = t / "android" / "app" / "build.gradle"
    g = gradle.read_text() if gradle.exists() else ""
    check(f"[{tid}] namespace + applicationId", meta["pkg"] in g and g.count(meta["pkg"]) >= 2,
          f"matches={g.count(meta['pkg'])}")
    check(f"[{tid}] compileSdk 35 / minSdk 26 / Java 17",
          all(x in g for x in ["compileSdk 35", "minSdk 26", "VERSION_17"]), "")
    props = t / "android" / "gradle.properties"
    check(f"[{tid}] gradle.properties has AndroidX flag",
          props.exists() and "android.useAndroidX=true" in props.read_text(),
          "required fix: upstream bundle shipped without this file")

    # manifest
    man = t / "android" / "app" / "src" / "main" / "AndroidManifest.xml"
    try:
        tree = ET.parse(man); r = tree.getroot()
        perms = {e.get("{http://schemas.android.com/apk/res/android}name") for e in r.iter("uses-permission")}
        app = r.find("application")
        cleartext = app.get("{http://schemas.android.com/apk/res/android}usesCleartextTraffic")
        check(f"[{tid}] AndroidManifest.xml well-formed", True)
        check(f"[{tid}] INTERNET + POST_NOTIFICATIONS", {"android.permission.INTERNET", "android.permission.POST_NOTIFICATIONS"} <= perms, sorted(perms))
        check(f"[{tid}] cleartext disabled", cleartext == "false", f"usesCleartextTraffic={cleartext}")
        check(f"[{tid}] networkSecurityConfig set", "networkSecurityConfig" in man.read_text(), "")
        check(f"[{tid}] crestline://sync deep link", "crestline" in man.read_text() and "sync" in man.read_text(), "")
    except Exception as e:
        check(f"[{tid}] AndroidManifest.xml well-formed", False, e)

    nsc = t / "android" / "app" / "src" / "main" / "res" / "xml" / "network_security_config.xml"
    try:
        ET.parse(nsc); check(f"[{tid}] network_security_config.xml well-formed", True)
    except Exception as e:
        check(f"[{tid}] network_security_config.xml well-formed", False, e)
    nsc_txt = nsc.read_text() if nsc.exists() else ""
    check(f"[{tid}] Amoy RPC domains pinned", "rpc-amoy.polygon.technology" in nsc_txt, "")
    if meta["net"] == "mainnet":
        check(f"[{tid}] mainnet RPC domain pinned", "polygon-bor-rpc.publicnode.com" in nsc_txt, "")
    else:
        check(f"[{tid}] testnet build excludes mainnet RPC", "polygon-bor-rpc.publicnode.com" not in nsc_txt, "network isolation")

    # java sources
    jdir = t / "android" / "app" / "src" / "main" / "java" / Path(*meta["pkg"].split("."))
    check(f"[{tid}] MainActivity.java + AmoySyncWorker.java", (jdir / "MainActivity.java").exists() and (jdir / "AmoySyncWorker.java").exists(), jdir)
    mainjava = (jdir / "MainActivity.java").read_text() if (jdir / "MainActivity.java").exists() else ""
    check(f"[{tid}] WebViewAssetLoader + FLAG_SECURE + JS bridge",
          all(k in mainjava for k in ["appassets.androidplatform.net", "FLAG_SECURE", "@JavascriptInterface", "WebViewAssetLoader"]), "")

    # static web bundle
    idx = t / "www" / "index.html"
    html = idx.read_text() if idx.exists() else ""
    refs = re.findall(r'(?:src|href)="\./assets/([^"]+)"', html)
    check(f"[{tid}] index.html references JS + CSS", len(refs) >= 2 and any(x.endswith(".js") for x in refs) and any(x.endswith(".css") for x in refs), refs)
    for ref in refs:
        check(f"[{tid}] referenced asset exists: {ref}", (t / "www" / "assets" / ref).exists(), "")

    # asset parity across the three copies
    groups = {}
    for base in ["www/assets", "public/assets", "android/app/src/main/assets/www/assets"]:
        d = t / base
        groups[base] = {p.name: sha(p.read_bytes()) for p in d.iterdir() if p.is_file()} if d.exists() else {}
    a, b, c = groups.values()
    check(f"[{tid}] www/public/android asset parity", a and a == b == c, {k: len(v) for k, v in groups.items()})

    # role + network isolation in the compiled JS
    js = next((t / "public" / "assets").glob("index-*.js"), None)
    jstxt = js.read_text(errors="replace") if js else ""
    if meta["role"] == "user":
        check(f"[{tid}] USER: referral/bucket logic present", "REFPROOF3" in jstxt and "BUCKET_LOCK" in jstxt, "")
        check(f"[{tid}] USER: admin console absent", "Admin Console" not in jstxt and "Master Seed" not in jstxt, "role isolation")
    else:
        check(f"[{tid}] ADMIN: console + master seed present", "Admin Console" in jstxt and "Master Seed" in jstxt, "")
        check(f"[{tid}] ADMIN: user referral logic absent", "REFPROOF3" not in jstxt and "BUCKET_LOCK" not in jstxt, "role isolation")
        check(f"[{tid}] ADMIN: owner seed/code hash baked in", bool(re.search(r"`[0-9a-f]{64}`", jstxt)), "auth gate is bound to a fixed owner seed")
    rpc_main = "polygon-bor-rpc.publicnode.com" in jstxt
    if meta["net"] == "mainnet":
        check(f"[{tid}] mainnet RPC present", rpc_main, "")
    else:
        check(f"[{tid}] testnet build has no mainnet RPC", not rpc_main, "network isolation")

    # syntax checks
    code, out = run(["node", "--check", str(js)], timeout=60) if js else (-1, "no js")
    check(f"[{tid}] JS bundle parses (node --check)", code == 0, out[:180])

for f in sorted(ROOT.glob("*.mjs")):
    code, out = run(["node", "--check", str(f)], timeout=60)
    check(f"[scripts] {f.name} parses", code == 0, out[:180])
for f in sorted(ROOT.glob("*.sh")):
    code, out = run(["bash", "-n", str(f)], timeout=30)
    check(f"[scripts] {f.name} shell syntax", code == 0, out[:180])

# ---------------------------------------------------------------- 2. secrets
bad = []
secret_pats = [
    (re.compile(r"-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----"), "PEM private key"),
    (re.compile(r"\b0x[0-9a-fA-F]{64}\b"), "64-hex key literal"),
    (re.compile(r"\b(sk|pk)_[A-Za-z0-9]{24,}\b"), "API key literal"),
    (re.compile(r"AKIA[0-9A-Z]{16}"), "AWS key"),
]
for p in ROOT.rglob("*"):
    # qa/ contains test fixtures (e.g. the ERC-20 Transfer topic0, a 64-hex constant)
    if (not p.is_file() or ".git/" in str(p) or "/qa/" in str(p)
            or p.suffix in {".apk", ".jks", ".png", ".jpg", ".idsig"} or "build/" in str(p)):
        continue
    # Compiled Vite/ethers bundles contain secp256k1 field constants (64 hex chars).
    # Those are library constants, not credentials; only scan them for high-confidence patterns.
    is_compiled_bundle = "/assets/" in str(p) and p.name.startswith("index-") and p.suffix == ".js"
    pats = secret_pats[0:1] + secret_pats[2:] if is_compiled_bundle else secret_pats
    try: txt = p.read_text(errors="ignore")
    except Exception: continue
    for pat, label in pats:
        if pat.search(txt): bad.append(f"{p.relative_to(ROOT)}: {label}")
check("[security] no obvious private keys / API keys in source", not bad, "; ".join(bad[:5]) or "clean")
check("[security] no keystore committed", not list(ROOT.rglob("*.jks")) and not list(ROOT.rglob("*.keystore")), "")

# ---------------------------------------------------------------- 3. APK checks
if BT and BT.exists():
    apksigner = BT / "apksigner"; zipalign = BT / "zipalign"; aapt2 = BT / "aapt2"
    for tid, meta in TARGETS.items():
        apk = APK_DIR / f"crestline-{tid}-release.apk"
        ok = apk.exists()
        check(f"[APK {tid}] exists", ok, str(apk))
        if not ok: continue
        check(f"[APK {tid}] size > 500 KB", apk.stat().st_size > 500_000, f"{apk.stat().st_size:,} bytes")
        env = dict(os.environ); 
        if JAVA_HOME: env["PATH"] = str(Path(JAVA_HOME) / "bin") + os.pathsep + env.get("PATH", "")
        try:
            p = subprocess.run([str(apksigner), "verify", "--print-certs", str(apk)], capture_output=True, text=True, timeout=90, env=env)
            check(f"[APK {tid}] signature verifies (v1+v2)", p.returncode == 0, (p.stdout + p.stderr)[:180])
        except Exception as e:
            check(f"[APK {tid}] signature verifies (v1+v2)", False, e)
        try:
            p = subprocess.run([str(zipalign), "-c", "4", str(apk)], capture_output=True, text=True, timeout=60)
            check(f"[APK {tid}] zipalign 4-byte aligned", p.returncode == 0, (p.stdout + p.stderr)[:160])
        except Exception as e:
            check(f"[APK {tid}] zipalign 4-byte aligned", False, e)
        try:
            z = zipfile.ZipFile(apk)
            names = z.namelist()
            check(f"[APK {tid}] web assets bundled", all(any(n.endswith(s) for n in names) for s in ["index.html", ".js", ".css"]),
                  f"{sum(1 for n in names if n.startswith('assets/www/'))} assets/www files")
            dex = b"".join(z.read(n) for n in names if n.endswith(".dex"))
            check(f"[APK {tid}] JS bridge + WebViewAssetLoader survive R8",
                  all(k.encode() in dex for k in ["CrestlineAndroid", "getAppSigningSha256", "appassets.androidplatform.net"]), "")
        except Exception as e:
            check(f"[APK {tid}] web assets bundled", False, e)
        try:
            p = subprocess.run([str(aapt2), "dump", "badging", str(apk)], capture_output=True, text=True, timeout=90)
            out = p.stdout + p.stderr
            m = re.search(r"package: name='([^']+)'", out)
            check(f"[APK {tid}] release package name", bool(m) and m.group(1) == meta["pkg"], m.group(1) if m else out[:160])
            check(f"[APK {tid}] minSdk 26 / targetSdk 35",
                  bool(re.search(r"(?:sdkVersion|minSdkVersion):'26'", out)) and "targetSdkVersion:'35'" in out, "")
        except Exception as e:
            check(f"[APK {tid}] aapt2 badging", False, e)
else:
    check("[APK] SDK toolchain available", False, "ANDROID_SDK_ROOT not set — APK checks skipped")

# ---------------------------------------------------------------- 4. local server smoke
import threading, http.server, socketserver, functools
for i, (tid, meta) in enumerate(TARGETS.items()):
    d = ROOT / tid / "www"
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(d))
    srv = socketserver.TCPServer(("127.0.0.1", 0), handler)
    port = srv.server_address[1]
    th = threading.Thread(target=srv.serve_forever, daemon=True); th.start()
    try:
        good = []
        for path, mime in [("/", "text/html"), ("/index.html", "text/html")]:
            with urllib.request.urlopen(f"http://127.0.0.1:{port}{path}", timeout=5) as r:
                good.append(r.status == 200 and mime in r.headers.get("Content-Type", ""))
        jsname = next((p.name for p in (d / "assets").glob("index-*.js")), None)
        if jsname:
            with urllib.request.urlopen(f"http://127.0.0.1:{port}/assets/{jsname}", timeout=5) as r:
                good.append(r.status == 200 and len(r.read()) > 100_000)
        check(f"[server {tid}] static bundle served", all(good) and len(good) == 3, f"{len(good)}/3 checks")
    except Exception as e:
        check(f"[server {tid}] static bundle served", False, e)
    finally:
        srv.shutdown(); srv.server_close()

# ---------------------------------------------------------------- summary
passed = sum(1 for r in results if r["passed"])
failed = [r for r in results if not r["passed"]]
print(f"\n{'='*72}\nVERIFY: {passed}/{len(results)} checks passed, {len(failed)} failed\n{'='*72}")
for r in failed:
    print(f"  FAIL  {r['name']} :: {r['detail']}")
print("\nPassed checks (sample):")
for r in [x for x in results if x["passed"]][:12]:
    print(f"  PASS  {r['name']}")
args = argparse.ArgumentParser(); args.add_argument("--json", default="")
ns = args.parse_args()
if ns.json:
    Path(ns.json).write_text(json.dumps(dict(total=len(results), passed=passed, failed=len(failed), results=results), indent=2))
sys.exit(0 if not failed else 1)
