import { registerQueue } from './jobQueue.service.js';
import notificationEngine from './notificationEngine.js';
import logger from '../utils/logger.js';

const QUEUE_NAME = 'notification_queue';

/**
 * BullMQ processor for notifications.
 */
async function processNotificationJob(job) {
  const { message, channel, options } = job.data;
  if (!message || !channel) {
    logger.warn('NotificationQueue: missing message or channel data in job', { jobId: job.id });
    return;
  }
  
  // Hand off to the notification engine
  await notificationEngine.processMessage(message, channel, options);
}

// Register the queue with a concurrency of 5
registerQueue(QUEUE_NAME, processNotificationJob, { concurrency: 5 });

export const notificationQueue = {   
  add: async (message, channel, options) => {
    // Dynamically import jobQueue.service to avoid circular deps during boot
    const { addJob } = await import('./jobQueue.service.js');
    return addJob(QUEUE_NAME, { message, channel, options }, {
      // Small delay helps avoid race conditions where the socket message
      // hasn't reached the client before the push notification does.
      delay: 100,
      jobId: `notif-${message._id}`,
      removeOnComplete: true,
      removeOnFail: 100,
    });
  }
};

export default notificationQueue;
