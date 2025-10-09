import createMiddleware from 'next-intl/middleware';
import type { NextRequest } from 'next/server';
import { routing } from './lib/i18n/config';

const intlMiddleware = createMiddleware({
  locales: routing.locales,
  defaultLocale: routing.defaultLocale,
  localePrefix: 'always'
});

const securityHeaders: Record<string, string> = {
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(self)'
};

export default function middleware(request: NextRequest) {
  const response = intlMiddleware(request);

  const connectSources = new Set(["'self'"]);
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'https://api.codeccloud.local/v1';
  try {
    const { origin } = new URL(apiUrl);
    connectSources.add(origin);
  } catch (error) {
    console.warn('Invalid NEXT_PUBLIC_API_URL for CSP connect-src', error);
  }

  const csp = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    `connect-src ${Array.from(connectSources).join(' ')}`,
    "font-src 'self' data:",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'"
  ].join('; ');

  response.headers.set('Content-Security-Policy', csp);
  Object.entries(securityHeaders).forEach(([key, value]) => response.headers.set(key, value));

  return response;
}

export const config = {
  matcher: ['/((?!_next|.*\\..*|api).*)']
};
