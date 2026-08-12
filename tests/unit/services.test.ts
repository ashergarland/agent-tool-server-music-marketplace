import { describe, expect, it } from 'vitest';
import { createApplication } from '../../src/app.js';
import { createServices } from '../../src/services/index.js';
import { FakeMusicProvider } from '../helpers/fake-provider.js';
import { testConfig } from '../helpers/config.js';

describe('music marketplace services', () => {
  it('retrieves, identifies, and compares releases', async () => {
    const services = createServices(testConfig(), new FakeMusicProvider());
    expect((await services.catalog.getRelease(1)).title).toBe('Example Album');
    expect(await services.identification.identify({ barcode: '111' })).toMatchObject({
      status: 'unique_match',
    });
    expect(await services.comparison.compare([1, 2])).toMatchObject({
      differences: expect.arrayContaining([
        expect.objectContaining({ field: 'country', equal: false }),
      ]),
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

  it('wires an injectable application', async () => {
    const application = createApplication({
      config: testConfig(),
      provider: new FakeMusicProvider(),
    });
    expect(application.registry.list()).toHaveLength(13);
    await application.http.close();
  });
});
