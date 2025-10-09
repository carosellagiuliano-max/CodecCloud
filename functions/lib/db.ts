import { randomUUID } from 'node:crypto';
import { ConflictError, BadRequestError } from './errors';
import type { Booking } from '../../packages/types/contracts';

export type BookingRecord = Booking & {
  version: number;
  notes?: string;
};

export type OutboxEventStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface OutboxEvent<T = unknown> {
  id: string;
  tenantId: string;
  eventType: string;
  payload: T;
  status: OutboxEventStatus;
  attempts: number;
  nextRunAt: number;
  lockedAt: number | null;
  lastError?: string;
  createdAt: number;
  updatedAt: number;
}

export interface InvoiceRecord {
  id: string;
  tenantId: string;
  bookingId: string;
  issueDate: string;
  dueDate: string;
  language: string;
  pdfUrl: string;
  total: Booking['price'];
  createdAt: number;
}

export interface PaymentEventRecord {
  provider: 'stripe' | 'sumup';
  providerEventId: string;
  tenantId: string;
  sequence?: number;
  payload: unknown;
  receivedAt: number;
}

interface DatabaseState {
  bookings: Map<string, BookingRecord>;
  outbox: Map<string, OutboxEvent>;
  invoices: Map<string, InvoiceRecord>;
  paymentEvents: Map<string, PaymentEventRecord>;
}

export interface BookingSlotInput {
  serviceId: string;
  staffId: string;
  slotStart: string;
  slotEnd: string;
}

export interface BookingCreateInput extends BookingSlotInput {
  tenantId: string;
  price: Booking['price'];
  customer: Booking['customer'];
  notes?: string;
}

export interface BookingRescheduleInput {
  bookingId: string;
  slotStart: string;
  slotEnd: string;
  reason?: string;
}

export interface BookingCancelInput {
  bookingId: string;
  reason?: string;
  waiveFee?: boolean;
}

const toTimestamp = (value: string) => new Date(value).getTime();

const assertValidRange = (start: string, end: string) => {
  if (toTimestamp(end) <= toTimestamp(start)) {
    throw new BadRequestError('slotEnd must be after slotStart.');
  }
};

const overlaps = (aStart: string, aEnd: string, bStart: string, bEnd: string) => {
  return toTimestamp(aStart) < toTimestamp(bEnd) && toTimestamp(bStart) < toTimestamp(aEnd);
};

const generateIcs = (bookings: BookingRecord[]): string => {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//CodecCloud//Salon//DE'
  ];

  for (const booking of bookings) {
    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${booking.id}@codeccloud`);
    lines.push(`DTSTAMP:${new Date(booking.createdAt).toISOString().replace(/[-:]/g, '').split('.')[0]}Z`);
    lines.push(`DTSTART:${new Date(booking.slotStart).toISOString().replace(/[-:]/g, '').split('.')[0]}Z`);
    lines.push(`DTEND:${new Date(booking.slotEnd).toISOString().replace(/[-:]/g, '').split('.')[0]}Z`);
    lines.push(`SUMMARY:Booking ${booking.id}`);
    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
};

class DatabaseTransaction {
  public readonly outboxEvents: OutboxEvent[] = [];

  constructor(private readonly state: DatabaseState, private readonly tenantId: string) {}

  private ensureTenantBooking(bookingId: string): BookingRecord {
    const booking = this.state.bookings.get(bookingId);
    if (!booking || booking.tenantId !== this.tenantId) {
      throw new BadRequestError('Booking not found for tenant.');
    }
    return booking;
  }

  getBookingCopy(bookingId: string): BookingRecord {
    const booking = this.ensureTenantBooking(bookingId);
    return structuredClone(booking);
  }

  private ensureSlotAvailability(input: BookingSlotInput, ignoreBookingId?: string) {
    for (const booking of this.state.bookings.values()) {
      if (booking.tenantId !== this.tenantId) continue;
      if (booking.status === 'cancelled') continue;
      if (ignoreBookingId && booking.id === ignoreBookingId) continue;
      if (booking.staffId !== input.staffId) continue;
      if (overlaps(input.slotStart, input.slotEnd, booking.slotStart, booking.slotEnd)) {
        throw new ConflictError('Requested slot overlaps with an existing booking.');
      }
    }
  }

  createBooking(input: BookingCreateInput): { booking: BookingRecord; outboxEvent: OutboxEvent } {
    assertValidRange(input.slotStart, input.slotEnd);
    this.ensureSlotAvailability(input);

    const nowIso = new Date().toISOString();
    const booking: BookingRecord = {
      id: randomUUID(),
      tenantId: input.tenantId,
      serviceId: input.serviceId,
      staffId: input.staffId,
      customer: input.customer,
      slotStart: input.slotStart,
      slotEnd: input.slotEnd,
      status: 'scheduled',
      price: input.price,
      createdAt: nowIso,
      updatedAt: nowIso,
      rescheduledFromId: null,
      cancellationReason: null,
      version: 1,
      notes: input.notes
    };

    this.state.bookings.set(booking.id, booking);

    const event = this.enqueueOutbox('booking.created', {
      bookingId: booking.id,
      tenantId: booking.tenantId,
      status: booking.status,
      occurredAt: nowIso
    });

    return { booking, outboxEvent: event };
  }

  rescheduleBooking(input: BookingRescheduleInput): { booking: BookingRecord; outboxEvent: OutboxEvent } {
    assertValidRange(input.slotStart, input.slotEnd);
    const booking = this.ensureTenantBooking(input.bookingId);
    if (booking.status === 'cancelled') {
      throw new ConflictError('Cannot reschedule a cancelled booking.');
    }

    this.ensureSlotAvailability(
      {
        serviceId: booking.serviceId,
        staffId: booking.staffId,
        slotStart: input.slotStart,
        slotEnd: input.slotEnd
      },
      booking.id
    );

    const nowIso = new Date().toISOString();
    booking.rescheduledFromId = booking.id;
    booking.slotStart = input.slotStart;
    booking.slotEnd = input.slotEnd;
    booking.status = 'rescheduled';
    booking.updatedAt = nowIso;
    booking.version += 1;

    const event = this.enqueueOutbox('booking.rescheduled', {
      bookingId: booking.id,
      tenantId: booking.tenantId,
      status: booking.status,
      occurredAt: nowIso,
      reason: input.reason ?? null
    });

    return { booking, outboxEvent: event };
  }

  cancelBooking(input: BookingCancelInput): { booking: BookingRecord; outboxEvent: OutboxEvent } {
    const booking = this.ensureTenantBooking(input.bookingId);
    if (booking.status === 'cancelled') {
      throw new ConflictError('Booking already cancelled.');
    }

    const nowIso = new Date().toISOString();
    booking.status = 'cancelled';
    booking.cancellationReason = input.reason ?? null;
    booking.updatedAt = nowIso;
    booking.version += 1;

    const event = this.enqueueOutbox('booking.cancelled', {
      bookingId: booking.id,
      tenantId: booking.tenantId,
      status: booking.status,
      occurredAt: nowIso,
      waiveFee: input.waiveFee ?? false,
      reason: input.reason ?? null
    });

    return { booking, outboxEvent: event };
  }

  getAvailability({
    serviceId,
    staffId,
    from,
    to,
    granularityMinutes
  }: {
    serviceId: string;
    staffId?: string;
    from: string;
    to: string;
    granularityMinutes: number;
  }): Array<{ slotStart: string; slotEnd: string; serviceId: string; staffId: string }> {
    assertValidRange(from, to);
    const slots: Array<{ slotStart: string; slotEnd: string; serviceId: string; staffId: string }> = [];
    const start = toTimestamp(from);
    const end = toTimestamp(to);
    const step = granularityMinutes * 60 * 1000;

    for (let ts = start; ts + step <= end; ts += step) {
      const slotStart = new Date(ts).toISOString();
      const slotEnd = new Date(ts + step).toISOString();

      let staffToCheck = staffId;
      if (!staffToCheck) {
        const staffBookings = Array.from(this.state.bookings.values()).find(
          (booking) => booking.tenantId === this.tenantId && booking.serviceId === serviceId
        );
        staffToCheck = staffBookings?.staffId ?? staffId ?? '00000000-0000-0000-0000-000000000010';
      }

      let overlapping = false;
      for (const booking of this.state.bookings.values()) {
        if (booking.tenantId !== this.tenantId) continue;
        if (booking.serviceId !== serviceId) continue;
        if (staffToCheck && booking.staffId !== staffToCheck) continue;
        if (booking.status === 'cancelled') continue;
        if (overlaps(slotStart, slotEnd, booking.slotStart, booking.slotEnd)) {
          overlapping = true;
          break;
        }
      }

      if (!overlapping && staffToCheck) {
        slots.push({ slotStart, slotEnd, serviceId, staffId: staffToCheck });
      }
    }

    return slots;
  }

  enqueueOutbox(eventType: string, payload: unknown): OutboxEvent {
    const event: OutboxEvent = {
      id: randomUUID(),
      tenantId: this.tenantId,
      eventType,
      payload,
      status: 'pending',
      attempts: 0,
      nextRunAt: Date.now(),
      lockedAt: null,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    this.state.outbox.set(event.id, event);
    this.outboxEvents.push(event);
    return event;
  }

  recordPaymentEvent(event: PaymentEventRecord): { record: PaymentEventRecord; stored: boolean } {
    const key = `${event.provider}:${event.providerEventId}`;
    const existing = this.state.paymentEvents.get(key);

    if (existing) {
      if (
        event.sequence !== undefined &&
        existing.sequence !== undefined &&
        event.sequence > existing.sequence
      ) {
        this.state.paymentEvents.set(key, event);
        return { record: event, stored: true };
      }
      return { record: existing, stored: false };
    }

    this.state.paymentEvents.set(key, event);
    return { record: event, stored: true };
  }

  createInvoice(record: InvoiceRecord): InvoiceRecord {
    if (this.state.invoices.has(record.id)) {
      throw new ConflictError('Invoice already exists.');
    }
    this.state.invoices.set(record.id, record);
    return record;
  }

  listUpcomingBookings(from: string, to: string): BookingRecord[] {
    const start = toTimestamp(from);
    const end = toTimestamp(to);
    return Array.from(this.state.bookings.values()).filter((booking) => {
      if (booking.tenantId !== this.tenantId) return false;
      if (booking.status === 'cancelled') return false;
      const bookingStart = toTimestamp(booking.slotStart);
      return bookingStart >= start && bookingStart <= end;
    });
  }
}

const cloneState = (state: DatabaseState): DatabaseState => ({
  bookings: new Map(
    Array.from(state.bookings.entries()).map(([id, booking]) => [id, structuredClone(booking)])
  ),
  outbox: new Map(
    Array.from(state.outbox.entries()).map(([id, event]) => [id, structuredClone(event)])
  ),
  invoices: new Map(
    Array.from(state.invoices.entries()).map(([id, invoice]) => [id, structuredClone(invoice)])
  ),
  paymentEvents: new Map(
    Array.from(state.paymentEvents.entries()).map(([key, event]) => [key, structuredClone(event)])
  )
});

export class InMemoryDatabase {
  private state: DatabaseState = {
    bookings: new Map(),
    outbox: new Map(),
    invoices: new Map(),
    paymentEvents: new Map()
  };

  private listeners = new Set<(event: OutboxEvent) => void>();
  private queue: Promise<void> = Promise.resolve();

  onOutboxEnqueued(listener: (event: OutboxEvent) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notifyOutbox(event: OutboxEvent) {
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  async transaction<T>(
    tenantId: string,
    handler: (tx: DatabaseTransaction) => Promise<T>
  ): Promise<T> {
    const releasePromise = this.queue;
    let release: () => void = () => {};
    this.queue = new Promise((resolve) => {
      release = resolve;
    });

    await releasePromise;

    const snapshot = cloneState(this.state);
    const tx = new DatabaseTransaction(snapshot, tenantId);
    try {
      const result = await handler(tx);
      this.state = snapshot;
      release();
      for (const event of tx.outboxEvents) {
        this.notifyOutbox(event);
      }
      return result;
    } catch (error) {
      release();
      throw error;
    }
  }

  async fetchPendingOutbox(limit: number): Promise<OutboxEvent[]> {
    const ready: OutboxEvent[] = [];
    const now = Date.now();
    for (const event of this.state.outbox.values()) {
      if (event.status !== 'pending') continue;
      if (event.nextRunAt > now) continue;
      event.status = 'processing';
      event.lockedAt = now;
      event.updatedAt = now;
      ready.push(structuredClone(event));
      if (ready.length >= limit) break;
    }
    return ready;
  }

  async markOutboxCompleted(eventId: string) {
    const event = this.state.outbox.get(eventId);
    if (!event) return;
    event.status = 'completed';
    event.lockedAt = null;
    event.updatedAt = Date.now();
  }

  async markOutboxFailed(eventId: string, error: Error, backoffMs: number, maxAttempts: number) {
    const event = this.state.outbox.get(eventId);
    if (!event) return;
    event.attempts += 1;
    event.lastError = error.message;
    event.lockedAt = null;
    if (event.attempts >= maxAttempts) {
      event.status = 'failed';
      event.nextRunAt = Date.now();
    } else {
      event.status = 'pending';
      event.nextRunAt = Date.now() + backoffMs;
    }
    event.updatedAt = Date.now();
  }

  async listDeadLetterEvents(): Promise<OutboxEvent[]> {
    return Array.from(this.state.outbox.values()).filter((event) => event.status === 'failed');
  }

  async getBooking(tenantId: string, bookingId: string): Promise<BookingRecord | null> {
    const booking = this.state.bookings.get(bookingId);
    if (!booking || booking.tenantId !== tenantId) {
      return null;
    }
    return structuredClone(booking);
  }

  async listUpcomingBookings(tenantId: string, from: string, to: string): Promise<BookingRecord[]> {
    const tx = new DatabaseTransaction(this.state, tenantId);
    return tx.listUpcomingBookings(from, to);
  }

  async hasProcessedPaymentEvent(provider: string, providerEventId: string) {
    return this.state.paymentEvents.has(`${provider}:${providerEventId}`);
  }

  async listAvailability(
    tenantId: string,
    params: {
      serviceId: string;
      staffId?: string;
      from: string;
      to: string;
      granularityMinutes: number;
    }
  ) {
    const tx = new DatabaseTransaction(this.state, tenantId);
    return tx.getAvailability(params);
  }

  reset() {
    this.state = {
      bookings: new Map(),
      outbox: new Map(),
      invoices: new Map(),
      paymentEvents: new Map()
    };
  }
}

export const db = new InMemoryDatabase();
export const renderCalendarIcs = (bookings: BookingRecord[]) => generateIcs(bookings);
