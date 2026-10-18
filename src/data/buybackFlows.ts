import { createPublicClient, encodeEventTopics, http, parseAbiItem, type Hash } from 'viem';
import { bsc } from 'viem/chains';
import { verifiedDeployment } from '../config/verified';
import { chainConfig } from '../config/chain';
import { publicClient, readTokenMetadata } from './treasury';
import type { TokenAmount } from './types';

export interface BuybackFlows {
  amount: TokenAmount;
  transactionCount: number;
  windowStart: number;
  windowEnd: number;
  fromBlock: bigint;
  toBlock: bigint;
  lastTransactionHash?: Hash;
  updatedAt: number;
}

const historyClient = createPublicClient({
  chain: bsc,
  transport: http(import.meta.env.VITE_BSC_HISTORY_RPC_URL?.trim() || 'https://rpc-bsc.48.club', {
    timeout: 30_000, retryCount: 1,
  }),
});
const transferEvent = parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 value)');
const creationTopics = encodeEventTopics({
  abi: [parseAbiItem('event VaultCreated(address indexed taxToken, address indexed vault, address indexed creator)')],
  eventName: 'VaultCreated',
  args: { taxToken: verifiedDeployment.token, vault: verifiedDeployment.treasury },
});
const creationBlock = 128_169_574n;
const creationTransaction = '0xcc8619b905f392957e26144e1a382823eae82a70b435e0b2ea19988d7c2b5074';
const windowSeconds = 48n * 60n * 60n;
const chunkSize = 5_000n;
const confirmations = 20n;
const overlapBlocks = 128n;

interface Transfer {
  blockNumber: bigint;
  transactionHash: Hash;
  logIndex: number;
  value: bigint;
}

interface LogCache {
  fromBlock: bigint;
  toBlock: bigint;
  blockHash: Hash;
  logs: Transfer[];
}

let cache: LogCache | undefined;
let inFlight: Promise<BuybackFlows> | undefined;
let creationCheck: Promise<void> | undefined;

export function hasVerifiedFlowSources() {
  return chainConfig.treasuryAddress?.toLowerCase() === verifiedDeployment.treasury &&
    chainConfig.buybackAddress?.toLowerCase() === verifiedDeployment.buybackRecipient &&
    chainConfig.tokens.pop.toLowerCase() === verifiedDeployment.pop;
}

function verifyCreation(): Promise<void> {
  creationCheck ??= publicClient.getTransactionReceipt({ hash: creationTransaction }).then((receipt) => {
    const event = receipt.logs.some((log) => log.address.toLowerCase() === verifiedDeployment.factory &&
      creationTopics.every((topic, index) => topic === null || log.topics[index] === topic));
    if (receipt.status !== 'success' || receipt.blockNumber !== creationBlock || !event) {
      throw new Error('Treasury creation evidence does not match');
    }
  }).catch((error: unknown) => {
    creationCheck = undefined;
    throw error;
  });
  return creationCheck;
}

async function loadBuybackFlows(): Promise<BuybackFlows> {
  const [chainId, historyChainId, metadata, tip] = await Promise.all([
    publicClient.getChainId(), historyClient.getChainId(),
    readTokenMetadata(publicClient, verifiedDeployment.pop),
    publicClient.getBlock({ blockTag: 'latest' }),
  ]);
  if (chainId !== bsc.id || historyChainId !== bsc.id) {
    throw new Error('Buyback history RPC is not BNB Smart Chain');
  }
  if (tip.number === null) throw new Error('Missing confirmed block');
  const toBlock = tip.number > confirmations ? tip.number - confirmations : 0n;
  const head = await publicClient.getBlock({ blockNumber: toBlock });
  if (!head.hash) throw new Error('Missing confirmed block hash');
  const cutoff = head.timestamp > windowSeconds ? head.timestamp - windowSeconds : 0n;
  let earliest = 0n;
  if (toBlock >= creationBlock) {
    await verifyCreation();
    earliest = creationBlock;
  }

  let reusable = false;
  if (cache && cache.toBlock <= toBlock) {
    const previous = await publicClient.getBlock({ blockNumber: cache.toBlock });
    reusable = previous.hash === cache.blockHash;
  }
  // Find the first block at or after the exact timestamp boundary, not a block-rate estimate.
  let low = reusable && cache ? cache.fromBlock : earliest;
  let high = toBlock;
  while (low < high) {
    const middle = (low + high) / 2n;
    const block = await publicClient.getBlock({ blockNumber: middle });
    if (block.timestamp < cutoff) low = middle + 1n;
    else high = middle;
  }
  const fromBlock = low;
  const overlapStart = cache && cache.toBlock >= overlapBlocks
    ? cache.toBlock - overlapBlocks + 1n : 0n;
  const scanStart = reusable && overlapStart > fromBlock ? overlapStart : fromBlock;
  const ranges: { fromBlock: bigint; toBlock: bigint }[] = [];
  for (let start = scanStart; start <= toBlock; start += chunkSize) {
    ranges.push({ fromBlock: start, toBlock: start + chunkSize - 1n < toBlock
      ? start + chunkSize - 1n : toBlock });
  }

  const fresh: Transfer[] = [];
  let next = 0;
  let failure: unknown;
  const worker = async () => {
    while (next < ranges.length && !failure) {
      const range = ranges[next++];
      try {
        const logs = await historyClient.getLogs({
          address: verifiedDeployment.pop, event: transferEvent, strict: true,
          args: { from: verifiedDeployment.treasury, to: verifiedDeployment.buybackRecipient },
          ...range,
        });
        for (const log of logs) {
          if (log.removed || log.blockNumber === null || log.transactionHash === null ||
              log.logIndex === null || log.blockNumber < range.fromBlock ||
              log.blockNumber > range.toBlock || log.address.toLowerCase() !== verifiedDeployment.pop ||
              log.args.from?.toLowerCase() !== verifiedDeployment.treasury ||
              log.args.to?.toLowerCase() !== verifiedDeployment.buybackRecipient ||
              typeof log.args.value !== 'bigint' || log.args.value < 0n) {
            throw new Error('Invalid POP transfer history');
          }
          fresh.push({ blockNumber: log.blockNumber, transactionHash: log.transactionHash,
            logIndex: log.logIndex, value: log.args.value });
        }
      } catch (error) {
        failure = error instanceof Error ? error : new Error('POP transfer history request failed');
      }
    }
  };
  // Settle all four workers before rejecting, so retries cannot overlap abandoned requests.
  await Promise.all([worker(), worker(), worker(), worker()]);
  if (failure) throw failure;
  const confirmed = await publicClient.getBlock({ blockNumber: toBlock });
  if (confirmed.hash !== head.hash) throw new Error('History changed during the read; retry required');

  const retained = reusable && cache ? cache.logs.filter((log) =>
    log.blockNumber >= fromBlock && log.blockNumber < scanStart) : [];
  const unique = new Map([...retained, ...fresh].map((log) =>
    [`${log.transactionHash}:${log.logIndex}`, log]));
  const logs = [...unique.values()].sort((a, b) => a.blockNumber === b.blockNumber
    ? a.logIndex - b.logIndex : a.blockNumber < b.blockNumber ? -1 : 1);
  cache = { fromBlock, toBlock, blockHash: head.hash, logs };
  return {
    amount: { raw: logs.reduce((sum, log) => sum + log.value, 0n), ...metadata },
    transactionCount: new Set(logs.map((log) => log.transactionHash)).size,
    windowStart: Number(cutoff) * 1_000,
    windowEnd: Number(head.timestamp) * 1_000,
    fromBlock, toBlock, lastTransactionHash: logs.at(-1)?.transactionHash,
    updatedAt: Date.now(),
  };
}

export function readBuybackFlows(): Promise<BuybackFlows> {
  if (!hasVerifiedFlowSources()) return Promise.reject(new Error('Funding history deployment is not verified'));
  inFlight ??= loadBuybackFlows().finally(() => { inFlight = undefined; });
  return inFlight;
}
