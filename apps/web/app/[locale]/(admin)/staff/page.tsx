import { AppLocale, routing } from '@/lib/i18n/config';
import { notFound } from 'next/navigation';
import { AdminStaff } from '@/components/admin/staff';

export default function AdminStaffPage({ params }: { params: { locale: string } }) {
  const locale = params.locale as AppLocale;
  if (!routing.locales.includes(locale)) {
    notFound();
  }
  return <AdminStaff locale={locale} />;
}
