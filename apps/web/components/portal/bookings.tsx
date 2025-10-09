'use client';

import { useMemo, useState, useEffect } from 'react';
import { useSession } from '@/lib/auth';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient, Booking } from '@/lib/apiClient';
import { useTranslations } from 'next-intl';
import { AppLocale } from '@/lib/i18n/config';
import { useUiStore } from '@/lib/store';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';

const rescheduleSchema = z.object({
  start: z.string(),
  end: z.string()
});

type RescheduleFormValues = z.infer<typeof rescheduleSchema>;

const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogContent = DialogPrimitive.Content;
const DialogTitle = DialogPrimitive.Title;
const DialogPortal = DialogPrimitive.Portal;
const DialogOverlay = DialogPrimitive.Overlay;

function useBookings(locale: AppLocale) {
  const { session } = useSession();
  const query = useQuery({
    queryKey: ['bookings', locale],
    queryFn: () => {
      if (!session) {
        return [] as Booking[];
      }
      return apiClient.listBookings(session.accessToken, locale);
    },
    enabled: Boolean(session)
  });

  return query;
}

export function PortalBookings({ locale }: { locale: AppLocale }) {
  const t = useTranslations('portal');
  const common = useTranslations('common');
  const notifications = useTranslations('notifications');
  const { session } = useSession();
  const { data: bookings = [] } = useBookings(locale);
  const queryClient = useQueryClient();
  const pushNotification = useUiStore((state) => state.pushNotification);
  const connectivity = useUiStore((state) => state.connectivity);
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const isAuthenticated = Boolean(session);

  const optimisticUpdate = (id: string, updater: (booking: Booking) => Booking) => {
    queryClient.setQueryData<Booking[]>(['bookings', locale], (previous = []) =>
      previous.map((booking) => (booking.id === id ? updater(booking) : booking))
    );
  };

  const cancelMutation = useMutation({
    mutationFn: (booking: Booking) => {
      if (!session) throw new Error('unauthenticated');
      return apiClient.cancelBooking(booking.id, locale, session.accessToken);
    },
    onMutate: async (booking) => {
      await queryClient.cancelQueries({ queryKey: ['bookings', locale] });
      const snapshot = queryClient.getQueryData<Booking[]>(['bookings', locale]);
      optimisticUpdate(booking.id, (current) => ({ ...current, status: 'cancelled' }));
      pushNotification({ message: notifications('optimistic'), level: 'info' });
      return { snapshot };
    },
    onError: (error, _booking, context) => {
      if (context?.snapshot) {
        queryClient.setQueryData(['bookings', locale], context.snapshot);
      }
      const isConflict = (error as Error & { problem?: { status?: number } }).problem?.status === 409;
      pushNotification({
        message: isConflict ? notifications('conflict') : common('error'),
        level: 'error'
      });
    },
    onSuccess: () => {
      pushNotification({ message: common('success'), level: 'success' });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['bookings', locale] });
    }
  });

  const rescheduleMutation = useMutation({
    mutationFn: ({ booking, values }: { booking: Booking; values: RescheduleFormValues }) => {
      if (!session) throw new Error('unauthenticated');
      return apiClient.rescheduleBooking(booking.id, values, locale, session.accessToken);
    },
    onMutate: async ({ booking, values }) => {
      await queryClient.cancelQueries({ queryKey: ['bookings', locale] });
      const snapshot = queryClient.getQueryData<Booking[]>(['bookings', locale]);
      optimisticUpdate(booking.id, (current) => ({ ...current, start: values.start, end: values.end }));
      pushNotification({ message: notifications('optimistic'), level: 'info' });
      return { snapshot };
    },
    onError: (error, _variables, context) => {
      if (context?.snapshot) {
        queryClient.setQueryData(['bookings', locale], context.snapshot);
      }
      const isConflict = (error as Error & { problem?: { status?: number } }).problem?.status === 409;
      pushNotification({
        message: isConflict ? notifications('conflict') : common('error'),
        level: 'error'
      });
    },
    onSuccess: () => {
      pushNotification({ message: common('success'), level: 'success' });
      setSelectedBooking(null);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['bookings', locale] });
    }
  });

  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        timeZone: 'Europe/Zurich',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      }),
    [locale]
  );

  const upcoming = useMemo(
    () => bookings.filter((booking) => booking.status !== 'cancelled' && new Date(booking.start) > new Date()),
    [bookings]
  );
  const history = useMemo(() => bookings.filter((booking) => new Date(booking.start) <= new Date()), [bookings]);

  const form = useForm<RescheduleFormValues>({
    resolver: zodResolver(rescheduleSchema),
    defaultValues: { start: '', end: '' }
  });

  const resetForm = (booking: Booking | null) => {
    setSelectedBooking(booking);
    if (booking) {
      form.reset({ start: booking.start.slice(0, 16), end: booking.end.slice(0, 16) });
    }
  };

  useEffect(() => {
    if (!selectedBooking) {
      form.reset({ start: '', end: '' });
    }
  }, [selectedBooking, form]);

  return (
    <div className="space-y-10">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold text-slate-900">{t('upcoming')}</h2>
        {upcoming.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">{t('empty')}</p>
        ) : (
          <table className="mt-4 w-full table-fixed border-collapse text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="pb-2">{t('title')}</th>
                <th className="pb-2">{t('reschedule')}</th>
                <th className="pb-2">{t('cancel')}</th>
              </tr>
            </thead>
            <tbody>
              {upcoming.map((booking) => (
                <tr key={booking.id} className="border-t border-slate-100">
                  <td className="py-3">
                    <div className="font-medium text-slate-900">{booking.serviceId}</div>
                    <div className="text-xs text-slate-500">
                      {dateFormatter.format(new Date(booking.start))} · {booking.staffId}
                    </div>
                  </td>
                  <td className="py-3">
                    <Dialog open={selectedBooking?.id === booking.id} onOpenChange={(open) => (open ? resetForm(booking) : resetForm(null))}>
                      <DialogTrigger asChild>
                        <button
                          type="button"
                          disabled={connectivity === 'offline' || !isAuthenticated}
                          className="rounded-full border border-brand-200 px-3 py-1 text-xs font-medium text-brand-700 transition hover:border-brand-500 hover:text-brand-800 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-300"
                        >
                          {t('reschedule')}
                        </button>
                      </DialogTrigger>
                      <DialogPortal>
                        <DialogOverlay className="fixed inset-0 z-40 bg-black/40" />
                        <DialogContent className="fixed inset-0 z-50 flex items-center justify-center p-4">
                          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
                            <DialogTitle className="text-lg font-semibold text-slate-900">{t('reschedule')}</DialogTitle>
                            <form
                              className="mt-4 space-y-4"
                              onSubmit={form.handleSubmit((values) => rescheduleMutation.mutate({ booking, values }))}
                            >
                              <label className="block text-sm font-medium text-slate-700">
                                Start
                                <input
                                  type="datetime-local"
                                  className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                                  {...form.register('start')}
                                />
                              </label>
                              <label className="block text-sm font-medium text-slate-700">
                                Ende
                                <input
                                  type="datetime-local"
                                  className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                                  {...form.register('end')}
                                />
                              </label>
                              <div className="flex justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={() => resetForm(null)}
                                  className="rounded-full px-4 py-2 text-sm font-medium text-slate-500 hover:text-slate-700"
                                >
                                  {common('actions.cancel')}
                                </button>
                                <button
                                  type="submit"
                                disabled={rescheduleMutation.isPending}
                                  className="rounded-full bg-brand-500 px-4 py-2 text-sm font-medium text-white shadow-soft transition hover:bg-brand-600 disabled:cursor-progress"
                                >
                                  {common('actions.save')}
                                </button>
                              </div>
                            </form>
                          </div>
                        </DialogContent>
                      </DialogPortal>
                    </Dialog>
                  </td>
                  <td className="py-3">
                    <button
                      type="button"
                      disabled={connectivity === 'offline' || !isAuthenticated}
                      onClick={() => cancelMutation.mutate(booking)}
                      className="rounded-full border border-slate-200 px-3 py-1 text-xs font-medium text-slate-500 transition hover:border-red-300 hover:text-red-600 disabled:cursor-not-allowed disabled:text-slate-300"
                    >
                      {t('cancel')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-semibold text-slate-900">{t('history')}</h2>
        {history.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">{t('empty')}</p>
        ) : (
          <ul className="mt-4 space-y-3 text-sm text-slate-600">
            {history.map((booking) => (
              <li key={booking.id} className="flex items-center justify-between rounded-xl border border-slate-100 px-4 py-3">
                <span>
                  {dateFormatter.format(new Date(booking.start))} · {booking.serviceId}
                </span>
                <span className="text-xs uppercase tracking-wide text-slate-400">{common(`statuses.${booking.status}`)}</span>
              </li>
            ))}
          </ul>
        )}
        {(!isAuthenticated || connectivity === 'offline') && (
          <p className="mt-6 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-700">{t('offlineNotice')}</p>
        )}
      </div>
    </div>
  );
}
