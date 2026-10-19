import { toEventSelector, toFunctionSelector } from 'viem';
import { verifiedDeployment as deployment } from '../../src/config/verified';
import { fetchJson, isRecord, jsonResponse, readJsonLimited } from './http';

type RpcId = string | number | null;
interface RpcRequest { jsonrpc: '2.0'; id: RpcId; method: string; params: unknown[] }
type RpcMode = 'rpc' | 'history';

const readUpstreams = ['https://bsc-dataseed.binance.org', 'https://rpc-bsc.48.club'];
const historyUpstreams = [...readUpstreams].reverse();
const hashPattern = /^0x[\da-f]{64}$/i;
const addressPattern = /^0x[\da-f]{40}$/i;
const quantityPattern = /^0x(?:0|[1-9a-f][\da-f]*)$/i;
const methods = new Set(['eth_chainId', 'eth_blockNumber', 'eth_call', 'eth_getBlockByNumber',
  'eth_getTransactionReceipt', 'eth_getLogs', 'eth_getBalance', 'eth_getCode']);
const assets = new Set<string>([deployment.token, deployment.pop]);
const contracts = new Set<string>([...assets, deployment.treasury]);
const balanceHolders = new Set<string>([deployment.treasury, deployment.buybackRecipient, deployment.burnAddress]);
const metadataSelectors = new Set(['name()', 'symbol()', 'decimals()', 'totalSupply()'].map(toFunctionSelector));
const tokenSelectors = new Set(['taxProcessor()', 'mainPool()', 'quoteToken()'].map(toFunctionSelector));
const vaultSelectors = new Set(['taxToken()', 'quoteToken()', 'buyBackAddress()', 'vaultBalance()',
  'currentPricePerTokenRaw()', 'floorAmountRaw()', 'stageRemaining()'].map(toFunctionSelector));
const balanceSelector = toFunctionSelector('balanceOf(address)');
const transferTopic = toEventSelector('Transfer(address,address,uint256)');
const flooredTopic = toEventSelector('TokenFloored(address,uint256,uint256,uint256)');
const creationTopic = toEventSelector('VaultCreated(address,address,address)');
const addressTopic = (address: string) => `0x${address.slice(2).padStart(64, '0')}`;

function onlyKeys(record: Record<string, unknown>, allowed: readonly string[]) {
  return Object.keys(record).every((key) => allowed.includes(key));
}

function isBlock(value: unknown) {
  return typeof value === 'string' && (quantityPattern.test(value) || ['latest', 'safe', 'finalized'].includes(value));
}

function isAllowedCall(value: unknown) {
  if (!isRecord(value) || !onlyKeys(value, ['to', 'data']) ||
      typeof value.to !== 'string' || !addressPattern.test(value.to) ||
      typeof value.data !== 'string' || !/^0x[\da-f]*$/i.test(value.data)) return false;
  const address = value.to.toLowerCase();
  const data = value.data.toLowerCase();
  if (!contracts.has(address)) return false;
  if (assets.has(address)) {
    if (metadataSelectors.has(data as `0x${string}`)) return true;
    if (data.startsWith(balanceSelector) && data.length === 74 && /^0{24}$/.test(data.slice(10, 34))) {
      return balanceHolders.has(`0x${data.slice(34)}`);
    }
    return address === deployment.token && tokenSelectors.has(data as `0x${string}`);
  }
  return vaultSelectors.has(data as `0x${string}`);
}

function isAllowedLogs(value: unknown) {
  if (!isRecord(value) || !onlyKeys(value, ['address', 'fromBlock', 'toBlock', 'topics']) ||
      typeof value.address !== 'string' || !addressPattern.test(value.address) ||
      typeof value.fromBlock !== 'string' || !quantityPattern.test(value.fromBlock) ||
      typeof value.toBlock !== 'string' || !quantityPattern.test(value.toBlock) ||
      !Array.isArray(value.topics) || value.topics.length < 1 || value.topics.length > 4 ||
      !value.topics.every((topic) => topic === null || typeof topic === 'string' && hashPattern.test(topic))) return false;
  const start = BigInt(value.fromBlock);
  const end = BigInt(value.toBlock);
  if (end < start || end - start + 1n > 5_000n) return false;
  const address = value.address.toLowerCase();
  const topics = value.topics.map((topic) => typeof topic === 'string' ? topic.toLowerCase() : topic);
  if (address === deployment.pop) {
    return topics.length === 3 && topics[0] === transferTopic &&
      topics[1] === addressTopic(deployment.treasury) && topics[2] === addressTopic(deployment.buybackRecipient);
  }
  if (address === deployment.token) {
    return topics.length === 3 && topics[0] === transferTopic && topics[2] === addressTopic(deployment.burnAddress);
  }
  if (address === deployment.treasury) return topics.length <= 2 && topics[0] === flooredTopic;
  return address === deployment.factory && topics.length >= 3 && topics[0] === creationTopic &&
    topics[1] === addressTopic(deployment.token) && topics[2] === addressTopic(deployment.treasury);
}

function validParams(method: string, params: unknown[]) {
  if (method === 'eth_chainId' || method === 'eth_blockNumber') return params.length === 0;
  if (method === 'eth_call') return params.length === 2 && isAllowedCall(params[0]) && isBlock(params[1]);
  if (method === 'eth_getBlockByNumber') return params.length === 2 && isBlock(params[0]) && params[1] === false;
  if (method === 'eth_getTransactionReceipt') return params.length === 1 && typeof params[0] === 'string' && hashPattern.test(params[0]);
  if (method === 'eth_getLogs') return params.length === 1 && isAllowedLogs(params[0]);
  const addresses = method === 'eth_getBalance' ? balanceHolders : contracts;
  return params.length === 2 && typeof params[0] === 'string' && addresses.has(params[0].toLowerCase()) && isBlock(params[1]);
}

function rpcError(id: RpcId, code: number, message: string, status: number, headers?: Record<string, string>) {
  return jsonResponse({ jsonrpc: '2.0', id, error: { code, message } }, status, headers);
}

export async function handleRpc(request: Request, mode: RpcMode) {
  if (request.method !== 'POST') return rpcError(null, -32600, 'POST is required', 405, { Allow: 'POST' });
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    return rpcError(null, -32600, 'Content-Type must be application/json', 415);
  }
  let body: unknown;
  try { body = await readJsonLimited(request.body, 8_192); }
  catch (error) {
    return rpcError(null, -32700, error instanceof RangeError ? 'Request body is too large' : 'Invalid JSON body',
      error instanceof RangeError ? 413 : 400);
  }
  if (!isRecord(body) || !onlyKeys(body, ['jsonrpc', 'id', 'method', 'params']) || body.jsonrpc !== '2.0' ||
      !(body.id === null || typeof body.id === 'string' && body.id.length <= 128 ||
        typeof body.id === 'number' && Number.isSafeInteger(body.id)) || typeof body.method !== 'string') {
    return rpcError(null, -32600, 'Expected a single JSON-RPC 2.0 request with an id', 400);
  }
  const id = body.id as RpcId;
  if (!methods.has(body.method)) return rpcError(id, -32601, 'Method is not allowed', 403);
  const params = body.params === undefined ? [] : body.params;
  if (!Array.isArray(params) || !validParams(body.method, params)) {
    return rpcError(id, -32602, 'Parameters are outside the verified read-only scope', 400);
  }
  const payload: RpcRequest = { jsonrpc: '2.0', id, method: body.method, params };
  const upstreams = mode === 'history' ? historyUpstreams : readUpstreams;
  const totalBudget = mode === 'history' ? 20_000 : 8_000;
  const started = Date.now();
  let upstreamError: { code: number; message: string } | undefined;
  for (let index = 0; index < upstreams.length; index++) {
    const remaining = totalBudget - (Date.now() - started);
    if (remaining <= 0) break;
    const timeout = index === 0 ? Math.max(1, Math.floor(remaining / 2)) : remaining;
    try {
      const response = await fetchJson(upstreams[index], {
        method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
      }, timeout);
      if (!isRecord(response) || response.jsonrpc !== '2.0' || response.id !== id) throw new Error('Invalid RPC envelope');
      if (isRecord(response.error) && typeof response.error.code === 'number' && Number.isFinite(response.error.code) &&
          typeof response.error.message === 'string') {
        upstreamError = { code: response.error.code, message: response.error.message.slice(0, 300) };
        continue;
      }
      if (!Object.hasOwn(response, 'result') || Object.hasOwn(response, 'error')) throw new Error('Missing RPC result');
      return jsonResponse({ jsonrpc: '2.0', id, result: response.result });
    } catch { /* Try the next fixed upstream within the same total budget. */ }
  }
  return rpcError(id, upstreamError?.code ?? -32002,
    upstreamError?.message ?? 'Verified chain data is temporarily unavailable', 503);
}
