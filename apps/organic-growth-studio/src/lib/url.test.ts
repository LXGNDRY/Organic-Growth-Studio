import { describe, expect, it } from 'vitest';
import { publicBaseUrl } from './url';

describe('publicBaseUrl', () => {
  // Regression: behind Caddy the request URL carries the container's own
  // listening address, so the first tracked link minted in production came
  // out as https://0.0.0.0:3010/go/... - valid, unusable, and the thing every
  // experiment is measured with.
  it('prefers the configured public origin over the request address', () => {
    process.env.PUBLIC_BASE_URL = 'https://studio.example.com';
    expect(publicBaseUrl('http://0.0.0.0:3010/api/projects/x/links'))
      .toBe('https://studio.example.com');
  });

  it('ignores a trailing path on the configured value', () => {
    process.env.PUBLIC_BASE_URL = 'https://studio.example.com/somewhere/';
    expect(publicBaseUrl('http://0.0.0.0:3010/x')).toBe('https://studio.example.com');
  });

  it('falls back to the request origin when unset', () => {
    delete process.env.PUBLIC_BASE_URL;
    expect(publicBaseUrl('http://127.0.0.1:3010/x')).toBe('http://127.0.0.1:3010');
  });

  it('falls back when the configured value is unusable', () => {
    for (const bad of ['', '   ', 'not a url', 'ftp://studio.example.com']) {
      process.env.PUBLIC_BASE_URL = bad;
      expect(publicBaseUrl('http://127.0.0.1:3010/x')).toBe('http://127.0.0.1:3010');
    }
    delete process.env.PUBLIC_BASE_URL;
  });
});
