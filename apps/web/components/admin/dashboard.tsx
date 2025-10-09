'use client';

import { useSession } from '@/lib/auth';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { AppLocale } from '@/lib/i18n/config';
import { useTranslations } from 'next-intl';
import { motion } from 'framer-motion';
import { CalendarBoard } from '@/components/calendar/board';

export function AdminDashboard({ locale }: { locale: AppLocale }) {
  const { session } = useSession();
  const t = useTranslations('admin.dashboard');

  const { data } = useQuery({
    queryKey: ['admin-dashboard', locale, session?.tenantId ?? null],
    queryFn: () => (session ? apiClient.getDashboardMetrics(locale) : undefined),
    enabled: Boolean(session)
  });

  return (
    <section className="space-y-8">
      <div className="grid gap-6 md:grid-cols-3">
        <motion.article
          layout
          className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
        >
          <p className="text-sm font-medium text-slate-500">{t('kpiRevenue')}</p>
          <p className="mt-3 text-3xl font-semibold text-slate-900">
            {data ? new Intl.NumberFormat(locale, { style: 'currency', currency: 'CHF' }).format(data.revenueCents / 100) : '–'}
          </p>
        </motion.article>
        <motion.article
          layout
          className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <p className="text-sm font-medium text-slate-500">{t('kpiUtilization')}</p>
          <p className="mt-3 text-3xl font-semibold text-slate-900">{data ? `${Math.round(data.utilisation * 100)}%` : '–'}</p>
        </motion.article>
        <motion.article
          layout
          className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
        >
          <p className="text-sm font-medium text-slate-500">{t('kpiSatisfaction')}</p>
          <p className="mt-3 text-3xl font-semibold text-slate-900">{data ? `${Math.round(data.satisfaction * 100)}%` : '–'}</p>
          <p className="mt-1 text-xs text-emerald-600">{t('realtime')}</p>
        </motion.article>
      </div>
      <CalendarBoard locale={locale} />
    </section>
  );
}
