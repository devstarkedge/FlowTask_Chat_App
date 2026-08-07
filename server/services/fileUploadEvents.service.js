import eventBus from './eventBus.js';
import FileReference from '../modules/files/FileReference.model.js';
import messageRepository from '../modules/messages/message.repository.js';
import { emitToChannel } from '../sockets/socketManager.js';
import { SOCKET_EVENTS } from '../config/constants.js';
import { messageSocketPayload } from '../utils/socketPayload.js';
import logger from '../utils/logger.js';

/**
 * When async uploads finish, push message:update so clients receive real file URLs
 * without requiring a manual refresh.
 */
export function registerFileUploadEventHandlers() {
  eventBus.register(
    'file:uploaded',
    async ({ assetId, asset }) => {
      const fileId = assetId?.toString?.() || asset?._id?.toString?.();
      if (!fileId) return;

      const refs = await FileReference.find({ fileId }).lean();
      if (!refs.length) return;

      const messageIds = [
        ...new Set(refs.map((ref) => ref.messageId?.toString()).filter(Boolean)),
      ];

      for (const messageId of messageIds) {
        const ref = refs.find((r) => r.messageId?.toString() === messageId);
        const workspaceId = ref?.workspaceId?.toString();
        const channelId = ref?.channelId?.toString();
        if (!channelId) continue;

        const populated = await messageRepository.findById(messageId, { workspaceId });
        if (!populated) continue;

        const socketPayload = messageSocketPayload(populated);
        emitToChannel(
          channelId,
          SOCKET_EVENTS.MESSAGE_UPDATE,
          { message: socketPayload },
          workspaceId,
        );

        logger.debug('Emitted message:update after file upload', {
          messageId,
          channelId,
          fileId,
        });
      }
    },
    'fileUploadMessageSync',
  );
}
