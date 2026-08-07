/**
 * Socket Payload Utilities — create minimal payloads for socket emissions.
 * Full data remains in REST responses; sockets only send what clients need for real-time updates.
 */

function toId(value) {
  if (value == null) return value;
  if (typeof value === 'string') {
    return value !== '[object Object]' ? value : null;
  }
  if (typeof value === 'object') {
    if (typeof value.toHexString === 'function') {
      return value.toHexString();
    }
    if (value._id != null && value._id !== value) return toId(value._id);
    if (typeof value.toString === 'function') {
      const serialized = value.toString();
      if (serialized !== '[object Object]') return serialized;
    }
  }
  return String(value);
}

function toPlainMessage(message) {
  if (!message) return message;
  if (typeof message.toObject === 'function') {
    return message.toObject({ virtuals: true, flattenMaps: true });
  }
  return message;
}

function serializeAttachments(attachments) {
  if (!Array.isArray(attachments)) return [];
  return attachments.map((attachment) => {
    if (!attachment) return attachment;
    const plain = typeof attachment.toObject === 'function'
      ? attachment.toObject()
      : attachment;
    return {
      ...plain,
      _id: plain._id ? toId(plain._id) : plain._id,
    };
  });
}

function serializeFileReferences(fileReferences) {
  if (!Array.isArray(fileReferences)) return [];
  return fileReferences.map((reference) => {
    if (!reference) return reference;
    const plain = typeof reference.toObject === 'function'
      ? reference.toObject({ virtuals: true })
      : reference;
    const fileId = plain.fileId;
    const plainFile = fileId && typeof fileId.toObject === 'function'
      ? fileId.toObject()
      : fileId;

    return {
      ...plain,
      _id: plain._id ? toId(plain._id) : plain._id,
      fileId: plainFile
        ? {
            ...plainFile,
            _id: toId(plainFile._id),
          }
        : plain.fileId,
      channelId: plain.channelId ? toId(plain.channelId) : plain.channelId,
      messageId: plain.messageId ? toId(plain.messageId) : plain.messageId,
      workspaceId: plain.workspaceId ? toId(plain.workspaceId) : plain.workspaceId,
      referencedBy: plain.referencedBy ? toId(plain.referencedBy) : plain.referencedBy,
    };
  });
}

/**
 * Create a minimal message payload for socket emission.
 * @param {object} message - Mongoose message document (lean or populated)
 * @param {object} [extras] - Additional fields to merge (e.g. tempId)
 * @returns {object} Slim payload
 */
export function messageSocketPayload(message, extras = {}) {
  const plain = toPlainMessage(message);
  const authorId = toId(plain.authorId?._id || plain.authorId);

  return {
    _id: toId(plain._id),
    channelId: toId(plain.channelId),
    threadId: plain.threadId ? toId(plain.threadId) : null,
    content: plain.content,
    htmlContent: plain.htmlContent,
    contentType: plain.contentType,
    authorId,
    senderSnapshot: plain.senderSnapshot || null,
    attachments: serializeAttachments(plain.attachments),
    fileReferences: serializeFileReferences(plain.fileReferences),
    mentions: plain.mentions || [],
    reactions: plain.reactions || [],
    replyCount: plain.replyCount || 0,
    isEdited: plain.isEdited || false,
    isPinned: plain.isPinned || false,
    isDeleted: plain.isDeleted || false,
    flowTaskRef: plain.flowTaskRef || null,
    activityMeta: plain.activityMeta || null,
    forwardMeta: plain.forwardMeta || null,
    gifMeta: plain.gifMeta || null,
    audioMeta: plain.audioMeta || null,
    videoMeta: plain.videoMeta || null,
    status: plain.status || 'sent',
    deliveredAt: plain.deliveredAt || null,
    seenAt: plain.seenAt || null,
    createdAt: plain.createdAt,
    updatedAt: plain.updatedAt,
    ...extras,
  };
}

/**
 * Create a minimal reaction event payload.
 * @param {object} params
 * @returns {object}
 */
export function reactionSocketPayload({ messageId, channelId, userId, emoji }) {
  return {
    messageId: toId(messageId),
    channelId: toId(channelId),
    userId: toId(userId),
    emoji,
  };
}

/**
 * Create a minimal delete event payload.
 * @param {object} params
 * @returns {object}
 */
export function deleteSocketPayload({ messageId, channelId }) {
  return {
    messageId: toId(messageId),
    channelId: toId(channelId),
  };
}
