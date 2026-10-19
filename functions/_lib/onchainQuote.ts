import { decodeFunctionResult, encodeFunctionData, parseAbi } from 'viem';
import { parseOnchainMarket, popOnchainMarket, popUsdPool, type OnchainQuotePayload } from '../../src/config/popMarket';
import { verifiedDeployment as deployment } from '../../src/config/verified';
import { fetchJson, isRecord } from './http';

const upstreams = ['https://bsc-dataseed.binance.org', 'https://rpc-bsc.48.club'];
const abi = parseAbi([
  'function token0() view returns (address)',
  'function token1() view returns (address)',
  'function factory() view returns (address)',
  'function fee() view returns (uint24)',
  'function slot0() view returns (uint160,int24,uint16,uint16,uint16,uint32,bool)',
  'function liquidity() view returns (uint128)',
  'function decimals() view returns (uint8)',
  'function description() view returns (string)',
  'function aggregator() view returns (address)',
  'function latestRoundData() view returns (uint80,int256,uint256,uint256,uint80)',
]);

async function settled<T>(tasks: Promise<T>[]) {
  const results = await Promise.allSettled(tasks);
  return results.map((result) => {
    if (result.status === 'rejected') throw result.reason;
    return result.value;
  });
}

async function snapshot(upstream: string, deadline: number): Promise<OnchainQuotePayload> {
  let requestId = 0;
  const request = async (method: string, params: unknown[]) => {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new Error('Chain quote budget exhausted');
    const id = ++requestId;
    const value = await fetchJson(upstream, { method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id, method, params }) }, remaining);
    if (!isRecord(value) || value.jsonrpc !== '2.0' || value.id !== id ||
        Object.hasOwn(value, 'error') || !Object.hasOwn(value, 'result')) throw new Error('Invalid chain quote RPC response');
    return value.result;
  };
  const [chain, block] = await settled([
    request('eth_chainId', []), request('eth_getBlockByNumber', ['latest', false]),
  ]);
  if (chain !== '0x38' || !isRecord(block) || typeof block.number !== 'string' ||
      !/^0x[\da-f]+$/i.test(block.number) || typeof block.hash !== 'string' ||
      !/^0x[\da-f]{64}$/i.test(block.hash) || typeof block.timestamp !== 'string' ||
      !/^0x[\da-f]+$/i.test(block.timestamp)) throw new Error('Invalid BSC quote block');
  const blockNumber = block.number;
  const read = async (address: `0x${string}`, functionName: typeof abi[number]['name']) => {
    const result = await request('eth_call', [{ to: address,
      data: encodeFunctionData({ abi, functionName }) }, blockNumber]);
    if (typeof result !== 'string' || !/^0x[\da-f]+$/i.test(result)) throw new Error('Invalid chain quote call data');
    return decodeFunctionResult({ abi, functionName, data: result as `0x${string}` });
  };
  const [token0, token1, factory, fee, slot, liquidity, token0Decimals, token1Decimals,
    description, oracleDecimals, aggregator, round] = await settled([
    read(popUsdPool, 'token0'), read(popUsdPool, 'token1'), read(popUsdPool, 'factory'),
    read(popUsdPool, 'fee'), read(popUsdPool, 'slot0'), read(popUsdPool, 'liquidity'),
    read(popOnchainMarket.usdt, 'decimals'), read(deployment.pop, 'decimals'),
    read(popOnchainMarket.oracle, 'description'), read(popOnchainMarket.oracle, 'decimals'),
    read(popOnchainMarket.oracle, 'aggregator'), read(popOnchainMarket.oracle, 'latestRoundData'),
  ]);
  if (!Array.isArray(slot) || !Array.isArray(round) || typeof token0 !== 'string' || typeof token1 !== 'string' ||
      typeof factory !== 'string' || typeof fee !== 'number' || typeof token0Decimals !== 'number' ||
      typeof token1Decimals !== 'number' || typeof description !== 'string' || typeof oracleDecimals !== 'number' ||
      typeof aggregator !== 'string' || typeof slot[6] !== 'boolean') throw new Error('Invalid decoded chain quote state');
  const payload: OnchainQuotePayload = {
    chainId: 56, blockNumber: BigInt(blockNumber).toString(), blockHash: block.hash,
    blockTimestamp: BigInt(block.timestamp).toString(),
    pool: { address: popUsdPool, factory: factory.toLowerCase(), token0: token0.toLowerCase(),
      token1: token1.toLowerCase(), token0Decimals, token1Decimals, fee,
      sqrtPriceX96: String(slot[0]), liquidity: String(liquidity), unlocked: slot[6] },
    oracle: { address: popOnchainMarket.oracle, aggregator: aggregator.toLowerCase(), description, decimals: oracleDecimals,
      roundId: String(round[0]), answer: String(round[1]), startedAt: String(round[2]),
      updatedAt: String(round[3]), answeredInRound: String(round[4]) },
  };
  parseOnchainMarket(payload, Date.now());
  const confirmed = await request('eth_getBlockByNumber', [blockNumber, false]);
  if (!isRecord(confirmed) || confirmed.hash !== block.hash) throw new Error('Chain quote block changed during the read');
  return payload;
}

export async function readOnchainQuote(timeoutMs = 6_000): Promise<OnchainQuotePayload> {
  const deadline = Date.now() + Math.min(6_000, Math.max(1, timeoutMs));
  for (let index = 0; index < upstreams.length; index++) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    const attempt = index === 0 ? Math.max(1, Math.floor(remaining / 2)) : remaining;
    try { return await snapshot(upstreams[index], Date.now() + attempt); }
    catch { /* Use only the other fixed BSC node, retaining the same overall deadline. */ }
  }
  throw new Error('Confirmed on-chain POP/USD reference is unavailable');
}
