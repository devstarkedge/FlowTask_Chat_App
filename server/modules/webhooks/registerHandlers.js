import { registerProjectEventHandlers } from './handlers/projectEventHandler.js';
import { registerTaskEventHandlers } from './handlers/taskEventHandler.js';
import { registerUserEventHandlers } from './handlers/userEventHandler.js';
import { registerAnnouncementEventHandlers } from './handlers/announcementEventHandler.js';
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

  logger.info('All webhook event handlers registered');
}
