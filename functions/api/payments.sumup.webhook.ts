import { SumUpWebhookSchema } from '../../packages/types/contracts';
import { db } from '../lib/db';
import { withoutAuth, parseJson, respond, type ApiRequest } from '../lib/http';
import { BadRequestError } from '../lib/errors';

const textEncoder = new TextEncoder();

const resolveNumber = (value: string | undefined, fallback: number): number => {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const SUMUP_TOLERANCE_SECONDS = resolveNumber(process.env.SUMUP_TIMESTAMP_WINDOW_SECONDS, 60 * 5);
const SUMUP_SECRET =
  process.env.SUMUP_WEBHOOK_HMAC_KEY ?? process.env.SUMUP_WEBHOOK_SECRET ?? 'sumup_test_secret';
const SUMUP_ALLOWED_RANGES =
  process.env.SUMUP_ALLOWED_IP_RANGES ?? process.env.SUMUP_IP_ALLOWLIST;
if (!SUMUP_ALLOWED_RANGES) {
  throw new Error(
    "No IP allowlist configured for SumUp webhook. Please set SUMUP_ALLOWED_IP_RANGES or SUMUP_IP_ALLOWLIST in the environment."
  );
}
const SUMUP_CLIENT_ID = process.env.SUMUP_CLIENT_ID ?? 'salon-pos-client';
const SUMUP_CLIENT_SECRET = process.env.SUMUP_CLIENT_SECRET ?? 'salon-pos-secret';
const SUMUP_API_BASE_URL = (process.env.SUMUP_API_BASE_URL ?? 'https://api.sumup.com').replace(/\/$/, '');
const SUMUP_TOKEN_SCOPE = process.env.SUMUP_TOKEN_SCOPE ?? 'payments.transactions';

const TRUSTED_PROXY_IP_HEADERS = [
  'x-nf-client-connection-ip',
  'x-vercel-proxy-ip',
  'cf-connecting-ip',
  'true-client-ip',
  'x-forwarded-for'
] as const;

type IpRange =
  | { type: 'single'; value: number }
  | { type: 'cidr'; base: number; mask: number };

const parseIpv4 = (ip: string): number | null => {
  const parts = ip.trim().split('.');
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    if (part === '') return null;
    const octet = Number.parseInt(part, 10);
    if (!Number.isInteger(octet) || octet < 0 || octet > 255) {
      return null;
    }
    value = (value << 8) + octet;
  }
  return value >>> 0;
};

const parseRange = (entry: string): IpRange | null => {
  const trimmed = entry.trim();
  if (!trimmed) return null;
  if (trimmed.includes('/')) {
    const [network, prefixRaw] = trimmed.split('/');
    const prefix = Number.parseInt(prefixRaw, 10);
    if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) {
      return null;
    }
    const networkValue = parseIpv4(network);
    if (networkValue === null) {
      return null;
    }
    const mask = prefix === 0 ? 0 : ((0xffffffff << (32 - prefix)) >>> 0);
    const base = (networkValue & mask) >>> 0;
    return { type: 'cidr', base, mask };
  }
  const single = parseIpv4(trimmed);
  if (single === null) {
    return null;
  }
  return { type: 'single', value: single };
};

const ALLOWLIST = SUMUP_ALLOWED_RANGES.split(',')
  .map((value) => parseRange(value))
  .filter((value): value is IpRange => value !== null);

const isIpAllowlisted = (ip: string): boolean => {
  const numeric = parseIpv4(ip);
  if (numeric === null) {
    return false;
  }
  return ALLOWLIST.some((range) => {
    if (range.type === 'single') {
      return range.value === numeric;
    }
    return (numeric & range.mask) >>> 0 === range.base;
  });
};

const extractCandidateIps = (req: ApiRequest) => {
  const candidates: string[] = [];
  for (const header of TRUSTED_PROXY_IP_HEADERS) {
    const value = req.headers[header];
    if (!value) continue;
    const first = value.split(',')[0]?.trim();
    if (first) {
      candidates.push(first);
    }
  }
  if (req.ip?.trim()) {
    candidates.push(req.ip.trim());
  }
  return candidates;
};

const verifyIp = (req: ApiRequest) => {
  const candidates = extractCandidateIps(req);
  if (candidates.length === 0) {
    throw new BadRequestError('Source IP missing.');
  }
  for (const candidate of candidates) {
    if (isIpAllowlisted(candidate)) {
      return candidate;
    }
  }
  throw new BadRequestError('Source IP not allowed.');
};

const verifyTimestamp = (timestampHeader: string | undefined) => {
  if (!timestampHeader) {
    throw new BadRequestError('X-SumUp-Timestamp missing.');
  }
  const timestamp = Number.parseInt(timestampHeader, 10);
  if (!Number.isFinite(timestamp)) {
    throw new BadRequestError('X-SumUp-Timestamp malformed.');
  }
  const ageSeconds = Math.abs(Math.floor(Date.now() / 1000) - timestamp);
  if (ageSeconds > SUMUP_TOLERANCE_SECONDS) {
    throw new BadRequestError('SumUp timestamp outside tolerance.');
  }
  return timestampHeader;
};

const hexToBytes = (hex: string): Uint8Array => {
  const clean = hex.trim();
  if (!/^[0-9a-fA-F]+$/.test(clean) || clean.length % 2 !== 0) {
    throw new BadRequestError('SumUp HMAC secret is not valid hex.');
  }
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < clean.length; i += 2) {
    bytes[i / 2] = Number.parseInt(clean.slice(i, i + 2), 16);
  }
  return bytes;
};

let hmacKeyPromise: Promise<CryptoKey> | null = null;

const toArrayBuffer = (bytes: Uint8Array): ArrayBuffer => {
  const copy = new Uint8Array(bytes);
  return copy.buffer;
};

const getHmacKey = () => {
  if (!hmacKeyPromise) {
    const keyBytes = /^[0-9a-fA-F]+$/.test(SUMUP_SECRET) && SUMUP_SECRET.length % 2 === 0
      ? hexToBytes(SUMUP_SECRET)
      : textEncoder.encode(SUMUP_SECRET);
    hmacKeyPromise = crypto.subtle.importKey(
      'raw',
      toArrayBuffer(keyBytes),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
  }
  return hmacKeyPromise;
};

const bufferToHex = (buffer: ArrayBuffer) =>
  Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');

const verifyHmac = async (timestamp: string, rawBody: string, signature: string | undefined) => {
  if (!signature) {
    throw new BadRequestError('X-SumUp-Hmac missing.');
  }
  const key = await getHmacKey();
  const payload = `${timestamp}.${rawBody}`;
  const expected = bufferToHex(await crypto.subtle.sign('HMAC', key, textEncoder.encode(payload)));
  if (expected !== signature.toLowerCase()) {
    throw new BadRequestError('Invalid SumUp HMAC signature.');
  }
};

const parseJsonBody = (rawBody: string) => {
  try {
    return JSON.parse(rawBody);
  } catch {
    throw new BadRequestError('Request body is not valid JSON.');
  }
};

const extractTenantId = (payload: unknown) => {
  const tenantId = (payload as any)?.payload?.tenant_id;
  if (typeof tenantId !== 'string') {
    throw new BadRequestError('Tenant identifier missing in SumUp payload.');
  }
  return tenantId;
};

const extractTransactionId = (payload: unknown) => {
  const transactionId = (payload as any)?.payload?.transaction_id;
  if (typeof transactionId !== 'string' || transactionId.trim() === '') {
    throw new BadRequestError('Transaction identifier missing in SumUp payload.');
  }
  return transactionId;
};

const readJsonResponse = async (response: Response) => {
  const text = await response.text();
  if (!text) {
    return {};
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new BadRequestError('SumUp response was not valid JSON.');
  }
};

interface CachedToken {
  value: string;
  expiresAt: number;
}

class SumUpApiClient {
  private token: CachedToken | null = null;

  private async fetchAccessToken(): Promise<CachedToken> {
    if (!SUMUP_CLIENT_ID || !SUMUP_CLIENT_SECRET) {
      throw new BadRequestError('SumUp client credentials are not configured.');
    }
    const response = await fetch(`${SUMUP_API_BASE_URL}/token`, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: SUMUP_CLIENT_ID,
        client_secret: SUMUP_CLIENT_SECRET,
        scope: SUMUP_TOKEN_SCOPE
      })
    });
    if (!response.ok) {
      throw new BadRequestError('Failed to authenticate SumUp request.');
    }
    const data = await readJsonResponse(response);
    const accessToken = typeof data.access_token === 'string' ? data.access_token : null;
    if (!accessToken) {
      throw new BadRequestError('SumUp access token missing in provider response.');
    }
    const expiresIn =
      typeof data.expires_in === 'number' && Number.isFinite(data.expires_in) ? data.expires_in : 300;
    return {
      value: accessToken,
      expiresAt: Date.now() + Math.max(expiresIn - 15, 30) * 1000
    };
  }

  async getAccessToken(): Promise<string> {
    if (this.token && this.token.expiresAt > Date.now()) {
      return this.token.value;
    }
    this.token = await this.fetchAccessToken();
    return this.token.value;
  }

  async verifyTransaction(transactionId: string, eventId: string) {
    const token = await this.getAccessToken();
    const response = await fetch(`${SUMUP_API_BASE_URL}/v0.1/me/transactions/${transactionId}`, {
      method: 'GET',
      headers: {
        authorization: `Bearer ${token}`,
        accept: 'application/json'
      }
    });
    if (!response.ok) {
      throw new BadRequestError('SumUp transaction could not be verified.');
    }
    const data = await readJsonResponse(response);
    const remoteTransactionId =
      typeof data.id === 'string'
        ? data.id
        : typeof data.transaction_id === 'string'
          ? data.transaction_id
          : undefined;
    if (remoteTransactionId && remoteTransactionId !== transactionId) {
      throw new BadRequestError('SumUp transaction mismatch.');
    }
    const remoteEventId = typeof data.event_id === 'string' ? data.event_id : undefined;
    if (remoteEventId && remoteEventId !== eventId) {
      throw new BadRequestError('SumUp event mismatch.');
    }
    return data;
  }
}

const sumUpClient = new SumUpApiClient();

export const handler = withoutAuth(async (req: ApiRequest) => {
  const sourceIp = verifyIp(req);
  const rawBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body ?? {});
  const timestamp = verifyTimestamp(req.headers['x-sumup-timestamp']);
  await verifyHmac(timestamp, rawBody, req.headers['x-sumup-hmac']?.toLowerCase());

  const payload = parseJson(SumUpWebhookSchema, parseJsonBody(rawBody));
  const tenantId = extractTenantId(payload);
  const transactionId = extractTransactionId(payload);
  const verification = await sumUpClient.verifyTransaction(transactionId, payload.event_id);

  const stored = await db.transaction(tenantId, async (tx) => {
    const result = tx.recordPaymentEvent({
      provider: 'sumup',
      providerEventId: `${payload.event_id}`,
      tenantId,
      payload: {
        event: payload,
        verification,
        sourceIp
      },
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
