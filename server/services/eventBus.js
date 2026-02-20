import { EventEmitter } from 'events';
import logger from '../utils/logger.js';

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
   * Emit an event to all registered handlers and await their results.
   * Returns a Promise that resolves when all handlers have settled.
   * @param {string} eventName
   * @param {object} payload
   * @returns {Promise<{settled: PromiseSettledResult[]}>}
   */
  async dispatch(eventName, payload) {
    const handlerCount = this.listenerCount(eventName);
    if (handlerCount === 0) {
      logger.warn(`No handlers registered for event: ${eventName}`);
      return { settled: [] };
    }

    logger.info(`Dispatching event`, {
      event: eventName,
      handlers: handlerCount,
      deliveryId: payload?.deliveryId,
    });

    // Collect handler promises — handlers are wrapped async functions
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

export default eventBus;
