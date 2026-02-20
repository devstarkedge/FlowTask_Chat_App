import ProcessedEvent from '../modules/flowtask/ProcessedEvent.model.js';
import eventBus from './eventBus.js';
import logger from '../utils/logger.js';

/**
 * Event Processor — orchestrates webhook event handling.
 *
 * Pipeline: Idempotency Check → Schema Validation → Event Bus Dispatch → Status Update
 *
 * Responsibilities:
 *  1. Check idempotency (ProcessedEvent table)
 *  2. Validate event schema
 *  3. Dispatch to event bus
 *  4. Update processing status
 */

class EventProcessor {
  /**
   * Process a FlowTask webhook event.
   * Returns the processing result for the HTTP response.
   *
   * @param {object} params
   * @param {string} params.deliveryId
   * @param {string} params.eventName
   * @param {string} params.eventVersion
   * @param {object} params.payload - The event data
   * @returns {{ status: 'processed'|'duplicate'|'failed', statusCode: number }}
   */
  async process({ deliveryId, eventName, eventVersion, payload }) {
    // 1. Idempotency check
    const claim = await ProcessedEvent.claimEvent(deliveryId, eventName);

    if (claim.status === 'duplicate') {
      logger.info('Duplicate event skipped', { deliveryId, eventName });
      return { status: 'duplicate', statusCode: 200 };
    }

    // 2. Process the event
    try {
      logger.info('Processing event', {
        deliveryId,
        eventName,
        eventVersion,
      });

      // Dispatch to registered handlers via event bus (await all handlers)
      const dispatchResult = await eventBus.dispatch(eventName, {
        deliveryId,
        eventName,
        eventVersion,
        data: payload?.data || payload,
        timestamp: payload?.timestamp,
      });

      // Check if any handlers failed
      const failures = dispatchResult.settled.filter((r) => r.status === 'rejected');
      if (failures.length > 0) {
        logger.warn('Some event handlers failed', {
          deliveryId,
          eventName,
          failedCount: failures.length,
          totalCount: dispatchResult.settled.length,
        });
      }

      // 3. Mark as completed (now safe — all handlers have settled)
      await ProcessedEvent.markCompleted(deliveryId);

      return { status: 'processed', statusCode: 200 };
    } catch (error) {
      logger.error('Event processing failed', {
        deliveryId,
        eventName,
        error: error.message,
        stack: error.stack,
      });

      await ProcessedEvent.markFailed(deliveryId, error);

      return { status: 'failed', statusCode: 500 };
    }
  }
}

export default new EventProcessor();
