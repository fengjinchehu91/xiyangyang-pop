import { verifiedDeployment as deployment } from './verified';

export const popUsdPool = '0xe5ce5bc4785cd2a246151364f5a190cee3fdb142';
const usdtAddress = '0x55d398326f99059ff775485246999027b3197955';
export type QuoteProvider = 'dexscreener' | 'geckoterminal';
export interface QuoteEnvelope { provider: QuoteProvider; retrievedAt: number; payload: unknown }

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

export function parseMarketPayload(provider: QuoteProvider, payload: unknown) {
  if (provider === 'dexscreener') return { usdPerToken: readDexMarket(payload),
    sourceUrl: `https://dexscreener.com/bsc/${popUsdPool}` };
  if (provider === 'geckoterminal') return { usdPerToken: readGeckoMarket(payload),
    sourceUrl: `https://www.geckoterminal.com/bsc/pools/${popUsdPool}` };
  throw new Error('Unknown POP quote provider');
}

export function parseQuotePayload(payload: unknown) {
  if (isRecord(payload) && 'provider' in payload) {
    if ((payload.provider !== 'dexscreener' && payload.provider !== 'geckoterminal') ||
        typeof payload.retrievedAt !== 'number' || !Number.isFinite(payload.retrievedAt) || payload.retrievedAt <= 0) {
      throw new Error('Invalid POP quote envelope');
    }
    return { ...parseMarketPayload(payload.provider, payload.payload), timestamp: payload.retrievedAt };
  }
  // The direct development feed exposes no update time, so record retrieval only.
  return { ...parseMarketPayload('dexscreener', payload), timestamp: Date.now() };
}
