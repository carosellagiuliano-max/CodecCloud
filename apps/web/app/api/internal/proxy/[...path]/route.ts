import { NextRequest, NextResponse } from 'next/server';
import {
  SESSION_COOKIE_NAME,
  SessionCookiePayload,
  decodeSessionCookie
} from '@/lib/server/session-cookie';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'https://api.codeccloud.local/v1';

function buildUpstreamUrl(pathSegments: string[], searchParams: URLSearchParams) {
  const normalizedPath = pathSegments.join('/');
  const target = new URL(normalizedPath, API_BASE_URL.endsWith('/') ? API_BASE_URL : `${API_BASE_URL}/`);
  target.search = searchParams.toString();
  return target;
}

function getSession(request: NextRequest): SessionCookiePayload | null {
  const cookie = request.cookies.get(SESSION_COOKIE_NAME);
  if (!cookie) {
    return null;
  }
  const decoded = decodeSessionCookie(cookie.value);
  if (!decoded || decoded.expiresAt <= Date.now()) {
    return null;
  }
  return decoded;
}

async function forward(request: NextRequest, session: SessionCookiePayload, path: string[]) {
  const upstreamUrl = buildUpstreamUrl(path, request.nextUrl.searchParams);

  const headers = new Headers();
  request.headers.forEach((value, key) => {
    if (key === 'host' || key === 'connection' || key === 'content-length') {
      return;
    }
    headers.set(key, value);
  });
  headers.set('Authorization', `Bearer ${session.accessToken}`);
  if (!headers.has('accept')) {
    headers.set('accept', 'application/json');
  }

  const method = request.method;
  const hasBody = method !== 'GET' && method !== 'HEAD';
  const body = hasBody ? await request.arrayBuffer() : undefined;

  const upstreamResponse = await fetch(upstreamUrl, {
    method,
    headers,
    body: body ? body : undefined,
    cache: 'no-store'
  });

  const responseHeaders = new Headers(upstreamResponse.headers);
  responseHeaders.delete('set-cookie');

  return new NextResponse(upstreamResponse.body, {
    status: upstreamResponse.status,
    headers: responseHeaders
  });
}

async function handle(request: NextRequest, context: { params: { path: string[] } }) {
  const session = getSession(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  }
  return forward(request, session, context.params.path);
}

export const GET = handle;
export const POST = handle;
export const PATCH = handle;
export const DELETE = handle;
