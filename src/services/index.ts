import type { AppConfig } from '../config/index.js';
import type { MusicMarketplaceProvider } from '../provider/types.js';
import { CatalogService } from './catalog.js';
import { ComparisonService } from './comparison.js';
import { Guardrails } from './guardrails.js';
import { IdentificationService } from './identification.js';
import { MarketplaceService } from './marketplace.js';

export interface Services {
  readonly catalog: CatalogService;
  readonly identification: IdentificationService;
  readonly comparison: ComparisonService;
  readonly marketplace: MarketplaceService;
  readonly guardrails: Guardrails;
}

export const createServices = (config: AppConfig, provider: MusicMarketplaceProvider): Services => {
  const guardrails = new Guardrails(config);
  return {
    guardrails,
    catalog: new CatalogService(provider),
    identification: new IdentificationService(provider),
    comparison: new ComparisonService(provider),
    marketplace: new MarketplaceService(provider, config),
  };
};
