import { NextRequest, NextResponse } from 'next/server';
import { store } from '@/lib/store';
import { createFixedWindowLimiter } from '@/lib/security';

export const runtime = 'nodejs';
const events = new Set(['page_view', 'outbound_click', 'product_interest', 'add_to_cart', 'checkout_start', 'purchase']);
const rateLimit = createFixedWindowLimiter(180, 60_000, 10_000);

type Context = { params: Promise<{ projectId: string }> };

function corsHeaders(origin: string) {
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-allow-headers': 'content-type',
    'cache-control': 'no-store',
    vary: 'Origin',
  };
}

// Origin is absent on some beacon sends, so Referer is the fallback. A Referer
// is a full URL, and echoing one into access-control-allow-origin emits a
// malformed header, so reduce it to a bare origin before it is used or sent.
function requestOrigin(request: NextRequest): string | null {
  const origin = request.headers.get('origin');
  if (origin) return origin;
  const referer = request.headers.get('referer');
  if (!referer) return null;
  try {
    return new URL(referer).origin;
  } catch {
    return null;
  }
}

async function matchingOrigin(projectId: string, origin: string | null) {
  if (!origin) return false;
  try {
    const project = await store.getProject(projectId);
    if (!project) return false;
    const requestHost = new URL(origin).hostname.toLowerCase();
    const targetHost = new URL(project.targetUrl).hostname.toLowerCase();
    return requestHost === targetHost || requestHost.endsWith('.' + targetHost);
  } catch {
    return false;
  }
}

export async function GET(request: NextRequest, { params }: Context) {
  const { projectId } = await params;
  if (!await store.getProject(projectId)) {
    return new NextResponse('/* Unknown project */', { status: 404, headers: { 'content-type': 'application/javascript; charset=utf-8' } });
  }
  const endpoint = JSON.stringify(new URL('/api/track/' + encodeURIComponent(projectId), request.nextUrl.origin).toString());
  const js = '(()=>{const endpoint=' + endpoint + ';const q=new URLSearchParams(location.search);const send=(event)=>{const data=new URLSearchParams({event,path:location.pathname,source:q.get("utm_source")||"",medium:q.get("utm_medium")||"",campaign:q.get("utm_campaign")||""});navigator.sendBeacon(endpoint,data)};send("page_view");document.addEventListener("click",e=>{const el=e.target.closest("[data-signal-event]");if(el){const name=el.getAttribute("data-signal-event");if(["product_interest","add_to_cart","checkout_start","purchase"].includes(name))send(name)}},{capture:true});})();';
  return new NextResponse(js, {
    headers: {
      'content-type': 'application/javascript; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      'access-control-allow-origin': '*',
    },
  });
}

export async function OPTIONS(request: NextRequest, { params }: Context) {
  const { projectId } = await params;
  const origin = request.headers.get('origin');
  if (!await matchingOrigin(projectId, origin)) return new NextResponse(null, { status: 403 });
  return new NextResponse(null, { status: 204, headers: corsHeaders(origin!) });
}

export async function POST(request: NextRequest, { params }: Context) {
  const { projectId } = await params;
  const origin = requestOrigin(request);
  if (!await matchingOrigin(projectId, origin)) return new NextResponse(null, { status: 403 });
  const ip = (request.headers.get('x-forwarded-for') || 'unknown').split(',').pop()?.trim() || 'unknown';
  const limit = rateLimit(ip);
  if (!limit.allowed) return NextResponse.json({ error: 'Event rate limit exceeded.' }, { status: 429, headers: { ...corsHeaders(origin!), 'retry-after': String(limit.retryAfterSeconds) } });
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/x-www-form-urlencoded')) {
    return NextResponse.json({ error: 'Expected URL-encoded event data.' }, { status: 415, headers: corsHeaders(origin!) });
  }
  const length = Number(request.headers.get('content-length') || 0);
  if (length > 4096) return NextResponse.json({ error: 'Event request is too large.' }, { status: 413, headers: corsHeaders(origin!) });
  try {
    const body = await readBody(request, 4096);
    const form = new URLSearchParams(body);
    const event = form.get('event') || '';
    const pagePath = form.get('path') || '';
    if (!events.has(event) || !pagePath.startsWith('/') || pagePath.startsWith('//') || pagePath.length > 500) {
      return NextResponse.json({ error: 'Invalid event.' }, { status: 400, headers: corsHeaders(origin!) });
    }
    const clean = (value: string | null) => (value || '').replace(/[^a-zA-Z0-9 _./-]/g, '').slice(0, 100);
    await store.recordEvent({
      projectId,
      event,
      pagePath,
      source: clean(form.get('source')) || '(direct)',
      medium: clean(form.get('medium')) || '(none)',
      campaign: clean(form.get('campaign')) || '(not set)',
      day: new Date().toISOString().slice(0, 10),
    });
    return new NextResponse(null, { status: 204, headers: corsHeaders(origin!) });
  } catch {
    return NextResponse.json({ error: 'Invalid event payload.' }, { status: 400, headers: corsHeaders(origin!) });
  }
}

async function readBody(request: Request, maxBytes: number): Promise<string> {
  if (!request.body) return '';
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new Error('Event request is too large.');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}
