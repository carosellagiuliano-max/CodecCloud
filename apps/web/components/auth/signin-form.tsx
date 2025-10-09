'use client';

import { useSession } from '@/lib/auth';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { useUiStore } from '@/lib/store';

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(8)
});

type SignInValues = z.infer<typeof schema>;

export function SignInForm({ locale }: { locale: string }) {
  const { hydrateSession } = useSession();
  const t = useTranslations('auth');
  const common = useTranslations('common');
  const pushNotification = useUiStore((state) => state.pushNotification);
  const form = useForm<SignInValues>({ resolver: zodResolver(schema), defaultValues: { email: '', password: '' } });

  async function handleSubmit(values: SignInValues) {
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? 'https://api.codeccloud.local/v1'}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept-Language': locale,
          'Idempotency-Key': crypto.randomUUID()
        },
        body: JSON.stringify(values)
      });
      if (!response.ok) {
        pushNotification({ message: t('error'), level: 'error' });
        return;
      }
      const payload = await response.json();
      hydrateSession({
        accessToken: payload.accessToken,
        expiresAt: Date.now() + payload.expiresIn * 1000,
        locale,
        tenantId: payload.tenantId
      });
      pushNotification({ message: t('success'), level: 'success' });
    } catch (error) {
      pushNotification({ message: common('error'), level: 'error' });
    }
  }

  return (
    <form
      onSubmit={form.handleSubmit(handleSubmit)}
      className="mx-auto max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-soft"
    >
      <div className="space-y-2 text-center">
        <h1 className="text-2xl font-semibold text-slate-900">{t('title')}</h1>
        <p className="text-sm text-slate-500">{t('subtitle')}</p>
      </div>
      <div className="mt-6 space-y-4">
        <label className="block text-sm font-medium text-slate-700">
          {t('email')}
          <input
            type="email"
            {...form.register('email')}
            className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            autoComplete="email"
          />
        </label>
        <label className="block text-sm font-medium text-slate-700">
          {t('password')}
          <input
            type="password"
            {...form.register('password')}
            className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            autoComplete="current-password"
          />
        </label>
      </div>
      <button
        type="submit"
        className="mt-6 w-full rounded-full bg-brand-500 px-4 py-2 text-sm font-medium text-white shadow-soft transition hover:bg-brand-600"
      >
        {t('submit')}
      </button>
    </form>
  );
}
