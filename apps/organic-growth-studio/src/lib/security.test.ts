import { afterEach, describe, expect, it, test } from 'vitest';
import {
  createFixedWindowLimiter,
  createSessionCookie,
  SESSION_TTL_SECONDS,
  SHARED_THROTTLE_KEY,
  throttleKey,
  verifyOwnerToken,
  verifySessionCookie,
} from './security';

const originalAccess = process.env.APP_ACCESS_TOKEN;
const originalSession = process.env.SESSION_SECRET;

afterEach(() => {
  if (originalAccess === undefined) delete process.env.APP_ACCESS_TOKEN;
  else process.env.APP_ACCESS_TOKEN = originalAccess;
  if (originalSession === undefined) delete process.env.SESSION_SECRET;
  else process.env.SESSION_SECRET = originalSession;
});

describe('owner session security', () => {
  test('signs a short-lived session and rejects modified or expired values', async () => {
    process.env.APP_ACCESS_TOKEN = 'a'.repeat(48);
    process.env.SESSION_SECRET = 'b'.repeat(48);
    const now = 1_800_000_000_000;
    const cookie = await createSessionCookie(now);
    expect(await verifySessionCookie(cookie, now + 1000)).toBe(true);
    expect(await verifySessionCookie(cookie + '0', now + 1000)).toBe(false);
    expect(await verifySessionCookie(cookie, now + (SESSION_TTL_SECONDS + 1) * 1000)).toBe(false);
  });

  test('fails closed when secrets are missing or placeholders', async () => {
    process.env.APP_ACCESS_TOKEN = 'replace-me';
    process.env.SESSION_SECRET = 'b'.repeat(48);
    await expect(createSessionCookie()).rejects.toThrow('not configured');
    expect(await verifySessionCookie('1.abc.def')).toBe(false);
  });

  test('checks owner token without accepting partial or oversized input', async () => {
    process.env.APP_ACCESS_TOKEN = 'a'.repeat(48);
    process.env.SESSION_SECRET = 'b'.repeat(48);
    expect(await verifyOwnerToken('a'.repeat(48))).toBe(true);
    expect(await verifyOwnerToken('a'.repeat(47))).toBe(false);
    expect(await verifyOwnerToken('a'.repeat(513))).toBe(false);
  });
});

test('fixed-window limiter rejects excess requests and resets after its window', () => {
  const limit = createFixedWindowLimiter(2, 1000);
  expect(limit('client', 1000).allowed).toBe(true);
  expect(limit('client', 1100).allowed).toBe(true);
  expect(limit('client', 1200)).toEqual({ allowed: false, retryAfterSeconds: 1 });
  expect(limit('client', 2000).allowed).toBe(true);
});

describe('throttleKey', () => {
  const saved = process.env.TRUST_PROXY_HEADER;
  afterEach(() => {
    if (saved === undefined) delete process.env.TRUST_PROXY_HEADER;
    else process.env.TRUST_PROXY_HEADER = saved;
  });

  it('ignores x-forwarded-for when no proxy is declared', () => {
    delete process.env.TRUST_PROXY_HEADER;
    // Regression: a forged header used to mint a fresh bucket per request,
    // which both defeated the limit and could exhaust the key map.
    expect(throttleKey('1.2.3.4')).toBe(SHARED_THROTTLE_KEY);
    expect(throttleKey('9.9.9.9')).toBe(SHARED_THROTTLE_KEY);
    expect(throttleKey(null)).toBe(SHARED_THROTTLE_KEY);
  });

  it('uses the rightmost entry when a proxy is declared', () => {
    process.env.TRUST_PROXY_HEADER = 'true';
    expect(throttleKey('1.2.3.4, 10.0.0.9')).toBe('10.0.0.9');
    expect(throttleKey('  10.0.0.9  ')).toBe('10.0.0.9');
  });

  it('falls back to the shared key when a declared proxy sends nothing usable', () => {
    process.env.TRUST_PROXY_HEADER = 'true';
    expect(throttleKey(null)).toBe(SHARED_THROTTLE_KEY);
    expect(throttleKey('')).toBe(SHARED_THROTTLE_KEY);
  });
});

describe('createFixedWindowLimiter reset', () => {
  it('clears a blocked key so a proven owner is not locked out', () => {
    const limiter = createFixedWindowLimiter(2, 60_000);
    expect(limiter('k').allowed).toBe(true);
    expect(limiter('k').allowed).toBe(true);
    expect(limiter('k').allowed).toBe(false);
    limiter.reset('k');
    expect(limiter('k').allowed).toBe(true);
  });

  it('only clears the key it is given', () => {
    const limiter = createFixedWindowLimiter(1, 60_000);
    limiter('a');
    limiter('b');
    limiter.reset('a');
    expect(limiter('a').allowed).toBe(true);
    expect(limiter('b').allowed).toBe(false);
  });
});
