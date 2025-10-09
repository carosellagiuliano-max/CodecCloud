import { AppLocale, routing } from '@/lib/i18n/config';
import { notFound } from 'next/navigation';
import { SignInForm } from '@/components/auth/signin-form';

export default function SignInPage({ params }: { params: { locale: string } }) {
  const locale = params.locale as AppLocale;
  if (!routing.locales.includes(locale)) {
    notFound();
  }
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200 px-6 py-12">
      <SignInForm locale={locale} />
    </div>
  );
}
