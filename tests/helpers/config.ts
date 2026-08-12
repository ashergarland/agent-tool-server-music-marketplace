import { buildConfig, envSchema, type AppConfig } from '../../src/config/index.js';

export const testConfig = (overrides: Record<string, unknown> = {}): AppConfig =>
  buildConfig(
    envSchema.parse({
      NODE_ENV: 'test',
      AUTH_MODE: 'api-key',
      API_KEYS: 'test-api-key-that-is-at-least-32-characters',
      RATE_LIMIT_MAX: 120,
      DISCOGS_TOKEN: 'test-discogs-token',
      DISCOGS_USER_AGENT: 'music-marketplace-tests/1.0 (test@example.com)',
      ...overrides,
    }),
  );
