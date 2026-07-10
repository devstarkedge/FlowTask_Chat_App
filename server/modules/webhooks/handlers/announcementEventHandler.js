import eventBus from '../../../services/eventBus.js';
import botNotifier from '../../../services/botNotifier.js';
import channelRepository from '../../channels/channel.repository.js';
import messageRepository from '../../messages/message.repository.js';
import messageService from '../../messages/message.service.js';
import userRepository from '../../users/user.repository.js';
import logger from '../../../utils/logger.js';
import { FLOWTASK_EVENTS, SYSTEM_CHANNELS, SOCKET_EVENTS } from '../../../config/constants.js';
import { emitToChannel, emitToUser } from '../../../sockets/socketManager.js';
import env from '../../../config/environment.js';

// Optional Redis-backed idempotency (uses REDIS_URL when available)
async function getRedisClient() {
  if (!env.REDIS_URL) return null;
  try {
    const { default: redisManager } = await import('../../../config/redisManager.js');
    return redisManager.getSharedClient();
  } catch (err) {
    logger.warn('Failed to get singleton Redis client for idempotency, continuing with in-memory fallback', err?.message || err);
    return null;
  }
}

export async function cleanupAnnouncementRedis() {
  // Client is managed by redisManager, no-op
}

/**
 * Announcement Event Handler — sync FlowTask announcements with ChatApp
 *
 * Idempotency: processed delete syncVersions are tracked in a short-lived
 * in-memory Set to prevent duplicate processing from BullMQ retries.
 */

// ─── Idempotency guard ───────────────────────────────────────────────────────
// Uses Redis SET NX EX for cross-instance atomicity when REDIS_URL is configured.
const processedDeleteEvents = new Map(); // fallback: syncVersion → expiry timestamp
const DELETE_EVENT_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

async function isDeleteEventProcessed(syncVersion) {
  if (!syncVersion) return false;
  // Try Redis first (atomic, cross-instance)
  try {
    const client = await getRedisClient();
    if (client) {
      const key = `announcement:delete:${syncVersion}`;
      const v = await client.get(key);
      return !!v;
    }
  } catch (err) {
    logger.warn('isDeleteEventProcessed: redis check failed, falling back to memory', err?.message || err);
  }

  // In-memory fallback (best-effort, process-local)
  const expiry = processedDeleteEvents.get(syncVersion);
  if (!expiry) return false;
  if (Date.now() > expiry) {
    processedDeleteEvents.delete(syncVersion);
    return false;
  }
  return true;
}

async function markDeleteEventProcessed(syncVersion) {
  if (!syncVersion) return;
  // Try Redis first (SET NX EX)
  try {
    const client = await getRedisClient();
    if (client) {
      const key = `announcement:delete:${syncVersion}`;
      // SET key value NX EX seconds
      await client.set(key, '1', 'EX', Math.floor(DELETE_EVENT_TTL_MS / 1000), 'NX');
      return;
    }
  } catch (err) {
    logger.warn('markDeleteEventProcessed: redis set failed, falling back to memory', err?.message || err);
  }

  // In-memory fallback
  processedDeleteEvents.set(syncVersion, Date.now() + DELETE_EVENT_TTL_MS);
  // Prune expired entries every 1000 tracked events to prevent unbounded growth
  if (processedDeleteEvents.size > 1000) {
    const now = Date.now();
    for (const [key, expiry] of processedDeleteEvents) {
      if (now > expiry) processedDeleteEvents.delete(key);
    }
  }
}

// ─── Handler registration ────────────────────────────────────────────────────

export function registerAnnouncementEventHandlers() {

  // ── CREATE ──────────────────────────────────────────────────────────────
  eventBus.register(
    FLOWTASK_EVENTS.ANNOUNCEMENT_CREATED,
    async (payload) => {
      const { announcement, userId, _workspaceId: wsId } = payload;

      if (!announcement) {
        logger.warn('announcement.created: missing announcement data');
        return;
      }

      const channel = await channelRepository.findBySlug(
        SYSTEM_CHANNELS.ANNOUNCEMENTS.slug,
        wsId
      );

      if (!channel) {
        logger.warn('announcement.created: #announcements channel not found');
        return;
      }

      const author = userId
        ? await userRepository.findByFlowTaskId(userId, wsId)
        : null;

      const authorName = author?.name || 'Admin';

      const title = announcement.title || 'Announcement';
      const description = announcement.description || '';
      const category = announcement.category || null;

      const msg = [
        `New announcement: **${title}**`,
        `Author: ${authorName}`,
        description && `${description}`,
        category && `Category: ${category}`,
      ]
        .filter(Boolean)
        .join('  •  ');

      const subscriberIds =
        announcement?.subscriberIds ||
        payload?.subscriberIds ||
        [];

      if (!subscriberIds.length) {
        logger.warn('announcement.created: no subscribers, skipping');
        return;
      }

      const chatUsers = await userRepository.findByFlowTaskIds(subscriberIds, wsId);
      const chatUserIds = [...new Set(chatUsers.map((u) => u._id.toString()))];
      if (!chatUserIds.length) {
        logger.warn('announcement.created: no matching ChatApp users for subscribers');
        return;
      }

      const activityMeta = {
        eventType: 'ANNOUNCEMENT_CREATED',
        announcementId: announcement._id || announcement.id || null,
        announcementTitle: title,
        announcementDescription: description ? description.substring(0, 200) : null,
        actorName: authorName,
        category,
        priority: announcement.priority || null,
      };

      await messageService.sendSystemMessage(
        channel._id,
        msg,
        { entityType: 'announcement', entityId: announcement._id },
        wsId,
        chatUserIds,
        activityMeta
      );

      await botNotifier.onAnnouncementCreated(title, authorName, wsId, chatUserIds);

      logger.info('announcement.created handled', {
        channelId: channel._id,
        announcementId: announcement._id,
        users: chatUserIds.length,
      });
    },
    'announcementCreatedHandler'
  );

  // ── DELETE ──────────────────────────────────────────────────────────────
  eventBus.register(
    FLOWTASK_EVENTS.ANNOUNCEMENT_DELETED,
    async (payload) => {
      const {
        announcement,
        announcementId: directId,
        _workspaceId: wsId,
        syncVersion,
        deletedBy,
        deletedAt,
      } = payload;

      // Idempotency: skip already-processed delete events
      if (syncVersion && await isDeleteEventProcessed(syncVersion)) {
        logger.info('announcement.deleted: duplicate event skipped', { syncVersion });
        return;
      }

      const announcementId =
        directId ||
        announcement?._id ||
        announcement?.id;

      if (!announcementId) {
        logger.warn('announcement.deleted: missing announcementId', { payload });
        return;
      }

      try {
        // Find linked messages BEFORE deleting so we know which channel to broadcast to
        const linkedMessages = await messageRepository.findByFlowTaskRef(
          'announcement',
          announcementId,
          wsId
        );

        // Soft-delete the linked system messages and emit message:update tombstones
        await messageService.deleteByFlowTaskRef('announcement', announcementId, wsId);

        // Mark event as processed (idempotency)
        if (syncVersion) await markDeleteEventProcessed(syncVersion);

        // Broadcast semantic announcement:deleted event so frontend can do
        // clean removal (not just show a tombstone)
        const socketPayload = {
          announcementId,
          deletedBy: deletedBy || null,
          deletedAt: deletedAt || new Date().toISOString(),
          workspaceId: wsId,
        };

        if (linkedMessages && linkedMessages.length > 0) {
          // Emit per-channel for each affected channel (usually just #announcements)
          const affectedChannelIds = [...new Set(
            linkedMessages.map((m) => m.channelId?.toString()).filter(Boolean)
          )];
          for (const channelId of affectedChannelIds) {
            emitToChannel(channelId, SOCKET_EVENTS.ANNOUNCEMENT_DELETED, socketPayload, wsId);
          }
          // Also emit to each subscriber who had visibility-restricted access
          const visibleToUserIds = linkedMessages
            .flatMap((m) => m.visibleTo || [])
            .map((id) => id.toString());
          const uniqueUserIds = [...new Set(visibleToUserIds)];
          for (const userId of uniqueUserIds) {
            emitToUser(userId, SOCKET_EVENTS.ANNOUNCEMENT_DELETED, socketPayload, wsId);
          }
        } else {
          // Fallback: broadcast to the system announcements channel
          const channel = await channelRepository.findBySlug(
            SYSTEM_CHANNELS.ANNOUNCEMENTS.slug,
            wsId
          );
          if (channel) {
            emitToChannel(channel._id.toString(), SOCKET_EVENTS.ANNOUNCEMENT_DELETED, socketPayload, wsId);
          }
        }

        logger.info('announcement.deleted handled', { announcementId, syncVersion });
      } catch (err) {
        logger.error('announcement.deleted failed', {
          error: err.message,
          announcementId,
          syncVersion,
        });
        throw err; // Re-throw so BullMQ can retry
      }
    },
    'announcementDeletedHandler'
  );

  // ── UPDATE ──────────────────────────────────────────────────────────────
  eventBus.register(
    FLOWTASK_EVENTS.ANNOUNCEMENT_UPDATED,
    async (payload) => {
      const { announcement, userId, _workspaceId: wsId } = payload;

      if (!announcement) {
        logger.warn('announcement.updated: missing announcement data');
        return;
      }

      const announcementId = announcement._id || announcement.id;
      if (!announcementId) {
        logger.warn('announcement.updated: missing announcementId');
        return;
      }

      try {
        // Find the linked system message(s) and update their activityMeta
        const linkedMessages = await messageRepository.findByFlowTaskRef(
          'announcement',
          announcementId,
          wsId
        );

        if (!linkedMessages || linkedMessages.length === 0) {
          logger.warn('announcement.updated: no linked messages found', { announcementId });
          return;
        }

        const author = userId
          ? await userRepository.findByFlowTaskId(userId, wsId)
          : null;
        const authorName = author?.name || announcement.actorName || 'Admin';

        const title = announcement.title || 'Announcement';
        const description = announcement.description || '';
        const category = announcement.category || null;

        const updatedMsg = [
          `Updated announcement: **${title}**`,
          `Author: ${authorName}`,
          description && `${description}`,
          category && `Category: ${category}`,
        ]
          .filter(Boolean)
          .join('  •  ');

        const updatedActivityMeta = {
          eventType: 'ANNOUNCEMENT_UPDATED',
          announcementId,
          announcementTitle: title,
          announcementDescription: description ? description.substring(0, 200) : null,
          actorName: authorName,
          category,
          priority: announcement.priority || null,
        };

        for (const msg of linkedMessages) {
          // Patch content and activityMeta in-place
          msg.content = updatedMsg;
          msg.activityMeta = { ...msg.activityMeta, ...updatedActivityMeta };
          await msg.save();

          // Broadcast message:update to subscribers
          const socketPayload = { message: msg };
          if (msg.visibleTo && msg.visibleTo.length > 0) {
            for (const uid of msg.visibleTo) {
              emitToUser(uid.toString(), SOCKET_EVENTS.MESSAGE_UPDATE, socketPayload, wsId);
            }
          } else {
            emitToChannel(msg.channelId.toString(), SOCKET_EVENTS.MESSAGE_UPDATE, socketPayload, wsId);
          }

          // Also emit semantic announcement:updated
          emitToChannel(msg.channelId.toString(), SOCKET_EVENTS.ANNOUNCEMENT_UPDATED, {
            announcementId,
            title,
            description,
            category,
            priority: announcement.priority || null,
            workspaceId: wsId,
          }, wsId);
        }

        logger.info('announcement.updated handled', { announcementId, messages: linkedMessages.length });
      } catch (err) {
        logger.error('announcement.updated failed', {
          error: err.message,
          announcementId,
        });
        throw err;
      }
    },
    'announcementUpdatedHandler'
  );

  logger.info('Announcement event handlers registered');
}
