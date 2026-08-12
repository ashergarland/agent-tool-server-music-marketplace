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
    expect(String(url)).toContain('catno=CAT+1');
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
});
