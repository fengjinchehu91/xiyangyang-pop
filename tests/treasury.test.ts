import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.hoisted(() => ({
  readContract: vi.fn(), getChainId: vi.fn(), getBlockNumber: vi.fn(), getBalance: vi.fn(),
}));
const quoteConfig = vi.hoisted(() => ({ source: null as import('../src/config/quotes').QuoteSource | null }));
vi.mock('viem', async (importOriginal) => {
  const actual = await importOriginal<typeof import('viem')>();
  return { ...actual, createPublicClient: () => ({ ...rpc, transport: { url: 'test://bsc' } }) };
});
vi.mock('../src/config/quotes', async (importOriginal) => ({
  ...await importOriginal<typeof import('../src/config/quotes')>(),
  get quoteSource() { return quoteConfig.source; },
}));

let data: typeof import('../src/data/treasury');
let chain: typeof import('../src/config/chain')['chainConfig'];
let sources: typeof import('../src/config/contracts')['contractSources'];
const holder = '0x1111111111111111111111111111111111111111';

beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  quoteConfig.source = null;
  data = await import('../src/data/treasury');
  chain = (await import('../src/config/chain')).chainConfig;
  sources = (await import('../src/config/contracts')).contractSources;
  chain.treasuryAddress = undefined;
  chain.buybackAddress = undefined;
  chain.buybackAssetKind = undefined;
  chain.buybackAssetAddress = undefined;
  chain.buybackBalanceVerified = false;
  chain.buybackBalanceEvidenceUrl = undefined;
  chain.tokens.xiyangyang = holder;
  sources.floorPrice = null;
  sources.cumulativeBurned = null;
  sources.recentBuyback = null;
  rpc.getChainId.mockResolvedValue(56);
  rpc.getBlockNumber.mockResolvedValue(123456n);
  rpc.readContract.mockImplementation(async ({ functionName }: { functionName: string }) => {
    if (functionName === 'decimals') return 6;
    if (functionName === 'symbol') return 'POP';
    return 0n;
  });
});

describe('honest treasury states', () => {
  it('keeps missing sources unconfigured and makes no RPC requests', async () => {
    const snapshot = await data.readDashboard();
    expect(snapshot.reserve.status).toBe('unconfigured');
    expect(snapshot.floor.status).toBe('unconfigured');
    expect(snapshot.buyback.status).toBe('unconfigured');
    expect(snapshot.burned.status).toBe('unconfigured');
    expect(snapshot.blackholeBurned.status).toBe('unconfigured');
    expect(snapshot.recentBuyback.status).toBe('unconfigured');
    expect(snapshot.updatedAt).toBeUndefined();
    expect(rpc.getChainId).not.toHaveBeenCalled();
  });
  it('uses actual ERC20 decimals and displays real zero balances as ready', async () => {
    chain.treasuryAddress = holder;
    const snapshot = await data.readDashboard();
    expect(snapshot.reserve).toMatchObject({ status: 'ready', data: { raw: 0n, decimals: 6, symbol: 'POP' } });
    expect(snapshot.floor.status).toBe('unconfigured');
    expect(snapshot.blockNumber).toBe(123456n);
    expect(rpc.readContract).toHaveBeenCalledWith(expect.objectContaining({ functionName: 'balanceOf', args: [holder], blockNumber: 123456n }));
  });
  it('keeps huge raw balances as bigint', async () => {
    chain.treasuryAddress = holder;
    rpc.readContract.mockImplementation(async ({ functionName }: { functionName: string }) =>
      functionName === 'decimals' ? 8 : functionName === 'symbol' ? 'POP' : 900719925474099312345n);
    const snapshot = await data.readDashboard();
    expect(snapshot.reserve).toMatchObject({ status: 'ready', data: { raw: 900719925474099312345n, decimals: 8 } });
  });
  it('marks RPC failure as error, never a zero or updated value', async () => {
    chain.treasuryAddress = holder;
    rpc.getChainId.mockRejectedValue(new Error('RPC unavailable'));
    const snapshot = await data.readDashboard();
    expect(snapshot.reserve.status).toBe('error');
    expect(snapshot.reserve).not.toHaveProperty('data');
    expect(snapshot.updatedAt).toBeUndefined();
    expect(snapshot.floor.status).toBe('unconfigured');
  });
  it('rejects an RPC pointed at a different chain', async () => {
    chain.treasuryAddress = holder;
    rpc.getChainId.mockResolvedValue(1);
    const snapshot = await data.readDashboard();
    expect(snapshot.reserve.status).toBe('error');
    expect(rpc.readContract).not.toHaveBeenCalled();
  });
  it('does not guess the buyback asset from a holding address', async () => {
    chain.buybackAddress = holder;
    const snapshot = await data.readDashboard();
    expect(snapshot.buyback.status).toBe('unconfigured');
    expect(rpc.getChainId).not.toHaveBeenCalled();
  });
  it('reads the current buyback token balance at the same block', async () => {
    chain.buybackAddress = holder;
    chain.buybackAssetKind = 'erc20';
    chain.buybackAssetAddress = chain.tokens.pop;
    chain.buybackBalanceVerified = true;
    chain.buybackBalanceEvidenceUrl = 'https://example.com/verified-project-funds';
    const snapshot = await data.readDashboard();
    expect(snapshot.buyback).toMatchObject({ status: 'ready', data: { raw: 0n, decimals: 6 } });
    expect(rpc.readContract).toHaveBeenCalledWith(expect.objectContaining({ functionName: 'balanceOf', blockNumber: 123456n }));
  });
  it('does not present a confirmed recipient wallet balance as available project funds', async () => {
    chain.buybackAddress = holder;
    chain.buybackAssetKind = 'erc20';
    chain.buybackAssetAddress = chain.tokens.pop;
    const snapshot = await data.readDashboard();
    expect(snapshot.buyback.status).toBe('unconfigured');
    expect(rpc.readContract).not.toHaveBeenCalled();
  });
  it('requires evidence before enabling a project-available buyback balance', async () => {
    chain.buybackAddress = holder;
    chain.buybackAssetKind = 'erc20';
    chain.buybackAssetAddress = chain.tokens.pop;
    chain.buybackBalanceVerified = true;
    expect((await data.readDashboard()).buyback.status).toBe('unconfigured');
  });
  it('retries failed metadata instead of caching a failed read', async () => {
    chain.treasuryAddress = holder;
    rpc.readContract.mockRejectedValueOnce(new Error('decimals failed'));
    expect((await data.readDashboard()).reserve.status).toBe('error');
    expect((await data.readDashboard()).reserve.status).toBe('ready');
  });
  it('shares concurrent dashboard requests', async () => {
    chain.treasuryAddress = holder;
    const first = data.readDashboard();
    const second = data.readDashboard();
    expect(first).toBe(second);
    await first;
    expect(rpc.getChainId).toHaveBeenCalledTimes(1);
  });
  it('publishes independent quote data while the RPC is still waiting', async () => {
    chain.treasuryAddress = holder;
    quoteConfig.source = {
      tokenAddress: chain.tokens.pop, sourceUrl: 'https://example.com/source',
      requestUrl: '/api/pop-price', maxAgeMs: 60_000,
      parse: () => ({ usdPerToken: '0.0003', timestamp: Date.now() }),
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}')));
    let release!: (value: number) => void;
    rpc.getChainId.mockImplementation(() => new Promise<number>((resolve) => { release = resolve; }));
    const update = vi.fn();
    const pending = data.readDashboard(update);
    await vi.waitFor(() => expect(update).toHaveBeenCalledWith({ quote: expect.objectContaining({ status: 'ready' }) }));
    expect(rpc.getBlockNumber).not.toHaveBeenCalled();
    release(56);
    expect((await pending).reserve.status).toBe('ready');
  });
  it('publishes blackhole data without waiting for a slow treasury balance', async () => {
    const { verifiedDeployment: deployment } = await import('../src/config/verified');
    chain.tokens.xiyangyang = deployment.token;
    chain.treasuryAddress = holder;
    let release!: (value: bigint) => void;
    rpc.readContract.mockImplementation(async ({ functionName, address }: { functionName: string; address: string }) => {
      if (functionName === 'decimals') return 18;
      if (functionName === 'symbol') return address === deployment.token ? 'XIYANGYANG' : 'POP';
      if (address === deployment.token) return 19508n * 10n ** 18n;
      return new Promise<bigint>((resolve) => { release = resolve; });
    });
    const update = vi.fn();
    const pending = data.readDashboard(update);
    await vi.waitFor(() => expect(update).toHaveBeenCalledWith(expect.objectContaining({
      blackholeBurned: expect.objectContaining({ status: 'ready' }),
    })));
    release(10n);
    await pending;
  });
  it('does not derive a floor price from reserves or 30 million tokens', async () => {
    chain.treasuryAddress = holder;
    const snapshot = await data.readDashboard();
    expect(snapshot.floor).toEqual({ status: 'unconfigured' });
  });
  it('only reads the explicitly configured floor method and units', async () => {
    sources.floorPrice = {
      address: holder,
      abi: [{ type: 'function', name: 'verifiedBackingPrice', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] }],
      functionName: 'verifiedBackingPrice', outputDecimals: 9,
      verificationUrl: 'https://example.com/verified-interface',
    };
    rpc.readContract.mockResolvedValue(123456789n);
    const snapshot = await data.readDashboard();
    expect(snapshot.floor).toMatchObject({ status: 'ready', data: { raw: 123456789n, decimals: 9 } });
    expect(snapshot.reserve.status).toBe('unconfigured');
  });
  it('leaves invalid configured addresses as errors', async () => {
    chain.treasuryAddress = 'not-an-address';
    expect((await data.readDashboard()).reserve.status).toBe('error');
  });
  it('rejects a non-read-only ABI method as a price source', async () => {
    sources.floorPrice = {
      address: holder,
      abi: [{ type: 'function', name: 'mutatingMethod', stateMutability: 'nonpayable', inputs: [], outputs: [{ type: 'uint256' }] }],
      functionName: 'mutatingMethod', outputDecimals: 18,
      verificationUrl: 'https://example.com/source',
    };
    expect((await data.readDashboard()).floor.status).toBe('error');
    expect(rpc.readContract).not.toHaveBeenCalled();
  });
  it('reads the verified vault balance and 18-decimal price directly at one block', async () => {
    const { verifiedDeployment: deployment, vaultReadAbi } = await import('../src/config/verified');
    chain.treasuryAddress = deployment.treasury;
    chain.buybackAddress = deployment.buybackRecipient;
    chain.buybackAssetKind = 'erc20';
    chain.buybackAssetAddress = deployment.pop;
    sources.floorPrice = {
      address: deployment.treasury, abi: vaultReadAbi,
      functionName: 'currentPricePerTokenRaw', outputDecimals: 18,
      verificationUrl: deployment.vaultSource,
    };
    rpc.readContract.mockImplementation(async ({ functionName }: { functionName: string }) => {
      if (functionName === 'taxToken') return chain.tokens.xiyangyang;
      if (functionName === 'quoteToken') return deployment.pop;
      if (functionName === 'decimals') return 18;
      if (functionName === 'symbol') return 'POP';
      if (functionName === 'currentPricePerTokenRaw') return 1316112854036170390n;
      if (functionName === 'balanceOf') return 39457710891528574114478070n;
      throw new Error('Unexpected read');
    });
    const snapshot = await data.readDashboard();
    expect(snapshot.reserve).toMatchObject({ status: 'ready', data: {
      raw: 39457710891528574114478070n, decimals: 18, symbol: 'POP',
    } });
    expect(snapshot.floor).toMatchObject({ status: 'ready', data: {
      raw: 1316112854036170390n, decimals: 18, symbol: 'POP',
    } });
    expect(snapshot.buyback.status).toBe('unconfigured');
    expect(rpc.readContract).toHaveBeenCalledWith(expect.objectContaining({
      functionName: 'currentPricePerTokenRaw', blockNumber: 123456n,
    }));
    expect(rpc.readContract).not.toHaveBeenCalledWith(expect.objectContaining({
      functionName: 'balanceOf', args: [deployment.buybackRecipient],
    }));
    expect(rpc.readContract.mock.calls.filter(([call]) => call.functionName === 'taxToken')).toHaveLength(1);
  });
  it('fails both vault metrics if its token identity does not match', async () => {
    const { verifiedDeployment: deployment, vaultReadAbi } = await import('../src/config/verified');
    chain.treasuryAddress = deployment.treasury;
    sources.floorPrice = { address: deployment.treasury, abi: vaultReadAbi,
      functionName: 'currentPricePerTokenRaw', outputDecimals: 18,
      verificationUrl: deployment.vaultSource };
    rpc.readContract.mockImplementation(async ({ functionName }: { functionName: string }) =>
      functionName === 'quoteToken' ? deployment.pop : deployment.token);
    const snapshot = await data.readDashboard();
    expect(snapshot.reserve.status).toBe('error');
    expect(snapshot.floor.status).toBe('error');
    expect(rpc.readContract).not.toHaveBeenCalledWith(expect.objectContaining({ functionName: 'balanceOf' }));
    expect(snapshot.updatedAt).toBeUndefined();
  });

  it('reads the verified token blackhole balance separately from buyback burns, using actual decimals', async () => {
    const { verifiedDeployment: deployment } = await import('../src/config/verified');
    const { hasVerifiedBlackholeSource, blackholeRecordsUrl } = await import('../src/config/blackhole');
    expect(hasVerifiedBlackholeSource()).toBe(false);
    expect(blackholeRecordsUrl()).toBeUndefined();
    chain.tokens.xiyangyang = deployment.token;
    expect(hasVerifiedBlackholeSource()).toBe(true);
    expect(blackholeRecordsUrl()).toBe(`https://bscscan.com/token/${deployment.token}?a=${deployment.burnAddress}`);
    rpc.readContract.mockImplementation(async ({ functionName }: { functionName: string }) => {
      if (functionName === 'decimals') return 6;
      if (functionName === 'symbol') return '喜羊羊';
      if (functionName === 'balanceOf') return 19508000000n;
      throw new Error('Unexpected read');
    });
    const snapshot = await data.readDashboard();
    expect(snapshot.blackholeBurned).toMatchObject({ status: 'ready', data: {
      raw: 19508000000n, decimals: 6, symbol: '喜羊羊',
    } });
    expect(snapshot.burned.status).toBe('unconfigured');
    expect(snapshot.recentBuyback.status).toBe('unconfigured');
    expect(rpc.readContract).toHaveBeenCalledWith(expect.objectContaining({
      address: deployment.token, functionName: 'balanceOf', args: [deployment.burnAddress], blockNumber: 123456n,
    }));
    expect(rpc.readContract).not.toHaveBeenCalledWith(expect.objectContaining({ functionName: 'totalBurned' }));
  });

  it('does not show zero blackhole burns when a balance read fails, and permits retry', async () => {
    const { verifiedDeployment: deployment } = await import('../src/config/verified');
    chain.tokens.xiyangyang = deployment.token;
    rpc.readContract.mockImplementation(async ({ functionName }: { functionName: string }) => {
      if (functionName === 'balanceOf') throw new Error('Unavailable');
      return functionName === 'decimals' ? 6 : '喜羊羊';
    });
    const failed = await data.readDashboard();
    expect(failed.blackholeBurned.status).toBe('error');
    expect(failed.blackholeBurned).not.toHaveProperty('data');
    expect(failed.updatedAt).toBeUndefined();
    expect(failed.burned.status).toBe('unconfigured');
    rpc.readContract.mockResolvedValue(0n);
    expect((await data.readDashboard()).blackholeBurned).toMatchObject({
      status: 'ready', data: { raw: 0n, decimals: 6, symbol: '喜羊羊' },
    });
  });
});

describe('reliable USD quote validation', () => {
  const feed = () => ({
    tokenAddress: chain.tokens.pop,
    sourceUrl: 'https://example.com/source', requestUrl: 'https://example.com/feed',
    maxAgeMs: 60_000,
    parse: (payload: unknown) => payload as { usdPerToken: string; timestamp: number },
  });
  it('accepts a fresh decimal quote with its timestamp', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ usdPerToken: '0.123', timestamp: Date.now() }))));
    expect(await data.readUsdQuote(feed())).toMatchObject({ usdPerToken: '0.123', tokenAddress: chain.tokens.pop });
  });
  it('rejects stale quotes', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ usdPerToken: '0.123', timestamp: Date.now() - 120_000 }))));
    await expect(data.readUsdQuote(feed())).rejects.toThrow('stale');
  });
  it('rejects a price for another token', async () => {
    await expect(data.readUsdQuote({ ...feed(), tokenAddress: holder })).rejects.toThrow('match POP');
  });
  it('rejects a failed price request', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 503 })));
    await expect(data.readUsdQuote(feed())).rejects.toThrow('request failed');
  });
  it('works on browsers without AbortSignal.timeout and accepts the fixed same-origin feed', async () => {
    vi.stubGlobal('AbortSignal', {});
    const request = vi.fn().mockResolvedValue(new Response(JSON.stringify({ usdPerToken: '0.123', timestamp: Date.now() })));
    vi.stubGlobal('fetch', request);
    expect(await data.readUsdQuote({ ...feed(), requestUrl: '/api/pop-price' })).toMatchObject({ usdPerToken: '0.123' });
    expect(request).toHaveBeenCalledWith('/api/pop-price', expect.objectContaining({
      signal: expect.anything(), cache: 'no-store',
    }));
  });
  it('cancels a stalled quote request and cleans up its timeout', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn().mockImplementation((_url, { signal }: { signal: AbortSignal }) =>
      new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('Aborted'))))));
    try {
      const pending = expect(data.readUsdQuote(feed())).rejects.toThrow('Aborted');
      await vi.advanceTimersByTimeAsync(10_000);
      await pending;
      expect(vi.getTimerCount()).toBe(0);
    } finally { vi.useRealTimers(); }
  });
  it('rejects arbitrary relative quote URLs', async () => {
    await expect(data.readUsdQuote({ ...feed(), requestUrl: '/unverified' })).rejects.toThrow();
  });
});
