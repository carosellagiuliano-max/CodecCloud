'use client';

import { useSession } from '@/lib/auth';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient, StaffMember } from '@/lib/apiClient';
import { AppLocale } from '@/lib/i18n/config';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useUiStore } from '@/lib/store';

const inviteSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  role: z.string().min(2)
});

type InviteFormValues = z.infer<typeof inviteSchema>;

export function AdminStaff({ locale }: { locale: AppLocale }) {
  const { session } = useSession();
  const t = useTranslations('admin.staff');
  const common = useTranslations('common');
  const queryClient = useQueryClient();
  const pushNotification = useUiStore((state) => state.pushNotification);
  const connectivity = useUiStore((state) => state.connectivity);

  const { data: staff = [] } = useQuery({
    queryKey: ['staff', locale],
    queryFn: () => (session ? apiClient.listStaff(session.accessToken, locale) : [] as StaffMember[]),
    enabled: Boolean(session)
  });
  const isAuthenticated = Boolean(session);

  const form = useForm<InviteFormValues>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { name: '', email: '', role: '' }
  });

  const inviteMutation = useMutation({
    mutationFn: (values: InviteFormValues) => {
      if (!session) {
        throw new Error('unauthenticated');
      }
      return apiClient.inviteStaff(values, session.accessToken, locale);
    },
    onMutate: async (values) => {
      await queryClient.cancelQueries({ queryKey: ['staff', locale] });
      const snapshot = queryClient.getQueryData<StaffMember[]>(['staff', locale]);
      if (snapshot) {
        queryClient.setQueryData<StaffMember[]>(['staff', locale], [
          ...snapshot,
          {
            id: `temp-${Date.now()}`,
            name: values.name,
            email: values.email,
            role: values.role,
            avatarUrl: undefined,
            locale,
            workingHours: []
          }
        ]);
      }
      pushNotification({ message: common('loading'), level: 'info' });
      return { snapshot };
    },
    onError: (_error, _values, context) => {
      if (context?.snapshot) {
        queryClient.setQueryData(['staff', locale], context.snapshot);
      }
      pushNotification({ message: common('error'), level: 'error' });
    },
    onSuccess: () => {
      pushNotification({ message: common('success'), level: 'success' });
      form.reset();
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['staff', locale] });
    }
  });

  return (
    <div className="space-y-8">
      <form
        className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
        onSubmit={form.handleSubmit((values) => inviteMutation.mutate(values))}
      >
        <h2 className="text-xl font-semibold text-slate-900">{t('new.title')}</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <label className="text-sm font-medium text-slate-700">
            {t('new.name')}
            <input
              type="text"
              {...form.register('name')}
              className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
          </label>
          <label className="text-sm font-medium text-slate-700">
            {t('new.email')}
            <input
              type="email"
              {...form.register('email')}
              className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
          </label>
          <label className="text-sm font-medium text-slate-700">
            {t('new.role')}
            <input
              type="text"
              {...form.register('role')}
              className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
          </label>
        </div>
        <div className="mt-6 flex justify-end">
          <button
            type="submit"
            disabled={inviteMutation.isPending || connectivity === 'offline' || !isAuthenticated}
            className="rounded-full bg-brand-500 px-5 py-2 text-sm font-medium text-white shadow-soft transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {t('new.submit')}
          </button>
        </div>
      </form>
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold text-slate-900">{t('title')}</h2>
        <table className="mt-4 w-full table-fixed border-collapse text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-slate-400">
              <th className="pb-2">{t('new.name')}</th>
              <th className="pb-2">{t('role')}</th>
              <th className="pb-2">{t('availability')}</th>
            </tr>
          </thead>
          <tbody>
            {staff.map((member) => (
              <tr key={member.id} className="border-t border-slate-100">
                <td className="py-3">
                  <div className="font-medium text-slate-900">{member.name}</div>
                  <div className="text-xs text-slate-500">{member.email}</div>
                </td>
                <td className="py-3 text-slate-600">{member.role}</td>
                <td className="py-3 text-xs text-slate-500">
                  {member.workingHours.length === 0
                    ? '—'
                    : member.workingHours
                        .map((slot) => `${slot.day}: ${slot.start}–${slot.end}`)
                        .join(', ')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
