import { useScheduledStore } from '../../stores/scheduledStore';
import { showLocalNotification } from '../../services/pushNotificationService';
import logger from '../../utils/logger';

export default (socket) => {
  socket.on('scheduled:sent', ({ scheduledMessageId, channelId, message }) => {
    logger.info('[ScheduledEvents] scheduled:sent received', scheduledMessageId);

    // Remove from the scheduled list
    useScheduledStore.getState().handleScheduledSent({ scheduledMessageId });

    // Derive a readable preview from the message payload
    const preview = message?.content
      ? message.content.replace(/<[^>]*>/g, '').trim().slice(0, 80)
      : null;

    showLocalNotification({
      title: 'Scheduled message sent',
      body: preview || 'Your scheduled message has been sent.',
      data: { channelId, messageId: message?._id, type: 'scheduled_sent' },
    });
  });

  socket.on('scheduled:failed', ({ scheduledMessageId, error }) => {
    logger.error('[ScheduledEvents] scheduled:failed', scheduledMessageId, error);
    useScheduledStore.getState().handleScheduledFailed({ scheduledMessageId, error });

    showLocalNotification({
      title: 'Scheduled message failed',
      body: 'A scheduled message could not be sent. Tap to review.',
      data: { type: 'scheduled_failed' },
    });
  });

  socket.on('scheduled:cancelled', ({ scheduledMessageId }) => {
    useScheduledStore.getState().handleScheduledCancelled({ scheduledMessageId });
  });
};
