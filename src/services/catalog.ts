import type {
  MasterVersionsOptions,
  MusicMarketplaceProvider,
  SearchOptions,
} from '../provider/types.js';

export class CatalogService {
  public constructor(private readonly provider: MusicMarketplaceProvider) {}

  public searchArtists(options: SearchOptions) {
    return this.provider.searchArtists(options);
  }
  public searchMasters(options: SearchOptions) {
    return this.provider.searchMasters(options);
  }
  public searchReleases(options: SearchOptions) {
    return this.provider.searchReleases(options);
  }
  public searchLabels(options: SearchOptions) {
    return this.provider.searchLabels(options);
  }
  public getArtist(id: number) {
    return this.provider.getArtist(id);
  }
  public getLabel(id: number) {
    return this.provider.getLabel(id);
  }
  public getMaster(id: number) {
    return this.provider.getMaster(id);
  }
  public getRelease(id: number) {
    return this.provider.getRelease(id);
  }
  public listMasterVersions(id: number, options: MasterVersionsOptions) {
    return this.provider.listMasterVersions(id, options);
  }
}
