import type { Address } from 'viem';
import { parseQuotePayload } from './popMarket';

export interface QuoteSource {
  tokenAddress: Address;
  sourceUrl: string;
  requestUrl: string;
  maxAgeMs: number;
  timestampKind?: 'market' | 'retrieved';
  parse: (payload: unknown) => { usdPerToken: string; timestamp: number; sourceUrl?: string;
    sourceLabel?: string; sourceDetailsUrl?: string };
}

const popAddress = '0xa3cfb853339b77f385b994799b015cb04b208fe6';
const pairAddress = '0xe5ce5bc4785cd2a246151364f5a190cee3fdb142';

export function parsePopUsdQuote(payload: unknown) {
  const { usdPerToken, timestamp } = parseQuotePayload(payload);
  return { usdPerToken, timestamp };
}

export const quoteSource: QuoteSource | null = {
  tokenAddress: popAddress,
  sourceUrl: `https://dexscreener.com/bsc/${pairAddress}`,
  requestUrl: import.meta.env.VITE_POP_QUOTE_URL?.trim() || (import.meta.env.DEV
    ? `https://api.dexscreener.com/latest/dex/pairs/bsc/${pairAddress}` : '/api/pop-price'),
  maxAgeMs: 60_000,
  timestampKind: 'retrieved',
  parse: parseQuotePayload,
};
