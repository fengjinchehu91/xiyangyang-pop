import { chainConfig } from './chain';
import { verifiedDeployment } from './verified';

export function hasVerifiedBlackholeSource() {
  return chainConfig.tokens.xiyangyang.toLowerCase() === verifiedDeployment.token;
}

export function blackholeRecordsUrl(): string | undefined {
  return hasVerifiedBlackholeSource()
    ? `${chainConfig.explorerUrl}/token/${verifiedDeployment.token}?a=${verifiedDeployment.burnAddress}`
    : undefined;
}
