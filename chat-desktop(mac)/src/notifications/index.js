/**
 * @file index.js
 * Public entrypoint for the centralized notification architecture.
 */

export {
  NotificationType,
  NotificationPriority,
  NavigationTargetType,
  ActiveConversationBehavior,
} from './types.js'

export { notificationConfig } from './config.js'
export { eventMapper } from './eventMapper.js'
export { NotificationBuilder } from './notificationBuilder.js'
export { deduplicationManager, DeduplicationManager } from './deduplicationManager.js'
export { navigationRouter, NavigationRouter } from './navigationRouter.js'
export { notificationService, NotificationService } from './notificationService.js'
