import mongoose from 'mongoose';
import env from '../../config/environment.js';
import { connectDatabase, isDatabaseConnected } from '../../config/database.js';
import Message from '../../modules/messages/Message.model.js';
import Channel from '../../modules/channels/Channel.model.js';
import ScheduledMessage from '../../modules/messages/ScheduledMessage.model.js';
import { encrypt, isEncrypted, generateSearchTokens } from '../../services/encryption/crypto.service.js';
import { isBotMessage } from '../../services/encryption/messageEncryption.service.js';
import logger from '../../utils/logger.js';

/**
 * Migration: Encrypt Historical Messages
 *
 * Scans all existing unencrypted messages, channels, and scheduled messages
 * in MongoDB and encrypts them using AES-256-GCM.
 *
 * Features:
 *  - Fully idempotent: skips documents that are already encrypted.
 *  - Preserves bot/system activity messages unencrypted per spec.
 *  - Generates HMAC blind index search tokens and link flags.
 *  - Batched processing for zero memory bloat on large datasets.
 */
export async function migrateHistoricalMessages({ batchSize = 100 } = {}) {
  logger.info('[ENCRYPTION_MIGRATION] Starting message history encryption...');

  let encryptedMessagesCount = 0;
  let skippedBotMessagesCount = 0;
  let encryptedChannelsCount = 0;
  let encryptedScheduledCount = 0;

  // ─── 1. Migrate Messages ──────────────────────────────────────────────────
  const unencryptedMessageQuery = {
    isEncrypted: { $ne: true },
    contentType: { $nin: ['system', 'activity'] },
  };

  const totalUnencrypted = await Message.countDocuments(unencryptedMessageQuery);
  logger.info(`[ENCRYPTION_MIGRATION] Found ${totalUnencrypted} candidate messages to encrypt.`);

  let cursor = Message.find(unencryptedMessageQuery).cursor({ batchSize });

  let batch = [];
  for await (const doc of cursor) {
    if (isBotMessage(doc)) {
      skippedBotMessagesCount++;
      // Mark as not encrypted so it won't be queried on next run
      doc.isEncrypted = false;
      await doc.save();
      continue;
    }

    const wsId = doc.workspaceId;

    if (doc.content && !isEncrypted(doc.content)) {
      const original = doc.content;
      doc.content = encrypt(original, wsId);
      doc.searchTokens = generateSearchTokens(original, wsId);
      doc.hasLink = Boolean(/https?:\/\//i.test(original));
    }

    if (doc.htmlContent && !isEncrypted(doc.htmlContent)) {
      doc.htmlContent = encrypt(doc.htmlContent, wsId);
    }

    if (doc.senderSnapshot?.name && !isEncrypted(doc.senderSnapshot.name)) {
      doc.senderSnapshot.name = encrypt(doc.senderSnapshot.name, wsId);
    }

    if (doc.replyTo) {
      if (doc.replyTo.content && !isEncrypted(doc.replyTo.content)) {
        doc.replyTo.content = encrypt(doc.replyTo.content, wsId);
      }
      if (doc.replyTo.senderName && !isEncrypted(doc.replyTo.senderName)) {
        doc.replyTo.senderName = encrypt(doc.replyTo.senderName, wsId);
      }
    }

    if (Array.isArray(doc.editHistory) && doc.editHistory.length > 0) {
      for (const edit of doc.editHistory) {
        if (edit.content && !isEncrypted(edit.content)) {
          edit.content = encrypt(edit.content, wsId);
        }
        if (edit.htmlContent && !isEncrypted(edit.htmlContent)) {
          edit.htmlContent = encrypt(edit.htmlContent, wsId);
        }
      }
    }

    if (doc.forwardMeta) {
      if (doc.forwardMeta.customMessage && !isEncrypted(doc.forwardMeta.customMessage)) {
        doc.forwardMeta.customMessage = encrypt(doc.forwardMeta.customMessage, wsId);
      }
      if (doc.forwardMeta.originalSenderName && !isEncrypted(doc.forwardMeta.originalSenderName)) {
        doc.forwardMeta.originalSenderName = encrypt(doc.forwardMeta.originalSenderName, wsId);
      }
    }

    doc.isEncrypted = true;
    doc.encryptionVersion = 1;

    batch.push(doc.save());

    if (batch.length >= batchSize) {
      await Promise.all(batch);
      encryptedMessagesCount += batch.length;
      logger.info(`[ENCRYPTION_MIGRATION] Progress: ${encryptedMessagesCount} messages encrypted.`);
      batch = [];
    }
  }

  if (batch.length > 0) {
    await Promise.all(batch);
    encryptedMessagesCount += batch.length;
  }

  // ─── 2. Migrate Channel lastMessagePreview ───────────────────────────────
  const channelsWithPreview = await Channel.find({
    lastMessagePreview: { $exists: true, $ne: '' },
  });

  for (const ch of channelsWithPreview) {
    if (ch.lastMessagePreview && !isEncrypted(ch.lastMessagePreview)) {
      ch.lastMessagePreview = encrypt(ch.lastMessagePreview, ch.workspaceId);
      await ch.save();
      encryptedChannelsCount++;
    }
  }

  // ─── 3. Migrate Scheduled Messages ───────────────────────────────────────
  const scheduledMessages = await ScheduledMessage.find({
    status: 'pending',
    content: { $exists: true, $ne: '' },
  });

  for (const sched of scheduledMessages) {
    if (sched.content && !isEncrypted(sched.content)) {
      sched.content = encrypt(sched.content, sched.workspaceId);
      if (sched.htmlContent && !isEncrypted(sched.htmlContent)) {
        sched.htmlContent = encrypt(sched.htmlContent, sched.workspaceId);
      }
      await sched.save();
      encryptedScheduledCount++;
    }
  }

  logger.info('[ENCRYPTION_MIGRATION] Completed successfully.', {
    encryptedMessages: encryptedMessagesCount,
    skippedBotMessages: skippedBotMessagesCount,
    encryptedChannels: encryptedChannelsCount,
    encryptedScheduledMessages: encryptedScheduledCount,
  });

  return {
    encryptedMessages: encryptedMessagesCount,
    skippedBotMessages: skippedBotMessagesCount,
    encryptedChannels: encryptedChannelsCount,
    encryptedScheduledMessages: encryptedScheduledCount,
  };
}

// Direct execution from CLI
const isDirectExecution = process.argv[1]?.includes('encrypt-message-history');
if (isDirectExecution) {
  (async () => {
    try {
      if (!isDatabaseConnected()) {
        await connectDatabase();
      }
      await migrateHistoricalMessages();
      await mongoose.disconnect();
      process.exit(0);
    } catch (err) {
      logger.error('[ENCRYPTION_MIGRATION] Failed:', err);
      process.exit(1);
    }
  })();
}
