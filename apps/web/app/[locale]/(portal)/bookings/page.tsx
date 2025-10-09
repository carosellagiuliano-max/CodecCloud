import { AppLocale, routing } from '@/lib/i18n/config';
import { notFound } from 'next/navigation';
import { PortalBookings } from '@/components/portal/bookings';

export default function BookingsPage({ params }: { params: { locale: string } }) {
  const locale = params.locale as AppLocale;
  if (!routing.locales.includes(locale)) {
    notFound();
  }

  return <PortalBookings locale={locale} />;
}
