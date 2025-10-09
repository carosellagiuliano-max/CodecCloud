import { AppLocale, routing } from '@/lib/i18n/config';
import { notFound } from 'next/navigation';

export default function AuthCallbackPage({ params, searchParams }: { params: { locale: string }; searchParams: Record<string, string> }) {
  const locale = params.locale as AppLocale;
  if (!routing.locales.includes(locale)) {
    notFound();
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-6 py-12 text-center">
      <div className="max-w-md space-y-3 rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">CodecCloud</h1>
        <p className="text-sm text-slate-600">Wir verarbeiten deine Anmeldung…</p>
      </div>
    </div>
  );
}
