import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { encodeFunctionData, parseAbi, toEventSelector } from 'viem';
import { onRequest as rpc } from '../functions/api/rpc';
import { onRequest as history } from '../functions/api/history';
import { verifiedDeployment as deployment } from '../src/config/verified';

const primary = 'https://bsc-dataseed.binance.org';
const secondary = 'https://rpc-bsc.48.club';
const quoteUrl = 'https://api.dexscreener.com/latest/dex/pairs/bsc/0xe5ce5bc4785cd2a246151364f5a190cee3fdb142';
const addressTopic = (address: string) => `0x${address.slice(2).padStart(64, '0')}`;
const transferTopic = toEventSelector('Transfer(address,address,uint256)');
const logs = { address: deployment.pop, fromBlock: '0x100', toBlock: '0x1487',
  topics: [transferTopic, addressTopic(deployment.treasury), addressTopic(deployment.buybackRecipient)] };
const callAbi = parseAbi(['function decimals() view returns (uint8)',
  'function balanceOf(address) view returns (uint256)', 'function currentPricePerTokenRaw() view returns (uint256)',
  'function swap(uint256)']);
const decimalCall = { to: deployment.pop, data: encodeFunctionData({ abi: callAbi, functionName: 'decimals' }) };
const envelope = (result: unknown, id: string | number | null = 17) => ({ jsonrpc: '2.0', id, result });
const response = (payload: unknown, status = 200) => new Response(JSON.stringify(payload), {
  status, headers: { 'Content-Type': 'application/json' },
});
const request = (method: string, params: unknown[] = [], id: string | number | null = 17) => ({
  request: new Request('https://site.example/api/rpc', { method: 'POST',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id, method, params }) }),
});
const market = () => ({ pairs: [{
  chainId: 'bsc', dexId: 'pancakeswap', pairAddress: '0xe5ce5bc4785cd2a246151364f5a190cee3fdb142',
  labels: ['v3'], baseToken: { address: deployment.pop },
  quoteToken: { address: '0x55d398326f99059ff775485246999027b3197955' },
  priceUsd: '0.0003207', liquidity: { usd: 716282.56 },
}] });
let fetchMock: ReturnType<typeof vi.fn>;
let price: typeof import('../functions/api/pop-price')['onRequest'];

beforeEach(async () => {
  vi.resetModules();
  price = (await import('../functions/api/pop-price')).onRequest;
  fetchMock = vi.fn(async () => response(envelope('0x38')));
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('same-origin read-only chain APIs', () => {
  it('preserves JSON-RPC ids and uses only the fixed primary URL', async () => {
    fetchMock.mockImplementation(async () => response(envelope('0x38', 'mobile-1')));
    const result = await rpc(request('eth_chainId', [], 'mobile-1'));
    expect(result.status).toBe(200);
    expect(await result.json()).toEqual(envelope('0x38', 'mobile-1'));
    expect(result.headers.get('content-type')).toContain('application/json');
    expect(result.headers.get('cache-control')).toBe('no-store');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(primary);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      jsonrpc: '2.0', id: 'mobile-1', method: 'eth_chainId', params: [],
    });
  });

  it.each([
    ['eth_call', [decimalCall, 'latest']],
    ['eth_call', [{ to: deployment.token, data: encodeFunctionData({ abi: callAbi,
      functionName: 'balanceOf', args: [deployment.burnAddress] }) }, '0x123']],
    ['eth_call', [{ to: deployment.treasury, data: encodeFunctionData({ abi: callAbi,
      functionName: 'currentPricePerTokenRaw' }) }, '0x123']],
    ['eth_blockNumber', []],
    ['eth_getBlockByNumber', ['0x123', false]],
    ['eth_getTransactionReceipt', [`0x${'1'.repeat(64)}`]],
    ['eth_getBalance', [deployment.buybackRecipient, 'latest']],
    ['eth_getCode', [deployment.token, 'latest']],
  ])('allows application read %s', async (method, params) => {
    expect((await rpc(request(method as string, params as unknown[]))).status).toBe(200);
  });

  it.each(['eth_sendRawTransaction', 'eth_sendTransaction', 'personal_sign', 'wallet_switchEthereumChain', 'debug_traceCall'])
  ('rejects wallet, write and unrelated method %s without an upstream request', async (method) => {
    const result = await rpc(request(method));
    expect(result.status).toBe(403);
    expect(await result.json()).toMatchObject({ id: 17, error: { code: -32601 } });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ['eth_call', [{ ...decimalCall, to: '0x1111111111111111111111111111111111111111' }, 'latest']],
    ['eth_call', [{ ...decimalCall, from: deployment.buybackRecipient }, 'latest']],
    ['eth_call', [{ to: deployment.treasury, data: encodeFunctionData({ abi: callAbi, functionName: 'swap', args: [1n] }) }, 'latest']],
    ['eth_call', [{ to: deployment.token, data: encodeFunctionData({ abi: callAbi, functionName: 'balanceOf',
      args: ['0x1111111111111111111111111111111111111111'] }) }, 'latest']],
    ['eth_getBlockByNumber', ['latest', true]],
    ['eth_getTransactionReceipt', ['not-a-hash']],
    ['eth_getLogs', [{ ...logs, toBlock: '0x1488' }]],
    ['eth_getLogs', [{ ...logs, toBlock: 'latest' }]],
    ['eth_getLogs', [{ ...logs, address: '0x1111111111111111111111111111111111111111' }]],
    ['eth_getLogs', [{ ...logs, topics: [transferTopic] }]],
  ])('rejects an out-of-scope %s request', async (method, params) => {
    expect((await rpc(request(method as string, params as unknown[]))).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('permits exactly 5000 history blocks, and starts with the history upstream', async () => {
    fetchMock.mockImplementation(async () => response(envelope([])));
    const result = await history(request('eth_getLogs', [logs]));
    expect(result.status).toBe(200);
    expect(await result.json()).toEqual(envelope([]));
    expect(fetchMock.mock.calls[0][0]).toBe(secondary);
  });

  it('falls back on network failures and JSON-RPC errors while preserving the original id', async () => {
    fetchMock.mockRejectedValueOnce(new Error('Primary blocked'))
      .mockResolvedValueOnce(response(envelope('0x123')));
    expect(await (await rpc(request('eth_blockNumber'))).json()).toEqual(envelope('0x123'));
    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([primary, secondary]);
    fetchMock.mockClear().mockResolvedValueOnce(response({ jsonrpc: '2.0', id: 17,
      error: { code: -32005, message: 'limit exceeded' } }))
      .mockResolvedValueOnce(response(envelope([])));
    expect((await history(request('eth_getLogs', [logs]))).status).toBe(200);
    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([secondary, primary]);
  });

  it('rejects mismatched response ids and retries the next fixed upstream', async () => {
    fetchMock.mockResolvedValueOnce(response(envelope('0x123', 999)))
      .mockResolvedValueOnce(response(envelope('0x456')));
    expect(await (await rpc(request('eth_blockNumber'))).json()).toEqual(envelope('0x456'));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('uses Workers-compatible manual redirects and refuses to follow an upstream 302', async () => {
    fetchMock.mockImplementation(async () => new Response(null, {
      status: 302, headers: { Location: 'https://attacker.example/redirected' },
    }));
    expect((await rpc(request('eth_chainId'))).status).toBe(503);
    expect((await price({ request: new Request('https://site.example/api/pop-price') })).status).toBe(502);
    expect(fetchMock.mock.calls.map((call) => call[0]).slice(0, 3)).toEqual([primary, secondary, quoteUrl]);
    expect(fetchMock.mock.calls.every((call) => call[0] !== 'https://attacker.example/redirected')).toBe(true);
    for (const [, init] of fetchMock.mock.calls) expect(init.redirect).toBe('manual');
  });

  it('returns an uncached failure when all upstreams fail, without manufacturing zero or empty logs', async () => {
    fetchMock.mockImplementation(async () => response({ jsonrpc: '2.0', id: 17,
      error: { code: -32005, message: 'Logs unavailable' } }));
    const result = await history(request('eth_getLogs', [logs]));
    expect(result.status).toBe(503);
    expect(await result.json()).toEqual({ jsonrpc: '2.0', id: 17,
      error: { code: -32005, message: 'Logs unavailable' } });
    expect(result.headers.get('cache-control')).toBe('no-store');
  });

  it.each([['rpc', 8_000], ['history', 20_000]])('bounds the whole %s attempt, including fallback, to %s ms', async (mode, budget) => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(() => new Promise(() => {}));
    const pending = mode === 'rpc' ? rpc(request('eth_chainId')) : history(request('eth_getLogs', [logs]));
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(Number(budget) / 2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(Number(budget) / 2);
    expect((await pending).status).toBe(503);
    expect(fetchMock.mock.calls[1][1].signal.aborted).toBe(true);
  });

  it('rejects batch requests, malformed JSON, oversized bodies and user-supplied upstream fields', async () => {
    for (const [body, status] of [
      ['[]', 400], ['invalid', 400], [' '.repeat(8_193), 413],
      [JSON.stringify({ jsonrpc: '2.0', id: 17, method: 'eth_chainId', params: [], url: 'https://attacker.example' }), 400],
    ] as const) {
      const result = await rpc({ request: new Request('https://site.example/api/rpc', { method: 'POST',
        headers: { 'Content-Type': 'application/json' }, body }) });
      expect(result.status).toBe(status);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('requires POST JSON and does not forward request headers or credentials', async () => {
    expect((await rpc({ request: new Request('https://site.example/api/rpc') })).status).toBe(405);
    expect((await rpc({ request: new Request('https://site.example/api/rpc', { method: 'POST', body: '{}' }) })).status).toBe(415);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('same-origin POP price API', () => {
  it('uses the fixed market, preserves the payload in a sourced envelope and needs no AbortSignal.timeout', async () => {
    vi.spyOn(AbortSignal, 'timeout').mockImplementation(() => { throw new Error('Unavailable in old browsers'); });
    const payload = market();
    fetchMock.mockImplementation(async () => response(payload));
    const result = await price({ request: new Request('https://site.example/api/pop-price?url=https://attacker.example') });
    expect(result.status).toBe(200);
    expect(await result.json()).toEqual({ provider: 'dexscreener', retrievedAt: expect.any(Number), payload });
    expect(fetchMock.mock.calls[0][0]).toBe(quoteUrl);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each(['http', 'network', 'market'])('does not cache or fabricate a quote after %s failure', async (failure) => {
    if (failure === 'http') fetchMock.mockResolvedValue(response({}, 503));
    if (failure === 'network') fetchMock.mockRejectedValue(new Error('Offline'));
    if (failure === 'market') fetchMock.mockResolvedValue(response({ pairs: [] }));
    const result = await price({ request: new Request('https://site.example/api/pop-price') });
    expect(result.status).toBe(502);
    expect(await result.json()).toEqual({ error: 'POP price is temporarily unavailable' });
    expect(result.headers.get('cache-control')).toBe('no-store');
  });

  it('aborts a stalled quote after eight seconds', async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(() => new Promise(() => {}));
    const pending = price({ request: new Request('https://site.example/api/pop-price') });
    await vi.advanceTimersByTimeAsync(8_000);
    expect((await pending).status).toBe(502);
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
  });

  it('requires GET', async () => {
    const result = await price({ request: new Request('https://site.example/api/pop-price', { method: 'POST' }) });
    expect(result.status).toBe(405);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
