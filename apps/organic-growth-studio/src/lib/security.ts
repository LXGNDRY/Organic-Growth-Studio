export const SESSION_COOKIE = 'ogs_session';
export const SESSION_TTL_SECONDS = 12 * 60 * 60;

const encoder = new TextEncoder();

function isStrongSecret(value: string | undefined): value is string {
  return Boolean(value && value.length >= 32 && !value.startsWith('replace-'));
}

export function authConfigurationReady(): boolean {
  return isStrongSecret(process.env.APP_ACCESS_TOKEN) && isStrongSecret(process.env.SESSION_SECRET);
}

export async function verifyOwnerToken(candidate: unknown): Promise<boolean> {
  const expected = process.env.APP_ACCESS_TOKEN;
  if (!isStrongSecret(expected) || typeof candidate !== 'string' || candidate.length > 512) return false;
  const [candidateHash, expectedHash] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(candidate)),
    crypto.subtle.digest('SHA-256', encoder.encode(expected)),
  ]);
  const a = new Uint8Array(candidateHash);
  const b = new Uint8Array(expectedHash);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function sign(payload: string, secret: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(payload)));
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');
}

function fromHex(value: string): Uint8Array | null {
  if (!/^[a-f0-9]+$/i.test(value) || value.length % 2 !== 0) return null;
  const bytes = new Uint8Array(value.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = Number.parseInt(value.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

export async function createSessionCookie(now = Date.now()): Promise<string> {
  const secret = process.env.SESSION_SECRET;
  if (!isStrongSecret(secret) || !isStrongSecret(process.env.APP_ACCESS_TOKEN)) {
    throw new Error('Owner authentication is not configured.');
  }
  const expiresAt = Math.floor(now / 1000) + SESSION_TTL_SECONDS;
  const nonce = toHex(crypto.getRandomValues(new Uint8Array(16)));
  const payload = expiresAt + '.' + nonce;
  return payload + '.' + toHex(await sign(payload, secret));
}

export async function verifySessionCookie(value: string | undefined, now = Date.now()): Promise<boolean> {
  const secret = process.env.SESSION_SECRET;
  if (!isStrongSecret(secret) || !isStrongSecret(process.env.APP_ACCESS_TOKEN) || !value || value.length > 256) return false;
  const parts = value.split('.');
  if (parts.length !== 3) return false;
  const [expiresText, nonce, signatureText] = parts;
  if (!/^\d{10}$/.test(expiresText) || !/^[a-f0-9]{32}$/i.test(nonce) || !/^[a-f0-9]{64}$/i.test(signatureText)) return false;
  const expiresAt = Number(expiresText);
  const nowSeconds = Math.floor(now / 1000);
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= nowSeconds || expiresAt > nowSeconds + SESSION_TTL_SECONDS + 5) return false;
  const signature = fromHex(signatureText);
  if (!signature) return false;
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  return crypto.subtle.verify('HMAC', key, signature as BufferSource, encoder.encode(expiresText + '.' + nonce));
}

export type FixedWindowLimiter = ((key: string, now?: number) => { allowed: boolean; retryAfterSeconds: number })
  & { reset: (key: string) => void };

// A throttle key taken straight from x-forwarded-for is attacker-controlled
// whenever nothing trusted sits in front of the app: the caller can forge a
// fresh key per request to slip the limit, and can mint enough distinct keys to
// fill the map and lock everyone out. Only read the header when the deployment
// declares a proxy; otherwise every caller shares one key.
export function trustsProxyHeader(): boolean {
  return process.env.TRUST_PROXY_HEADER === 'true';
}

export const SHARED_THROTTLE_KEY = 'all';

export function throttleKey(forwardedFor: string | null): string {
  if (!trustsProxyHeader()) return SHARED_THROTTLE_KEY;
  // Rightmost entry is the peer the nearest proxy actually observed; entries to
  // its left are whatever the client sent.
  const observed = (forwardedFor || '').split(',').pop()?.trim();
  return observed || SHARED_THROTTLE_KEY;
}

export function createFixedWindowLimiter(limit: number, windowMs: number, maxKeys = 5000): FixedWindowLimiter {
  const entries = new Map<string, { count: number; resetAt: number }>();
  const limiter = ((key: string, now = Date.now()): { allowed: boolean; retryAfterSeconds: number } => {
    let entry = entries.get(key);
    if (!entry || entry.resetAt <= now) {
      if (entries.size >= maxKeys) {
        for (const [candidate, state] of entries) if (state.resetAt <= now) entries.delete(candidate);
        if (entries.size >= maxKeys) return { allowed: false, retryAfterSeconds: 60 };
      }
      entry = { count: 0, resetAt: now + windowMs };
      entries.set(key, entry);
    }
    if (entry.count >= limit) return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)) };
    entry.count += 1;
    return { allowed: true, retryAfterSeconds: 0 };
  }) as FixedWindowLimiter;
  limiter.reset = (key: string) => { entries.delete(key); };
  return limiter;
}
