import { isAddress, type Address } from 'viem';
import { verifiedDeployment } from './verified';

export const chainConfig = {
  chainId: 56,
  name: 'BNB Smart Chain',
  rpcUrl: import.meta.env.VITE_BSC_RPC_URL?.trim() ||
    (import.meta.env.DEV ? 'https://bsc-dataseed.binance.org' : '/api/rpc'),
  historyRpcUrl: import.meta.env.VITE_BSC_HISTORY_RPC_URL?.trim() ||
    (import.meta.env.DEV ? 'https://rpc-bsc.48.club' : '/api/history'),
  explorerUrl: 'https://bscscan.com',
  refreshIntervalMs: 30_000,
  tokens: {
    xiyangyang: '0x4dda46c9dd7e794b99eebdcfd3c82bfbd3207777' as Address,
    pop: '0xa3cfb853339b77f385b994799b015cb04b208fe6' as Address,
  },
  treasuryAddress: import.meta.env.VITE_TREASURY_ADDRESS?.trim() || verifiedDeployment.treasury,
  buybackAddress: import.meta.env.VITE_BUYBACK_ADDRESS?.trim() || verifiedDeployment.buybackRecipient,
  buybackAssetKind: import.meta.env.VITE_BUYBACK_ASSET_KIND?.trim() || 'erc20',
  buybackAssetAddress: import.meta.env.VITE_BUYBACK_ASSET_ADDRESS?.trim() || verifiedDeployment.pop,
  // A recipient wallet balance is not necessarily this project's available funds.
  buybackBalanceVerified: import.meta.env.VITE_BUYBACK_BALANCE_VERIFIED === 'true',
  buybackBalanceEvidenceUrl: import.meta.env.VITE_BUYBACK_BALANCE_EVIDENCE_URL?.trim() || undefined,
  tradingPoolAddress: import.meta.env.VITE_TRADING_POOL_ADDRESS?.trim() || verifiedDeployment.pool,
  burnRecordsUrl: import.meta.env.VITE_BURN_RECORDS_URL?.trim() || undefined,
};

export function addressUrl(address?: string): string | undefined {
  return address && isAddress(address, { strict: false })
    ? `${chainConfig.explorerUrl}/address/${address}`
    : undefined;
}

export function confirmedUrl(value?: string): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.href : undefined;
  } catch { return undefined; }
}

