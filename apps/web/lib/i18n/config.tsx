import { getRequestConfig, unstable_setRequestLocale } from 'next-intl/server';
import { NextIntlClientProvider, IntlErrorCode, type IntlError, type AbstractIntlMessages } from 'next-intl';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';

export const routing = {
  locales: ['de-CH', 'fr-CH', 'it-CH', 'en-CH'] as const,
  defaultLocale: 'de-CH' as const
};

export type AppLocale = (typeof routing.locales)[number];

export const timeZone = 'Europe/Zurich';

export async function loadMessages(locale: AppLocale): Promise<AbstractIntlMessages> {
  try {
    const messages = (await import(`../../messages/${locale}.json`)).default;
    return messages as AbstractIntlMessages;
  } catch (error) {
    console.error('Failed to load i18n messages', error);
    throw error;
  }
}

export const getLocaleConfig = getRequestConfig(async ({ locale }) => {
  if (!locale || !routing.locales.includes(locale as AppLocale)) {
    notFound();
  }

  const messages = await loadMessages(locale as AppLocale);
  return {
    messages,
    timeZone,
    now: new Date()
  };
});

export function createIntlProvider({
  locale,
  messages,
  children
}: {
  locale: AppLocale;
  messages: AbstractIntlMessages;
  children: ReactNode;
}) {
  unstable_setRequestLocale(locale);
  return (
    <NextIntlClientProvider locale={locale} messages={messages} timeZone={timeZone} onError={(err: IntlError) => {
      if (err.code === IntlErrorCode.MISSING_MESSAGE) {
        console.error('Missing translation', err);
      } else {
        console.warn('Intl runtime error', err);
      }
    }}>
      {children}
    </NextIntlClientProvider>
  );
}
