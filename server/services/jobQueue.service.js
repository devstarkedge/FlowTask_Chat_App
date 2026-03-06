import { Queue, Worker } from 'bullmq';
import env from '../config/environment.js';
import logger from '../utils/logger.js';

/**
 * Job Queue Service — BullMQ-backed async job processing.
 * Falls back to synchronous execution when Redis is unavailable.
 */

const queues = {};
const workers = {};

function getConnection() {
  if (!env.REDIS_URL) return null;
  // Parse REDIS_URL into ioredis connection options
  return { url: env.REDIS_URL };
}

/**
 * Register a named queue with a processor function.
 * @param {string} name - Queue name
 * @param {Function} processor - async (job) => result
 * @param {Object} [opts] - Worker options (concurrency, etc.)
 */
export function registerQueue(name, processor, opts = {}) {
  const connection = getConnection();

  if (!connection) {
    // No Redis — store processor for synchronous fallback
    queues[name] = { processor, sync: true };
    logger.info(`Queue "${name}" registered (sync fallback, no Redis)`);
    return;
  }

  const queue = new Queue(name, {
    connection,
    defaultJobOptions: {
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 50 },
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
    },
  });

  const worker = new Worker(name, processor, {
    connection,
    concurrency: opts.concurrency || 3,
    limiter: opts.limiter || undefined,
  });

  worker.on('failed', (job, err) => {
    logger.error(`Job failed: ${name}/${job?.id}`, { error: err.message, data: job?.data });
  });

  worker.on('error', (err) => {
    logger.error(`Worker error: ${name}`, { error: err.message });
  });

  worker.on('completed', (job) => {
    logger.debug(`Job completed: ${name}/${job.id}`);
  });

  queues[name] = { queue, sync: false };
  workers[name] = worker;
  logger.info(`Queue "${name}" registered with BullMQ (concurrency: ${opts.concurrency || 3})`);
}

/**
 * Add a job to a named queue.
 * Falls back to synchronous execution if Redis is unavailable.
 */
export async function addJob(name, data, opts = {}) {
  const entry = queues[name];
  if (!entry) {
    logger.warn(`Queue "${name}" not registered, dropping job`);
    return null;
  }

  if (entry.sync) {
    // Synchronous fallback — execute immediately
    try {
      await entry.processor({ data, id: `sync-${Date.now()}` });
    } catch (err) {
      logger.error(`Sync job failed: ${name}`, { error: err.message });
    }
    return null;
  }

  return entry.queue.add(name, data, opts);
}

/**
 * Gracefully shut down all queues and workers.
 */
export async function shutdownQueues() {
  for (const [name, worker] of Object.entries(workers)) {
    try {
      await worker.close();
      logger.info(`Worker "${name}" closed`);
    } catch (err) {
      logger.error(`Error closing worker "${name}"`, { error: err.message });
    }
  }
  for (const [name, entry] of Object.entries(queues)) {
    if (!entry.sync && entry.queue) {
      try {
        await entry.queue.close();
        logger.info(`Queue "${name}" closed`);
      } catch (err) {
        logger.error(`Error closing queue "${name}"`, { error: err.message });
      }
    }
  }
}

export default { registerQueue, addJob, shutdownQueues };
