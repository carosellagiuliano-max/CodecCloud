import { AppLocale, routing } from '@/lib/i18n/config';
import { notFound } from 'next/navigation';
import { AdminDashboard } from '@/components/admin/dashboard';

export default function AdminDashboardPage({ params }: { params: { locale: string } }) {
  const locale = params.locale as AppLocale;
  if (!routing.locales.includes(locale)) {
    notFound();
  }
  return <AdminDashboard locale={locale} />;
}
