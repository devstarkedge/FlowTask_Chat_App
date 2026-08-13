import ReadReceipt from "./readReceipt.model.js";
import Channel from "../channels/Channel.model.js";
import ChatUser from "../users/ChatUser.model.js";
import { emitToChannel } from "../../sockets/socketManager.js";
import { SOCKET_EVENTS } from "../../config/constants.js";

/**
 * Get message info: delivery/read status per member
 */
export const getMessageInfo = async (messageId, channelId, requesterId, workspaceId) => {
  const { default: channelRepository } = await import("../channels/channel.repository.js");
  const members = await channelRepository.listActiveMembers(channelId);

  // Get all channel members except the sender
  const recipientMembers = members.filter(m => {
    const uid = m.userId?._id?.toString() || m.userId?.toString();
    return uid && uid !== requesterId.toString();
  });

  // Get read receipts for this message
  const receipts = await ReadReceipt.find({
    messageId,
    channelId,
    workspaceId,
  }).lean();

  const receiptMap = new Map(receipts.map(r => [r.userId.toString(), r]));

  // Build response
  const deliveredTo = [];
  const readBy = [];
  const pending = [];

  for (const member of recipientMembers) {
    const userObj = member.userId;
    if (!userObj) continue;
    const memberId = userObj._id?.toString();
    const receipt = receiptMap.get(memberId);

    if (receipt && receipt.readAt) {
      readBy.push({
        userId: memberId,
        name: userObj.name || "User",
        avatar: userObj.avatar || null,
        status: "read",
        readAt: receipt.readAt,
      });
    } else if (receipt && receipt.deliveredAt) {
      deliveredTo.push({
        userId: memberId,
        name: userObj.name || "User",
        avatar: userObj.avatar || null,
        status: "delivered",
        deliveredAt: receipt.deliveredAt,
      });
    } else {
      pending.push({
        userId: memberId,
        name: userObj.name || "User",
        avatar: userObj.avatar || null,
        status: "pending",
      });
    }
  }

  return {
    messageId,
    channelId,
    totalRecipients: recipientMembers.length,
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
export const markAsRead = async (messageId, channelId, userId, workspaceId) => {
  const receipt = await ReadReceipt.findOneAndUpdate(
    { messageId, channelId, userId, workspaceId },
    {
      $set: {
        readAt: new Date(),
        deliveredAt: new Date(),
      },
    },
    { new: true, upsert: true }
  );

  // Emit socket event to channel
  emitToChannel(channelId, SOCKET_EVENTS.MESSAGE_READ, {
    messageId,
    channelId,
    userId,
    readAt: receipt.readAt,
  }, workspaceId);

  return receipt;
};

/**
 * Mark a message as delivered to a user
 */
export const markAsDelivered = async (messageId, channelId, userId, workspaceId) => {
  const receipt = await ReadReceipt.findOneAndUpdate(
    { messageId, channelId, userId, workspaceId },
    {
      $setOnInsert: {
        deliveredAt: new Date(),
      },
    },
    { new: true, upsert: true }
  );

  // Emit socket event to channel
  emitToChannel(channelId, SOCKET_EVENTS.MESSAGE_DELIVERED, {
    messageId,
    channelId,
    userId,
    deliveredAt: receipt.deliveredAt,
  }, workspaceId);

  return receipt;
};