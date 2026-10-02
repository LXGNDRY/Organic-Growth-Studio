import { afterEach, describe, expect, test } from 'vitest';
import {
  createFixedWindowLimiter,
  createSessionCookie,
  SESSION_TTL_SECONDS,
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
