import { createHmac } from 'node:crypto';
import { SumUpWebhookSchema } from '../../packages/types/contracts';
import { db } from '../lib/db';
import { withoutAuth, parseJson, respond, type ApiRequest } from '../lib/http';
import { BadRequestError } from '../lib/errors';

const SUMUP_TOLERANCE_SECONDS = 60 * 5;
const SUMUP_SECRET = process.env.SUMUP_WEBHOOK_SECRET ?? 'sumup_test_secret';
const SUMUP_IP_ALLOWLIST = (process.env.SUMUP_IP_ALLOWLIST ?? '127.0.0.1').split(',');

const TRUSTED_PROXY_IP_HEADERS = ['x-nf-client-connection-ip', 'x-vercel-proxy-ip', 'true-client-ip'] as const;

const extractConnectionIp = (req: ApiRequest) => {
  if (req.ip?.trim()) {
    return req.ip.trim();
  }
  for (const header of TRUSTED_PROXY_IP_HEADERS) {
    const value = req.headers[header];
    if (value) {
      return value.split(',')[0]?.trim();
    }
  }
  return undefined;
};

const verifyIp = (req: ApiRequest) => {
  const ip = extractConnectionIp(req);
  if (!ip) {
    throw new BadRequestError('Source IP missing.');
  }
  if (!SUMUP_IP_ALLOWLIST.includes(ip)) {
    throw new BadRequestError('Source IP not allowed.');
  }
};

const verifyTimestamp = (timestampHeader: string | undefined) => {
  if (!timestampHeader) {
    throw new BadRequestError('X-SumUp-Timestamp missing.');
  }
  const timestamp = Number(timestampHeader);
  const ageSeconds = Math.abs(Math.floor(Date.now() / 1000) - timestamp);
  if (ageSeconds > SUMUP_TOLERANCE_SECONDS) {
    throw new BadRequestError('SumUp timestamp outside tolerance.');
  }
  return timestampHeader;
};

const verifyHmac = (timestamp: string, rawBody: string, signature: string | undefined) => {
  if (!signature) {
    throw new BadRequestError('X-SumUp-Hmac missing.');
  }
  const expected = createHmac('sha256', SUMUP_SECRET)
    .update(`${timestamp}.${rawBody}`)
    .digest('hex');
  if (expected !== signature) {
    throw new BadRequestError('Invalid SumUp HMAC signature.');
  }
};

const extractTenantId = (payload: unknown) => {
  const tenantId = (payload as any)?.payload?.tenant_id;
  if (typeof tenantId !== 'string') {
    throw new BadRequestError('Tenant identifier missing in SumUp payload.');
  }
  return tenantId;
};

export const handler = withoutAuth(async (req: ApiRequest) => {
  verifyIp(req);
  const rawBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body ?? {});
  const timestamp = verifyTimestamp(req.headers['x-sumup-timestamp']);
  verifyHmac(timestamp, rawBody, req.headers['x-sumup-hmac']);

  const payload = parseJson(SumUpWebhookSchema, JSON.parse(rawBody));
  const tenantId = extractTenantId(payload);

  const stored = await db.transaction(tenantId, async (tx) => {
    const result = tx.recordPaymentEvent({
      provider: 'sumup',
      providerEventId: `${payload.event_id}`,
      tenantId,
      payload,
      sequence: payload.sequence,
      receivedAt: Date.now()
    });
    if (result.stored) {
      tx.enqueueOutbox('payments.sumup', {
        eventId: payload.event_id,
        eventType: payload.event_type,
        payload: payload.payload
      });
    }
    return result.stored;
  });

  return respond({ received: true, replayed: !stored }, 200);
});
