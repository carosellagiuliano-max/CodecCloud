import { randomUUID } from 'node:crypto';
import {
  InvoiceGenerateResponseSchema,
  InvoiceGenerateSchema
} from '../../packages/types/contracts';
import { db } from '../lib/db';
import { parseJson, respond, withAuth } from '../lib/http';
import { ensureIdempotent } from '../lib/idempotency';
import { idempotencyStore, rateLimiter } from '../lib/runtime';
import { BadRequestError } from '../lib/errors';

const getKey = (headers: Record<string, string | undefined>) =>
  headers['idempotency-key'] ?? headers['Idempotency-Key'];

export const handler = withAuth(async (req, auth) => {
  await rateLimiter.consume(`invoices:generate:${auth.userId}`);
  const key = getKey(req.headers);
  if (!key) {
    throw new BadRequestError('Idempotency-Key header is required.');
  }

  const payload = parseJson(InvoiceGenerateSchema, req.body);

  const result = await ensureIdempotent({
    tenantId: auth.tenantId,
    key,
    requestBody: payload,
    store: idempotencyStore,
    execute: async () => {
      const outcome = await db.transaction(auth.tenantId, async (tx) => {
        const booking = tx.getBookingCopy(payload.bookingId);
        const invoiceId = randomUUID();
        const invoice = tx.createInvoice({
          id: invoiceId,
          tenantId: auth.tenantId,
          bookingId: payload.bookingId,
          issueDate: payload.issueDate,
          dueDate: payload.dueDate,
          language: payload.language ?? 'de-CH',
          pdfUrl: `https://cdn.codeccloud.local/invoices/${invoiceId}.pdf`,
          total: booking.price,
          createdAt: Date.now()
        });

        const outbox = tx.enqueueOutbox('invoice.generated', {
          invoiceId: invoice.id,
          bookingId: invoice.bookingId,
          tenantId: invoice.tenantId,
          sendEmail: payload.sendEmail
        });

        return { booking, invoice, outbox };
      });

      const body = parseJson(InvoiceGenerateResponseSchema, {
        invoiceId: outcome.invoice.id,
        booking: outcome.booking,
        total: outcome.invoice.total,
        pdfUrl: outcome.invoice.pdfUrl,
        outboxEventId: outcome.outbox.id
      });

      return { status: 201, body };
    }
  });

  return respond(result.body, result.status, {
    'x-request-id': auth.requestId,
    'x-idempotent-replay': String(result.idempotent)
  });
});
