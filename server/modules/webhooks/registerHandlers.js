import { registerProjectEventHandlers } from './handlers/projectEventHandler.js';
import { registerTaskEventHandlers } from './handlers/taskEventHandler.js';
import { registerUserEventHandlers } from './handlers/userEventHandler.js';
import { registerAnnouncementEventHandlers } from './handlers/announcementEventHandler.js';
import eventBus from '../../services/eventBus.js';
import logger from '../../utils/logger.js';

/**
 * Register all webhook event handlers on the EventBus.
 * Called once during server startup.
 */
export function registerAllEventHandlers() {
  registerProjectEventHandlers();
  registerTaskEventHandlers();
  registerUserEventHandlers();
  registerAnnouncementEventHandlers();

  // Global handler-error listener for observability / future alerting
  eventBus.on('handler:error', ({ eventName, handlerName, error }) => {
    logger.error('EventBus handler error captured', {
      eventName,
      handlerName,
      error: error.message,
      stack: error.stack,
    });
  });

  logger.info('All webhook event handlers registered');
}
