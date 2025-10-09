import { PropsWithChildren } from 'react';
import { createIntlProvider, AppLocale, routing, loadMessages } from '@/lib/i18n/config';
import { Providers } from '@/components/providers';
import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function LocaleLayout({ children, params }: PropsWithChildren<{ params: { locale: string } }>) {
  const locale = params.locale as AppLocale;
  if (!routing.locales.includes(locale)) {
    notFound();
  }

  const messages = await loadMessages(locale);

  return createIntlProvider({
    locale,
    messages,
    children: (
      <Providers>
        <div className="flex min-h-screen flex-col bg-gradient-to-b from-slate-50 via-white to-slate-100">
          {children}
        </div>
      </Providers>
    )
  });
}
