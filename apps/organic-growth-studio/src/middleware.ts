import { NextRequest, NextResponse } from 'next/server';
import { authConfigurationReady, SESSION_COOKIE, verifySessionCookie } from '@/lib/security';

function isPublicPath(pathname: string): boolean {
  return pathname === '/login'
    || pathname === '/api/auth/login'
    || pathname === '/api/auth/logout'
    || pathname === '/api/health'
    || pathname.startsWith('/api/track/')
    || pathname.startsWith('/go/')
    || pathname === '/api/agent/tick';
}

function sameOriginHost(request: NextRequest, origin: string): boolean {
  try {
    const host = new URL(origin).host.toLowerCase();
    const expected = (request.headers.get('host') || request.nextUrl.host).split(',')[0].trim().toLowerCase();
    return host === expected;
  } catch {
    return false;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isLoginPage = pathname === '/login';
  const publicPath = isPublicPath(pathname);

  if (!publicPath && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) {
    const origin = request.headers.get('origin');
    if (origin && !sameOriginHost(request, origin)) {
      return NextResponse.json({ error: 'Cross-origin request rejected.' }, { status: 403 });
    }
  }

  if (pathname === '/api/auth/login' || pathname === '/api/auth/logout' || pathname === '/api/health'
      || pathname.startsWith('/api/track/') || pathname.startsWith('/go/') || pathname === '/api/agent/tick') {
    return NextResponse.next();
  }

  const validSession = await verifySessionCookie(request.cookies.get(SESSION_COOKIE)?.value);
  if (isLoginPage) {
    return validSession ? NextResponse.redirect(new URL('/', request.url)) : NextResponse.next();
  }

  if (!authConfigurationReady()) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Owner authentication is not configured.' }, { status: 503, headers: { 'cache-control': 'no-store' } });
    }
    return NextResponse.redirect(new URL('/login', request.url));
  }

  if (validSession) return NextResponse.next();
  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401, headers: { 'cache-control': 'no-store' } });
  }
  const login = new URL('/login', request.url);
  login.searchParams.set('next', pathname);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
