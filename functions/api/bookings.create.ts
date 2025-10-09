import {
  BookingCreateResponseSchema,
  BookingCreateSchema
} from '../../packages/types/contracts';
import { db } from '../lib/db';
import { parseJson, respond, withAuth } from '../lib/http';
import { ensureIdempotent } from '../lib/idempotency';
import { rateLimiter, idempotencyStore } from '../lib/runtime';
import { BadRequestError } from '../lib/errors';

const getIdempotencyKey = (headers: Record<string, string | undefined>) =>
  headers['idempotency-key'] ?? headers['Idempotency-Key'];

export const handler = withAuth(async (req, auth) => {
  await rateLimiter.consume(`bookings:create:${auth.userId}`);
  const key = getIdempotencyKey(req.headers);
  const body = parseJson(BookingCreateSchema, req.body);
  if (!key) {
    throw new BadRequestError('Idempotency-Key header is required.');
  }

  const result = await ensureIdempotent({
    tenantId: auth.tenantId,
    key,
    requestBody: body,
    store: idempotencyStore,
    execute: async () => {
      const { booking, outboxEvent } = await db.transaction(auth.tenantId, async (tx) =>
        tx.createBooking({
          tenantId: auth.tenantId,
          serviceId: body.serviceId,
          staffId: body.staffId,
          slotStart: body.slotStart,
          slotEnd: body.slotEnd,
          price: body.price,
          customer: body.customer,
          notes: body.notes
        })
      );

      const payload = parseJson(BookingCreateResponseSchema, {
        booking,
        outboxEventId: outboxEvent.id
      });

      return {
        status: 201,
        body: payload
      };
    }
  });

  return respond(result.body, result.status, {
    'x-request-id': auth.requestId,
    'x-idempotent-replay': String(result.idempotent)
  });
});
