import { InMemoryIdempotencyStore } from './idempotency';
import { InMemoryRateLimitStore, RateLimiter } from './rate';

export const rateLimitStore = new InMemoryRateLimitStore();
export const rateLimiter = new RateLimiter({
  windowMs: 60_000,
  max: 30,
  keyPrefix: 'edge',
  store: rateLimitStore
});

export const idempotencyStore = new InMemoryIdempotencyStore(1000 * 60 * 60 * 24);
