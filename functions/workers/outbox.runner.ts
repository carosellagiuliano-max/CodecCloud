import { db, type OutboxEvent } from '../lib/db';

export type OutboxHandler = (event: OutboxEvent) => Promise<void>;

export interface OutboxRunnerOptions {
  pollIntervalMs?: number;
  maxAttempts?: number;
  baseBackoffMs?: number;
  jitterRatio?: number;
  batchSize?: number;
}

const defaultHandler: OutboxHandler = async (event) => {
  console.info('Outbox event processed (noop handler)', event.id);
};

export class OutboxRunner {
  private readonly pollIntervalMs: number;
  private readonly maxAttempts: number;
  private readonly baseBackoffMs: number;
  private readonly jitterRatio: number;
  private readonly batchSize: number;
  private readonly handlers = new Map<string, OutboxHandler>();
  private stopRequested = false;
  private pollTimer?: NodeJS.Timeout;
  private unsubscribe?: () => void;

  constructor(options: OutboxRunnerOptions = {}) {
    this.pollIntervalMs = options.pollIntervalMs ?? 1000 * 5;
    this.maxAttempts = options.maxAttempts ?? 5;
    this.baseBackoffMs = options.baseBackoffMs ?? 1000;
    this.jitterRatio = options.jitterRatio ?? 0.25;
    this.batchSize = options.batchSize ?? 10;
    this.handlers.set('*', defaultHandler);
  }

  registerHandler(eventType: string, handler: OutboxHandler) {
    this.handlers.set(eventType, handler);
  }

  start() {
    if (this.pollTimer) return;
    this.stopRequested = false;
    this.unsubscribe = db.onOutboxEnqueued(() => {
      void this.processOnce();
    });
    this.schedulePoll();
  }

  stop() {
    this.stopRequested = true;
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = undefined;
    }
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = undefined;
    }
  }

  async runOnce() {
    await this.processOnce();
  }

  private schedulePoll() {
    this.pollTimer = setInterval(() => {
      void this.processOnce();
    }, this.pollIntervalMs);
  }

  private async processOnce() {
    if (this.stopRequested) {
      return;
    }

    const events = await db.fetchPendingOutbox(this.batchSize);
    for (const event of events) {
      const handler = this.handlers.get(event.eventType) ?? this.handlers.get('*');
      if (!handler) continue;

      try {
        await handler(event);
        await db.markOutboxCompleted(event.id);
      } catch (error) {
        const backoff = this.computeBackoff(event.attempts + 1);
        await db.markOutboxFailed(event.id, error as Error, backoff, this.maxAttempts);
      }
    }
  }

  private computeBackoff(attempt: number) {
    const base = this.baseBackoffMs * Math.pow(2, attempt - 1);
    const jitter = base * this.jitterRatio * Math.random();
    return Math.round(base + jitter);
  }
}

export const outboxRunner = new OutboxRunner();
