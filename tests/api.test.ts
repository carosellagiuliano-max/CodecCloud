import { describe, it, expect, beforeEach, vi } from 'vitest';
import { randomUUID, createHmac } from 'node:crypto';
import { handler as createBooking } from '../functions/api/bookings.create';
import { handler as rescheduleBooking } from '../functions/api/bookings.reschedule';
import { handler as cancelBooking } from '../functions/api/bookings.cancel';
import { handler as availabilityHandler } from '../functions/api/bookings.get-availability';
import { handler as invoiceHandler } from '../functions/api/invoices.generate';
import { handler as stripeWebhook } from '../functions/api/payments.stripe.webhook';
import { handler as sumupWebhook } from '../functions/api/payments.sumup.webhook';
import { handler as calendarHandler } from '../functions/api/calendar.ics-feed';
import { db } from '../functions/lib/db';
import { idempotencyStore, rateLimitStore, rateLimiter } from '../functions/lib/runtime';
import type { ApiRequest } from '../functions/lib/http';
import type { HttpResponse } from '../functions/lib/errors';
import { OutboxRunner } from '../functions/workers/outbox.runner';
import {
  openApiDocument,
  schemaNames,
  type BookingCreateResponse,
  type BookingCancelResponse,
  type InvoiceGenerateResponse
} from '../packages/types/contracts';
import { authService } from '../functions/lib/auth';

const TENANT_ID = '00000000-0000-0000-0000-000000000000';

const baseHeaders = (overrides: Record<string, string> = {}) => ({
  authorization: 'Bearer root-token',
  'x-workspace-id': TENANT_ID,
  'content-type': 'application/json',
  ...overrides
});

const sampleBookingPayload = (overrides: Record<string, unknown> = {}) => ({
  serviceId: '11111111-1111-1111-1111-111111111111',
  staffId: '22222222-2222-2222-2222-222222222222',
  slotStart: '2030-01-01T09:00:00.000Z',
  slotEnd: '2030-01-01T09:30:00.000Z',
  price: { currency: 'CHF', amount: 1200 },
  customer: {
    id: '33333333-3333-3333-3333-333333333333',
    email: 'customer@example.com',
    firstName: 'Casey',
    lastName: 'Customer'
  },
  ...overrides
});

const execute = (handler: (req: ApiRequest) => Promise<any>, request: Partial<ApiRequest>) =>
  handler({
    method: 'POST',
    headers: baseHeaders(),
    body: {},
    query: {},
    params: {},
    ...request
  });

beforeEach(() => {
  db.reset();
  idempotencyStore.clear();
  rateLimitStore.clear();
});

describe('Bookings API', () => {
  it('creates a booking and enqueues outbox event', async () => {
    const response = (await execute(createBooking, {
      headers: baseHeaders({ 'idempotency-key': randomUUID() }),
      body: sampleBookingPayload()
    })) as HttpResponse<BookingCreateResponse>;
    expect(response.status).toBe(201);
    expect(response.body.booking.status).toBe('scheduled');
    expect(response.body.outboxEventId).toBeDefined();
  });

  it('enforces idempotency', async () => {
    const key = randomUUID();
    const first = (await execute(createBooking, {
      headers: baseHeaders({ 'idempotency-key': key }),
      body: sampleBookingPayload()
    })) as HttpResponse<BookingCreateResponse>;
    const second = (await execute(createBooking, {
      headers: baseHeaders({ 'idempotency-key': key }),
      body: sampleBookingPayload()
    })) as HttpResponse<BookingCreateResponse>;
    expect(second.status).toBe(201);
    expect(second.body.booking.id).toBe(first.body.booking.id);
    expect(second.headers?.['x-idempotent-replay']).toBe('true');
  });

  it('rejects conflicting booking attempts (409)', async () => {
    await execute(createBooking, {
      headers: baseHeaders({ 'idempotency-key': randomUUID() }),
      body: sampleBookingPayload()
    });
    const conflict = await execute(createBooking, {
      headers: baseHeaders({ 'idempotency-key': randomUUID() }),
      body: sampleBookingPayload()
    });
    expect(conflict.status).toBe(409);
  });

  it('supports high concurrency with single success', async () => {
    const consumeSpy = vi
      .spyOn(rateLimiter, 'consume')
      .mockResolvedValue({ remaining: 100, resetAt: Date.now() + 1000 });
    const results = await Promise.all(
      Array.from({ length: 100 }, () =>
        execute(createBooking, {
          headers: baseHeaders({ 'idempotency-key': randomUUID() }),
          body: sampleBookingPayload({
            slotStart: '2030-01-02T09:00:00.000Z',
            slotEnd: '2030-01-02T09:30:00.000Z'
          })
        })
      )
    );
    consumeSpy.mockRestore();
    const successCount = results.filter((r) => r.status === 201).length;
    const conflictCount = results.filter((r) => r.status === 409).length;
    expect(successCount).toBe(1);
    expect(conflictCount).toBe(99);
  });

  it('returns 422 on invalid payload', async () => {
    const response = await execute(createBooking, {
      headers: baseHeaders({ 'idempotency-key': randomUUID() }),
      body: {}
    });
    expect(response.status).toBe(422);
  });

  it('returns 401 for missing authorization', async () => {
    const response = await createBooking({
      method: 'POST',
      headers: { 'x-workspace-id': TENANT_ID, 'idempotency-key': randomUUID() },
      body: sampleBookingPayload()
    } as ApiRequest);
    expect(response.status).toBe(401);
  });

  it('returns 403 when workspace header mismatches token', async () => {
    authService.registerToken({
      token: 'temp-token',
      tenantId: TENANT_ID,
      userId: '44444444-4444-4444-4444-444444444444',
      roles: ['staff']
    });
    const response = await createBooking({
      method: 'POST',
      headers: {
        authorization: 'Bearer temp-token',
        'x-workspace-id': '11111111-1111-1111-1111-111111111111',
        'idempotency-key': randomUUID()
      },
      body: sampleBookingPayload()
    } as ApiRequest);
    expect(response.status).toBe(403);
  });

  it('rate limits availability requests', async () => {
    let lastResponse: any = null;
    for (let i = 0; i < 31; i++) {
      lastResponse = await availabilityHandler({
        method: 'GET',
        headers: baseHeaders(),
        query: {
          serviceId: '11111111-1111-1111-1111-111111111111',
          from: '2030-01-01T00:00:00.000Z',
          to: '2030-01-02T00:00:00.000Z'
        }
      } as ApiRequest);
    }
    expect(lastResponse.status).toBe(429);
  });

  it('reschedules and cancels booking', async () => {
    const createResponse = (await execute(createBooking, {
      headers: baseHeaders({ 'idempotency-key': randomUUID() }),
      body: sampleBookingPayload()
    })) as HttpResponse<BookingCreateResponse>;
    const bookingId = createResponse.body.booking.id;
    const reschedule = await rescheduleBooking({
      method: 'POST',
      headers: baseHeaders({ 'idempotency-key': randomUUID() }),
      params: { bookingId },
      body: {
        bookingId,
        slotStart: '2030-01-01T10:00:00.000Z',
        slotEnd: '2030-01-01T10:30:00.000Z'
      }
    } as ApiRequest);
    expect(reschedule.status).toBe(200);
    const cancel = (await cancelBooking({
      method: 'POST',
      headers: baseHeaders({ 'idempotency-key': randomUUID() }),
      params: { bookingId },
      body: { bookingId, reason: 'Client request' }
    } as ApiRequest)) as HttpResponse<BookingCancelResponse>;
    expect(cancel.status).toBe(200);
    expect(cancel.body.booking.status).toBe('cancelled');
  });
});

describe('Invoice generation', () => {
  it('generates invoices idempotently', async () => {
    const booking = (await execute(createBooking, {
      headers: baseHeaders({ 'idempotency-key': randomUUID() }),
      body: sampleBookingPayload({
        slotStart: '2030-02-01T09:00:00.000Z',
        slotEnd: '2030-02-01T09:30:00.000Z'
      })
    })) as HttpResponse<BookingCreateResponse>;

    const key = randomUUID();
    const req = {
      method: 'POST',
      headers: baseHeaders({ 'idempotency-key': key }),
      body: {
        bookingId: booking.body.booking.id,
        issueDate: '2030-02-01T00:00:00.000Z',
        dueDate: '2030-02-15T00:00:00.000Z',
        language: 'de-CH',
        sendEmail: true
      }
    } as ApiRequest;
    const first = (await invoiceHandler(req)) as HttpResponse<InvoiceGenerateResponse>;
    const second = (await invoiceHandler(req)) as HttpResponse<InvoiceGenerateResponse>;
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body.invoiceId).toBe(first.body.invoiceId);
  });
});

describe('Webhook handlers', () => {
  it('verifies Stripe signatures and dedupes replays', async () => {
    const event = {
      id: 'evt_test_1',
      type: 'payment_intent.succeeded',
      created: Math.floor(Date.now() / 1000),
      data: {
        object: {
          metadata: { tenant_id: TENANT_ID }
        }
      }
    };
    const raw = JSON.stringify(event);
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = createHmac('sha256', 'whsec_test_secret')
      .update(`${timestamp}.${raw}`)
      .digest('hex');
    const request: ApiRequest = {
      method: 'POST',
      headers: {
        'stripe-signature': `t=${timestamp},v1=${signature}`
      },
      body: raw
    } as unknown as ApiRequest;
    const first = (await stripeWebhook(request)) as HttpResponse<{ received: boolean; replayed?: boolean }>;
    const second = (await stripeWebhook(request)) as HttpResponse<{ received: boolean; replayed?: boolean }>;
    expect(first.status).toBe(200);
    expect(second.body.replayed).toBe(true);
  });

  it('validates SumUp HMAC, IP and sequence ordering', async () => {
    const payload = {
      event_id: 'sumup_evt_1',
      event_type: 'transaction.completed',
      occurred_at: '2030-03-01T12:00:00.000Z',
      payload: { tenant_id: TENANT_ID },
      sequence: 1
    };
    const raw = JSON.stringify(payload);
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = createHmac('sha256', 'sumup_test_secret')
      .update(`${timestamp}.${raw}`)
      .digest('hex');
    const request: ApiRequest = {
      method: 'POST',
      headers: {
        'x-sumup-timestamp': timestamp,
        'x-sumup-hmac': signature
      },
      body: raw,
      ip: '127.0.0.1'
    } as unknown as ApiRequest;
    const first = (await sumupWebhook(request)) as HttpResponse<{ received: boolean; replayed?: boolean }>;
    expect(first.status).toBe(200);

    const replay = (await sumupWebhook(request)) as HttpResponse<{ received: boolean; replayed?: boolean }>;
    expect(replay.body.replayed).toBe(true);

    const proxiedRequest: ApiRequest = {
      method: 'POST',
      headers: {
        'x-sumup-timestamp': timestamp,
        'x-sumup-hmac': signature,
        'cf-connecting-ip': '127.0.0.1'
      },
      body: raw
    } as unknown as ApiRequest;
    const proxied = (await sumupWebhook(proxiedRequest)) as HttpResponse<{ received: boolean; replayed?: boolean }>;
    expect(proxied.status).toBe(200);

    const higherSequencePayload = { ...payload, sequence: 2 };
    const rawHigh = JSON.stringify(higherSequencePayload);
    const signatureHigh = createHmac('sha256', 'sumup_test_secret')
      .update(`${timestamp}.${rawHigh}`)
      .digest('hex');
    const secondRequest: ApiRequest = {
      method: 'POST',
      headers: {
        'x-sumup-timestamp': timestamp,
        'x-sumup-hmac': signatureHigh
      },
      body: rawHigh,
      ip: '127.0.0.1'
    } as unknown as ApiRequest;
    const higher = (await sumupWebhook(secondRequest)) as HttpResponse<{ received: boolean; replayed?: boolean }>;
    expect(higher.body.replayed).toBe(false);
  });
});

describe('Outbox runner', () => {
  it('processes pending events and respects DLQ after retries', async () => {
    const bookingResponse = await execute(createBooking, {
      headers: baseHeaders({ 'idempotency-key': randomUUID() }),
      body: sampleBookingPayload({
        slotStart: '2030-04-01T09:00:00.000Z',
        slotEnd: '2030-04-01T09:30:00.000Z'
      })
    });
    expect(bookingResponse.status).toBe(201);

    const runner = new OutboxRunner({ maxAttempts: 3, baseBackoffMs: 10 });
    const processed: string[] = [];
    runner.registerHandler('booking.created', async (event) => {
      processed.push(event.id);
    });
    await runner.runOnce();
    expect(processed.length).toBe(1);

    await db.transaction(TENANT_ID, async (tx) => {
      tx.enqueueOutbox('test.failure', { foo: 'bar' });
    });
    const failingRunner = new OutboxRunner({ maxAttempts: 2, baseBackoffMs: 0 });
    failingRunner.registerHandler('test.failure', async () => {
      throw new Error('boom');
    });
    await failingRunner.runOnce();
    await failingRunner.runOnce();
    await failingRunner.runOnce();
    const dlq = await db.listDeadLetterEvents();
    expect(dlq.some((event) => event.eventType === 'test.failure')).toBe(true);
  });
});

describe('Calendar feed', () => {
  it('returns ICS payload for valid token', async () => {
    await execute(createBooking, {
      headers: baseHeaders({ 'idempotency-key': randomUUID() }),
      body: sampleBookingPayload({
        slotStart: '2030-05-01T09:00:00.000Z',
        slotEnd: '2030-05-01T09:30:00.000Z'
      })
    });
    const signature = createHmac('sha256', 'calendar_feed_secret')
      .update(TENANT_ID)
      .digest('hex');
    const response = await calendarHandler({
      method: 'GET',
      headers: {},
      query: { token: `${TENANT_ID}.${signature}` }
    } as ApiRequest);
    expect(response.status).toBe(200);
    expect(response.headers?.['content-type']).toContain('text/calendar');
    expect(response.body).toContain('BEGIN:VCALENDAR');
  });
});

describe('Contracts', () => {
  it('exports schemas and OpenAPI paths', () => {
    expect(schemaNames).toContain('Booking');
    const paths = openApiDocument.paths ?? {};
    expect(Object.keys(paths)).toContain('/bookings');
  });
});
