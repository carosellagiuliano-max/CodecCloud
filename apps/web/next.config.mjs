import withPWA from 'next-pwa';
import path from 'node:path';

const isProd = process.env.NODE_ENV === 'production';

const securityHeaders = [
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "connect-src 'self' https://api.codeccloud.local",
      "font-src 'self' data:",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'"
    ].join('; ')
  },
  {
    key: 'Referrer-Policy',
    value: 'strict-origin'
  },
  {
    key: 'X-Frame-Options',
    value: 'DENY'
  },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload'
  },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), payment=(self)'
  }
];

const withPWAConfig = withPWA({
  dest: 'public',
  disable: !isProd,
  register: true,
  skipWaiting: true,
  fallbacks: {
    document: '/offline',
    image: '/icons/icon.svg'
  }
});

const nextConfig = withPWAConfig({
  experimental: {
    reactCompiler: true,
    instrumentationHook: true
  },
  images: {
    formats: ['image/avif', 'image/webp']
  },
  poweredByHeader: false,
  reactStrictMode: true,
  webpack: (config) => {
    config.resolve.alias['~'] = path.join(process.cwd(), 'app');
    return config;
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: securityHeaders
      }
    ];
  }
});

export default nextConfig;
