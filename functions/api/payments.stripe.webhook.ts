import { createHmac } from 'node:crypto';
import { StripeWebhookSchema } from '../../packages/types/contracts';
import { db } from '../lib/db';
import { withoutAuth, parseJson, respond, type ApiRequest } from '../lib/http';
import { BadRequestError } from '../lib/errors';

const STRIPE_TOLERANCE_SECONDS = 60 * 5;
const STRIPE_SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? 'whsec_test_secret';

const parseSignatureHeader = (header: string | undefined) => {
  if (!header) {
    throw new BadRequestError('Stripe-Signature header missing.');
  }
  const parts = header.split(',').reduce<Record<string, string>>((acc, part) => {
    const [key, value] = part.split('=');
    if (key && value) {
      acc[key] = value;
    }
    return acc;
  }, {});

  if (!parts.t || !parts.v1) {
    throw new BadRequestError('Stripe-Signature header is malformed.');
  }

  return { timestamp: Number(parts.t), signature: parts.v1 };
};

const verifySignature = (rawBody: string, header: string | undefined) => {
  const { timestamp, signature } = parseSignatureHeader(header);
  const ageSeconds = Math.abs(Math.floor(Date.now() / 1000) - timestamp);
  if (ageSeconds > STRIPE_TOLERANCE_SECONDS) {
    throw new BadRequestError('Stripe signature timestamp outside allowed tolerance.');
  }

  const expected = createHmac('sha256', STRIPE_SECRET)
    .update(`${timestamp}.${rawBody}`)
    .digest('hex');

  if (expected !== signature) {
    throw new BadRequestError('Stripe signature verification failed.');
  }
};

const extractTenantId = (event: unknown): string => {
  const object = (event as any)?.data?.object;
  const tenantId = object?.tenant_id ?? object?.metadata?.tenant_id;
  if (typeof tenantId !== 'string') {
    throw new BadRequestError('Tenant identifier missing in Stripe payload.');
  }
  return tenantId;
};

export const handler = withoutAuth(async (req: ApiRequest) => {
  const rawBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body ?? {});
  verifySignature(rawBody, req.headers['stripe-signature']);
  const payload = parseJson(StripeWebhookSchema, JSON.parse(rawBody));

  const tenantId = extractTenantId(payload);

  const stored = await db.transaction(tenantId, async (tx) => {
    const result = tx.recordPaymentEvent({
      provider: 'stripe',
      providerEventId: payload.id,
      tenantId,
      payload,
      receivedAt: Date.now()
    });
    if (result.stored) {
      tx.enqueueOutbox('payments.stripe', {
        eventId: payload.id,
        type: payload.type,
        data: payload.data
      });
    }
    return result.stored;
  });

  return respond({ received: true, replayed: !stored }, 200);
});
