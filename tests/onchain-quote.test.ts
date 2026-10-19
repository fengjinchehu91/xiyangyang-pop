import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { encodeAbiParameters, toFunctionSelector } from 'viem';
import { parseMarketPayload, parseOnchainMarket, parseQuotePayload, popOnchainMarket,
  popUsdPool, type OnchainQuotePayload } from '../src/config/popMarket';
import { readOnchainQuote } from '../functions/_lib/onchainQuote';
import { verifiedDeployment as deployment } from '../src/config/verified';

const now = 1_792_385_495_000;
const primary = 'https://bsc-dataseed.binance.org';
const secondary = 'https://rpc-bsc.48.club';
const fixture = (): OnchainQuotePayload => ({
  chainId: 56, blockNumber: '128493356',
  blockHash: '0xb7fefb7a447b4f19a29d8a32cc0483531361cadfe2a940c9e0918ce15afa4127',
  blockTimestamp: '1792385494',
  pool: { address: popUsdPool, factory: '0x0bfbcf9fa4f9c56b0f40a671ad40e0805a091865',
    token0: '0x55d398326f99059ff775485246999027b3197955', token1: deployment.pop,
    token0Decimals: 18, token1Decimals: 18, fee: 100,
    sqrtPriceX96: '4617516142961171474810702216413', liquidity: '19749339569669766879981699', unlocked: true },
  oracle: { address: '0xb97ad0e74fa7d920791e90258a6e2085088b4320',
    aggregator: '0x63f4ff1c8c16c312f4b9792bdfde149622293934', description: 'USDT / USD', decimals: 8,
    roundId: '73786976294838212146', answer: '99877631', startedAt: '1792385177',
    updatedAt: '1792385190', answeredInRound: '73786976294838212146' },
});
const json = (value: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json', ...headers } });
let fetchMock: ReturnType<typeof vi.fn>;

function rpcResponse(init?: RequestInit, snapshot = fixture()) {
  const body = JSON.parse(String(init?.body)) as { id: number; method: string; params: unknown[] };
  let result: unknown;
  if (body.method === 'eth_chainId') result = '0x38';
  else if (body.method === 'eth_getBlockByNumber') result = {
    number: `0x${BigInt(snapshot.blockNumber).toString(16)}`, hash: snapshot.blockHash,
    timestamp: `0x${BigInt(snapshot.blockTimestamp).toString(16)}`,
  };
  else if (body.method === 'eth_call') {
    const { to, data } = body.params[0] as { to: string; data: string };
    const address = (value: string) => `0x${value.slice(2).padStart(64, '0')}`;
    const uint = (value: string | number) => `0x${BigInt(value).toString(16).padStart(64, '0')}`;
    const selector = (signature: string) => data === toFunctionSelector(signature);
    if (selector('token0()')) result = address(snapshot.pool.token0);
    else if (selector('token1()')) result = address(snapshot.pool.token1);
    else if (selector('factory()')) result = address(snapshot.pool.factory);
    else if (selector('fee()')) result = uint(snapshot.pool.fee);
    else if (selector('liquidity()')) result = uint(snapshot.pool.liquidity);
    else if (selector('aggregator()')) result = address(snapshot.oracle.aggregator);
    else if (selector('description()')) result = encodeAbiParameters([{ type: 'string' }], [snapshot.oracle.description]);
    else if (selector('decimals()')) result = uint(to === popOnchainMarket.oracle ? snapshot.oracle.decimals
      : to === deployment.pop ? snapshot.pool.token1Decimals : snapshot.pool.token0Decimals);
    else if (selector('slot0()')) result = encodeAbiParameters([
      { type: 'uint160' }, { type: 'int24' }, { type: 'uint16' }, { type: 'uint16' },
      { type: 'uint16' }, { type: 'uint32' }, { type: 'bool' },
    ], [BigInt(snapshot.pool.sqrtPriceX96), 81309, 9, 10, 10, 216272100, snapshot.pool.unlocked]);
    else if (selector('latestRoundData()')) result = encodeAbiParameters([
      { type: 'uint80' }, { type: 'int256' }, { type: 'uint256' }, { type: 'uint256' }, { type: 'uint80' },
    ], [BigInt(snapshot.oracle.roundId), BigInt(snapshot.oracle.answer), BigInt(snapshot.oracle.startedAt),
      BigInt(snapshot.oracle.updatedAt), BigInt(snapshot.oracle.answeredInRound)]);
    else throw new Error('Unexpected quote selector');
  } else throw new Error('Unexpected quote RPC method');
  return json({ jsonrpc: '2.0', id: body.id, result });
}

beforeEach(() => {
  vi.spyOn(Date, 'now').mockReturnValue(now);
  fetchMock = vi.fn(async (_url, init?: RequestInit) => rpcResponse(init));
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('shared POP spot / Chainlink USD evidence parser', () => {
  it('recomputes the real snapshot with integer arithmetic and preserves independent source identities', () => {
    const result = parseOnchainMarket(fixture(), now);
    expect(result.usdPerToken).toBe('0.000294042803907186277762');
    expect(result.sourceLabel).toBe('PancakeSwap × Chainlink');
    expect(result.sourceUrl).toBe(`https://bscscan.com/address/${popUsdPool}#readContract`);
    expect(result.sourceDetailsUrl).toContain(popOnchainMarket.oracle);
    const payload = { ...fixture(), usdPerToken: '999999999' };
    expect(parseQuotePayload({ provider: 'pancakeswap-chainlink', retrievedAt: now, payload })).toMatchObject({
      ...result, timestamp: now,
    });
  });

  it('uses the actual USDT/USD answer rather than assuming a dollar peg', () => {
    const snapshot = fixture();
    snapshot.oracle.answer = '100000000';
    expect(parseOnchainMarket(snapshot, now).usdPerToken).toBe('0.000294403061990112959089');
    expect(parseMarketPayload('pancakeswap-chainlink', fixture()).usdPerToken)
      .toBe('0.000294042803907186277762');
  });

  const invalid: [string, (snapshot: OnchainQuotePayload) => void][] = [
    ['wrong chain', (x) => { x.chainId = 1; }],
    ['wrong pool', (x) => { x.pool.address = deployment.treasury; }],
    ['wrong factory', (x) => { x.pool.factory = deployment.treasury; }],
    ['wrong quote asset', (x) => { x.pool.token0 = deployment.token; }],
    ['wrong base asset', (x) => { x.pool.token1 = deployment.token; }],
    ['wrong USDT units', (x) => { x.pool.token0Decimals = 6; }],
    ['wrong POP units', (x) => { x.pool.token1Decimals = 6; }],
    ['wrong oracle units', (x) => { x.oracle.decimals = 18; }],
    ['wrong fee', (x) => { x.pool.fee = 500; }],
    ['locked pool', (x) => { x.pool.unlocked = false; }],
    ['no liquidity', (x) => { x.pool.liquidity = '0'; }],
    ['zero sqrt price', (x) => { x.pool.sqrtPriceX96 = '0'; }],
    ['wrong oracle', (x) => { x.oracle.address = deployment.pop; }],
    ['unreviewed aggregator', (x) => { x.oracle.aggregator = deployment.pop; }],
    ['wrong description', (x) => { x.oracle.description = 'USDT / BNB'; }],
    ['zero price', (x) => { x.oracle.answer = '0'; }],
    ['negative price', (x) => { x.oracle.answer = '-1'; }],
    ['zero round', (x) => { x.oracle.roundId = '0'; }],
    ['incomplete round', (x) => { x.oracle.answeredInRound = '1'; }],
    ['zero timestamp', (x) => { x.oracle.updatedAt = '0'; }],
    ['future oracle', (x) => { x.oracle.updatedAt = '1792385495'; }],
    ['expired oracle', (x) => { x.oracle.updatedAt = '1792384473'; x.oracle.startedAt = '1792384470'; }],
    ['invalid round times', (x) => { x.oracle.startedAt = '1792385191'; }],
    ['stale block', (x) => { x.blockTimestamp = '1792385374'; }],
    ['future block', (x) => { x.blockTimestamp = '1792385506'; }],
    ['invalid block hash', (x) => { x.blockHash = '0x123'; }],
  ];
  it.each(invalid)('rejects %s instead of publishing a price', (_name, alter) => {
    const snapshot = fixture();
    alter(snapshot);
    expect(() => parseOnchainMarket(snapshot, now)).toThrow();
  });

  it('allows only the documented 900 second heartbeat plus 120 second grace', () => {
    const snapshot = fixture();
    snapshot.oracle.updatedAt = String(BigInt(snapshot.blockTimestamp) - 1020n);
    snapshot.oracle.startedAt = String(BigInt(snapshot.oracle.updatedAt) - 1n);
    expect(parseOnchainMarket(snapshot, now).usdPerToken).toBe('0.000294042803907186277762');
    snapshot.oracle.updatedAt = String(BigInt(snapshot.oracle.updatedAt) - 1n);
    expect(() => parseOnchainMarket(snapshot, now)).toThrow();
  });
});

describe('minimal pinned-block on-chain quote reader', () => {
  it('reads actual metadata and every contract at one block, then rechecks its hash', async () => {
    expect(await readOnchainQuote()).toEqual(fixture());
    expect(fetchMock).toHaveBeenCalledTimes(15);
    expect(fetchMock.mock.calls.every(([url]) => url === primary)).toBe(true);
    const requests = fetchMock.mock.calls.map(([, init]) => JSON.parse(init.body));
    const calls = requests.filter((x) => x.method === 'eth_call');
    expect(calls).toHaveLength(12);
    expect(calls.every((x) => x.params[1] === `0x${BigInt(fixture().blockNumber).toString(16)}`)).toBe(true);
    expect(requests.at(-1)).toMatchObject({ method: 'eth_getBlockByNumber',
      params: [`0x${BigInt(fixture().blockNumber).toString(16)}`, false] });
    expect(requests.every((x) => ['eth_chainId', 'eth_getBlockByNumber', 'eth_call'].includes(x.method))).toBe(true);
  });

  it('uses only the other fixed RPC when the first node cannot provide a complete snapshot', async () => {
    fetchMock.mockImplementation(async (url, init) => {
      if (url === primary) throw new Error('First node unavailable');
      return rpcResponse(init);
    });
    expect(await readOnchainQuote()).toEqual(fixture());
    expect(fetchMock.mock.calls.filter(([url]) => url === primary)).toHaveLength(2);
    expect(fetchMock.mock.calls.filter(([url]) => url === secondary)).toHaveLength(15);
  });

  it('rejects a block hash change rather than combining incompatible snapshots', async () => {
    fetchMock.mockImplementation(async (_url, init) => {
      const body = JSON.parse(init.body);
      const snapshot = fixture();
      if (body.method === 'eth_getBlockByNumber' && body.params[0] !== 'latest') snapshot.blockHash = `0x${'1'.repeat(64)}`;
      return rpcResponse(init, snapshot);
    });
    await expect(readOnchainQuote()).rejects.toThrow('unavailable');
  });

  it('times out both fixed nodes inside the total four second budget', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    fetchMock.mockImplementation(() => new Promise(() => {}));
    const pending = readOnchainQuote(4_000);
    const rejected = expect(pending).rejects.toThrow('unavailable');
    await vi.advanceTimersByTimeAsync(4_000);
    await rejected;
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock.mock.calls.every(([, init]) => init.signal.aborted)).toBe(true);
  });

  it('tries on-chain evidence only after both APIs fail, respecting their 429 cooldowns', async () => {
    vi.resetModules();
    const { onRequest } = await import('../functions/api/pop-price');
    const get = () => onRequest({ request: new Request('https://site.example/api/pop-price') });
    fetchMock.mockImplementation(async (url, init) => {
      if (String(url).includes('api.dexscreener.com') || String(url).includes('api.geckoterminal.com')) {
        return json({}, 429, { 'Retry-After': '3600' });
      }
      return rpcResponse(init);
    });
    const result = await get();
    expect(result.status).toBe(200);
    expect(await result.json()).toEqual({ provider: 'pancakeswap-chainlink', retrievedAt: now, payload: fixture() });
    expect(fetchMock.mock.calls[0][0]).toContain('api.dexscreener.com');
    expect(fetchMock.mock.calls[1][0]).toContain('api.geckoterminal.com');
    expect(fetchMock.mock.calls.slice(2).every(([url]) => url === primary)).toBe(true);
    vi.spyOn(Date, 'now').mockReturnValue(now + 16_000);
    fetchMock.mockClear();
    expect((await get()).status).toBe(200);
    expect(fetchMock.mock.calls.every(([url]) => url === primary)).toBe(true);
  });
});
