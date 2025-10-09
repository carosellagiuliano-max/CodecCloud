import { RateLimitError } from './errors';

export interface RateLimitRecord {
  count: number;
  expiresAt: number;
}

export interface RateLimitStore {
  increment(key: string, windowMs: number, cost: number): Promise<RateLimitRecord>;
}

export class InMemoryRateLimitStore implements RateLimitStore {
  private readonly storage = new Map<string, RateLimitRecord>();

  async increment(key: string, windowMs: number, cost: number): Promise<RateLimitRecord> {
    const now = Date.now();
    const existing = this.storage.get(key);
    if (!existing || existing.expiresAt <= now) {
      const record = { count: cost, expiresAt: now + windowMs };
      this.storage.set(key, record);
      return record;
    }

    existing.count += cost;
    return existing;
  }

  clear() {
    this.storage.clear();
  }
}

export interface RateLimiterOptions {
  windowMs: number;
  max: number;
  store?: RateLimitStore;
  keyPrefix?: string;
}

export type RateLimitResult = {
  remaining: number;
  resetAt: number;
};

export class RateLimiter {
  private readonly windowMs: number;
  private readonly max: number;
  private readonly store: RateLimitStore;
  private readonly keyPrefix: string;

  constructor(options: RateLimiterOptions) {
    this.windowMs = options.windowMs;
    this.max = options.max;
    this.store = options.store ?? new InMemoryRateLimitStore();
    this.keyPrefix = options.keyPrefix ?? 'rate';
  }

  async consume(key: string, cost = 1): Promise<RateLimitResult> {
    const storageKey = `${this.keyPrefix}:${key}`;
    const record = await this.store.increment(storageKey, this.windowMs, cost);
    const remaining = Math.max(0, this.max - record.count);

    if (record.count > this.max) {
      throw new RateLimitError({
        detail: 'Too many requests. Slow down before retrying.',
        retryAfter: Math.ceil((record.expiresAt - Date.now()) / 1000)
      });
    }

    return {
      remaining,
      resetAt: record.expiresAt
    };
  }
}
