import { outboxRunner } from '../functions/workers/outbox.runner.js';

outboxRunner.registerHandler('*', async (event) => {
  console.log(`[outbox] ${event.eventType}#${event.id}`, event.payload);
});

outboxRunner.start();
console.log('Outbox runner started. Press Ctrl+C to exit.');

const shutdown = () => {
  outboxRunner.stop();
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
