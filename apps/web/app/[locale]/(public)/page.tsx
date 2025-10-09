import Link from 'next/link';
import { apiClient } from '@/lib/apiClient';
import { AppLocale, routing } from '@/lib/i18n/config';
import { notFound } from 'next/navigation';
import { formatDuration, intervalToDuration } from 'date-fns';
import { getTranslations } from 'next-intl/server';

function formatPrice(value: number, locale: AppLocale, currency: string) {
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(value / 100);
}

export default async function PublicPage({ params }: { params: { locale: string } }) {
  const locale = params.locale as AppLocale;
  if (!routing.locales.includes(locale)) {
    notFound();
  }

  const [services, tPublic, tNav] = await Promise.all([
    apiClient.listServices(locale),
    getTranslations({ locale, namespace: 'public' }),
    getTranslations({ locale, namespace: 'navigation' })
  ]);

  return (
    <main className="flex-1">
      <section className="mx-auto flex max-w-6xl flex-col gap-12 px-6 py-16 text-slate-900">
        <div className="grid gap-10 md:grid-cols-[1.1fr,0.9fr]">
          <div className="space-y-6">
            <h1 className="text-4xl font-semibold leading-tight">{tPublic('heroTitle')}</h1>
            <p className="text-lg text-slate-600">{tPublic('heroSubtitle')}</p>
            <div className="flex gap-4">
              <Link
                href={`/${locale}/portal/bookings`}
                className="inline-flex items-center rounded-full bg-brand-500 px-6 py-3 text-white shadow-soft transition hover:bg-brand-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
              >
                {tNav('book')}
              </Link>
              <Link
                href={`/${locale}/auth/signin`}
                className="inline-flex items-center rounded-full border border-slate-300 px-6 py-3 text-slate-700 transition hover:border-brand-500 hover:text-brand-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
              >
                {tNav('signin')}
              </Link>
            </div>
          </div>
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 p-8 text-white shadow-soft">
            <p className="text-sm uppercase tracking-wide opacity-75">CodecCloud</p>
            <p className="mt-4 text-2xl font-semibold">{tNav('portal')}</p>
            <p className="mt-2 text-base opacity-80">{tPublic('heroSubtitle')}</p>
          </div>
        </div>
        <div className="space-y-6">
          <h2 className="text-2xl font-semibold">{tPublic('services.title')}</h2>
          <p className="text-sm text-slate-600">{tPublic('services.description')}</p>
          <div className="grid gap-6 md:grid-cols-2">
            {services.map((service) => (
              <article key={service.id} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex items-start justify-between">
                  <h3 className="text-xl font-semibold">{service.name}</h3>
                  <span className="rounded-full bg-brand-100 px-4 py-1 text-sm font-medium text-brand-700">
                    {tPublic('services.from')} {formatPrice(service.priceCents, locale, service.currency)}
                  </span>
                </div>
                <p className="mt-2 text-sm text-slate-600">{service.description}</p>
                <p className="mt-4 text-xs uppercase tracking-wide text-slate-400">
                  {formatDuration(intervalToDuration({ start: 0, end: service.durationMinutes * 60 * 1000 }))}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
