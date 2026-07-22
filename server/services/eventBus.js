import { EventEmitter } from 'events';
import logger from '../utils/logger.js';
import env from '../config/environment.js';
import { registerQueue, addJob } from './jobQueue.service.js';
import ProcessedEvent from '../modules/flowtask/ProcessedEvent.model.js';

/**
 * In-process event bus for decoupling webhook ingestion from event handlers.
 *
 * Design:
 *  - Uses Node.js EventEmitter for simplicity (single-process deployment).
 *  - Handler interface is designed so swapping to BullMQ requires changing ONLY this file.
 *  - All handlers are registered with error isolation — one handler failure doesn't block others.
 *
 * Future migration path:
 *  - Replace emit() with queue.add()
 *  - Replace on() with worker.process()
 *  - Keep handler function signatures identical.
 */

class EventBus extends EventEmitter {
  constructor() {
    super();
    // Increase max listeners to accommodate many event types
    this.setMaxListeners(50);
    this._handlerMap = new Map(); // Track registered handlers for health checks
  }

  /**
   * Register an event handler with error isolation.
   * @param {string} eventName
   * @param {Function} handler - async (payload) => void
   * @param {string} [handlerName] - for logging/debugging
   */
  register(eventName, handler, handlerName = 'anonymous') {
    const wrappedHandler = async (payload) => {
      const startTime = Date.now();
      try {
        await handler(payload);
        logger.debug(`Event handler completed`, {
          event: eventName,
          handler: handlerName,
          durationMs: Date.now() - startTime,
        });
      } catch (error) {
        logger.error(`Event handler failed`, {
          event: eventName,
          handler: handlerName,
          error: error.message,
          stack: error.stack,
          durationMs: Date.now() - startTime,
        });
        // Emit error event for monitoring — do NOT rethrow to prevent cascade
        this.emit('handler:error', {
          eventName,
          handlerName,
          error,
          payload,
        });
        throw error;
      }
    };

    this.on(eventName, wrappedHandler);

    // Track handler registrations
    if (!this._handlerMap.has(eventName)) {
      this._handlerMap.set(eventName, []);
    }
    this._handlerMap.get(eventName).push(handlerName);

    logger.info(`Registered event handler: ${handlerName} → ${eventName}`);
  }
  /**
   * Internal local dispatch — invokes registered handlers in-process.
   * Separated so we can optionally route events through a distributed queue.
   */
  async _dispatchLocal(eventName, payload) {
    const handlerCount = this.listenerCount(eventName);
    if (handlerCount === 0) {
      logger.warn(`No handlers registered for event: ${eventName}`);
      return { settled: [] };
    }

    logger.info(`Dispatching event (local)`, {
      event: eventName,
      handlers: handlerCount,
      deliveryId: payload?.deliveryId,
    });

    const handlerPromises = [];
    const listeners = this.listeners(eventName);
    for (const listener of listeners) {
      handlerPromises.push(listener(payload));
    }

    const settled = await Promise.allSettled(handlerPromises);
    const failures = settled.filter((r) => r.status === 'rejected');
    if (failures.length > 0) {
      logger.warn(`${failures.length}/${settled.length} handlers failed for ${eventName}`);
    }
    return { settled };
  }

  /**
   * Dispatch an event. When Redis/BullMQ is available this enqueues the event
   * into the distributed `event-bus` queue so other instances can process it.
   * Falls back to in-process handler invocation when queueing is not available.
   */
  async dispatch(eventName, payload) {
    // Attempt to enqueue to distributed queue first
    try {
      const jobResult = await addJob('event-bus', { eventName, payload });
      if (jobResult) {
        // Bull Job object (queued in Redis) — has an id property and no settled result
        if (jobResult.id && !jobResult.settled) {
          logger.debug('EventBus: enqueued event', { eventName, deliveryId: payload?.deliveryId });
          return { queued: true };
        }

        // Processor executed synchronously and returned a settled result
        if (jobResult.settled) {
          logger.debug('EventBus: processed sync via queue processor', { eventName, deliveryId: payload?.deliveryId });
          return jobResult;
        }

        // Sync sentinel from addJob — propagate result if present
        if (jobResult.processedSync) {
          logger.debug('EventBus: processed sync via queue processor (sentinel)', { eventName, deliveryId: payload?.deliveryId });
          return jobResult.result || { settled: [] };
        }

        // Unknown truthy result — treat as queued
        logger.debug('EventBus: enqueued event (unknown job result)', { eventName, deliveryId: payload?.deliveryId });
        return { queued: true };
      }
    } catch (err) {
      logger.warn('EventBus: enqueue failed, falling back to local dispatch', { error: err.message });
    }

    // Fallback to local synchronous dispatch
    return this._dispatchLocal(eventName, payload);
  }

  /**
   * Get health status of the event bus.
   * @returns {object} Registration summary
   */
  getStatus() {
    const status = {};
    for (const [event, handlers] of this._handlerMap) {
      status[event] = {
        handlerCount: handlers.length,
        handlers,
      };
    }
    return status;
  }
}

// Singleton instance
const eventBus = new EventBus();

// Register distributed event-bus queue processor (will be no-op if Redis not configured)
try {
  registerQueue('event-bus', async (job) => {
    const { eventName, payload } = job.data || {};
    if (!eventName) return;

    // Dispatch locally and capture settlement results
    const result = await eventBus._dispatchLocal(eventName, payload);
    const failures = result.settled.filter((entry) => entry.status === 'rejected');
    if (failures.length > 0) {
      const error = failures[0].reason || new Error('Event handler failed');
      if (payload?.deliveryId) {
        await ProcessedEvent.markFailed(
          payload.deliveryId,
          error,
          payload?._workspaceId || payload?.workspaceId,
        );
      }
      throw error;
    }

    // If this job came from a webhook with a deliveryId, mark the processed event completed
    const deliveryId = payload?.deliveryId;
    const workspaceId = payload?._workspaceId || payload?.workspaceId;
    if (deliveryId) {
      try {
        await ProcessedEvent.markCompleted(deliveryId, workspaceId);
      } catch (err) {
        logger.error('EventBus worker: failed to mark ProcessedEvent completed', { deliveryId, error: err.message });
      }
    }

    return result;
  }, { concurrency: 5 });
  logger.info('EventBus: registered distributed event-bus queue (if Redis available)');
} catch (err) {
  logger.warn('EventBus: failed to register event-bus queue', { error: err.message });
}

export default eventBus;
