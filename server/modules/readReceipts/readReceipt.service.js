import ReadReceipt from "./readReceipt.model.js";
import Channel from "../channels/Channel.model.js";
import ChatUser from "../users/ChatUser.model.js";
import Message from "../messages/Message.model.js";
import { emitToChannel, emitToUser } from "../../sockets/socketManager.js";
import { SOCKET_EVENTS } from "../../config/constants.js";
import logger from "../../utils/logger.js";

/**
 * Helper to get all recipient user IDs for a given message and channel.
 * Ensures DMs, group channels, project channels, and reporting channels
 * correctly identify all candidate recipients, excluding the message author.
 */
async function getRecipientUserIds(channel, message, authorId, workspaceId) {
  const recipientIds = new Set();
  const authorIdStr = authorId?.toString();

  // 1. DM channel participants
  if (channel?.type === 'dm') {
    if (Array.isArray(channel.dmParticipants)) {
      for (const p of channel.dmParticipants) {
        const pId = (p?._id || p)?.toString();
        if (pId && pId !== authorIdStr) {
          recipientIds.add(pId);
        }
      }
    }
  }

  // 2. Embedded channel members (common across all channel types)
  if (Array.isArray(channel?.members)) {
    for (const m of channel.members) {
      const mId = (m?.userId?._id || m?.userId)?.toString();
      if (mId && mId !== authorIdStr) {
        recipientIds.add(mId);
      }
    }
  }

  // 3. For non-DM channels, check active ChannelMember collection
  if (channel?.type !== 'dm' && channel?._id) {
    try {
      const { default: ChannelMember } = await import('../channels/ChannelMember.model.js');
      const activeMembers = await ChannelMember.find({
        channelId: channel._id,
        isActive: true,
      }).select('userId').lean();

      for (const m of activeMembers) {
        const mId = (m?.userId?._id || m?.userId)?.toString();
        if (mId && mId !== authorIdStr) {
          recipientIds.add(mId);
        }
      }
    } catch (err) {
      logger.debug('Failed to query ChannelMember for message info recipients', {
        channelId: channel._id,
        error: err.message,
      });
    }

    // 4. FlowTask project channel authorized users
    try {
      const { canAccessFlowTaskProjectChannel, getAuthorizedProjectUserIds, isFlowTaskProjectChannel } =
        await import('../flowtask/projectAccess.service.js');
      if (isFlowTaskProjectChannel(channel)) {
        const projectUserIds = await getAuthorizedProjectUserIds(channel, workspaceId);
        for (const pId of projectUserIds || []) {
          const strId = pId?.toString();
          if (strId && strId !== authorIdStr) {
            recipientIds.add(strId);
          }
        }
      }
    } catch (err) {
      logger.debug('Failed to query project authorized user IDs', {
        channelId: channel?._id,
        error: err.message,
      });
    }

    // 5. Reporting channel recipients
    try {
      const { isReportingChannel, reportingRecipients } =
        await import('../channels/recipientChannelAccess.js');
      if (isReportingChannel(channel)) {
        const repRecipients = await reportingRecipients(channel);
        for (const rId of repRecipients || []) {
          const strId = (rId?._id || rId)?.toString();
          if (strId && strId !== authorIdStr) {
            recipientIds.add(strId);
          }
        }
      }
    } catch {
      // Non-reporting channel, safe to ignore
    }
  }

  // 6. Include any user who has a record in message.readBy (even if they left or are archived)
  if (Array.isArray(message?.readBy)) {
    for (const rb of message.readBy) {
      const rbUserId = (rb?.userId?._id || rb?.userId)?.toString();
      if (rbUserId && rbUserId !== authorIdStr) {
        recipientIds.add(rbUserId);
      }
    }
  }

  return recipientIds;
}

/**
 * Get message info: delivery/read status per member
 */
export const getMessageInfo = async (messageId, channelId, requesterId, workspaceId) => {
  // 1. Fetch message
  const message = await Message.findById(messageId).lean();
  if (!message) {
    return {
      messageId: messageId?.toString(),
      channelId: channelId?.toString(),
      totalRecipients: 0,
      deliveredCount: 0,
      readCount: 0,
      pendingCount: 0,
      deliveredTo: [],
      readBy: [],
      pending: [],
    };
  }

  const resolvedChannelId = channelId || message.channelId?.toString();
  const resolvedWorkspaceId = workspaceId || message.workspaceId?.toString();
  const authorId = (message.authorId?._id || message.authorId)?.toString();

  // 2. Fetch channel
  const channel = resolvedChannelId
    ? await Channel.findById(resolvedChannelId).lean()
    : null;

  // 3. Collect all recipient user IDs (excluding the message author)
  const recipientIdSet = await getRecipientUserIds(
    channel,
    message,
    authorId,
    resolvedWorkspaceId,
  );

  // 4. Query per-message ReadReceipt records
  const receipts = await ReadReceipt.find({
    messageId,
    channelId: resolvedChannelId,
  }).lean();
  const receiptMap = new Map(receipts.map((r) => [r.userId.toString(), r]));

  // Also include any users who have a per-message ReadReceipt record
  for (const r of receipts) {
    const rUid = r.userId?.toString();
    if (rUid && rUid !== authorId) {
      recipientIdSet.add(rUid);
    }
  }

  const recipientIds = Array.from(recipientIdSet);

  // 5. Fetch profiles for all recipients from ChatUser
  const userDocs = await ChatUser.find({
    _id: { $in: recipientIds },
  })
    .select('_id name email avatar role isActive')
    .lean();
  const userMap = new Map(userDocs.map((u) => [u._id.toString(), u]));

  // 6. Query channel-level ReadReceipts for recipients (for historical lastReadAt / lastReadMessageId)
  const channelReceipts = recipientIds.length > 0
    ? await ReadReceipt.find({
        channelId: resolvedChannelId,
        messageId: null,
        userId: { $in: recipientIds },
      }).lean()
    : [];
  const channelReceiptMap = new Map(
    channelReceipts.map((r) => [r.userId.toString(), r])
  );

  // 7. Map denormalized message.readBy records
  const messageReadByMap = new Map();
  if (Array.isArray(message.readBy)) {
    for (const rb of message.readBy) {
      const rUid = (rb.userId?._id || rb.userId)?.toString();
      if (rUid) {
        messageReadByMap.set(rUid, rb.readAt || message.updatedAt || new Date());
      }
    }
  }

  // 8. Classify each recipient into readBy, deliveredTo, or pending
  const deliveredTo = [];
  const readBy = [];
  const pending = [];
  const now = new Date();
  const messageCreatedAt = message.createdAt ? new Date(message.createdAt) : now;

  for (const recipientId of recipientIds) {
    const userObj = userMap.get(recipientId);
    const receipt = receiptMap.get(recipientId);
    const channelReceipt = channelReceiptMap.get(recipientId);

    // Resolve readAt
    let readAt = null;
    if (receipt && receipt.readAt) {
      readAt = receipt.readAt;
    } else if (messageReadByMap.has(recipientId)) {
      readAt = messageReadByMap.get(recipientId);
    } else if (
      channel?.type === 'dm' &&
      (message.status === 'seen' || message.seenAt)
    ) {
      readAt = message.seenAt || message.updatedAt || now;
    } else if (channelReceipt?.lastReadAt && new Date(channelReceipt.lastReadAt) >= messageCreatedAt) {
      readAt = channelReceipt.lastReadAt;
    } else if (
      channelReceipt?.lastReadMessageId &&
      channelReceipt.lastReadMessageId.toString() === messageId.toString()
    ) {
      readAt = channelReceipt.lastReadAt || messageCreatedAt;
    }

    // Resolve deliveredAt
    let deliveredAt = null;
    if (receipt && receipt.deliveredAt) {
      deliveredAt = receipt.deliveredAt;
    } else if (readAt) {
      deliveredAt = readAt;
    } else if (
      channel?.type === 'dm' &&
      (message.status === 'delivered' || message.deliveredAt)
    ) {
      deliveredAt = message.deliveredAt || message.createdAt || now;
    }

    const userData = {
      userId: recipientId,
      name: userObj?.name || 'User',
      email: userObj?.email || null,
      avatar: userObj?.avatar || null,
      role: userObj?.role || 'employee',
      status: readAt ? 'read' : deliveredAt ? 'delivered' : 'pending',
    };

    if (readAt) {
      readBy.push({
        ...userData,
        readAt,
      });

      // Self-heal: If ReadReceipt document doesn't have readAt, persist it
      if (!receipt || !receipt.readAt) {
        ReadReceipt.findOneAndUpdate(
          {
            messageId,
            channelId: resolvedChannelId,
            userId: recipientId,
            workspaceId: resolvedWorkspaceId || channel?.workspaceId,
          },
          {
            $set: {
              readAt,
              deliveredAt: deliveredAt || readAt,
            },
          },
          { upsert: true }
        ).catch((err) => {
          logger.debug('Self-healing ReadReceipt upsert failed', {
            messageId,
            userId: recipientId,
            error: err.message,
          });
        });
      }
    } else if (deliveredAt) {
      deliveredTo.push({
        ...userData,
        deliveredAt,
      });
    } else {
      pending.push(userData);
    }
  }

  // Sort readBy and deliveredTo by most recent timestamp first
  readBy.sort((a, b) => new Date(b.readAt).getTime() - new Date(a.readAt).getTime());
  deliveredTo.sort((a, b) => new Date(b.deliveredAt).getTime() - new Date(a.deliveredAt).getTime());

  return {
    messageId: messageId.toString(),
    channelId: resolvedChannelId ? resolvedChannelId.toString() : null,
    totalRecipients: recipientIds.length,
    deliveredCount: deliveredTo.length,
    readCount: readBy.length,
    pendingCount: pending.length,
    deliveredTo,
    readBy,
    pending,
  };
};

/**
 * Mark a message as read by a user
 */
export const markAsRead = async (messageId, channelId, userId, workspaceId, options = {}) => {
  const message = await Message.findById(messageId);
  if (!message) return null;

  const resolvedChannelId = channelId || message.channelId;
  const resolvedWorkspaceId = workspaceId || message.workspaceId;
  const authorId = (message.authorId?._id || message.authorId)?.toString();
  const userIdStr = userId?.toString();

  // Author reading their own message does not count as a recipient read receipt
  if (authorId && authorId === userIdStr) {
    return null;
  }

  const now = new Date();

  // 1. Persist in ReadReceipt collection
  const receipt = await ReadReceipt.findOneAndUpdate(
    {
      messageId,
      channelId: resolvedChannelId,
      userId,
      workspaceId: resolvedWorkspaceId,
    },
    {
      $set: {
        readAt: now,
      },
      $setOnInsert: {
        deliveredAt: now,
      },
    },
    { new: true, upsert: true }
  );

  // 2. Persist in Message document (readBy array + seen status for DMs)
  const channel = resolvedChannelId ? await Channel.findById(resolvedChannelId).select('type').lean() : null;
  const isDM = channel?.type === 'dm';

  const updateFields = {
    $addToSet: {
      readBy: {
        userId,
        readAt: now,
      },
    },
  };

  if (isDM) {
    updateFields.$set = {
      status: 'seen',
      seenAt: now,
    };
  }

  await Message.updateOne({ _id: messageId }, updateFields);

  const payload = {
    messageId: messageId.toString(),
    channelId: resolvedChannelId ? resolvedChannelId.toString() : null,
    userId: userIdStr,
    readAt: receipt.readAt || now,
  };

  // 3. Broadcast real-time MESSAGE_READ to the channel room
  if (resolvedChannelId) {
    import('../../services/notificationOutbox.service.js')
      .then(({ default: outbox }) => outbox.cancelForChannelRead(userIdStr, resolvedChannelId, 'already_read'))
      .catch(() => {});
    emitToChannel(
      resolvedChannelId.toString(),
      SOCKET_EVENTS.MESSAGE_READ,
      payload,
      resolvedWorkspaceId?.toString()
    );
  }

  // 4. Emit directly to the author (in their personal user room)
  if (authorId && authorId !== userIdStr) {
    emitToUser(
      authorId,
      SOCKET_EVENTS.MESSAGE_READ,
      payload,
      resolvedWorkspaceId?.toString()
    );

    // Also emit MESSAGE_STATUS for checkmark status synchronization
    emitToUser(
      authorId,
      SOCKET_EVENTS.MESSAGE_STATUS,
      {
        channelId: resolvedChannelId ? resolvedChannelId.toString() : null,
        messageId: messageId.toString(),
        messageIds: [messageId.toString()],
        status: 'seen',
        seenAt: now,
      },
      resolvedWorkspaceId?.toString()
    );
  }

  // 5. Synchronize notification read status for this read message
  if (!options.skipNotificationSync) {
    try {
      const { default: notificationService } = await import('../notifications/notification.service.js');
      await notificationService.markMessageNotificationsAsRead(messageId, userId, resolvedWorkspaceId);
    } catch (err) {
      logger.warn('Failed to sync notification read status on message read', {
        messageId: messageId?.toString(),
        userId: userIdStr,
        error: err?.message,
      });
    }
  }

  return receipt;
};

/**
 * Mark multiple messages as read by a user.
 */
export const markMultipleAsRead = async (messageIds, channelId, userId, workspaceId, options = {}) => {
  if (!Array.isArray(messageIds) || messageIds.length === 0) return [];
  const results = [];
  for (const messageId of messageIds) {
    if (messageId) {
      const receipt = await markAsRead(messageId, channelId, userId, workspaceId, {
        ...options,
        skipNotificationSync: true, // Batch notification sync below
      });
      if (receipt) results.push(receipt);
    }
  }

  if (!options.skipNotificationSync) {
    try {
      const { default: notificationService } = await import('../notifications/notification.service.js');
      await notificationService.markMessagesNotificationsAsRead(messageIds, userId, workspaceId);
    } catch (err) {
      logger.warn('Failed to sync notifications on batch message read', {
        count: messageIds.length,
        userId: userId?.toString(),
        error: err?.message,
      });
    }
  }

  return results;
};

/**
 * Mark a message as delivered to a user
 */
export const markAsDelivered = async (messageId, channelId, userId, workspaceId) => {
  const message = await Message.findById(messageId);
  if (!message) return null;

  const resolvedChannelId = channelId || message.channelId;
  const resolvedWorkspaceId = workspaceId || message.workspaceId;
  const authorId = (message.authorId?._id || message.authorId)?.toString();
  const userIdStr = userId?.toString();

  // Author does not receive delivery receipt for own message
  if (authorId && authorId === userIdStr) {
    return null;
  }

  const now = new Date();

  // 1. Persist in ReadReceipt collection
  const receipt = await ReadReceipt.findOneAndUpdate(
    {
      messageId,
      channelId: resolvedChannelId,
      userId,
      workspaceId: resolvedWorkspaceId,
    },
    {
      $setOnInsert: {
        deliveredAt: now,
      },
    },
    { new: true, upsert: true }
  );

  // 2. Update message status if currently sent
  if (message.status === 'sent') {
    await Message.updateOne(
      { _id: messageId, status: 'sent' },
      { $set: { status: 'delivered', deliveredAt: receipt.deliveredAt || now } }
    );
  }

  const payload = {
    messageId: messageId.toString(),
    channelId: resolvedChannelId ? resolvedChannelId.toString() : null,
    userId: userIdStr,
    deliveredAt: receipt.deliveredAt || now,
  };

  // 3. Broadcast real-time MESSAGE_DELIVERED to the channel room
  if (resolvedChannelId) {
    emitToChannel(
      resolvedChannelId.toString(),
      SOCKET_EVENTS.MESSAGE_DELIVERED,
      payload,
      resolvedWorkspaceId?.toString()
    );
  }

  // 4. Emit directly to the author
  if (authorId && authorId !== userIdStr) {
    emitToUser(
      authorId,
      SOCKET_EVENTS.MESSAGE_DELIVERED,
      payload,
      resolvedWorkspaceId?.toString()
    );

    if (message.status === 'sent') {
      emitToUser(
        authorId,
        SOCKET_EVENTS.MESSAGE_STATUS,
        {
          channelId: resolvedChannelId ? resolvedChannelId.toString() : null,
          messageId: messageId.toString(),
          messageIds: [messageId.toString()],
          status: 'delivered',
          deliveredAt: receipt.deliveredAt || now,
        },
        resolvedWorkspaceId?.toString()
      );
    }
  }

  return receipt;
};
