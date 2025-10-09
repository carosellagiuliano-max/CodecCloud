import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import {
  SESSION_COOKIE_NAME,
  PublicSession,
  SessionCookiePayload,
  decodeSessionCookie,
  encodeSessionCookie,
  getCookieSecurity
} from '@/lib/server/session-cookie';

function sanitizeSession(payload: SessionCookiePayload): PublicSession {
  return {
    expiresAt: payload.expiresAt,
    locale: payload.locale,
    tenantId: payload.tenantId
  };
}

export async function GET() {
  const cookie = cookies().get(SESSION_COOKIE_NAME);
  if (!cookie) {
    return NextResponse.json({ session: null });
  }

  const decoded = decodeSessionCookie(cookie.value);
  if (!decoded || decoded.expiresAt <= Date.now()) {
    const response = NextResponse.json({ session: null });
    response.cookies.delete(SESSION_COOKIE_NAME, { path: '/' });
    return response;
  }

  return NextResponse.json({ session: sanitizeSession(decoded) });
}

export async function POST(request: NextRequest) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch (error) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  const { accessToken, expiresAt, locale, tenantId } = payload as Partial<SessionCookiePayload>;
  if (
    typeof accessToken !== 'string' ||
    typeof expiresAt !== 'number' ||
    typeof locale !== 'string' ||
    typeof tenantId !== 'string'
  ) {
    return NextResponse.json({ error: 'Invalid session payload' }, { status: 400 });
  }

  const encoded = encodeSessionCookie({ accessToken, expiresAt, locale, tenantId });
  const response = NextResponse.json({ session: { expiresAt, locale, tenantId } satisfies PublicSession });
  response.cookies.set({
    ...getCookieSecurity(expiresAt),
    value: encoded
  });

  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ session: null });
  response.cookies.delete(SESSION_COOKIE_NAME, { path: '/' });
  return response;
}
