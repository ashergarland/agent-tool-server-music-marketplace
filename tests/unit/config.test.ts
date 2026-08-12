import { describe, expect, it } from 'vitest';
import {
  buildConfig,
  ConfigurationError,
  envSchema,
  loadConfig,
  withoutBlankValues,
} from '../../src/config/index.js';

describe('configuration', () => {
  it('normalizes booleans and ignores blank optional values', () => {
    const config = loadConfig({
      NODE_ENV: 'test',
      AUTH_MODE: 'api-key',
      API_KEYS: '12345678901234567890123456789012',
      MUTATIONS_ENABLED: 'True',
      PUBLIC_BASE_URL: '',
      DISCOGS_TOKEN: 'test-discogs-token',
      DISCOGS_USER_AGENT: 'music-marketplace-tests/1.0 (test@example.com)',
    });
    expect(config.guardrails.mutationsEnabled).toBe(true);
    expect(config.service.publicBaseUrl).toBeUndefined();
    expect(withoutBlankValues({ A: '', B: 'x' })).toEqual({ B: 'x' });
  });

  it('rejects disabled production authentication', () => {
    expect(() =>
      buildConfig(
        envSchema.parse({
          NODE_ENV: 'production',
          AUTH_MODE: 'disabled',
          DISCOGS_TOKEN: 'token',
          DISCOGS_USER_AGENT: 'music-marketplace-tests/1.0 (test@example.com)',
        }),
      ),
    ).toThrow(ConfigurationError);
  });

  it('requires strong API keys', () => {
    expect(() =>
      buildConfig(
        envSchema.parse({
          NODE_ENV: 'test',
          AUTH_MODE: 'api-key',
          API_KEYS: 'short',
          DISCOGS_TOKEN: 'token',
          DISCOGS_USER_AGENT: 'music-marketplace-tests/1.0 (test@example.com)',
        }),
      ),
    ).toThrow('at least 32');
  });

  it('requires Discogs credentials', () => {
    expect(() => envSchema.parse({ NODE_ENV: 'test', AUTH_MODE: 'disabled' })).toThrow();
  });
});
