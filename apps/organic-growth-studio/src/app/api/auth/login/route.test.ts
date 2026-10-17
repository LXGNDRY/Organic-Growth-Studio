import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { POST } from './route';

const TOKEN = 'o'.repeat(40);
const savedToken = process.env.APP_ACCESS_TOKEN;
const savedSecret = process.env.SESSION_SECRET;
const savedProxy = process.env.TRUST_PROXY_HEADER;

const signIn = (token: unknown) =>
  POST(new Request('https://studio.example/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json', host: 'studio.example' },
    body: JSON.stringify({ token }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any);

beforeEach(() => {
  process.env.APP_ACCESS_TOKEN = TOKEN;
  process.env.SESSION_SECRET = 's'.repeat(40);
  delete process.env.TRUST_PROXY_HEADER;
});

afterEach(() => {
  if (savedToken === undefined) delete process.env.APP_ACCESS_TOKEN; else process.env.APP_ACCESS_TOKEN = savedToken;
  if (savedSecret === undefined) delete process.env.SESSION_SECRET; else process.env.SESSION_SECRET = savedSecret;
  if (savedProxy === undefined) delete process.env.TRUST_PROXY_HEADER; else process.env.TRUST_PROXY_HEADER = savedProxy;
});

describe('POST /api/auth/login throttling', () => {
  it('lets the owner in even after the shared bucket is exhausted', async () => {
    // Regression: the throttle used to gate every request before the token was
    // checked, so once an attacker spent the shared bucket the owner was
    // locked out for the whole window and could never reach the reset.
    for (let i = 0; i < 12; i++) await signIn('wrong-token');
    expect((await signIn('wrong-token')).status).toBe(429);

    const owner = await signIn(TOKEN);
    expect(owner.status).toBe(200);
    expect(owner.headers.get('set-cookie')).toContain('ogs_session=');
  });

  it('clears the window once the owner signs in', async () => {
    for (let i = 0; i < 12; i++) await signIn('wrong-token');
    expect((await signIn('wrong-token')).status).toBe(429);
    expect((await signIn(TOKEN)).status).toBe(200);
    // Reset on success means failures start from a fresh window, not 429.
    expect((await signIn('wrong-token')).status).toBe(401);
  });
});
