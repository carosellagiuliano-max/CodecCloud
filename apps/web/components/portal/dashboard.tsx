'use client';

import { useSession } from '@/lib/auth';
import { useQuery } from '@tanstack/react-query';
import { apiClient, Booking } from '@/lib/apiClient';
import { AppLocale } from '@/lib/i18n/config';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';

export function PortalDashboard({ locale }: { locale: AppLocale }) {
  const { session } = useSession();
  const t = useTranslations('portal');
  const common = useTranslations('common');

  const bookingsQueryKey = useMemo(
    () => ['bookings', locale, session?.tenantId ?? null] as const,
    [locale, session?.tenantId]
  );

  const { data: bookings = [] } = useQuery({
    queryKey: bookingsQueryKey,
    queryFn: () => (session ? apiClient.listBookings(session.accessToken, locale) : [] as Booking[]),
    enabled: Boolean(session)
  });

  const stats = useMemo(() => {
    const upcoming = bookings.filter((booking) => new Date(booking.start) > new Date());
    const confirmed = bookings.filter((booking) => booking.status === 'confirmed');
    const cancelled = bookings.filter((booking) => booking.status === 'cancelled');
    return {
      upcoming: upcoming.length,
      confirmed: confirmed.length,
      cancelled: cancelled.length
    };
  }, [bookings]);

  return (
    <section className="grid gap-6 md:grid-cols-3">
      <article className="rounded-2xl border border-brand-100 bg-brand-50 p-6 shadow-sm">
        <p className="text-sm font-medium text-brand-600">{t('upcoming')}</p>
        <p className="mt-3 text-3xl font-semibold text-brand-800">{stats.upcoming}</p>
        <p className="mt-1 text-xs text-brand-700">{t('upcoming')}</p>
      </article>
      <article className="rounded-2xl border border-emerald-100 bg-emerald-50 p-6 shadow-sm">
        <p className="text-sm font-medium text-emerald-600">{common('statuses.confirmed')}</p>
        <p className="mt-3 text-3xl font-semibold text-emerald-700">{stats.confirmed}</p>
        <p className="mt-1 text-xs text-emerald-600">{t('history')}</p>
      </article>
      <article className="rounded-2xl border border-amber-100 bg-amber-50 p-6 shadow-sm">
        <p className="text-sm font-medium text-amber-600">{common('statuses.cancelled')}</p>
        <p className="mt-3 text-3xl font-semibold text-amber-700">{stats.cancelled}</p>
        <p className="mt-1 text-xs text-amber-600">{t('history')}</p>
      </article>
    </section>
  );
}
