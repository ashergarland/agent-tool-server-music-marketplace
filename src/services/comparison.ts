import type {
  ComparisonField,
  MusicMarketplaceProvider,
  PressingComparison,
  Release,
} from '../provider/types.js';

export class ComparisonService {
  public constructor(private readonly provider: MusicMarketplaceProvider) {}

  public async compare(releaseIds: readonly number[]): Promise<PressingComparison> {
    const releases = await Promise.all(releaseIds.map((id) => this.provider.getRelease(id)));
    const differences = [
      this.field('catalogueNumbers', releases, (release) => release.catalogueNumbers),
      this.field('barcodes', releases, (release) =>
        release.identifiers
          .filter((entry) => entry.type.toLowerCase() === 'barcode')
          .map((entry) => entry.value),
      ),
      this.field('country', releases, (release) => release.country ?? null),
      this.field('year', releases, (release) => release.year ?? null),
      this.field('labels', releases, (release) => release.labels),
      this.field('formats', releases, (release) => release.formats),
      this.field('identifiers', releases, (release) =>
        release.identifiers.map((entry) => `${entry.type}: ${entry.value}`),
      ),
    ];
    return {
      releases,
      differences,
      disclaimer:
        'This compares Discogs metadata only; it does not authenticate physical items or estimate value.',
    };
  }

  private field(
    name: string,
    releases: readonly Release[],
    select: (release: Release) => string | number | string[] | null,
  ): ComparisonField {
    const values = releases.map(select);
    if (values.some((value) => value === null || (Array.isArray(value) && value.length === 0))) {
      return { field: name, values, equal: null };
    }
    const normalized = values.map((value) =>
      JSON.stringify(Array.isArray(value) ? [...value].sort() : value),
    );
    return {
      field: name,
      values,
      equal: normalized.every((value) => value === normalized[0]),
    };
  }
}
