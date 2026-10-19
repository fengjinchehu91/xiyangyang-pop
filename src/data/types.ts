import type { Address, PublicClient } from 'viem';

export type ReadResult<T> =
  | { status: 'unconfigured' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: T; updatedAt: number };

export interface TokenAmount {
  raw: bigint;
  decimals: number;
  symbol: string;
}

export interface BuybackRecord {
  transactionHash: `0x${string}`;
  timestamp: number;
  amount: TokenAmount;
}

export interface UsdQuote {
  usdPerToken: string;
  timestamp: number;
  timestampKind?: 'market' | 'retrieved';
  sourceUrl: string;
  sourceLabel?: string;
  sourceDetailsUrl?: string;
  tokenAddress: Address;
}

export interface Dashboard {
  reserve: ReadResult<TokenAmount>;
  floor: ReadResult<TokenAmount>;
  buyback: ReadResult<TokenAmount>;
  burned: ReadResult<TokenAmount>;
  blackholeBurned: ReadResult<TokenAmount>;
  recentBuyback: ReadResult<BuybackRecord | null>;
  quote: ReadResult<UsdQuote>;
  blockNumber?: bigint;
  updatedAt?: number;
}

export interface ReadContext {
  client: PublicClient;
  blockNumber: bigint;
}
