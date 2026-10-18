import type { Abi, Address } from 'viem';
import type { BuybackRecord, ReadContext } from '../data/types';
import { chainConfig } from './chain';
import { vaultReadAbi, verifiedDeployment } from './verified';

export interface VerifiedView {
  address: Address;
  abi: Abi;
  functionName: string;
  args?: readonly unknown[];
  // Units must come from the verified interface documentation, never a guess.
  outputDecimals: number | 'pop' | 'xiyangyang';
  verificationUrl: string;
}

export interface VerifiedHistory {
  verificationUrl: string;
  read: (context: ReadContext) => Promise<BuybackRecord | null>;
}

// The default vault was matched to the verified factory's compiled runtime.
// A different env-configured treasury must supply its own verified price source.
export const contractSources: {
  floorPrice: VerifiedView | null;
  cumulativeBurned: VerifiedView | null;
  recentBuyback: VerifiedHistory | null;
} = {
  floorPrice: chainConfig.treasuryAddress.toLowerCase() === verifiedDeployment.treasury
    ? {
      address: verifiedDeployment.treasury,
      abi: vaultReadAbi,
      functionName: 'currentPricePerTokenRaw',
      outputDecimals: 18,
      verificationUrl: verifiedDeployment.vaultSource,
    } : null,
  // Vault totalBurned() tracks redemption burns, not cumulative buyback burns.
  cumulativeBurned: null,
  recentBuyback: null,
};
