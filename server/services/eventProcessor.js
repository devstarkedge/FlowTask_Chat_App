import ProcessedEvent from '../modules/flowtask/ProcessedEvent.model.js';
import eventBus from './eventBus.js';
import { normalizeWebhookPayload } from '../utils/webhookPayloadNormalizer.js';
import logger from '../utils/logger.js';

/**
 * Event Processor — orchestrates webhook event handling.
 *
 * Pipeline: Idempotency Check → Payload Normalization → Event Bus Dispatch → Status Update
 *
 * Responsibilities:
 *  1. Check idempotency (ProcessedEvent table)
 *  2. Normalize FlowTask payload to ChatApp internal format
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
    const workspaceId = payload?._workspaceId;

    // 1. Idempotency check
    const claim = await ProcessedEvent.claimEvent(deliveryId, eventName);

    if (claim.status === 'duplicate') {
      logger.info('Duplicate event skipped', { deliveryId, eventName, workspaceId });
      return { status: 'duplicate', statusCode: 200 };
    }

    // 2. Process the event
    try {
      logger.info('Processing event', {
        deliveryId,
        eventName,
        eventVersion,
        workspaceId,
        step: 'event_processing_start',
      });

      // Normalize FlowTask payload fields to ChatApp internal format.
      // FlowTask sends { project, actor, task, ... } but handlers expect { board, userId, card, ... }.
      // The normalizer maps field names and preserves _workspaceId at the top level.
      const rawPayload = payload?.data || payload;
      const normalizedData = normalizeWebhookPayload(eventName, rawPayload);

      // Dispatch to registered handlers via event bus (await all handlers).
      // Spread normalized data at top level so handlers can destructure directly:
      //   const { board, userId, _workspaceId } = payload;
      const dispatchPayload = {
        ...normalizedData,
        _workspaceId: workspaceId,
        deliveryId,
        eventName,
        eventVersion,
        timestamp: payload?.timestamp,
      };

      const dispatchResult = await eventBus.dispatch(eventName, dispatchPayload);

      // Check if any handlers failed
      const failures = dispatchResult.settled.filter((r) => r.status === 'rejected');
      if (failures.length > 0) {
        logger.warn('Some event handlers failed', {
          deliveryId,
          eventName,
          workspaceId,
          failedCount: failures.length,
          totalCount: dispatchResult.settled.length,
          step: 'handler_partial_failure',
        });
      }

      // 3. Mark as completed (now safe — all handlers have settled)
      await ProcessedEvent.markCompleted(deliveryId);

      logger.info('Event processing completed', {
        deliveryId,
        eventName,
        workspaceId,
        handlerCount: dispatchResult.settled.length,
        failedCount: failures.length,
        step: 'event_processing_complete',
      });

      return { status: 'processed', statusCode: 200 };
    } catch (error) {
      logger.error('Event processing failed', {
        deliveryId,
        eventName,
        workspaceId,
        error: error.message,
        stack: error.stack,
        step: 'event_processing_error',
      });

      await ProcessedEvent.markFailed(deliveryId, error);

      return { status: 'failed', statusCode: 500 };
    }
  }
}

export default new EventProcessor();
