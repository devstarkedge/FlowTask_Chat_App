import { Queue, Worker } from 'bullmq';
import env from '../config/environment.js';
import logger from '../utils/logger.js';

/**
 * Job Queue Service — BullMQ-backed async job processing.
 * Falls back to synchronous execution when Redis is unavailable.
 */

const queues = {};
const workers = {};

const pendingRegistrations = [];

export function registerQueue(name, processor, opts = {}) {
  pendingRegistrations.push({ name, processor, opts });
  logger.debug(`Queue "${name}" registered (pending initialization)`);
}

export async function initQueues() {
  const { default: redisManager } = await import('../config/redisManager.js');
  const connection = redisManager.getSharedClient();

  for (const { name, processor, opts } of pendingRegistrations) {
    if (!connection) {
      queues[name] = { processor, sync: true };
      logger.info(`Queue "${name}" initialized (sync fallback, no Redis)`);
      continue;
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
    logger.info(`Queue "${name}" initialized with BullMQ (concurrency: ${opts.concurrency || 3})`);
  }
  
  // Clear pending array
  pendingRegistrations.length = 0;
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
    // If the job has a delay, do NOT execute immediately in sync mode.
    // Delayed jobs (e.g. scheduled messages) must wait for their time — the
    // caller's polling interval will process them when they become due.
    if (opts.delay && opts.delay > 0) {
      logger.debug(`Sync queue "${name}": delayed job deferred to polling (delay: ${opts.delay}ms)`);
      return null;
    }

    // Synchronous fallback — execute immediately and propagate processor result
    if (opts.backgroundOnly) {
      const jobWrapper = { data, id: opts.jobId || `background-${Date.now()}` };
      setImmediate(() => {
        entry.processor(jobWrapper).catch((err) => {
          logger.error(`Background fallback job failed: ${name}`, {
            jobId: jobWrapper.id,
            error: err.message,
          });
        });
      });
      return { queuedInBackground: true, id: jobWrapper.id };
    }

    try {
      const jobWrapper = { data, id: `sync-${Date.now()}` };
      const result = await entry.processor(jobWrapper);
      // If the processor returned a value (e.g. the event-bus processor returns
      // the handler settlement result), propagate it. Otherwise return a
      // sentinel indicating the job was processed synchronously.
      return result || { processedSync: true };
    } catch (err) {
      logger.error(`Sync job failed: ${name}`, { error: err.message });
      return { processedSync: true, error: err.message };
    }
  }

  const { backgroundOnly: _backgroundOnly, ...queueOptions } = opts;
  return entry.queue.add(name, data, queueOptions);
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

export default { registerQueue, initQueues, addJob, shutdownQueues };
