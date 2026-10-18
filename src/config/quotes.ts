import type { Address } from 'viem';

export interface QuoteSource {
  tokenAddress: Address;
  sourceUrl: string;
  requestUrl: string;
  maxAgeMs: number;
  timestampKind?: 'market' | 'retrieved';
  parse: (payload: unknown) => { usdPerToken: string; timestamp: number };
}

const popAddress = '0xa3cfb853339b77f385b994799b015cb04b208fe6';
const usdtAddress = '0x55d398326f99059ff775485246999027b3197955';
const pairAddress = '0xe5ce5bc4785cd2a246151364f5a190cee3fdb142';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function parsePopUsdQuote(payload: unknown) {
  if (!isRecord(payload) || !Array.isArray(payload.pairs) || payload.pairs.length !== 1) {
    throw new Error('Expected one confirmed POP/USD market');
  }
  const pair: unknown = payload.pairs[0];
  if (!isRecord(pair) || pair.chainId !== 'bsc' || pair.dexId !== 'pancakeswap' ||
      typeof pair.pairAddress !== 'string' || pair.pairAddress.toLowerCase() !== pairAddress ||
      !isRecord(pair.baseToken) || typeof pair.baseToken.address !== 'string' ||
      pair.baseToken.address.toLowerCase() !== popAddress ||
      !isRecord(pair.quoteToken) || typeof pair.quoteToken.address !== 'string' ||
      pair.quoteToken.address.toLowerCase() !== usdtAddress ||
      !Array.isArray(pair.labels) || !pair.labels.includes('v3')) {
    throw new Error('Price market does not match the verified POP/USDT pool');
  }
  if (!isRecord(pair.liquidity) || typeof pair.liquidity.usd !== 'number' ||
      !Number.isFinite(pair.liquidity.usd) || pair.liquidity.usd < 50_000) {
    throw new Error('POP price market has insufficient confirmed liquidity');
  }
  if (typeof pair.priceUsd !== 'string' || !/^\d+(\.\d{1,30})?$/.test(pair.priceUsd) ||
      !/[1-9]/.test(pair.priceUsd)) {
    throw new Error('Invalid POP/USD price');
  }
  // DEX Screener exposes no market update time; this records retrieval only.
  return { usdPerToken: pair.priceUsd, timestamp: Date.now() };
}

export const quoteSource: QuoteSource | null = {
  tokenAddress: popAddress,
  sourceUrl: `https://dexscreener.com/bsc/${pairAddress}`,
  requestUrl: `https://api.dexscreener.com/latest/dex/pairs/bsc/${pairAddress}`,
  maxAgeMs: 60_000,
  timestampKind: 'retrieved',
  parse: parsePopUsdQuote,
};
