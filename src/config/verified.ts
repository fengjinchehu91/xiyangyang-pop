import { parseAbi, type Address } from 'viem';

// Verified against BSC block 128347578; see docs/onchain-verification.md.
export const verifiedDeployment = {
  token: '0x4dda46c9dd7e794b99eebdcfd3c82bfbd3207777' as Address,
  tokenImplementation: '0x024f18294970b5c76c0691b87f138a0317156422' as Address,
  pop: '0xa3cfb853339b77f385b994799b015cb04b208fe6' as Address,
  taxProcessor: '0xf15e0b39743cc9d12a0a63cc2a2be00623026353' as Address,
  treasury: '0x24969be5ce754c517e631805931916b826b4a4f7' as Address,
  buybackRecipient: '0x3de5f55d352b1e161392a3fcebac5c0072ffb274' as Address,
  pool: '0xc06924c9234b39376ea80b21aea49ae692bc5bac' as Address,
  factory: '0xbc21215ead3fa513801f402bea168c2c8b655c8b' as Address,
  burnAddress: '0x000000000000000000000000000000000000dead' as Address,
  tokenSource: 'https://sourcify.dev/server/v2/contract/56/0x024f18294970b5c76c0691b87f138a0317156422?fields=all',
  vaultSource: 'https://sourcify.dev/server/v2/contract/56/0xbc21215ead3fa513801f402bea168c2c8b655c8b?fields=all',
} as const;

// A dated investigation boundary, not a live execution count or zero balance.
export const buybackExecutionReview = {
  blockNumber: 128_365_767n,
  checkedThrough: '2026-10-18 20:54:22 UTC+8',
} as const;

// Only audited view interfaces are shipped; no redemption or write ABI.
export const vaultReadAbi = parseAbi([
  'function taxToken() view returns (address)',
  'function quoteToken() view returns (address)',
  'function buyBackAddress() view returns (address)',
  'function vaultBalance() view returns (uint256)',
  'function currentPricePerTokenRaw() view returns (uint256)',
  'function floorAmountRaw() view returns (uint256)',
  'function stageRemaining() view returns (uint256)',
]);

export const tokenBindingAbi = parseAbi([
  'function taxProcessor() view returns (address)',
  'function mainPool() view returns (address)',
]);

export const processorBindingAbi = parseAbi([
  'function taxToken() view returns (address)',
  'function marketAddress() view returns (address)',
]);

export const poolReadAbi = parseAbi([
  'function token0() view returns (address)',
  'function token1() view returns (address)',
]);
