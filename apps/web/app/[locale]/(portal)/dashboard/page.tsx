import { AppLocale, routing } from '@/lib/i18n/config';
import { notFound } from 'next/navigation';
import { PortalDashboard } from '@/components/portal/dashboard';

export default function PortalDashboardPage({ params }: { params: { locale: string } }) {
  const locale = params.locale as AppLocale;
  if (!routing.locales.includes(locale)) {
    notFound();
  }
  return <PortalDashboard locale={locale} />;
}
