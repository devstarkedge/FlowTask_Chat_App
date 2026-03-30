import ProcessedEvent from '../modules/flowtask/ProcessedEvent.model.js';
import eventBus from './eventBus.js';
import botNotifier from './botNotifier.js';
import logger from '../utils/logger.js';

const MAX_RETRIES = 3;
const RETRY_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes

let retryTimer = null;

/**
 * Webhook Dead Letter Queue — retries failed webhook event processing
 * with exponential backoff. Alerts admins after max retries exhausted.
 */
class WebhookRetryService {
  /**
   * Start the periodic retry job.
   */
  start() {
    if (retryTimer) return;
    logger.info('WebhookRetryService started (interval: 15 min)');
    retryTimer = setInterval(() => this.processRetries(), RETRY_INTERVAL_MS);
    // Run once on start after a short delay
    setTimeout(() => this.processRetries(), 10_000);
  }

  /**
   * Stop the retry job.
   */
  stop() {
    if (retryTimer) {
      clearInterval(retryTimer);
      retryTimer = null;
      logger.info('WebhookRetryService stopped');
    }
  }

  /**
   * Find failed events under the retry limit and attempt re-processing.
   */
  async processRetries() {
    try {
      const failedEvents = await ProcessedEvent.find({
        status: 'failed',
        attempts: { $lt: MAX_RETRIES },
      })
        .sort({ receivedAt: 1 })
        .limit(50)
        .lean();

      if (failedEvents.length === 0) return;

      logger.info(`WebhookRetry: processing ${failedEvents.length} failed events`);

      for (const event of failedEvents) {
        await this.retryEvent(event);
      }
    } catch (error) {
      logger.error('WebhookRetry: processRetries failed', { error: error.message });
    }
  }

  /**
   * Retry a single failed event with exponential backoff check.
   */
  async retryEvent(event) {
    const backoffMs = Math.pow(2, event.attempts) * 60_000; // 1min, 2min, 4min
    const eligibleAt = new Date(event.processedAt || event.receivedAt).getTime() + backoffMs;

    if (Date.now() < eligibleAt) return; // Not yet eligible for retry

    try {
      // Increment attempt counter atomically
      const updated = await ProcessedEvent.findOneAndUpdate(
        { _id: event._id, status: 'failed' },
        { $set: { status: 'processing' }, $inc: { attempts: 1 } },
        { new: true },
      );
      if (!updated) return; // Already picked up by another process

      // Re-dispatch the event through the bus (dispatch uses Promise.allSettled
      // so handler errors are captured, unlike bare emit which is fire-and-forget)
      const results = await eventBus.dispatch(event.eventName, {
        ...event,
        _retryAttempt: updated.attempts,
        _workspaceId: event.workspaceId,
      });

      // Check if any handler rejected
      const failures = results?.settled?.filter(r => r.status === 'rejected') || [];
      if (failures.length > 0) {
        throw new Error(`${failures.length} handler(s) failed: ${failures.map(f => f.reason?.message || f.reason).join('; ')}`);
      }

      await ProcessedEvent.findOneAndUpdate(
        { _id: event._id, status: 'processing' },
        { $set: { status: 'completed', processedAt: new Date() } },
      );

      logger.info('WebhookRetry: event retried successfully', {
        deliveryId: event.deliveryId,
        eventName: event.eventName,
        attempt: updated.attempts,
      });
    } catch (error) {
      // Mark failed again
      await ProcessedEvent.findOneAndUpdate(
        { _id: event._id },
        {
          $set: {
            status: 'failed',
            lastError: error.message,
            processedAt: new Date(),
          },
        },
      ).catch(() => {});

      logger.error('WebhookRetry: retry failed', {
        deliveryId: event.deliveryId,
        attempt: event.attempts + 1,
        error: error.message,
      });

      // Alert admins if max retries exhausted
      if (event.attempts + 1 >= MAX_RETRIES) {
        await botNotifier.notifyAdmins(
          `⚠️ Webhook event **${event.eventName}** (delivery: \`${event.deliveryId}\`) failed after ${MAX_RETRIES} retries. Last error: ${error.message}`,
          null,
          event.workspaceId?.toString(),
        ).catch(() => {});
      }
    }
  }
}

export default new WebhookRetryService();
