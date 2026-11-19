#!/usr/bin/env python3
"""Read-only, key-free chain sanity checks. Never sends a transaction.

Queries public RPCs for chain ID, contract code at the addresses baked into the
bundles, the pool's USDT balance and recent Transfer logs. Results are written
to qa/real-chain-results.json.
"""
import json, socket, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
AMOY = 'https://polygon-amoy-bor-rpc.publicnode.com'
POLYGON = 'https://polygon-bor-rpc.publicnode.com'
USDT = '0xc2132D05D31c914a87C6611C10748AEb04B58e8F'
POOL_MAIN = '0xA14e867C7B4539B776F88FEDA19cf011b88c793b'
POOL_TEST = '0x08EE5Cf33C30123A628aC8FF80Ca48Bec8E96Db8'
REGISTRY_TEST = '0x9be43bC43b1b3e47f9507696101938EB830cbae8'
TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'

def rpc(url, method, params=None):
    data = json.dumps({'jsonrpc': '2.0', 'id': 1, 'method': method, 'params': params or []}).encode()
    req = urllib.request.Request(url, data=data, headers={'Content-Type': 'application/json', 'User-Agent': 'arena-qa'}, method='POST')
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            out = json.load(r)
            return out.get('result'), out.get('error')
    except Exception as e:
        return None, str(e)[:160]

out = {'note': 'read-only public RPC queries; no keys, no funds, no transactions', 'checks': []}
def add(label, value, error=None, note=''):
    out['checks'].append({'label': label, 'value': value, 'error': error, 'note': note})

for name, url in [('amoy', AMOY), ('polygon', POLYGON)]:
    cid, err = rpc(url, 'eth_chainId'); add(f'{name} eth_chainId', cid, err)
    bn, err = rpc(url, 'eth_blockNumber'); add(f'{name} eth_blockNumber', bn, err)
    blk, err = rpc(url, 'eth_getBlockByNumber', ['latest', False])
    add(f'{name} latest block timestamp', blk.get('timestamp') if isinstance(blk, dict) else None, err)

for label, url, addr in [
    ('amoy_pool', AMOY, POOL_TEST), ('amoy_registry', AMOY, REGISTRY_TEST),
    ('mainnet_pool', POLYGON, POOL_MAIN), ('polygon_USDT', POLYGON, USDT),
]:
    code, err = rpc(url, 'eth_getCode', [addr, 'latest'])
    bal, err2 = rpc(url, 'eth_getBalance', [addr, 'latest'])
    add(f'{label} eth_getCode', {'length': len(code) if isinstance(code, str) else None,
                                 'isContract': isinstance(code, str) and len(code) > 2}, err)
    add(f'{label} native balance', int(bal, 16) / 1e18 if isinstance(bal, str) and bal.startswith('0x') else None, err2)

# USDT balanceOf(mainnet pool)
data = '0x70a08231' + '0' * 24 + POOL_MAIN[2:].lower()
res, err = rpc(POLYGON, 'eth_call', [{'to': USDT, 'data': data}, 'latest'])
add('USDT balanceOf(mainnet pool)', int(res, 16) / 1e6 if isinstance(res, str) else None, err, '6 decimals')

# recent Transfer logs to the pool (10k block windows, 5 windows)
bn, _ = rpc(POLYGON, 'eth_blockNumber')
to_topic = '0x' + '0' * 24 + POOL_MAIN[2:].lower()
total = 0
if isinstance(bn, str):
    latest = int(bn, 16)
    for k in range(5):
        hi = latest - k * 10000; lo = max(0, hi - 9999)
        logs, e = rpc(POLYGON, 'eth_getLogs', [{'address': USDT, 'fromBlock': hex(lo), 'toBlock': hex(hi),
                                                'topics': [TRANSFER_TOPIC, None, to_topic]}])
        total += len(logs) if isinstance(logs, list) else 0
        add(f'USDT Transfers -> pool blocks {lo}..{hi}', len(logs) if isinstance(logs, list) else None, e)
add('USDT Transfers -> pool total (last 50k blocks)', total)

try:
    socket.gethostbyname('rpc-amoy.polygon.technology')
    add('rpc-amoy.polygon.technology DNS', 'resolves')
except Exception as e:
    add('rpc-amoy.polygon.technology DNS', 'UNRESOLVED', str(e)[:120])

(ROOT / 'qa' / 'real-chain-results.json').write_text(json.dumps(out, indent=2))
print(json.dumps(out, indent=2))
