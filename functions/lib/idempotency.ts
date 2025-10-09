import { createHash } from 'node:crypto';
import { IdempotencyKeyConflictError } from './errors';

export interface IdempotencyRecord<T = unknown> {
  key: string;
  tenantId: string;
  requestHash: string;
  responseHash: string;
  responseStatus: number;
  responseBody: T;
  createdAt: number;
  expiresAt: number;
}

export interface IdempotencyStore {
  get<T>(tenantId: string, key: string): Promise<IdempotencyRecord<T> | null>;
  set<T>(record: IdempotencyRecord<T>): Promise<void>;
}

export class InMemoryIdempotencyStore implements IdempotencyStore {
  private readonly storage = new Map<string, IdempotencyRecord>();

  constructor(private readonly ttlMs = 1000 * 60 * 60) {}

  private toKey(tenantId: string, key: string) {
    return `${tenantId}:${key}`;
  }

  async get<T>(tenantId: string, key: string): Promise<IdempotencyRecord<T> | null> {
    const now = Date.now();
    const record = this.storage.get(this.toKey(tenantId, key));
    if (!record) {
      return null;
    }

    if (record.expiresAt <= now) {
      this.storage.delete(this.toKey(tenantId, key));
      return null;
    }

    return record as IdempotencyRecord<T>;
  }

  async set<T>(record: IdempotencyRecord<T>): Promise<void> {
    this.storage.set(this.toKey(record.tenantId, record.key), record);
  }

  clear() {
    this.storage.clear();
  }
}

export interface EnsureIdempotentOptions<T> {
  tenantId: string;
  key: string;
  requestBody: unknown;
  ttlMs?: number;
  store?: IdempotencyStore;
  execute: () => Promise<{ status: number; body: T }>;
}

export const computeHash = (input: unknown): string => {
  const hash = createHash('sha256');
  hash.update(JSON.stringify(input));
  return hash.digest('hex');
};

export const ensureIdempotent = async <T>({
  tenantId,
  key,
  requestBody,
  ttlMs = 1000 * 60 * 60 * 24,
  store = new InMemoryIdempotencyStore(ttlMs),
  execute
}: EnsureIdempotentOptions<T>): Promise<{ status: number; body: T; idempotent: boolean }> => {
  if (!key || key.length < 8) {
    throw new Error('Idempotency-Key header must be provided.');
  }

  const requestHash = computeHash(requestBody);
  const existing = await store.get<T>(tenantId, key);
  if (existing) {
    if (existing.requestHash !== requestHash) {
      throw new IdempotencyKeyConflictError();
    }

    return {
      status: existing.responseStatus,
      body: existing.responseBody,
      idempotent: true
    };
  }

  const result = await execute();
  const responseHash = computeHash({
    status: result.status,
    body: result.body
  });

  await store.set({
    key,
    tenantId,
    requestHash,
    responseHash,
    responseStatus: result.status,
    responseBody: result.body,
    createdAt: Date.now(),
    expiresAt: Date.now() + ttlMs
  });

  return {
    status: result.status,
    body: result.body,
    idempotent: false
  };
};
