import {
  createPublicClient, erc20Abi, http, isAddress,
  type Address, type PublicClient,
} from 'viem';
import { bsc } from 'viem/chains';
import { chainConfig, confirmedUrl } from '../config/chain';
import { contractSources, type VerifiedView } from '../config/contracts';
import { quoteSource, type QuoteSource } from '../config/quotes';
import { vaultReadAbi, verifiedDeployment } from '../config/verified';
import { hasVerifiedBlackholeSource } from '../config/blackhole';
import type { Dashboard, ReadResult, TokenAmount, UsdQuote } from './types';

export const publicClient = createPublicClient({
  chain: bsc,
  transport: http(chainConfig.rpcUrl, { timeout: 12_000, retryCount: 0 }),
});

const metadataCache = new Map<string, Promise<{ decimals: number; symbol: string }>>();

export function requireAddress(value: string): Address {
  if (!isAddress(value, { strict: false })) throw new Error('Invalid configured address');
  return value as Address;
}

export async function readTokenMetadata(client: PublicClient, token: Address) {
  const key = `${client.transport.url}:${token.toLowerCase()}`;
  let pending = metadataCache.get(key);
  if (!pending) {
    pending = Promise.all([
      client.readContract({ address: token, abi: erc20Abi, functionName: 'decimals' }),
      client.readContract({ address: token, abi: erc20Abi, functionName: 'symbol' }),
    ]).then(([decimals, symbol]) => {
      if (!Number.isInteger(decimals) || decimals < 0 || decimals > 255 || !symbol) {
        throw new Error('Invalid token metadata');
      }
      return { decimals, symbol };
    }).catch((error: unknown) => {
      metadataCache.delete(key);
      throw error;
    });
    metadataCache.set(key, pending);
  }
  return pending;
}

export async function readTokenBalance(
  client: PublicClient, token: Address, holder: Address, blockNumber: bigint,
): Promise<TokenAmount> {
  const [metadata, raw] = await Promise.all([
    readTokenMetadata(client, token),
    client.readContract({
      address: token, abi: erc20Abi, functionName: 'balanceOf',
      args: [holder], blockNumber,
    }),
  ]);
  if (typeof raw !== 'bigint' || raw < 0n) throw new Error('Invalid balance');
  return { raw, ...metadata };
}

export async function readVerifiedView(
  client: PublicClient, source: VerifiedView, blockNumber: bigint, symbol: string,
): Promise<TokenAmount> {
  const evidence = new URL(source.verificationUrl);
  if (evidence.protocol !== 'https:' || !source.abi.length) {
    throw new Error('Unverified contract interface');
  }
  const view = source.abi.find((item) => item.type === 'function' &&
    item.name === source.functionName && ['view', 'pure'].includes(item.stateMutability));
  if (!view) throw new Error('Only verified read-only methods are allowed');
  const raw = await client.readContract({
    address: requireAddress(source.address), abi: source.abi,
    functionName: source.functionName, args: source.args, blockNumber,
  });
  if (typeof raw !== 'bigint' || raw < 0n) throw new Error('Expected a nonnegative scalar amount');
  const decimals = typeof source.outputDecimals === 'number'
    ? source.outputDecimals
    : (await readTokenMetadata(client, chainConfig.tokens[source.outputDecimals])).decimals;
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 255) {
    throw new Error('Invalid verified output precision');
  }
  return { raw, decimals, symbol };
}

export async function readUsdQuote(source: QuoteSource): Promise<UsdQuote> {
  if (source.tokenAddress.toLowerCase() !== chainConfig.tokens.pop.toLowerCase()) {
    throw new Error('Quote asset does not match POP');
  }
  if ((source.requestUrl !== '/api/pop-price' && new URL(source.requestUrl).protocol !== 'https:') ||
      new URL(source.sourceUrl).protocol !== 'https:') {
    throw new Error('Quote source must use HTTPS');
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  let quote: ReturnType<QuoteSource['parse']>;
  try {
    const response = await fetch(source.requestUrl, { signal: controller.signal, cache: 'no-store' });
    if (!response.ok) throw new Error('Price source request failed');
    quote = source.parse(await response.json());
  } finally {
    clearTimeout(timer);
  }
  if (!/^\d+(\.\d{1,30})?$/.test(quote.usdPerToken) ||
      !/[1-9]/.test(quote.usdPerToken) || !Number.isFinite(quote.timestamp) ||
      new URL(quote.sourceUrl || source.sourceUrl).protocol !== 'https:' ||
      Date.now() - quote.timestamp > Math.min(source.maxAgeMs, 300_000) ||
      quote.timestamp > Date.now() + 10_000) {
    throw new Error('Missing, invalid or stale price');
  }
  return { ...quote, sourceUrl: quote.sourceUrl || source.sourceUrl, tokenAddress: source.tokenAddress,
    timestampKind: source.timestampKind || 'market' };
}

export function initialDashboard(loading = false): Dashboard {
  const state = (configured: boolean): ReadResult<never> => ({
    status: configured && loading ? 'loading' : 'unconfigured',
  });
  return {
    reserve: state(Boolean(chainConfig.treasuryAddress)),
    floor: state(Boolean(contractSources.floorPrice)),
    buyback: state(hasBuybackSource()),
    burned: state(Boolean(contractSources.cumulativeBurned)),
    blackholeBurned: state(hasVerifiedBlackholeSource()),
    recentBuyback: state(Boolean(contractSources.recentBuyback)),
    quote: state(Boolean(quoteSource)),
  };
}

function hasBuybackSource() {
  const evidence = chainConfig.buybackBalanceEvidenceUrl;
  const verified = chainConfig.buybackBalanceVerified && Boolean(confirmedUrl(evidence));
  return Boolean(verified && chainConfig.buybackAddress && (chainConfig.buybackAssetKind === 'native' ||
    (chainConfig.buybackAssetKind === 'erc20' && chainConfig.buybackAssetAddress)));
}

export function hasConfiguredSources() {
  return Boolean(chainConfig.treasuryAddress || hasBuybackSource() ||
    contractSources.floorPrice || contractSources.cumulativeBurned ||
    hasVerifiedBlackholeSource() || contractSources.recentBuyback || quoteSource);
}

async function result<T>(read: () => Promise<T>): Promise<ReadResult<T>> {
  try { return { status: 'ready', data: await read(), updatedAt: Date.now() }; }
  catch (error) {
    return { status: 'error', message: error instanceof Error ? error.message : 'Read failed' };
  }
}

type DashboardUpdate = (patch: Partial<Dashboard>) => void;
const listeners = new Set<DashboardUpdate>();

function publish(patch: Partial<Dashboard>) {
  for (const listener of listeners) listener(patch);
}

async function loadDashboard(): Promise<Dashboard> {
  const snapshot = initialDashboard();
  // Price retrieval is independent of RPC availability and must not wait for it.
  const quoteTask = quoteSource ? result(() => readUsdQuote(quoteSource!))
    .then((value) => { snapshot.quote = value; publish({ quote: value }); }) : undefined;
  const configuredOnchain = Boolean(chainConfig.treasuryAddress || hasBuybackSource() ||
    contractSources.floorPrice || contractSources.cumulativeBurned || hasVerifiedBlackholeSource() ||
    contractSources.recentBuyback);
  let blockNumber: bigint | undefined;
  let chainFailure: Error | undefined;
  if (configuredOnchain) {
    try {
      const chainId = await publicClient.getChainId();
      if (chainId !== chainConfig.chainId) throw new Error('RPC is not BNB Smart Chain');
      blockNumber = await publicClient.getBlockNumber({ cacheTime: 0 });
    } catch (error) {
      chainFailure = error instanceof Error ? error : new Error('RPC unavailable');
    }
  }
  const onchain = <T,>(read: (block: bigint) => Promise<T>) => result(async () => {
    if (chainFailure) throw chainFailure;
    if (blockNumber === undefined) throw new Error('No block available');
    return read(blockNumber);
  });
  const update = <K extends keyof Pick<Dashboard, 'reserve' | 'floor' | 'buyback' | 'burned' | 'blackholeBurned' | 'recentBuyback'>>(
    key: K, value: Dashboard[K],
  ) => {
    snapshot[key] = value;
    const patch: Partial<Dashboard> = { [key]: value };
    if (value.status === 'ready') {
      snapshot.blockNumber = patch.blockNumber = blockNumber;
      snapshot.updatedAt = patch.updatedAt = value.updatedAt;
    }
    publish(patch);
  };
  const tasks: Promise<void>[] = [];
  if (quoteTask) tasks.push(quoteTask);
  // Recheck asset identity at the same block, shared by reserve and price reads.
  const treasuryIdentity = chainConfig.treasuryAddress?.toLowerCase() === verifiedDeployment.treasury &&
    blockNumber !== undefined && !chainFailure
    ? result(async () => {
      const [token, quote] = await Promise.all([
        publicClient.readContract({ address: verifiedDeployment.treasury, abi: vaultReadAbi,
          functionName: 'taxToken', blockNumber }),
        publicClient.readContract({ address: verifiedDeployment.treasury, abi: vaultReadAbi,
          functionName: 'quoteToken', blockNumber }),
      ]);
      if (token.toLowerCase() !== chainConfig.tokens.xiyangyang.toLowerCase() ||
          quote.toLowerCase() !== chainConfig.tokens.pop.toLowerCase()) {
        throw new Error('Treasury token identity does not match');
      }
    }) : Promise.resolve({ status: 'ready', data: undefined, updatedAt: Date.now() } as const);
  const checkTreasuryIdentity = async () => {
    const identity = await treasuryIdentity;
    if (identity.status === 'error') throw new Error(identity.message);
  };
  if (chainConfig.treasuryAddress) tasks.push(onchain(async (block) => {
    await checkTreasuryIdentity();
    return readTokenBalance(publicClient, chainConfig.tokens.pop, requireAddress(chainConfig.treasuryAddress!), block);
  }).then((value) => { update('reserve', value); }));
  if (contractSources.floorPrice) tasks.push(onchain(async (block) => {
    await checkTreasuryIdentity();
    return readVerifiedView(publicClient, contractSources.floorPrice!, block, 'POP');
  }).then((value) => { update('floor', value); }));
  if (hasBuybackSource()) tasks.push(onchain(async (block) => {
    const holder = requireAddress(chainConfig.buybackAddress!);
    if (chainConfig.buybackAssetKind === 'native') {
      const raw = await publicClient.getBalance({ address: holder, blockNumber: block });
      return { raw, decimals: bsc.nativeCurrency.decimals, symbol: bsc.nativeCurrency.symbol };
    }
    if (chainConfig.buybackAssetKind !== 'erc20' || !chainConfig.buybackAssetAddress) {
      throw new Error('Buyback reserve asset has not been confirmed');
    }
    return readTokenBalance(publicClient, requireAddress(chainConfig.buybackAssetAddress), holder, block);
  }).then((value) => { update('buyback', value); }));
  if (contractSources.cumulativeBurned) tasks.push(onchain((block) => readVerifiedView(
    publicClient, contractSources.cumulativeBurned!, block, 'XIYANGYANG',
  )).then((value) => { update('burned', value); }));
  if (hasVerifiedBlackholeSource()) tasks.push(onchain((block) => readTokenBalance(
    publicClient, verifiedDeployment.token, verifiedDeployment.burnAddress, block,
  )).then((value) => { update('blackholeBurned', value); }));
  if (contractSources.recentBuyback) tasks.push(onchain(async (block) => {
    if (new URL(contractSources.recentBuyback!.verificationUrl).protocol !== 'https:') {
      throw new Error('Unverified event source');
    }
    const record = await contractSources.recentBuyback!.read({ client: publicClient, blockNumber: block });
    if (record && (!/^0x[\da-f]{64}$/i.test(record.transactionHash) ||
      !Number.isFinite(record.timestamp) || record.amount.raw < 0n)) {
      throw new Error('Invalid buyback record');
    }
    return record;
  }).then((value) => { update('recentBuyback', value); }));
  await Promise.all(tasks);
  const successfulOnchain = [snapshot.reserve, snapshot.floor, snapshot.buyback,
    snapshot.burned, snapshot.blackholeBurned, snapshot.recentBuyback].some((value) => value.status === 'ready');
  if (successfulOnchain) {
    snapshot.blockNumber = blockNumber;
    snapshot.updatedAt = Date.now();
  }
  return snapshot;
}

let inFlight: Promise<Dashboard> | undefined;
export function readDashboard(onUpdate?: DashboardUpdate): Promise<Dashboard> {
  // The page and manual refresh share one request; no overlapping 30s polls.
  if (onUpdate) listeners.add(onUpdate);
  inFlight ??= loadDashboard().finally(() => { inFlight = undefined; listeners.clear(); });
  return inFlight;
}
