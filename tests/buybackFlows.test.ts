import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.hoisted(() => ({
  getChainId: vi.fn(), getBlock: vi.fn(), getLogs: vi.fn(), metadata: vi.fn(), receipt: vi.fn(),
}));
vi.mock('../src/data/treasury', () => ({
  publicClient: { getChainId: rpc.getChainId, getBlock: rpc.getBlock, getTransactionReceipt: rpc.receipt },
  readTokenMetadata: rpc.metadata,
}));
vi.mock('viem', async (importOriginal) => {
  const actual = await importOriginal<typeof import('viem')>();
  return { ...actual, createPublicClient: () => ({ getChainId: rpc.getChainId, getLogs: rpc.getLogs }) };
});

const pop = '0xa3cfb853339b77f385b994799b015cb04b208fe6';
const vault = '0x24969be5ce754c517e631805931916b826b4a4f7';
const recipient = '0x3de5f55d352b1e161392a3fcebac5c0072ffb274';
const epoch = 1_700_000_000n;
const hash = (value: bigint) => `0x${value.toString(16).padStart(64, '0')}` as const;
const transfer = (blockNumber: bigint, value: bigint, transaction = blockNumber, logIndex = 0) => ({
  address: pop, blockNumber, transactionHash: hash(transaction), logIndex, removed: false,
  args: { from: vault, to: recipient, value },
});
let head: bigint;
let logs: ReturnType<typeof transfer>[];
let read: typeof import('../src/data/buybackFlows')['readBuybackFlows'];

beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  head = 200_020n;
  logs = [];
  rpc.getChainId.mockResolvedValue(56);
  rpc.metadata.mockResolvedValue({ decimals: 6, symbol: 'POP' });
  rpc.getBlock.mockImplementation(async ({ blockNumber }: { blockNumber?: bigint }) => {
    const number = blockNumber ?? head;
    return { number, hash: hash(number), timestamp: epoch + number };
  });
  rpc.getLogs.mockImplementation(async ({ fromBlock, toBlock }: { fromBlock: bigint; toBlock: bigint }) =>
    logs.filter((log) => log.blockNumber >= fromBlock && log.blockNumber <= toBlock));
  read = (await import('../src/data/buybackFlows')).readBuybackFlows;
});

describe('rolling 48-hour buyback funding transfers', () => {
  it('does not mix verified history with an overridden treasury or recipient', async () => {
    const { chainConfig } = await import('../src/config/chain');
    const { hasVerifiedFlowSources } = await import('../src/data/buybackFlows');
    expect(hasVerifiedFlowSources()).toBe(true);
    chainConfig.treasuryAddress = recipient;
    expect(hasVerifiedFlowSources()).toBe(false);
    await expect(read()).rejects.toThrow('deployment is not verified');
    expect(rpc.getLogs).not.toHaveBeenCalled();
    chainConfig.treasuryAddress = vault;
    chainConfig.buybackAddress = vault;
    expect(hasVerifiedFlowSources()).toBe(false);
    await expect(read()).rejects.toThrow('deployment is not verified');
  });

  it('uses an exact timestamp boundary and actual decimals, with bigint sums and deduplicated logs', async () => {
    const large = 9_007_199_254_740_993_123_456n;
    const included = transfer(27_200n, large);
    logs = [transfer(27_199n, 100n), included, included,
      transfer(199_999n, 2n, 199_999n, 0), transfer(200_000n, 3n, 199_999n, 1),
      transfer(200_001n, 100n)];
    const result = await read();
    expect(result.amount).toEqual({ raw: large + 5n, decimals: 6, symbol: 'POP' });
    expect(result.transactionCount).toBe(2);
    expect(result.fromBlock).toBe(27_200n);
    expect(result.toBlock).toBe(200_000n);
    expect(result.windowEnd - result.windowStart).toBe(48 * 60 * 60 * 1_000);
    expect(result.windowEnd).toBe(Number(epoch + 200_000n) * 1_000);
    expect(result.lastTransactionHash).toBe(hash(199_999n));
    for (const [call] of rpc.getLogs.mock.calls) {
      const request = call as { fromBlock: bigint; toBlock: bigint };
      expect(request.toBlock - request.fromBlock + 1n).toBeLessThanOrEqual(5_000n);
      expect(request).toMatchObject({ address: pop, args: { from: vault, to: recipient }, strict: true });
    }
  });

  it('only returns a true zero after every history segment succeeds', async () => {
    const result = await read();
    expect(result.amount.raw).toBe(0n);
    expect(result.transactionCount).toBe(0);
    expect(rpc.getLogs).toHaveBeenCalledTimes(35);
    expect(result.lastTransactionHash).toBeUndefined();
  });

  it('rejects partial history and retries the full window instead of committing incomplete sums', async () => {
    logs = [transfer(190_000n, 123n)];
    rpc.getLogs.mockRejectedValueOnce(new Error('History RPC unavailable'));
    await expect(read()).rejects.toThrow('History RPC unavailable');
    const beforeRetry = rpc.getLogs.mock.calls.length;
    expect((await read()).amount.raw).toBe(123n);
    expect(rpc.getLogs.mock.calls.length - beforeRetry).toBe(35);
  });

  it('shares an in-flight scan and caps independent history requests at four', async () => {
    let active = 0;
    let maximum = 0;
    rpc.getLogs.mockImplementation(async () => {
      active++;
      maximum = Math.max(active, maximum);
      await Promise.resolve();
      active--;
      return [];
    });
    const first = read();
    const second = read();
    expect(first).toBe(second);
    await first;
    expect(maximum).toBe(4);
    expect(rpc.getLogs).toHaveBeenCalledTimes(35);
  });

  it('refreshes incrementally, prunes expired transfers and replaces the overlap without double-counting', async () => {
    logs = [transfer(27_200n, 5n), transfer(190_000n, 10n), transfer(199_999n, 20n)];
    expect((await read()).amount.raw).toBe(35n);
    const previousRequests = rpc.getLogs.mock.calls.length;
    head += 60n;
    logs.push(transfer(200_030n, 30n));
    const next = await read();
    expect(next.amount.raw).toBe(60n);
    expect(next.fromBlock).toBe(27_260n);
    expect(next.transactionCount).toBe(3);
    expect(rpc.getLogs.mock.calls.length - previousRequests).toBe(1);
    expect(rpc.getLogs).toHaveBeenLastCalledWith(expect.objectContaining({
      fromBlock: 199_873n, toBlock: 200_060n,
    }));
  });

  it('discards the cache and scans the full window if the previous confirmed head changes', async () => {
    logs = [transfer(190_000n, 10n)];
    await read();
    const previousRequests = rpc.getLogs.mock.calls.length;
    head += 60n;
    logs = [];
    rpc.getBlock.mockImplementation(async ({ blockNumber }: { blockNumber?: bigint }) => {
      const number = blockNumber ?? head;
      return { number, hash: hash(number + 1n), timestamp: epoch + number };
    });
    expect((await read()).amount.raw).toBe(0n);
    expect(rpc.getLogs.mock.calls.length - previousRequests).toBe(35);
  });

  it('only skips pre-deployment blocks after verifying the exact factory creation receipt', async () => {
    head = 128_357_500n;
    rpc.getBlock.mockImplementation(async ({ blockNumber }: { blockNumber?: bigint }) => {
      const number = blockNumber ?? head;
      return { number, hash: hash(number), timestamp: epoch + number / 2n };
    });
    const event = {
      address: '0xbc21215ead3fa513801f402bea168c2c8b655c8b',
      topics: ['0x897c133dfbfe1f6239e98b4ffd7e4f6c86a62350a131a7a37790419f58af02f9',
        `0x${'4dda46c9dd7e794b99eebdcfd3c82bfbd3207777'.padStart(64, '0')}`,
        `0x${vault.slice(2).padStart(64, '0')}`, hash(999n)],
    };
    rpc.receipt.mockResolvedValueOnce({ status: 'success', blockNumber: 128_169_574n, logs: [] });
    await expect(read()).rejects.toThrow('Treasury creation evidence does not match');
    expect(rpc.getLogs).not.toHaveBeenCalled();
    rpc.receipt.mockResolvedValue({ status: 'success', blockNumber: 128_169_574n, logs: [event] });
    expect((await read()).fromBlock).toBe(128_169_574n);
    await read();
    expect(rpc.receipt).toHaveBeenCalledTimes(2);
    expect(rpc.getLogs).toHaveBeenNthCalledWith(1, expect.objectContaining({ fromBlock: 128_169_574n }));
  });

  it('rejects the wrong chain or transfers from another funding source', async () => {
    rpc.getChainId.mockResolvedValueOnce(1);
    await expect(read()).rejects.toThrow('not BNB Smart Chain');
    expect(rpc.getLogs).not.toHaveBeenCalled();
    logs = [{ ...transfer(190_000n, 1n), args: { from: recipient, to: recipient, value: 1n } }];
    await expect(read()).rejects.toThrow('Invalid POP transfer history');
  });
});
