import './globals.css';
import { Metadata } from 'next';
import { routing } from '@/lib/i18n/config';
import { PropsWithChildren } from 'react';

export const metadata: Metadata = {
  metadataBase: new URL('https://app.codeccloud.local'),
  title: {
    default: 'CodecCloud Salon',
    template: '%s | CodecCloud Salon'
  },
  description:
    'CodecCloud Salon – Verwaltung für Terminbuchungen, Ressourcenplanung und Kundenerlebnisse für Salons in der Schweiz.',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'CodecCloud'
  }
};

export default function RootLayout({ children }: PropsWithChildren) {
  return (
    <html lang={routing.defaultLocale} data-theme="light" suppressHydrationWarning>
      <body className="min-h-screen bg-slate-50 text-slate-950 antialiased">{children}</body>
    </html>
  );
}
