'use client';

import { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSession } from '@/lib/auth';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiClient, Booking } from '@/lib/apiClient';
import { AppLocale } from '@/lib/i18n/config';
import { useUiStore } from '@/lib/store';
import { useTranslations } from 'next-intl';
import { DndProvider, useDrag, useDrop } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';

const HOURS = Array.from({ length: 10 }, (_, index) => 9 + index);
const ITEM_TYPE = 'booking-card';

type BookingDragItem = {
  id: string;
};

function formatTime(date: Date, locale: AppLocale) {
  return new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Europe/Zurich' }).format(
    date
  );
}

type SlotProps = {
  locale: AppLocale;
  dayOffset: number;
  hour: number;
  onDropBooking: (id: string, start: Date) => void;
  children?: ReactNode;
};

function Slot({ locale, dayOffset, hour, onDropBooking, children }: SlotProps) {
  const [, drop] = useDrop<BookingDragItem>(() => ({
    accept: ITEM_TYPE,
    drop: (item) => {
      const start = new Date();
      start.setHours(hour, 0, 0, 0);
      start.setDate(start.getDate() + dayOffset);
      onDropBooking(item.id, start);
    }
  }));
  const dropRef = useCallback(
    (node: HTMLDivElement | null) => {
      drop(node);
    },
    [drop]
  );

  return (
    <div
      ref={dropRef}
      className="relative flex min-h-[72px] flex-col rounded-xl border border-dashed border-slate-200 p-2 text-xs"
    >
      <span className="mb-1 text-[10px] uppercase tracking-wide text-slate-400">
        {new Intl.DateTimeFormat(locale, {
          weekday: 'short',
          timeZone: 'Europe/Zurich'
        }).format(new Date(Date.now() + dayOffset * 86400000))}{' '}
        {hour}:00
      </span>
      {children}
    </div>
  );
}

type CardProps = {
  booking: Booking;
  locale: AppLocale;
  onKeyboardMove: (id: string, direction: 'prev' | 'next') => void;
};

function BookingCard({ booking, locale, onKeyboardMove }: CardProps) {
  const [, drag] = useDrag(() => ({
    type: ITEM_TYPE,
    item: { id: booking.id }
  }));
  const dragRef = useCallback(
    (node: HTMLDivElement | null) => {
      drag(node);
    },
    [drag]
  );
  const start = new Date(booking.start);
  const end = new Date(booking.end);
  return (
    <div
      ref={dragRef}
      tabIndex={0}
      role="button"
      onKeyDown={(event) => {
        if (event.key === 'ArrowLeft') {
          event.preventDefault();
          onKeyboardMove(booking.id, 'prev');
        }
        if (event.key === 'ArrowRight') {
          event.preventDefault();
          onKeyboardMove(booking.id, 'next');
        }
      }}
      className="rounded-xl bg-brand-500/90 px-3 py-2 text-xs font-medium text-white shadow-soft focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
    >
      <span>{booking.customerName}</span>
      <span className="ml-2 opacity-80">
        {formatTime(start, locale)} – {formatTime(end, locale)}
      </span>
    </div>
  );
}

export function CalendarBoard({ locale }: { locale: AppLocale }) {
  const { session } = useSession();
  const t = useTranslations('calendar');
  const auth = useTranslations('auth');
  const pushNotification = useUiStore((state) => state.pushNotification);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const bookingsRef = useRef<Booking[]>([]);

  if (!session) {
    return (
      <p className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500">
        {auth('subtitle')}
      </p>
    );
  }

  const mutation = useMutation({
    mutationFn: ({ id, start, end }: { id: string; start: string; end: string }) =>
      apiClient.rescheduleBooking(id, { start, end }, locale),
    onMutate: async ({ id, start, end }) => {
      const previous = bookingsRef.current;
      setBookings((current) =>
        current.map((entry) => (entry.id === id ? { ...entry, start, end } : entry))
      );
      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) {
        setBookings(context.previous);
      }
      pushNotification({ message: t('conflict'), level: 'error' });
    },
    onSuccess: () => {
      pushNotification({ message: t('ariaLive'), level: 'success' });
    }
  });

  const { data } = useQuery({
    queryKey: ['calendar-initial', locale, session.tenantId],
    queryFn: () => apiClient.listBookings(locale)
  });

  useEffect(() => {
    if (data) {
      setBookings(data);
    }
  }, [data]);

  useEffect(() => {
    bookingsRef.current = bookings;
  }, [bookings]);

  const byDay = useMemo(() => {
    const now = new Date();
    return bookings.reduce<Record<number, Booking[]>>((acc, booking) => {
      const start = new Date(booking.start);
      const offset = Math.floor((start.getTime() - now.getTime()) / 86400000);
      if (!acc[offset]) acc[offset] = [];
      acc[offset].push(booking);
      return acc;
    }, {});
  }, [bookings]);

  const handleMove = (id: string, targetStart: Date) => {
    const booking = bookings.find((entry) => entry.id === id);
    if (!booking) return;
    const duration = new Date(booking.end).getTime() - new Date(booking.start).getTime();
    const newEnd = new Date(targetStart.getTime() + duration);
    mutation.mutate({ id, start: targetStart.toISOString(), end: newEnd.toISOString() });
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('calendar-announcement', { detail: t('move', { date: targetStart.toLocaleString(locale) }) })
      );
    }
  };

  return (
    <section className="space-y-4">
      <header>
        <h2 className="text-lg font-semibold text-slate-900">{t('title')}</h2>
        <p className="text-sm text-slate-500">{t('navigate')}</p>
      </header>
      <DndProvider backend={HTML5Backend}>
        <div className="grid gap-3 md:grid-cols-5">
          {Array.from({ length: 5 }, (_, dayOffset) => (
            <div key={dayOffset} className="space-y-2">
              {HOURS.map((hour) => {
                const slotBookings = byDay[dayOffset]?.filter((booking) => new Date(booking.start).getHours() === hour) ?? [];
                return (
                  <Slot key={`${dayOffset}-${hour}`} locale={locale} dayOffset={dayOffset} hour={hour} onDropBooking={handleMove}>
                    {slotBookings.map((booking) => (
                      <BookingCard
                        key={booking.id}
                        booking={booking}
                        locale={locale}
                        onKeyboardMove={(id, direction) => {
                          const target = new Date(booking.start);
                          target.setHours(target.getHours() + (direction === 'next' ? 1 : -1));
                          handleMove(id, target);
                        }}
                      />
                    ))}
                  </Slot>
                );
              })}
            </div>
          ))}
        </div>
      </DndProvider>
    </section>
  );
}
