import ReadReceipt from "./readReceipt.model.js";
import Channel from "../channels/Channel.model.js";
import ChatUser from "../users/ChatUser.model.js";
import { emitToChannel } from "../../sockets/socketManager.js";
import { SOCKET_EVENTS } from "../../config/constants.js";

/**
 * Get message info: delivery/read status per member
 */
export const getMessageInfo = async (messageId, channelId, requesterId, workspaceId) => {
  const channel = await Channel.findById(channelId).populate("members", "name email avatar");
  if (!channel) throw new Error("Channel not found");

  // Get all channel members except the sender
  const members = channel.members || [];
  const recipientMembers = members.filter(m => m._id.toString() !== requesterId.toString());

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
    const memberId = member._id.toString();
    const receipt = receiptMap.get(memberId);

    if (receipt && receipt.readAt) {
      readBy.push({
        userId: memberId,
        name: member.name || "User",
        avatar: member.avatar || null,
        status: "read",
        readAt: receipt.readAt,
      });
    } else if (receipt && receipt.deliveredAt) {
      deliveredTo.push({
        userId: memberId,
        name: member.name || "User",
        avatar: member.avatar || null,
        status: "delivered",
        deliveredAt: receipt.deliveredAt,
      });
    } else {
      pending.push({
        userId: memberId,
        name: member.name || "User",
        avatar: member.avatar || null,
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
  });

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

  return receipt;
};