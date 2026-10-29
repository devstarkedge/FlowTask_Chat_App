import {
  encrypt,
  decrypt,
  isEncrypted,
  generateSearchTokens,
} from './crypto.service.js';
import { MESSAGE_CONTENT_TYPES } from '../../config/constants.js';

/**
 * Checks if a message is a bot or system activity message.
 * Spec & User requirement: Bot and system activity messages MUST NOT be encrypted
 * so that automated events, tasks, announcements, and webhook sync remain transparent.
 * Only messages typed and sent by users are encrypted in the database.
 */
export function isBotMessage(message) {
  if (!message) return false;

  const type = message.contentType;
  if (type === MESSAGE_CONTENT_TYPES.SYSTEM || type === MESSAGE_CONTENT_TYPES.ACTIVITY || type === 'system' || type === 'activity') {
    return true;
  }

  if (message.activityMeta && (message.activityMeta.eventType || message.activityMeta.taskId)) {
    return true;
  }

  const senderName = message.senderSnapshot?.name || message.authorId?.name;
  if (senderName === 'FlowTask Bot' || senderName === 'System') {
    return true;
  }

  return false;
}

/**
 * Encrypts user message fields prior to database persistence.
 *
 * Encrypted fields:
 *  - content
 *  - htmlContent
 *  - senderSnapshot.name (prevents DB observers from knowing who sent what)
 *  - senderSnapshot.avatar (if present)
 *  - replyTo.content & replyTo.senderName (quoted user content)
 *  - editHistory[].content & editHistory[].htmlContent
 *  - forwardMeta.customMessage & forwardMeta.originalSenderName
 *
 * Metadata added:
 *  - searchTokens: HMAC blind index tokens for secure encrypted search
 *  - hasLink: boolean flag for URL search indexing
 *  - isEncrypted: true
 *  - encryptionVersion: 1
 *
 * @param {object} messageData
 * @param {string|ObjectId} [workspaceId]
 * @returns {object} Encrypted copy of messageData
 */
export function encryptMessageData(messageData, workspaceId = null) {
  if (!messageData) return messageData;

  const wsId = workspaceId || messageData.workspaceId;

  // Bot & system activity messages stay unencrypted
  if (isBotMessage(messageData)) {
    return {
      ...messageData,
      isEncrypted: false,
    };
  }

  const encrypted = { ...messageData };

  // 1. Text & HTML content
  const originalContent = messageData.content ?? '';
  encrypted.content = originalContent ? encrypt(originalContent, wsId) : originalContent;

  if (messageData.htmlContent) {
    encrypted.htmlContent = encrypt(messageData.htmlContent, wsId);
  }

  // 2. Sender snapshot (anonymizes author name in DB)
  if (messageData.senderSnapshot) {
    const rawSender = messageData.senderSnapshot;
    encrypted.senderSnapshot = {
      ...rawSender,
      name: rawSender.name ? encrypt(rawSender.name, wsId) : rawSender.name,
    };
  }

  // 3. Reply Quote
  if (messageData.replyTo) {
    const reply = messageData.replyTo;
    encrypted.replyTo = {
      ...reply,
      ...(reply.content ? { content: encrypt(reply.content, wsId) } : {}),
      ...(reply.senderName ? { senderName: encrypt(reply.senderName, wsId) } : {}),
    };
  }

  // 4. Edit History
  if (Array.isArray(messageData.editHistory) && messageData.editHistory.length > 0) {
    encrypted.editHistory = messageData.editHistory.map((item) => ({
      ...item,
      content: item.content ? encrypt(item.content, wsId) : item.content,
      ...(item.htmlContent ? { htmlContent: encrypt(item.htmlContent, wsId) } : {}),
    }));
  }

  // 5. Forward Metadata
  if (messageData.forwardMeta) {
    const fwd = messageData.forwardMeta;
    encrypted.forwardMeta = {
      ...fwd,
      ...(fwd.customMessage ? { customMessage: encrypt(fwd.customMessage, wsId) } : {}),
      ...(fwd.originalSenderName ? { originalSenderName: encrypt(fwd.originalSenderName, wsId) } : {}),
    };
  }

  // 6. Search tokens & Link flag
  encrypted.searchTokens = originalContent ? generateSearchTokens(originalContent, wsId) : [];
  encrypted.hasLink = Boolean(originalContent && /https?:\/\//i.test(originalContent));

  // 7. Security flags
  encrypted.isEncrypted = true;
  encrypted.encryptionVersion = 1;

  return encrypted;
}

/**
 * Decrypts a message document for API response or WebSocket broadcast.
 * Handles both Mongoose documents and lean POJOs safely.
 *
 * @param {object} message
 * @param {string|ObjectId} [workspaceId]
 * @returns {object} Decrypted message
 */
export function decryptMessageData(message, workspaceId = null) {
  if (!message) return message;

  const wsId = workspaceId || message.workspaceId;

  // If already decrypted or plain, check content
  if (message.content && isEncrypted(message.content)) {
    message.content = decrypt(message.content, wsId);
  }

  if (message.htmlContent && isEncrypted(message.htmlContent)) {
    message.htmlContent = decrypt(message.htmlContent, wsId);
  }

  if (message.senderSnapshot?.name && isEncrypted(message.senderSnapshot.name)) {
    message.senderSnapshot.name = decrypt(message.senderSnapshot.name, wsId);
  }

  if (message.replyTo) {
    if (message.replyTo.content && isEncrypted(message.replyTo.content)) {
      message.replyTo.content = decrypt(message.replyTo.content, wsId);
    }
    if (message.replyTo.senderName && isEncrypted(message.replyTo.senderName)) {
      message.replyTo.senderName = decrypt(message.replyTo.senderName, wsId);
    }
  }

  if (Array.isArray(message.editHistory) && message.editHistory.length > 0) {
    for (const item of message.editHistory) {
      if (item.content && isEncrypted(item.content)) {
        item.content = decrypt(item.content, wsId);
      }
      if (item.htmlContent && isEncrypted(item.htmlContent)) {
        item.htmlContent = decrypt(item.htmlContent, wsId);
      }
    }
  }

  if (message.forwardMeta) {
    if (message.forwardMeta.customMessage && isEncrypted(message.forwardMeta.customMessage)) {
      message.forwardMeta.customMessage = decrypt(message.forwardMeta.customMessage, wsId);
    }
    if (message.forwardMeta.originalSenderName && isEncrypted(message.forwardMeta.originalSenderName)) {
      message.forwardMeta.originalSenderName = decrypt(message.forwardMeta.originalSenderName, wsId);
    }
  }

  return message;
}

/**
 * Decrypts an array of messages.
 */
export function decryptMessages(messages, workspaceId = null) {
  if (!Array.isArray(messages)) return [];
  return messages.map((m) => decryptMessageData(m, workspaceId));
}

/**
 * Encrypts channel lastMessagePreview for storage in channels collection.
 */
export function encryptPreview(preview, workspaceId = null) {
  if (!preview || typeof preview !== 'string') return preview || '';
  if (isEncrypted(preview)) return preview;
  return encrypt(preview, workspaceId);
}

/**
 * Decrypts channel lastMessagePreview for sidebar and channel listing.
 */
export function decryptPreview(preview, workspaceId = null) {
  if (!preview || typeof preview !== 'string') return preview || '';
  if (!isEncrypted(preview)) return preview;
  return decrypt(preview, workspaceId);
}
