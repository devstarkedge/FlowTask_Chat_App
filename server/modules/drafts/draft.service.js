import Draft from './Draft.model.js';
import cache from '../../services/cache.service.js';
import logger from '../../utils/logger.js';
import { emitToUser } from '../../sockets/socketManager.js';
import { SOCKET_EVENTS } from '../../config/constants.js';
import { isContentEmpty } from '../../utils/draftUtils.js';
import messageService from '../messages/message.service.js';

const DRAFT_CACHE_TTL = 600; // 10 minutes

function cacheKey(senderId, channelId, threadId, workspaceId) {
  return `draft:${workspaceId}:${senderId}:${channelId}:${threadId || 'root'}`;
}

function allDraftsCacheKey(senderId, workspaceId) {
  return `drafts:${workspaceId}:${senderId}`;
}

class DraftService {
  /**
   * Save or update a draft. Upserts by user+channel+thread.
   */
  async saveDraft({ workspaceId, channelId, threadId, senderId, content, htmlContent, attachments, mentions }) {
    const trimmedContent = (content || '').trim();
    const trimmedHtml = (htmlContent || '').trim();

    // If content is empty, remove the draft instead
    if (isContentEmpty(trimmedHtml, trimmedContent) && (!attachments || attachments.length === 0)) {
      return this.removeDraftByConversation(senderId, channelId, threadId, workspaceId);
    }

    const filter = {
      workspaceId,
      senderId,
      channelId,
      threadId: threadId || null,
    };

    const update = {
      content: trimmedContent,
      htmlContent: trimmedHtml,
      attachments: attachments || [],
      mentions: mentions || [],
      status: 'draft',
      updatedAt: new Date(),
    };

    const draft = await Draft.upsertDraft(filter, update);

    // Update cache
    const key = cacheKey(senderId, channelId, threadId, workspaceId);
    await cache.set(key, draft, DRAFT_CACHE_TTL);
    // Invalidate all-drafts list cache
    await cache.del(allDraftsCacheKey(senderId, workspaceId));

    // Notify other devices via socket
    emitToUser(senderId.toString(), SOCKET_EVENTS.DRAFT_UPDATED, {
      draft: {
        _id: draft._id,
        channelId: draft.channelId,
        threadId: draft.threadId,
        content: draft.content,
        htmlContent: draft.htmlContent,
        attachments: draft.attachments,
        mentions: draft.mentions,
        updatedAt: draft.updatedAt,
      },
    }, workspaceId.toString());

    return draft;
  }

  /**
   * Get draft for a specific conversation. Cache-first.
   */
  async getDraft(senderId, channelId, threadId, workspaceId) {
    const key = cacheKey(senderId, channelId, threadId, workspaceId);

    // Try cache first
    const cached = await cache.get(key);
    if (cached) return cached;

    const draft = await Draft.getConversationDraft(senderId, channelId, threadId, workspaceId);
    if (draft) {
      await cache.set(key, draft, DRAFT_CACHE_TTL);
    }
    return draft;
  }

  /**
   * Get all drafts for sidebar display.
   */
  async getAllDrafts(senderId, workspaceId, { limit = 50, skip = 0 } = {}) {
    const listKey = allDraftsCacheKey(senderId, workspaceId);

    if (skip === 0 && limit <= 50) {
      const cached = await cache.get(listKey);
      if (cached) return cached;
    }

    const drafts = await Draft.getUserDrafts(senderId, workspaceId, { limit, skip });

    if (skip === 0 && limit <= 50) {
      await cache.set(listKey, drafts, DRAFT_CACHE_TTL);
    }

    return drafts;
  }

  /**
   * Count drafts for badge.
   */
  async countDrafts(senderId, workspaceId) {
    return Draft.countUserDrafts(senderId, workspaceId);
  }

  /**
   * Delete a draft by ID.
   */
  async removeDraft(draftId, senderId, workspaceId) {
    const draft = await Draft.removeDraft(draftId, senderId);
    if (!draft) return null;

    // Invalidate caches
    const key = cacheKey(senderId, draft.channelId, draft.threadId, workspaceId);
    await cache.del(key);
    await cache.del(allDraftsCacheKey(senderId, workspaceId));

    // Notify other devices
    emitToUser(senderId.toString(), SOCKET_EVENTS.DRAFT_DELETED, {
      draftId: draft._id,
      channelId: draft.channelId,
      threadId: draft.threadId,
    }, workspaceId.toString());

    return draft;
  }

  /**
   * Remove draft when message is sent.
   */
  async removeDraftByConversation(senderId, channelId, threadId, workspaceId) {
    const draft = await Draft.removeByConversation(senderId, channelId, threadId, workspaceId);
    if (!draft) return null;

    const key = cacheKey(senderId, channelId, threadId, workspaceId);
    await cache.del(key);
    await cache.del(allDraftsCacheKey(senderId, workspaceId));

    emitToUser(senderId.toString(), SOCKET_EVENTS.DRAFT_DELETED, {
      draftId: draft._id,
      channelId: draft.channelId,
      threadId: draft.threadId,
    }, workspaceId.toString());

    return draft;
  }

  /**
   * Atomically send a draft as a message and delete the draft.
   * Maps draft mention schema ({targetId, name}) to message mention schema ({userId, username}).
   */
  async sendDraft(draftId, senderId, workspaceId) {
    const draft = await Draft.findOne({ _id: draftId, senderId });
    if (!draft) return null;

    if (draft.workspaceId && draft.workspaceId.toString() !== workspaceId.toString()) {
      throw new Error('Draft does not belong to this workspace');
    }

    // Map draft mentions to the format messageService.sendMessage expects
    const mentions = (draft.mentions || []).map(m => ({
      userId: m.targetId,
      username: m.name,
      type: m.type || 'user',
    }));

    // Send as message
    const result = await messageService.sendMessage({
      channelId: draft.channelId,
      authorId: senderId,
      content: draft.content || '',
      htmlContent: draft.htmlContent || '',
      attachments: draft.attachments || [],
      mentions,
      threadId: draft.threadId || undefined,
      workspaceId,
    });

    // Only delete draft after message is sent successfully
    await this.removeDraft(draftId, senderId, workspaceId);

    return result;
  }
}

export default new DraftService();
