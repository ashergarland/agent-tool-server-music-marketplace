import pino from 'pino';
import { describe, expect, it, vi } from 'vitest';
import { DiscogsProvider } from '../../src/provider/discogs.js';
import { testConfig } from '../helpers/config.js';

const json = (body: unknown, init: ResponseInit = {}): Response =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  });

describe('Discogs provider', () => {
  it('authenticates, maps search results, and encodes filters', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      json({
        pagination: { page: 1, per_page: 25, pages: 1, items: 1 },
        results: [
          {
            id: 1,
            title: 'Artist - Album',
            artist: 'Artist',
            year: 1990,
            country: 'US',
            label: ['Label'],
            catno: ['CAT-1'],
            format: ['Vinyl'],
            resource_url: 'https://api.discogs.com/releases/1',
          },
        ],
      }),
    );
    const config = testConfig({
      DISCOGS_TOKEN: 'test-discogs-token',
      DISCOGS_USER_AGENT: 'music-marketplace-tests/1.0 (test@example.com)',
    });
    const provider = new DiscogsProvider(config.discogs, pino({ level: 'silent' }), fetchMock);

    const result = await provider.searchReleases({
      query: 'Album',
      catalogueNumber: 'CAT 1',
      page: 1,
      perPage: 25,
    });

    expect(result.items[0]).toMatchObject({ id: 1, catalogueNumbers: ['CAT-1'] });
    const [url, request] = fetchMock.mock.calls[0]!;
    const requestedUrl = typeof url === 'string' ? url : url instanceof URL ? url.href : url.url;
    expect(requestedUrl).toContain('catno=CAT+1');
    expect(new Headers(request?.headers).get('authorization')).toBe(
      'Discogs token=test-discogs-token',
    );
    expect(new Headers(request?.headers).get('user-agent')).toContain('music-marketplace-tests');
  });

  it('normalizes exact releases and coalesces cached requests', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      json({
        id: 1,
        title: 'Album',
        artists: [{ id: 2, name: 'Artist' }],
        labels: [{ id: 3, name: 'Label', catno: 'CAT-1' }],
        formats: [{ name: 'Vinyl', qty: '1', descriptions: ['LP'] }],
        identifiers: [{ type: 'Barcode', value: '111' }],
        tracklist: [{ position: 'A1', title: 'Track' }],
        year: 1990,
        country: 'US',
        master_id: 10,
        resource_url: 'https://api.discogs.com/releases/1',
      }),
    );
    const config = testConfig({ DISCOGS_CACHE_TTL_MS: 60_000 });
    const provider = new DiscogsProvider(config.discogs, pino({ level: 'silent' }), fetchMock);

    const [left, right] = await Promise.all([provider.getRelease(1), provider.getRelease(1)]);
    expect(left).toMatchObject({
      id: 1,
      catalogueNumbers: ['CAT-1'],
      identifiers: [{ type: 'Barcode', value: '111' }],
    });
    expect(right.id).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('maps upstream rate limits without leaking response bodies', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(json({ message: 'secret upstream body' }, { status: 429 }));
    const config = testConfig({ DISCOGS_MAX_RETRIES: 0 });
    const provider = new DiscogsProvider(config.discogs, pino({ level: 'silent' }), fetchMock);

    await expect(provider.getRelease(1)).rejects.toMatchObject({
      code: 'rate_limited',
      message: 'Discogs rate limit exceeded',
      retryable: true,
    });
  });

  it('normalizes every supported exact and marketplace resource', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockImplementation((input) => {
      const url = new URL(
        typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
      );
      if (url.pathname === '/artists/2') {
        return Promise.resolve(
          json({
            id: 2,
            name: 'Artist',
            realname: 'Real Name',
            profile: 'Profile',
            resource_url: 'artist-api-url',
            aliases: [{ id: 4, name: 'Alias', resource_url: 'alias-url' }],
          }),
        );
      }
      if (url.pathname === '/labels/3') {
        return Promise.resolve(
          json({
            id: 3,
            name: 'Label',
            profile: 'Profile',
            resource_url: 'label-api-url',
            parent_label: { id: 5, name: 'Parent', resource_url: 'parent-url' },
          }),
        );
      }
      if (url.pathname === '/masters/10') {
        return Promise.resolve(
          json({
            id: 10,
            title: 'Album',
            main_release: 1,
            artists: [{ id: 2, name: 'Artist' }],
            tracklist: [{ position: '1', title: 'Track', duration: '3:00' }],
            resource_url: 'master-api-url',
          }),
        );
      }
      if (url.pathname === '/masters/10/versions') {
        return Promise.resolve(
          json({
            pagination: { page: 1, per_page: 25, pages: 1, items: 1 },
            versions: [
              {
                id: 1,
                title: 'Album',
                label: 'Label',
                catno: 'CAT-1',
                format: 'Vinyl',
                resource_url: 'release-api-url',
              },
            ],
          }),
        );
      }
      if (url.pathname === '/marketplace/stats/1') {
        return Promise.resolve(
          json({ num_for_sale: 2, lowest_price: { value: 12.5, currency: 'USD' } }),
        );
      }
      if (url.pathname === '/marketplace/listings/5') {
        return Promise.resolve(
          json({
            id: 5,
            media_condition: 'Mint (M)',
            sleeve_condition: 'Near Mint (NM or M-)',
            price: { value: 20, currency: 'USD' },
            release: { id: 1, description: 'Artist - Album' },
          }),
        );
      }
      return Promise.resolve(json({ pagination: {}, results: [] }));
    });
    const config = testConfig();
    const provider = new DiscogsProvider(config.discogs, pino({ level: 'silent' }), fetchMock);

    expect(await provider.getArtist(2)).toMatchObject({
      realName: 'Real Name',
      aliases: [{ id: 4 }],
    });
    expect(await provider.getLabel(3)).toMatchObject({ parentLabel: { id: 5 } });
    expect(await provider.getMaster(10)).toMatchObject({ mainReleaseId: 1 });
    expect(await provider.listMasterVersions(10, { page: 1, perPage: 25 })).toMatchObject({
      items: [{ catalogueNumbers: ['CAT-1'], formats: ['Vinyl'] }],
    });
    expect(await provider.getMarketplaceStats(1, 'USD')).toMatchObject({
      numberForSale: 2,
      lowestPrice: { value: 12.5 },
    });
    expect(await provider.getMarketplaceListing(5)).toMatchObject({
      condition: 'Mint (M)',
      sleeveCondition: 'Near Mint (NM or M-)',
    });
  });

  it('maps not found, authorization, invalid payload, and local quota errors', async () => {
    const logger = pino({ level: 'silent' });
    const notFoundProvider = new DiscogsProvider(
      testConfig().discogs,
      logger,
      vi.fn<typeof fetch>().mockResolvedValue(json({}, { status: 404 })),
    );
    await expect(notFoundProvider.getArtist(404)).rejects.toMatchObject({ code: 'not_found' });

    const unauthorizedProvider = new DiscogsProvider(
      testConfig().discogs,
      logger,
      vi.fn<typeof fetch>().mockResolvedValue(json({}, { status: 401 })),
    );
    await expect(unauthorizedProvider.getArtist(1)).rejects.toMatchObject({
      code: 'upstream_error',
      retryable: false,
    });

    const invalidProvider = new DiscogsProvider(
      testConfig({ DISCOGS_MAX_RETRIES: 0 }).discogs,
      logger,
      vi.fn<typeof fetch>().mockResolvedValue(json([])),
    );
    await expect(invalidProvider.getArtist(1)).rejects.toMatchObject({
      code: 'upstream_error',
      retryable: true,
    });

    const quotaProvider = new DiscogsProvider(
      testConfig({ DISCOGS_RATE_LIMIT_MAX: 1 }).discogs,
      logger,
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(json({ id: 1, name: 'Artist', resource_url: 'artist-url' })),
    );
    await quotaProvider.getArtist(1);
    await expect(quotaProvider.getArtist(2)).rejects.toMatchObject({ code: 'rate_limited' });
  });

  it('retries transient failures and succeeds', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json({}, { status: 503, headers: { 'retry-after': '0' } }))
      .mockResolvedValueOnce(json({ id: 2, name: 'Artist', resource_url: 'artist-url' }));
    const provider = new DiscogsProvider(
      testConfig({ DISCOGS_MAX_RETRIES: 1 }).discogs,
      pino({ level: 'silent' }),
      fetchMock,
    );
    await expect(provider.getArtist(2)).resolves.toMatchObject({ id: 2 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
