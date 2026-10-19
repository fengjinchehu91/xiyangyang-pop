import { verifiedDeployment as deployment } from './verified';

export const popUsdPool = '0xe5ce5bc4785cd2a246151364f5a190cee3fdb142';
const usdtAddress = '0x55d398326f99059ff775485246999027b3197955';
// Official Chainlink BNB mainnet directory, independently checked against the proxy.
export const popOnchainMarket = {
  usdt: usdtAddress,
  factory: '0x0bfbcf9fa4f9c56b0f40a671ad40e0805a091865',
  oracle: '0xb97ad0e74fa7d920791e90258a6e2085088b4320',
  aggregator: '0x63f4ff1c8c16c312f4b9792bdfde149622293934',
  heartbeatSeconds: 900,
  graceSeconds: 120,
} as const;
export type QuoteProvider = 'dexscreener' | 'geckoterminal' | 'pancakeswap-chainlink';
export interface QuoteEnvelope { provider: QuoteProvider; retrievedAt: number; payload: unknown }

export interface OnchainQuotePayload {
  chainId: number;
  blockNumber: string;
  blockHash: string;
  blockTimestamp: string;
  pool: {
    address: string; factory: string; token0: string; token1: string;
    token0Decimals: number; token1Decimals: number; fee: number;
    sqrtPriceX96: string; liquidity: string; unlocked: boolean;
  };
  oracle: {
    address: string; aggregator: string; description: string; decimals: number;
    roundId: string; answer: string; startedAt: string; updatedAt: string; answeredInRound: string;
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function positiveDecimal(value: unknown): value is string {
  return typeof value === 'string' && /^\d+(\.\d{1,30})?$/.test(value) && /[1-9]/.test(value);
}

function readDexMarket(payload: unknown) {
  if (!isRecord(payload) || !Array.isArray(payload.pairs) || payload.pairs.length !== 1) {
    throw new Error('Expected one confirmed POP/USD market');
  }
  const pair: unknown = payload.pairs[0];
  if (!isRecord(pair) || pair.chainId !== 'bsc' || pair.dexId !== 'pancakeswap' ||
      typeof pair.pairAddress !== 'string' || pair.pairAddress.toLowerCase() !== popUsdPool ||
      !isRecord(pair.baseToken) || typeof pair.baseToken.address !== 'string' ||
      pair.baseToken.address.toLowerCase() !== deployment.pop ||
      !isRecord(pair.quoteToken) || typeof pair.quoteToken.address !== 'string' ||
      pair.quoteToken.address.toLowerCase() !== usdtAddress ||
      !Array.isArray(pair.labels) || !pair.labels.includes('v3')) {
    throw new Error('Price market does not match the verified POP/USDT pool');
  }
  if (!isRecord(pair.liquidity) || typeof pair.liquidity.usd !== 'number' ||
      !Number.isFinite(pair.liquidity.usd) || pair.liquidity.usd < 50_000 || !positiveDecimal(pair.priceUsd)) {
    throw new Error('Invalid POP/USD price or insufficient confirmed liquidity');
  }
  return pair.priceUsd;
}

function relationshipMatches(value: unknown, type: string, id: string) {
  return isRecord(value) && isRecord(value.data) && value.data.type === type &&
    typeof value.data.id === 'string' && value.data.id.toLowerCase() === id;
}

function readGeckoMarket(payload: unknown) {
  if (!isRecord(payload) || !isRecord(payload.data)) throw new Error('Missing GeckoTerminal pool');
  const { data } = payload;
  if (data.type !== 'pool' || typeof data.id !== 'string' || data.id.toLowerCase() !== `bsc_${popUsdPool}` ||
      !isRecord(data.attributes) || typeof data.attributes.address !== 'string' ||
      data.attributes.address.toLowerCase() !== popUsdPool || !isRecord(data.relationships)) {
    throw new Error('GeckoTerminal pool does not match');
  }
  const { attributes, relationships } = data;
  if (!relationshipMatches(relationships.base_token, 'token', `bsc_${deployment.pop}`) ||
      !relationshipMatches(relationships.quote_token, 'token', `bsc_${usdtAddress}`) ||
      !relationshipMatches(relationships.dex, 'dex', 'pancakeswap-v3-bsc') ||
      !positiveDecimal(attributes.base_token_price_usd) || !positiveDecimal(attributes.reserve_in_usd) ||
      BigInt(attributes.reserve_in_usd.split('.')[0]) < 50_000n || !Array.isArray(payload.included)) {
    throw new Error('Invalid GeckoTerminal POP market, price or liquidity');
  }
  const included: unknown[] = payload.included;
  const validTokens = [deployment.pop, usdtAddress].every((address) => {
    const matches = included.filter((token) => isRecord(token) && token.type === 'token' &&
      typeof token.id === 'string' && token.id.toLowerCase() === `bsc_${address}`);
    const token = matches[0];
    return matches.length === 1 && isRecord(token) && isRecord(token.attributes) &&
      typeof token.attributes.address === 'string' && token.attributes.address.toLowerCase() === address;
  });
  if (!validTokens) throw new Error('GeckoTerminal token identities do not match');
  return attributes.base_token_price_usd;
}

function unsigned(value: unknown) {
  if (typeof value !== 'string' || !/^(?:0|[1-9]\d{0,77})$/.test(value)) throw new Error('Invalid chain integer');
  return BigInt(value);
}

function sameAddress(value: unknown, expected: string) {
  return typeof value === 'string' && value.toLowerCase() === expected;
}

export function parseOnchainMarket(payload: unknown, nowMs: number) {
  if (!isRecord(payload) || payload.chainId !== 56 || !isRecord(payload.pool) || !isRecord(payload.oracle) ||
      typeof payload.blockHash !== 'string' || !/^0x[\da-f]{64}$/i.test(payload.blockHash) ||
      unsigned(payload.blockNumber) === 0n || !Number.isFinite(nowMs) || nowMs <= 0) {
    throw new Error('Invalid chain quote snapshot');
  }
  const { pool, oracle } = payload;
  if (!sameAddress(pool.address, popUsdPool) || !sameAddress(pool.factory, popOnchainMarket.factory) ||
      !sameAddress(pool.token0, usdtAddress) || !sameAddress(pool.token1, deployment.pop) ||
      pool.token0Decimals !== 18 || pool.token1Decimals !== 18 || pool.fee !== 100 || pool.unlocked !== true ||
      !sameAddress(oracle.address, popOnchainMarket.oracle) || !sameAddress(oracle.aggregator, popOnchainMarket.aggregator) ||
      oracle.description !== 'USDT / USD' || oracle.decimals !== 8) {
    throw new Error('Chain quote asset, pool or oracle units do not match');
  }
  const blockTime = unsigned(payload.blockTimestamp);
  const now = BigInt(Math.floor(nowMs / 1000));
  const sqrt = unsigned(pool.sqrtPriceX96);
  const liquidity = unsigned(pool.liquidity);
  const answer = unsigned(oracle.answer);
  const round = unsigned(oracle.roundId);
  const answered = unsigned(oracle.answeredInRound);
  const started = unsigned(oracle.startedAt);
  const updated = unsigned(oracle.updatedAt);
  if (blockTime > now + 10n || blockTime + 120n < now || sqrt === 0n || sqrt >= 2n ** 160n ||
      liquidity === 0n || liquidity >= 2n ** 128n || answer === 0n || answer >= 2n ** 255n ||
      round === 0n || round >= 2n ** 80n || answered < round || answered >= 2n ** 80n ||
      started === 0n || started > updated || updated === 0n || updated > blockTime ||
      blockTime - updated > BigInt(popOnchainMarket.heartbeatSeconds + popOnchainMarket.graceSeconds)) {
    throw new Error('Stale or invalid pool state or Chainlink round');
  }
  // token0=USDT, token1=POP: invert sqrt(token1/token0), then convert USDT to USD.
  const scale = 10n ** 24n;
  const numerator = (1n << 192n) * 10n ** BigInt(pool.token1Decimals) * answer * scale;
  const denominator = sqrt * sqrt * 10n ** BigInt(pool.token0Decimals) * 10n ** BigInt(oracle.decimals);
  const scaled = numerator / denominator;
  if (scaled === 0n) throw new Error('POP reference price is below supported precision');
  const fraction = (scaled % scale).toString().padStart(24, '0').replace(/0+$/, '');
  return {
    usdPerToken: `${scaled / scale}${fraction ? `.${fraction}` : ''}`,
    sourceUrl: `https://bscscan.com/address/${popUsdPool}#readContract`,
    sourceLabel: 'PancakeSwap × Chainlink',
    sourceDetailsUrl: `https://bscscan.com/address/${popOnchainMarket.oracle}#readContract`,
  };
}

export function parseMarketPayload(provider: QuoteProvider, payload: unknown) {
  if (provider === 'dexscreener') return { usdPerToken: readDexMarket(payload),
    sourceUrl: `https://dexscreener.com/bsc/${popUsdPool}`, sourceLabel: 'DEX Screener', sourceDetailsUrl: undefined };
  if (provider === 'geckoterminal') return { usdPerToken: readGeckoMarket(payload),
    sourceUrl: `https://www.geckoterminal.com/bsc/pools/${popUsdPool}`, sourceLabel: 'GeckoTerminal', sourceDetailsUrl: undefined };
  if (provider === 'pancakeswap-chainlink') return parseOnchainMarket(payload, Date.now());
  throw new Error('Unknown POP quote provider');
}

export function parseQuotePayload(payload: unknown) {
  if (isRecord(payload) && 'provider' in payload) {
    if ((payload.provider !== 'dexscreener' && payload.provider !== 'geckoterminal' && payload.provider !== 'pancakeswap-chainlink') ||
        typeof payload.retrievedAt !== 'number' || !Number.isFinite(payload.retrievedAt) || payload.retrievedAt <= 0) {
      throw new Error('Invalid POP quote envelope');
    }
    return { ...parseMarketPayload(payload.provider, payload.payload), timestamp: payload.retrievedAt };
  }
  // The direct development feed exposes no update time, so record retrieval only.
  return { ...parseMarketPayload('dexscreener', payload), timestamp: Date.now() };
}
