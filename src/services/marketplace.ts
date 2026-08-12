import type { AppConfig } from '../config/index.js';
import { featureDisabled } from '../errors.js';
import type { MusicMarketplaceProvider } from '../provider/types.js';

export class MarketplaceService {
  public constructor(
    private readonly provider: MusicMarketplaceProvider,
    private readonly config: AppConfig,
  ) {}

  public getStats(releaseId: number, currency?: string) {
    if (!this.config.discogs.marketplaceStatsEnabled) {
      throw featureDisabled('Marketplace statistics are disabled pending Discogs approval');
    }
    return this.provider.getMarketplaceStats(releaseId, currency);
  }

  public getListing(listingId: number) {
    if (!this.config.discogs.marketplaceListingsEnabled) {
      throw featureDisabled('Marketplace listing retrieval is disabled pending Discogs approval');
    }
    return this.provider.getMarketplaceListing(listingId);
  }
}
