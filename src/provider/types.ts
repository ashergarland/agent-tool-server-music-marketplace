export interface SourceMetadata {
  readonly source: 'Discogs';
  readonly sourceUrl: string;
  readonly retrievedAt: string;
  readonly attribution: string;
}

export interface Pagination {
  readonly page: number;
  readonly perPage: number;
  readonly pages: number;
  readonly total: number;
}

export interface Paged<T> {
  readonly items: T[];
  readonly pagination: Pagination;
  readonly source: SourceMetadata;
}

export interface ArtistSummary {
  readonly id: number;
  readonly name: string;
  readonly resourceUrl: string;
}

export interface Artist extends ArtistSummary {
  readonly realName?: string | undefined;
  readonly profile?: string | undefined;
  readonly aliases: ArtistSummary[];
  readonly source: SourceMetadata;
}

export interface LabelSummary {
  readonly id: number;
  readonly name: string;
  readonly resourceUrl: string;
}

export interface Label extends LabelSummary {
  readonly profile?: string | undefined;
  readonly parentLabel?: LabelSummary | undefined;
  readonly source: SourceMetadata;
}

export interface ArtistCredit {
  readonly id: number;
  readonly name: string;
  readonly role?: string | undefined;
}

export interface LabelCredit {
  readonly id: number;
  readonly name: string;
  readonly catalogueNumber: string;
}

export interface ReleaseFormat {
  readonly name: string;
  readonly quantity: string;
  readonly descriptions: string[];
  readonly text?: string | undefined;
}

export interface Identifier {
  readonly type: string;
  readonly value: string;
  readonly description?: string | undefined;
}

export interface Track {
  readonly position: string;
  readonly title: string;
  readonly duration?: string | undefined;
}

export interface Community {
  readonly have: number;
  readonly want: number;
  readonly ratingCount: number;
  readonly ratingAverage: number;
}

export interface ReleaseSummary {
  readonly id: number;
  readonly title: string;
  readonly artist?: string | undefined;
  readonly year?: number | undefined;
  readonly country?: string | undefined;
  readonly labels: string[];
  readonly catalogueNumbers: string[];
  readonly formats: string[];
  readonly resourceUrl: string;
}

export interface Release extends ReleaseSummary {
  readonly masterId?: number | undefined;
  readonly artists: ArtistCredit[];
  readonly labelCredits: LabelCredit[];
  readonly formatDetails: ReleaseFormat[];
  readonly identifiers: Identifier[];
  readonly tracklist: Track[];
  readonly community?: Community | undefined;
  readonly source: SourceMetadata;
}

export interface MasterSummary {
  readonly id: number;
  readonly title: string;
  readonly artist?: string | undefined;
  readonly year?: number | undefined;
  readonly resourceUrl: string;
}

export interface Master extends MasterSummary {
  readonly mainReleaseId: number;
  readonly artists: ArtistCredit[];
  readonly tracklist: Track[];
  readonly source: SourceMetadata;
}

export interface Price {
  readonly value: number;
  readonly currency: string;
}

export interface MarketplaceStats {
  readonly releaseId: number;
  readonly numberForSale: number;
  readonly lowestPrice?: Price | undefined;
  readonly source: SourceMetadata;
  readonly disclaimer: string;
}

export interface MarketplaceListing {
  readonly id: number;
  readonly releaseId: number;
  readonly title: string;
  readonly condition: string;
  readonly sleeveCondition?: string | undefined;
  readonly price: Price;
  readonly source: SourceMetadata;
  readonly disclaimer: string;
}

export interface SearchOptions {
  readonly query: string;
  readonly page: number;
  readonly perPage: number;
  readonly artist?: string | undefined;
  readonly title?: string | undefined;
  readonly label?: string | undefined;
  readonly catalogueNumber?: string | undefined;
  readonly barcode?: string | undefined;
  readonly country?: string | undefined;
  readonly year?: number | undefined;
  readonly format?: string | undefined;
}

export interface MasterVersionsOptions {
  readonly page: number;
  readonly perPage: number;
  readonly country?: string | undefined;
  readonly label?: string | undefined;
  readonly format?: string | undefined;
  readonly released?: string | undefined;
}

export interface ReleaseEvidence {
  readonly barcode?: string | undefined;
  readonly catalogueNumber?: string | undefined;
  readonly label?: string | undefined;
  readonly country?: string | undefined;
  readonly year?: number | undefined;
  readonly format?: string | undefined;
  readonly artist?: string | undefined;
  readonly title?: string | undefined;
}

export interface ReleaseCandidate {
  readonly release: ReleaseSummary;
  readonly confidence: 'high' | 'medium' | 'low';
  readonly score: number;
  readonly matchedFields: string[];
  readonly conflictingFields: string[];
  readonly missingFields: string[];
}

export interface ReleaseIdentificationResult {
  readonly status: 'unique_match' | 'ambiguous' | 'no_match';
  readonly candidates: ReleaseCandidate[];
  readonly reasonCodes: string[];
  readonly disclaimer: string;
}

export interface ComparisonField {
  readonly field: string;
  readonly values: (string | number | string[] | null)[];
  readonly equal: boolean | null;
}

export interface PressingComparison {
  readonly releases: Release[];
  readonly differences: ComparisonField[];
  readonly disclaimer: string;
}

export interface MusicMarketplaceProvider {
  searchArtists(options: SearchOptions): Promise<Paged<ArtistSummary>>;
  searchMasters(options: SearchOptions): Promise<Paged<MasterSummary>>;
  searchReleases(options: SearchOptions): Promise<Paged<ReleaseSummary>>;
  searchLabels(options: SearchOptions): Promise<Paged<LabelSummary>>;
  getArtist(id: number): Promise<Artist>;
  getLabel(id: number): Promise<Label>;
  getMaster(id: number): Promise<Master>;
  getRelease(id: number): Promise<Release>;
  listMasterVersions(id: number, options: MasterVersionsOptions): Promise<Paged<ReleaseSummary>>;
  getMarketplaceStats(releaseId: number, currency?: string): Promise<MarketplaceStats>;
  getMarketplaceListing(listingId: number): Promise<MarketplaceListing>;
}
