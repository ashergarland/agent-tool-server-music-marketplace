import { describe, expect, it } from 'vitest';
import { createApplication } from '../../src/app.js';
import { createServices } from '../../src/services/index.js';
import { FakeMusicProvider, testRelease } from '../helpers/fake-provider.js';
import { testConfig } from '../helpers/config.js';

describe('music marketplace services', () => {
  it('retrieves, identifies, and compares releases', async () => {
    const services = createServices(testConfig(), new FakeMusicProvider());
    expect((await services.catalog.getRelease(1)).title).toBe('Example Album');
    expect(await services.identification.identify({ barcode: '111' })).toMatchObject({
      status: 'unique_match',
    });
    const comparison = await services.comparison.compare([1, 2]);
    expect(comparison.differences.find((field) => field.field === 'country')).toMatchObject({
      equal: false,
    });
  });

  it('requires strong evidence and gates marketplace reads', async () => {
    const services = createServices(testConfig(), new FakeMusicProvider());
    await expect(services.identification.identify({ title: 'Example' })).rejects.toMatchObject({
      code: 'bad_request',
    });
    expect(() => services.marketplace.getStats(1)).toThrowError(
      'Marketplace statistics are disabled',
    );
  });

  it('reports ambiguous, conflicting, and missing release matches', async () => {
    const ambiguousProvider = new FakeMusicProvider();
    ambiguousProvider.releases.set(2, {
      ...testRelease(2),
      identifiers: [{ type: 'Barcode', value: '111' }],
    });
    const ambiguous = createServices(testConfig(), ambiguousProvider);
    await expect(ambiguous.identification.identify({ barcode: '111' })).resolves.toMatchObject({
      status: 'ambiguous',
      candidates: [{ confidence: 'high' }, { confidence: 'high' }],
    });

    const conflicting = createServices(testConfig(), new FakeMusicProvider());
    await expect(
      conflicting.identification.identify({ barcode: '111', country: 'UK' }),
    ).resolves.toMatchObject({
      status: 'no_match',
      candidates: [{ conflictingFields: ['country'] }],
    });
    await expect(conflicting.identification.identify({ barcode: '999' })).resolves.toMatchObject({
      status: 'no_match',
      candidates: [],
    });
  });

  it('preserves unknown comparison fields', async () => {
    const provider = new FakeMusicProvider();
    provider.releases.set(2, {
      ...testRelease(2),
      country: undefined,
      identifiers: [],
    });
    const comparison = await createServices(testConfig(), provider).comparison.compare([1, 2]);
    expect(comparison.differences.find((field) => field.field === 'country')?.equal).toBeNull();
    expect(comparison.differences.find((field) => field.field === 'barcodes')?.equal).toBeNull();
  });

  it('wires an injectable application', async () => {
    const application = createApplication({
      config: testConfig(),
      provider: new FakeMusicProvider(),
    });
    expect(application.registry.list()).toHaveLength(13);
    await application.http.close();
  });
});
