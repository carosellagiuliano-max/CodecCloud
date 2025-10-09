import { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';
import { Shell } from '@/components/layouts/shell';
import { AppLocale, routing } from '@/lib/i18n/config';
import { notFound } from 'next/navigation';

export default async function AdminLayout({
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
    { href: `/${locale}/admin/dashboard`, label: t('dashboard') },
    { href: `/${locale}/admin/staff`, label: t('team') }
  ];

  return <Shell navItems={navItems} title={t('admin')} logoutLabel={t('logout')}>{children}</Shell>;
}
