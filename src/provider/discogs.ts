import type { Logger } from 'pino';
import type { AppConfig } from '../config/index.js';
import { AppError, notFound } from '../errors.js';
import type {
  Artist,
  ArtistCredit,
  ArtistSummary,
  Identifier,
  Label,
  LabelCredit,
  LabelSummary,
  MarketplaceListing,
  MarketplaceStats,
  Master,
  MasterSummary,
  MasterVersionsOptions,
  MusicMarketplaceProvider,
  Paged,
  Pagination,
  Price,
  Release,
  ReleaseFormat,
  ReleaseSummary,
  SearchOptions,
  SourceMetadata,
  Track,
} from './types.js';

type Json = Record<string, unknown>;
type Fetch = typeof globalThis.fetch;

const ATTRIBUTION =
  "This application uses Discogs' API but is not affiliated with, sponsored or endorsed by Discogs.";
const record = (value: unknown): Json => (value && typeof value === 'object' ? (value as Json) : {});
const array = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const text = (value: unknown): string | undefined =>
  typeof value === 'string' && value.length > 0 ? value : undefined;
const number = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;
const stringList = (value: unknown): string[] =>
  typeof value === 'string'
    ? [value]
    : array(value).flatMap((entry) => (text(entry) ? [text(entry)!] : []));
const requiredNumber = (value: unknown, field: string): number => {
  const parsed = number(value);
  if (parsed === undefined) throw new Error(`Invalid Discogs response: missing ${field}`);
  return parsed;
};
const requiredText = (value: unknown, field: string): string => {
  const parsed = text(value);
  if (parsed === undefined) throw new Error(`Invalid Discogs response: missing ${field}`);
  return parsed;
};

const source = (url: string): SourceMetadata => ({
  source: 'Discogs',
  sourceUrl: url,
  retrievedAt: new Date().toISOString(),
  attribution: ATTRIBUTION,
});

const artistSummary = (value: unknown): ArtistSummary => {
  const data = record(value);
  const id = requiredNumber(data['id'], 'artist id');
  return {
    id,
    name: requiredText(data['name'] ?? data['title'], 'artist name'),
    resourceUrl: text(data['resource_url']) ?? `https://api.discogs.com/artists/${id}`,
  };
};

const labelSummary = (value: unknown): LabelSummary => {
  const data = record(value);
  const id = requiredNumber(data['id'], 'label id');
  return {
    id,
    name: requiredText(data['name'] ?? data['title'], 'label name'),
    resourceUrl: text(data['resource_url']) ?? `https://api.discogs.com/labels/${id}`,
  };
};

const artistCredit = (value: unknown): ArtistCredit => {
  const data = record(value);
  return {
    id: requiredNumber(data['id'], 'artist credit id'),
    name: requiredText(data['name'], 'artist credit name'),
    ...(text(data['role']) ? { role: text(data['role']) } : {}),
  };
};

const labelCredit = (value: unknown): LabelCredit => {
  const data = record(value);
  return {
    id: requiredNumber(data['id'], 'label credit id'),
    name: requiredText(data['name'], 'label credit name'),
    catalogueNumber: text(data['catno']) ?? '',
  };
};

const format = (value: unknown): ReleaseFormat => {
  const data = record(value);
  return {
    name: requiredText(data['name'], 'format name'),
    quantity: text(data['qty']) ?? '1',
    descriptions: array(data['descriptions']).flatMap((entry) => (text(entry) ? [text(entry)!] : [])),
    ...(text(data['text']) ? { text: text(data['text']) } : {}),
  };
};

const identifier = (value: unknown): Identifier => {
  const data = record(value);
  return {
    type: requiredText(data['type'], 'identifier type'),
    value: requiredText(data['value'], 'identifier value'),
    ...(text(data['description']) ? { description: text(data['description']) } : {}),
  };
};

const track = (value: unknown): Track => {
  const data = record(value);
  return {
    position: text(data['position']) ?? '',
    title: requiredText(data['title'], 'track title'),
    ...(text(data['duration']) ? { duration: text(data['duration']) } : {}),
  };
};

const pagination = (value: unknown): Pagination => {
  const data = record(value);
  return {
    page: number(data['page']) ?? 1,
    perPage: number(data['per_page']) ?? 0,
    pages: number(data['pages']) ?? 0,
    total: number(data['items']) ?? 0,
  };
};

const releaseSummary = (value: unknown): ReleaseSummary => {
  const data = record(value);
  const id = requiredNumber(data['id'], 'release id');
  const labels = stringList(data['label']);
  const catnos = stringList(data['catno']);
  return {
    id,
    title: requiredText(data['title'], 'release title'),
    ...(text(data['artist']) ? { artist: text(data['artist']) } : {}),
    ...(number(data['year'] ?? data['released']) ? { year: number(data['year'] ?? data['released']) } : {}),
    ...(text(data['country']) ? { country: text(data['country']) } : {}),
    labels,
    catalogueNumbers: catnos,
    formats: stringList(data['format']),
    resourceUrl: text(data['resource_url']) ?? `https://api.discogs.com/releases/${id}`,
  };
};

const masterSummary = (value: unknown): MasterSummary => {
  const data = record(value);
  const id = requiredNumber(data['id'], 'master id');
  return {
    id,
    title: requiredText(data['title'], 'master title'),
    ...(text(data['artist']) ? { artist: text(data['artist']) } : {}),
    ...(number(data['year']) ? { year: number(data['year']) } : {}),
    resourceUrl: text(data['resource_url']) ?? `https://api.discogs.com/masters/${id}`,
  };
};

const price = (value: unknown): Price | undefined => {
  const data = record(value);
  const amount = number(data['value']);
  const currency = text(data['currency']);
  return amount === undefined || !currency ? undefined : { value: amount, currency };
};

interface CacheEntry {
  readonly expiresAt: number;
  readonly value: unknown;
}

export class DiscogsProvider implements MusicMarketplaceProvider {
  private readonly cache = new Map<string, CacheEntry>();
  private readonly pending = new Map<string, Promise<unknown>>();
  private windowStartedAt = Date.now();
  private windowCount = 0;

  public constructor(
    private readonly config: AppConfig['discogs'],
    private readonly logger: Logger,
    private readonly fetchImpl: Fetch = globalThis.fetch,
  ) {}

  public searchArtists(options: SearchOptions): Promise<Paged<ArtistSummary>> {
    return this.search('artist', options, artistSummary);
  }

  public searchMasters(options: SearchOptions): Promise<Paged<MasterSummary>> {
    return this.search('master', options, masterSummary);
  }

  public searchReleases(options: SearchOptions): Promise<Paged<ReleaseSummary>> {
    return this.search('release', options, releaseSummary);
  }

  public searchLabels(options: SearchOptions): Promise<Paged<LabelSummary>> {
    return this.search('label', options, labelSummary);
  }

  public async getArtist(id: number): Promise<Artist> {
    const path = `/artists/${id}`;
    const data = await this.request(path, this.config.cacheTtlMs);
    const summary = artistSummary(data);
    return {
      ...summary,
      ...(text(data['realname']) ? { realName: text(data['realname']) } : {}),
      ...(text(data['profile']) ? { profile: text(data['profile']) } : {}),
      aliases: array(data['aliases']).map(artistSummary),
      source: source(this.webUrl('artist', id)),
    };
  }

  public async getLabel(id: number): Promise<Label> {
    const data = await this.request(`/labels/${id}`, this.config.cacheTtlMs);
    const summary = labelSummary(data);
    const parent = record(data['parent_label']);
    return {
      ...summary,
      ...(text(data['profile']) ? { profile: text(data['profile']) } : {}),
      ...(number(parent['id']) ? { parentLabel: labelSummary(parent) } : {}),
      source: source(this.webUrl('label', id)),
    };
  }

  public async getMaster(id: number): Promise<Master> {
    const data = await this.request(`/masters/${id}`, this.config.cacheTtlMs);
    const summary = masterSummary(data);
    return {
      ...summary,
      mainReleaseId: requiredNumber(data['main_release'], 'main release id'),
      artists: array(data['artists']).map(artistCredit),
      tracklist: array(data['tracklist']).map(track),
      source: source(this.webUrl('master', id)),
    };
  }

  public async getRelease(id: number): Promise<Release> {
    const data = await this.request(`/releases/${id}`, this.config.cacheTtlMs);
    const artists = array(data['artists']).map(artistCredit);
    const labels = array(data['labels']).map(labelCredit);
    const formats = array(data['formats']).map(format);
    const identifiers = array(data['identifiers']).map(identifier);
    const community = record(data['community']);
    const rating = record(community['rating']);
    return {
      id: requiredNumber(data['id'], 'release id'),
      title: requiredText(data['title'], 'release title'),
      ...(artists.length > 0 ? { artist: artists.map((entry) => entry.name).join(', ') } : {}),
      ...(number(data['year']) ? { year: number(data['year']) } : {}),
      ...(text(data['country']) ? { country: text(data['country']) } : {}),
      labels: labels.map((entry) => entry.name),
      catalogueNumbers: labels.map((entry) => entry.catalogueNumber).filter(Boolean),
      formats: formats.map((entry) => entry.name),
      resourceUrl: text(data['resource_url']) ?? `https://api.discogs.com/releases/${id}`,
      ...(number(data['master_id']) ? { masterId: number(data['master_id']) } : {}),
      artists,
      labelCredits: labels,
      formatDetails: formats,
      identifiers,
      tracklist: array(data['tracklist']).map(track),
      ...(Object.keys(community).length > 0
        ? {
            community: {
              have: number(community['have']) ?? 0,
              want: number(community['want']) ?? 0,
              ratingCount: number(rating['count']) ?? 0,
              ratingAverage: number(rating['average']) ?? 0,
            },
          }
        : {}),
      source: source(this.webUrl('release', id)),
    };
  }

  public async listMasterVersions(
    id: number,
    options: MasterVersionsOptions,
  ): Promise<Paged<ReleaseSummary>> {
    const params = new URLSearchParams({
      page: String(options.page),
      per_page: String(options.perPage),
    });
    this.append(params, 'country', options.country);
    this.append(params, 'label', options.label);
    this.append(params, 'format', options.format);
    this.append(params, 'released', options.released);
    const data = await this.request(
      `/masters/${id}/versions?${params.toString()}`,
      this.config.searchCacheTtlMs,
    );
    return {
      items: array(data['versions']).map(releaseSummary),
      pagination: pagination(data['pagination']),
      source: source(this.webUrl('master', id)),
    };
  }

  public async getMarketplaceStats(releaseId: number, currency?: string): Promise<MarketplaceStats> {
    const params = new URLSearchParams();
    this.append(params, 'curr_abbr', currency);
    const suffix = params.size > 0 ? `?${params.toString()}` : '';
    const data = await this.request(`/marketplace/stats/${releaseId}${suffix}`, 0);
    const lowestPrice = price(data['lowest_price']);
    return {
      releaseId,
      numberForSale: number(data['num_for_sale']) ?? 0,
      ...(lowestPrice ? { lowestPrice } : {}),
      source: source(`https://www.discogs.com/sell/release/${releaseId}`),
      disclaimer:
        'Current marketplace asking-price information observed at retrieval time; not a valuation or sales history.',
    };
  }

  public async getMarketplaceListing(listingId: number): Promise<MarketplaceListing> {
    const data = await this.request(`/marketplace/listings/${listingId}`, 0);
    const release = record(data['release']);
    const listingPrice = price(data['price']);
    if (!listingPrice) throw new Error('Invalid Discogs response: missing listing price');
    return {
      id: requiredNumber(data['id'], 'listing id'),
      releaseId: requiredNumber(release['id'], 'listing release id'),
      title: requiredText(release['description'], 'listing release description'),
      condition: requiredText(data['condition'] ?? data['media_condition'], 'listing condition'),
      ...(text(data['sleeve_condition']) ? { sleeveCondition: text(data['sleeve_condition']) } : {}),
      price: listingPrice,
      source: source(`https://www.discogs.com/sell/item/${listingId}`),
      disclaimer: 'Live marketplace listing observed at retrieval time; availability may change.',
    };
  }

  private async search<T>(
    type: 'artist' | 'master' | 'release' | 'label',
    options: SearchOptions,
    mapper: (value: unknown) => T,
  ): Promise<Paged<T>> {
    const params = new URLSearchParams({
      type,
      q: options.query,
      page: String(options.page),
      per_page: String(options.perPage),
    });
    this.append(params, 'artist', options.artist);
    this.append(params, 'release_title', options.title);
    this.append(params, 'label', options.label);
    this.append(params, 'catno', options.catalogueNumber);
    this.append(params, 'barcode', options.barcode);
    this.append(params, 'country', options.country);
    this.append(params, 'year', options.year);
    this.append(params, 'format', options.format);
    const data = await this.request(`/database/search?${params.toString()}`, this.config.searchCacheTtlMs);
    return {
      items: array(data['results']).map(mapper),
      pagination: pagination(data['pagination']),
      source: source(`https://www.discogs.com/search/?q=${encodeURIComponent(options.query)}&type=${type}`),
    };
  }

  private append(params: URLSearchParams, name: string, value: string | number | undefined): void {
    if (value !== undefined && String(value).length > 0) params.set(name, String(value));
  }

  private webUrl(type: 'artist' | 'label' | 'master' | 'release', id: number): string {
    return `https://www.discogs.com/${type}/${id}`;
  }

  private async request(path: string, ttlMs: number): Promise<Json> {
    const cached = this.cache.get(path);
    if (cached && cached.expiresAt > Date.now()) return cached.value as Json;
    if (cached) this.cache.delete(path);
    const inFlight = this.pending.get(path);
    if (inFlight) return inFlight as Promise<Json>;
    const request = this.fetchWithRetries(path)
      .then((value) => {
        if (ttlMs > 0 && this.config.cacheMaxEntries > 0) {
          if (this.cache.size >= this.config.cacheMaxEntries) {
            const oldest = this.cache.keys().next().value as string | undefined;
            if (oldest) this.cache.delete(oldest);
          }
          this.cache.set(path, { value, expiresAt: Date.now() + ttlMs });
        }
        return value;
      })
      .finally(() => this.pending.delete(path));
    this.pending.set(path, request);
    return request;
  }

  private async fetchWithRetries(path: string): Promise<Json> {
    for (let attempt = 0; attempt <= this.config.maxRetries; attempt += 1) {
      this.consumeQuota();
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);
      const startedAt = Date.now();
      try {
        const response = await this.fetchImpl(new URL(path, this.config.apiBaseUrl), {
          headers: {
            authorization: `Discogs token=${this.config.token}`,
            'user-agent': this.config.userAgent,
            accept: 'application/vnd.discogs.v2.discogs+json',
          },
          signal: controller.signal,
        });
        const remaining = response.headers.get('x-discogs-ratelimit-remaining');
        const total = response.headers.get('x-discogs-ratelimit');
        if (remaining && total && /^\d+$/.test(remaining) && /^\d+$/.test(total)) {
          this.windowCount = Math.max(this.windowCount, Number(total) - Number(remaining));
        }
        this.logger.info({
          event: 'discogs.request',
          endpoint: path.split('?')[0],
          status: response.status,
          durationMs: Date.now() - startedAt,
          attempt,
          ...(remaining ? { remainingQuota: remaining } : {}),
        });
        if (response.ok) {
          const parsed: unknown = await response.json();
          if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            throw new Error('Invalid Discogs response');
          }
          return parsed as Json;
        }
        if (response.status === 404) throw notFound('Discogs resource not found');
        if (response.status === 401 || response.status === 403) {
          throw new AppError('upstream_error', 'Discogs rejected the configured credentials');
        }
        const retryable = response.status === 429 || [502, 503, 504].includes(response.status);
        if (!retryable || attempt === this.config.maxRetries) {
          throw new AppError(
            response.status === 429 ? 'rate_limited' : 'upstream_error',
            response.status === 429
              ? 'Discogs rate limit exceeded'
              : 'Discogs could not complete the request',
            undefined,
            retryable,
          );
        }
        await this.delay(this.retryDelay(response, attempt));
      } catch (error) {
        if (error instanceof AppError) throw error;
        if (attempt === this.config.maxRetries) {
          throw new AppError(
            'upstream_error',
            error instanceof Error && error.name === 'AbortError'
              ? 'Discogs request timed out'
              : 'Discogs request failed',
            undefined,
            true,
            error,
          );
        }
        await this.delay(250 * 2 ** attempt + Math.floor(Math.random() * 100));
      } finally {
        clearTimeout(timeout);
      }
    }
    throw new AppError('upstream_error', 'Discogs request failed');
  }

  private consumeQuota(): void {
    const now = Date.now();
    if (now - this.windowStartedAt >= 60_000) {
      this.windowStartedAt = now;
      this.windowCount = 0;
    }
    if (this.windowCount >= this.config.rateLimitMax) {
      throw new AppError('rate_limited', 'Local Discogs request budget exhausted', undefined, true);
    }
    this.windowCount += 1;
  }

  private retryDelay(response: Response, attempt: number): number {
    const retryAfter = response.headers.get('retry-after');
    if (retryAfter && /^\d+$/.test(retryAfter)) return Number(retryAfter) * 1000;
    return 250 * 2 ** attempt + Math.floor(Math.random() * 100);
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
