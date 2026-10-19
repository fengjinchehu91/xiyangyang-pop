import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const pool = '0xe5ce5bc4785cd2a246151364f5a190cee3fdb142';
const pop = '0xa3cfb853339b77f385b994799b015cb04b208fe6';
const usdt = '0x55d398326f99059ff775485246999027b3197955';
const dexUrl = `https://api.dexscreener.com/latest/dex/pairs/bsc/${pool}`;
const geckoUrl = `https://api.geckoterminal.com/api/v2/networks/bsc/pools/${pool}?include=base_token,quote_token,dex`;
const dexMarket = () => ({ pairs: [{ chainId: 'bsc', dexId: 'pancakeswap', pairAddress: pool,
  baseToken: { address: pop }, quoteToken: { address: usdt }, labels: ['v3'],
  priceUsd: '0.0002943', liquidity: { usd: 686601.47 } }] });
const geckoMarket = () => ({
  data: { type: 'pool', id: `bsc_${pool}`,
    attributes: { address: pool, base_token_price_usd: '0.000298683267859537', reserve_in_usd: '693118.1496' },
    relationships: {
      base_token: { data: { type: 'token', id: `bsc_${pop}` } },
      quote_token: { data: { type: 'token', id: `bsc_${usdt}` } },
      dex: { data: { type: 'dex', id: 'pancakeswap-v3-bsc' } },
    } },
  included: [pop, usdt].map((address) => ({ type: 'token', id: `bsc_${address}`, attributes: { address, decimals: 18 } })),
});
const response = (payload: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json', ...headers } });
let price: typeof import('../functions/api/pop-price')['onRequest'];
let fetchMock: ReturnType<typeof vi.fn>;
const request = () => price({ request: new Request('https://site.example/api/pop-price') });

beforeEach(async () => {
  vi.resetModules();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-19T04:41:21Z'));
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  price = (await import('../functions/api/pop-price')).onRequest;
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('independent POP quote providers', () => {
  it('returns the primary provider identity, original payload and retrieval time', async () => {
    const payload = dexMarket();
    fetchMock.mockResolvedValue(response(payload));
    const result = await request();
    expect(await result.json()).toEqual({ provider: 'dexscreener', retrievedAt: Date.now(), payload });
    expect(result.headers.get('cache-control')).toBe('public, max-age=15');
    expect(fetchMock.mock.calls[0][0]).toBe(dexUrl);
  });

  it('uses an independently identified GeckoTerminal payload when the primary is rate limited', async () => {
    const payload = geckoMarket();
    fetchMock.mockResolvedValueOnce(response({}, 429)).mockResolvedValueOnce(response(payload));
    expect(await (await request()).json()).toEqual({ provider: 'geckoterminal', retrievedAt: Date.now(), payload });
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([dexUrl, geckoUrl]);
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ redirect: 'manual', headers: { Accept: 'application/json;version=20230203' } });
  });

  it('reuses the 15-second successful cache without changing its retrieval time', async () => {
    fetchMock.mockImplementation(async () => response(dexMarket()));
    const initial = await (await request()).json();
    vi.advanceTimersByTime(14_999);
    expect(await (await request()).json()).toEqual(initial);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect((await request()).status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each(['90', 'Mon, 19 Oct 2026 04:42:51 GMT'])('honors the longer Retry-After cooldown: %s', async (retryAfter) => {
    fetchMock.mockResolvedValueOnce(response({}, 429, { 'Retry-After': retryAfter }))
      .mockImplementation(async () => response(geckoMarket()));
    await request();
    vi.advanceTimersByTime(60_000);
    await request();
    expect(fetchMock.mock.calls.filter(([url]) => url === dexUrl)).toHaveLength(1);
    vi.advanceTimersByTime(30_000);
    fetchMock.mockImplementation(async (url: string) => response(url === dexUrl ? dexMarket() : geckoMarket()));
    await request();
    expect(fetchMock.mock.calls.filter(([url]) => url === dexUrl)).toHaveLength(2);
  });

  it('applies at least 60 seconds of cooldown independently to both providers', async () => {
    fetchMock.mockImplementation(async () => response({}, 429, { 'Retry-After': '1' }));
    expect((await request()).status).toBe(502);
    vi.advanceTimersByTime(59_999);
    expect((await request()).status).toBe(502);
    expect(fetchMock.mock.calls.filter(([url]) => url === dexUrl || url === geckoUrl)).toHaveLength(2);
    vi.advanceTimersByTime(1);
    await request();
    expect(fetchMock.mock.calls.filter(([url]) => url === dexUrl || url === geckoUrl)).toHaveLength(4);
  });

  it('shares concurrent provider attempts within one isolate', async () => {
    let resolve!: (value: Response) => void;
    fetchMock.mockImplementation(() => new Promise<Response>((done) => { resolve = done; }));
    const first = request();
    const second = request();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    resolve(response(dexMarket()));
    expect((await first).status).toBe(200);
    expect((await second).status).toBe(200);
  });

  it('reuses validated Cache API data across fresh module instances', async () => {
    const store = new Map<string, Response>();
    vi.stubGlobal('caches', { default: {
      match: vi.fn(async (key: string) => store.get(key)?.clone()),
      put: vi.fn(async (key: string, value: Response) => { store.set(key, value.clone()); }),
    } });
    fetchMock.mockImplementation(async () => response(dexMarket()));
    const first = await (await request()).json();
    vi.resetModules();
    price = (await import('../functions/api/pop-price')).onRequest;
    expect(await (await request()).json()).toEqual(first);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('persists provider cooldown in Cache API when a fresh isolate has no module state', async () => {
    const store = new Map<string, Response>();
    vi.stubGlobal('caches', { default: {
      match: vi.fn(async (key: string) => store.get(key)?.clone()),
      put: vi.fn(async (key: string, value: Response) => { store.set(key, value.clone()); }),
    } });
    fetchMock.mockResolvedValueOnce(response({}, 429))
      .mockImplementation(async () => response(geckoMarket()));
    await request();
    vi.advanceTimersByTime(16_000);
    vi.resetModules();
    price = (await import('../functions/api/pop-price')).onRequest;
    fetchMock.mockClear();
    expect((await request()).status).toBe(200);
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([geckoUrl]);
  });

  it.each(['pool', 'network', 'base', 'quote', 'dex', 'price', 'liquidity', 'included'])
  ('rejects invalid GeckoTerminal %s data and never fabricates a usable price', async (field) => {
    const payload = geckoMarket();
    if (field === 'pool') payload.data.attributes.address = pop;
    if (field === 'network') payload.data.id = `eth_${pool}`;
    if (field === 'base') payload.data.relationships.base_token.data.id = `bsc_${usdt}`;
    if (field === 'quote') payload.data.relationships.quote_token.data.id = `bsc_${pop}`;
    if (field === 'dex') payload.data.relationships.dex.data.id = 'uniswap-v3-bsc';
    if (field === 'price') payload.data.attributes.base_token_price_usd = '0';
    if (field === 'liquidity') payload.data.attributes.reserve_in_usd = '49999.999';
    if (field === 'included') payload.included[0].attributes.address = usdt;
    fetchMock.mockResolvedValueOnce(response({}, 429)).mockResolvedValueOnce(response(payload));
    const result = await request();
    expect(result.status).toBe(502);
    expect(await result.json()).toEqual({ error: 'POP price is temporarily unavailable' });
    expect(result.headers.get('cache-control')).toBe('no-store');
  });

  it('keeps API and on-chain attempts within eight seconds and aborts stalled requests', async () => {
    fetchMock.mockImplementation(() => new Promise(() => {}));
    const pending = request();
    await vi.advanceTimersByTimeAsync(4_000);
    expect(fetchMock.mock.calls.filter(([url]) => url === dexUrl || url === geckoUrl)).toHaveLength(2);
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(4_000);
    expect((await pending).status).toBe(502);
    expect(fetchMock.mock.calls[1][1].signal.aborted).toBe(true);
  });
});
