import { NextRequest, NextResponse } from 'next/server';
import { authConfigurationReady, createFixedWindowLimiter, createSessionCookie, SESSION_COOKIE, verifyOwnerToken } from '@/lib/security';

export const runtime = 'nodejs';
const attempts = createFixedWindowLimiter(10, 15 * 60 * 1000);

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin');
  const expectedHost = (request.headers.get('host') || request.nextUrl.host).split(',')[0].trim().toLowerCase();
  if (origin) {
    try {
      if (new URL(origin).host.toLowerCase() !== expectedHost) return NextResponse.json({ error: 'Cross-origin login rejected.' }, { status: 403 });
    } catch {
      return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 });
    }
  }

  const contentLength = Number(request.headers.get('content-length') || 0);
  if (contentLength > 2048) return NextResponse.json({ error: 'Request is too large.' }, { status: 413 });
  const key = (request.headers.get('x-forwarded-for') || 'unknown').split(',').pop()?.trim() || 'unknown';
  const limit = attempts(key);
  if (!limit.allowed) {
    return NextResponse.json({ error: 'Too many sign-in attempts. Try again later.' }, {
      status: 429,
      headers: { 'retry-after': String(limit.retryAfterSeconds), 'cache-control': 'no-store' },
    });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid sign-in request.' }, { status: 400 });
  }
  const token = typeof body === 'object' && body !== null && 'token' in body ? body.token : undefined;
  if (!(await verifyOwnerToken(token))) {
    return NextResponse.json({ error: 'The access token is incorrect or authentication is not configured.' }, {
      status: authConfigurationReady() ? 401 : 503,
      headers: { 'cache-control': 'no-store' },
    });
  }

  const response = NextResponse.json({ ok: true }, { headers: { 'cache-control': 'no-store' } });
  response.cookies.set(SESSION_COOKIE, await createSessionCookie(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: 12 * 60 * 60,
  });
  return response;
}
