/**
 * Socket Payload Utilities — create minimal payloads for socket emissions.
 * Full data remains in REST responses; sockets only send what clients need for real-time updates.
 */

/**
 * Create a minimal message payload for socket emission.
 * @param {object} message - Mongoose message document (lean or populated)
 * @param {object} [extras] - Additional fields to merge (e.g. tempId)
 * @returns {object} Slim payload
 */
export function messageSocketPayload(message, extras = {}) {
  const authorId = message.authorId?._id || message.authorId;

  return {
    _id: message._id,
    channelId: message.channelId,
    threadId: message.threadId || null,
    content: message.content,
    htmlContent: message.htmlContent,
    contentType: message.contentType,
    authorId,
    senderSnapshot: message.senderSnapshot || null,
    attachments: message.attachments || [],
    fileReferences: message.fileReferences || [],
    mentions: message.mentions || [],
    reactions: message.reactions || [],
    replyCount: message.replyCount || 0,
    isEdited: message.isEdited || false,
    isPinned: message.isPinned || false,
    isDeleted: message.isDeleted || false,
    flowTaskRef: message.flowTaskRef || null,
    activityMeta: message.activityMeta || null,
    forwardMeta: message.forwardMeta || null,
    gifMeta: message.gifMeta || null,
    status: message.status || 'sent',
    deliveredAt: message.deliveredAt || null,
    seenAt: message.seenAt || null,
    createdAt: message.createdAt,
    updatedAt: message.updatedAt,
    ...extras,
  };
}

/**
 * Create a minimal reaction event payload.
 * @param {object} params
 * @returns {object}
 */
export function reactionSocketPayload({ messageId, channelId, userId, emoji }) {
  return { messageId, channelId, userId, emoji };
}

/**
 * Create a minimal delete event payload.
 * @param {object} params
 * @returns {object}
 */
export function deleteSocketPayload({ messageId, channelId }) {
  return { messageId, channelId };
}
