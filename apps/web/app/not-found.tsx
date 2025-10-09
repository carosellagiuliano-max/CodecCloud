'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';

export default function NotFound() {
  const t = useTranslations('common');
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-white px-6 text-center">
      <div className="max-w-xl space-y-4">
        <h1 className="text-3xl font-semibold text-slate-900">404</h1>
        <p className="text-lg text-slate-600">{t('error')}</p>
        <Link
          href="/"
          className="inline-flex items-center rounded-full bg-brand-500 px-6 py-3 text-white shadow-soft transition hover:bg-brand-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
        >
          {t('navigation.home')}
        </Link>
      </div>
    </main>
  );
}
