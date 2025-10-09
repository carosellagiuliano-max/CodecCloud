import { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';
import { Shell } from '@/components/layouts/shell';
import { AppLocale, routing } from '@/lib/i18n/config';
import { notFound } from 'next/navigation';

export default async function PortalLayout({
  children,
  params
}: {
  children: ReactNode;
  params: { locale: string };
}) {
  const locale = params.locale as AppLocale;
  if (!routing.locales.includes(locale)) {
    notFound();
  }
  const t = await getTranslations({ locale, namespace: 'navigation' });

  const navItems = [
    { href: `/${locale}/portal/dashboard`, label: t('dashboard') },
    { href: `/${locale}/portal/bookings`, label: t('bookings') }
  ];

  return <Shell navItems={navItems} title={t('portal')} logoutLabel={t('logout')}>{children}</Shell>;
}
