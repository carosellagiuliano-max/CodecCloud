export type SessionCookiePayload = {
  accessToken: string;
  expiresAt: number;
  locale: string;
  tenantId: string;
};

export type PublicSession = Omit<SessionCookiePayload, 'accessToken'>;

export const SESSION_COOKIE_NAME = '__Host-cc-session';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function encodeSessionCookie(payload: SessionCookiePayload) {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

export function decodeSessionCookie(value: string): SessionCookiePayload | null {
  try {
    const decoded = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    if (!isRecord(decoded)) {
      return null;
    }

    const { accessToken, expiresAt, locale, tenantId } = decoded;
    if (
      typeof accessToken !== 'string' ||
      typeof expiresAt !== 'number' ||
      typeof locale !== 'string' ||
      typeof tenantId !== 'string'
    ) {
      return null;
    }

    return { accessToken, expiresAt, locale, tenantId };
  } catch (error) {
    console.warn('Failed to decode session cookie', error);
    return null;
  }
}

export function getCookieSecurity(expiresAt: number) {
  return {
    name: SESSION_COOKIE_NAME,
    httpOnly: true,
    sameSite: 'strict' as const,
    secure: process.env.NODE_ENV !== 'development',
    path: '/',
    expires: new Date(expiresAt)
  };
}
