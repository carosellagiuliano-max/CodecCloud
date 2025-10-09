import { AppLocale, routing } from '@/lib/i18n/config';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

export default async function OfflinePage({ params }: { params: { locale: string } }) {
  const locale = params.locale as AppLocale;
  if (!routing.locales.includes(locale)) {
    notFound();
  }
  const t = await getTranslations({ locale, namespace: 'pwa.offline' });

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6 py-12 text-center">
      <div className="max-w-md space-y-4 rounded-2xl border border-slate-200 bg-white p-8 shadow-soft">
        <h1 className="text-2xl font-semibold text-slate-900">{t('title')}</h1>
        <p className="text-sm text-slate-600">{t('description')}</p>
        <p className="text-sm font-medium text-amber-600">{t('bookingDisabled')}</p>
      </div>
    </main>
  );
}
