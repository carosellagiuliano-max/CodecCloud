import {
  BookingRescheduleResponseSchema,
  BookingRescheduleSchema
} from '../../packages/types/contracts';
import { db } from '../lib/db';
import { parseJson, respond, withAuth } from '../lib/http';
import { ensureIdempotent } from '../lib/idempotency';
import { idempotencyStore, rateLimiter } from '../lib/runtime';
import { BadRequestError } from '../lib/errors';

const getKey = (headers: Record<string, string | undefined>) =>
  headers['idempotency-key'] ?? headers['Idempotency-Key'];

export const handler = withAuth(async (req, auth) => {
  await rateLimiter.consume(`bookings:reschedule:${auth.userId}`);
  const key = getKey(req.headers);
  if (!key) {
    throw new BadRequestError('Idempotency-Key header is required.');
  }

  const payload = parseJson(BookingRescheduleSchema, req.body);
  const pathId = req.params?.bookingId;
  if (!pathId) {
    throw new BadRequestError('bookingId path parameter is required.');
  }

  if (payload.bookingId !== pathId) {
    throw new BadRequestError('bookingId in path and body must match.');
  }

  const result = await ensureIdempotent({
    tenantId: auth.tenantId,
    key,
    requestBody: payload,
    store: idempotencyStore,
    execute: async () => {
      const { booking, outboxEvent } = await db.transaction(auth.tenantId, async (tx) =>
        tx.rescheduleBooking({
          bookingId: payload.bookingId,
          slotStart: payload.slotStart,
          slotEnd: payload.slotEnd,
          reason: payload.reason
        })
      );

      const body = parseJson(BookingRescheduleResponseSchema, {
        booking,
        outboxEventId: outboxEvent.id
      });

      return { status: 200, body };
    }
  });

  return respond(result.body, result.status, {
    'x-request-id': auth.requestId,
    'x-idempotent-replay': String(result.idempotent)
  });
});
