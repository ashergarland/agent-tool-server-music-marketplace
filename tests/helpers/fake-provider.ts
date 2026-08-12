import { notFound } from '../../src/errors.js';
import type {
  Artist,
  ArtistSummary,
  Label,
  LabelSummary,
  MarketplaceListing,
  MarketplaceStats,
  Master,
  MasterSummary,
  MusicMarketplaceProvider,
  Paged,
  Release,
  ReleaseSummary,
  SearchOptions,
} from '../../src/provider/types.js';

const source = {
  source: 'Discogs' as const,
  sourceUrl: 'https://www.discogs.com',
  retrievedAt: '2026-01-01T00:00:00.000Z',
  attribution: 'Metadata provided by Discogs.',
};

export const testRelease = (id = 1): Release => ({
  id,
  title: 'Example Album',
  artist: 'Example Artist',
  year: id === 1 ? 1990 : 1991,
  country: id === 1 ? 'US' : 'UK',
  labels: ['Example Label'],
  catalogueNumbers: [id === 1 ? 'CAT-1' : 'CAT-2'],
  formats: ['Vinyl'],
  resourceUrl: `https://api.discogs.com/releases/${id}`,
  masterId: 10,
  artists: [{ id: 2, name: 'Example Artist' }],
  labelCredits: [{ id: 3, name: 'Example Label', catalogueNumber: id === 1 ? 'CAT-1' : 'CAT-2' }],
  formatDetails: [{ name: 'Vinyl', quantity: '1', descriptions: ['LP'] }],
  identifiers: [{ type: 'Barcode', value: id === 1 ? '111' : '222' }],
  tracklist: [{ position: 'A1', title: 'Track One' }],
  source,
});

const paged = <T>(items: T[]): Paged<T> => ({
  items,
  pagination: { page: 1, perPage: 25, pages: 1, total: items.length },
  source,
});

export class FakeMusicProvider implements MusicMarketplaceProvider {
  public readonly releases = new Map([
    [1, testRelease(1)],
    [2, testRelease(2)],
  ]);

  public searchArtists(): Promise<Paged<ArtistSummary>> {
    return Promise.resolve(paged([{ id: 2, name: 'Example Artist', resourceUrl: 'artist-url' }]));
  }
  public searchMasters(): Promise<Paged<MasterSummary>> {
    return Promise.resolve(
      paged([
        { id: 10, title: 'Example Album', artist: 'Example Artist', resourceUrl: 'master-url' },
      ]),
    );
  }
  public searchReleases(options: SearchOptions): Promise<Paged<ReleaseSummary>> {
    const releases = [...this.releases.values()].filter(
      (release) =>
        (!options.barcode ||
          release.identifiers.some((entry) => entry.value === options.barcode)) &&
        (!options.catalogueNumber || release.catalogueNumbers.includes(options.catalogueNumber)),
    );
    return Promise.resolve(paged(releases));
  }
  public searchLabels(): Promise<Paged<LabelSummary>> {
    return Promise.resolve(paged([{ id: 3, name: 'Example Label', resourceUrl: 'label-url' }]));
  }
  public getArtist(id: number): Promise<Artist> {
    return Promise.resolve({
      id,
      name: 'Example Artist',
      resourceUrl: 'artist-url',
      aliases: [],
      source,
    });
  }
  public getLabel(id: number): Promise<Label> {
    return Promise.resolve({ id, name: 'Example Label', resourceUrl: 'label-url', source });
  }
  public getMaster(id: number): Promise<Master> {
    return Promise.resolve({
      id,
      title: 'Example Album',
      resourceUrl: 'master-url',
      mainReleaseId: 1,
      artists: [{ id: 2, name: 'Example Artist' }],
      tracklist: [],
      source,
    });
  }
  public getRelease(id: number): Promise<Release> {
    const release = this.releases.get(id);
    if (!release) return Promise.reject(notFound('Release not found'));
    return Promise.resolve(release);
  }
  public listMasterVersions(): Promise<Paged<ReleaseSummary>> {
    return Promise.resolve(paged([...this.releases.values()]));
  }
  public getMarketplaceStats(releaseId: number): Promise<MarketplaceStats> {
    return Promise.resolve({
      releaseId,
      numberForSale: 1,
      lowestPrice: { value: 10, currency: 'USD' },
      source,
      disclaimer: 'Current asking price; not a valuation.',
    });
  }
  public getMarketplaceListing(listingId: number): Promise<MarketplaceListing> {
    return Promise.resolve({
      id: listingId,
      releaseId: 1,
      title: 'Example Album',
      condition: 'Mint (M)',
      price: { value: 10, currency: 'USD' },
      source,
      disclaimer: 'Live listing.',
    });
  }
}
