import flowTaskService from './flowtask.service.js';
import userRepository from '../users/user.repository.js';
import workspaceRepository from '../workspaces/workspace.repository.js';
import channelService from '../channels/channel.service.js';
import channelRepository from '../channels/channel.repository.js';
import { WORKSPACE_ROLES } from '../../config/constants.js';
import logger from '../../utils/logger.js';

function normalizeEntityId(value) {
  if (!value) return null;
  if (typeof value === 'object') {
    if (value._id) return value._id.toString();
    if (value.id) return value.id.toString();
    try { const s = value.toString(); if (s && s !== '[object Object]') return s; } catch {}
    return null;
  }
  if (typeof value === 'string') {
    const idMatch = value.match(/[0-9a-fA-F]{24}/);
    if (idMatch) return idMatch[0];
    return value;
  }
  try { return String(value); } catch { return null; }
}

/**
 * FlowTask Sync Service — orchestrates bulk synchronization between
 * FlowTask and ChatApp. Used for initial workspace setup and daily
 * reconciliation.
 *
 * Sync operations:
 *  - syncAllUsers: Sync all FlowTask users → ChatApp users + workspace membership
 *  - syncAllBoards: Sync all FlowTask boards → ChatApp channels
 *  - syncBoardMembers: Sync board members → channel members
 *  - reconcile: Full reconciliation (users + boards + members)
 */

class FlowTaskSyncService {
  /**
   * Sync all FlowTask users to ChatApp.
   * Creates/updates ChatUser records and workspace memberships.
   *
   * @param {string} workspaceId - ChatApp workspace ID
   * @param {string} token - FlowTask admin JWT token
   * @returns {Promise<{ created: number, updated: number, total: number }>}
   */
  async syncAllUsers(workspaceId, token) {
    const report = { created: 0, updated: 0, skipped: 0, total: 0 };

    const users = await flowTaskService.getUsers({}, token);
    if (!Array.isArray(users) || users.length === 0) {
      logger.info('[SYNC] No FlowTask users found to sync');
      return report;
    }

    report.total = users.length;

    for (const ftUser of users) {
      try {
        if (!ftUser._id || !ftUser.email) {
          report.skipped++;
          continue;
        }

        if (!ftUser.isActive) {
          report.skipped++;
          continue;
        }

        // Upsert ChatUser from FlowTask data
        const chatUser = await userRepository.upsertFromFlowTask(ftUser);

        // Ensure workspace membership
        const isMember = await workspaceRepository.isMember(chatUser._id, workspaceId);
        if (!isMember) {
          await workspaceRepository.addMember(
            chatUser._id,
            workspaceId,
            WORKSPACE_ROLES.MEMBER,
          );
          report.created++;
        } else {
          report.updated++;
        }
      } catch (err) {
        logger.error('[SYNC] Failed to sync user', {
          flowTaskUserId: ftUser._id,
          error: err.message,
        });
        report.skipped++;
      }
    }

    logger.info('[SYNC] User sync completed', { workspaceId, ...report });
    return report;
  }

  /**
   * Sync all FlowTask boards to ChatApp channels.
   * Creates project channels for each active board.
   *
   * @param {string} workspaceId - ChatApp workspace ID
   * @param {string} token - FlowTask JWT token
   * @returns {Promise<{ created: number, updated: number, total: number }>}
   */
  async syncAllBoards(workspaceId, token) {
    const report = { created: 0, updated: 0, skipped: 0, total: 0 };

    let boards;
    try {
      boards = await flowTaskService.getUserBoards(token);
    } catch (err) {
      logger.error('[SYNC] Failed to fetch boards from FlowTask', {
        error: err.message,
      });
      return report;
    }

    if (!Array.isArray(boards) || boards.length === 0) {
      logger.info('[SYNC] No boards found to sync');
      return report;
    }

    report.total = boards.length;

    for (const board of boards) {
      try {
        const boardId = board._id || board.id;
        if (!boardId) {
          report.skipped++;
          continue;
        }

        if (board.isArchived || board.isDeleted) {
          report.skipped++;
          continue;
        }

        // Check if channel already exists for this board
        const existing = await channelRepository.findByFlowTaskRef('board', boardId.toString(), workspaceId);

        if (existing) {
          // Update channel name/description if changed
          const updates = {};
          const expectedName = this._boardToChannelName(board);
          if (existing.name !== expectedName) {
            updates.name = expectedName;
          }
          if (board.description && existing.description !== board.description) {
            updates.description = board.description.substring(0, 500);
          }
          if (Object.keys(updates).length > 0) {
            await channelRepository.update(existing._id, updates, workspaceId);
          }
          report.updated++;
        } else {
          // Create new project channel
          await channelService.createProjectChannel(board, null, workspaceId);
          report.created++;
        }

        // Sync members for this board → channel
        await this.syncBoardMembers(boardId.toString(), workspaceId, token).catch((err) => {
          logger.warn('[SYNC] Failed to sync members for board', {
            boardId,
            error: err.message,
          });
        });
      } catch (err) {
        logger.error('[SYNC] Failed to sync board', {
          boardId: board._id,
          boardName: board.name,
          error: err.message,
        });
        report.skipped++;
      }
    }

    logger.info('[SYNC] Board sync completed', { workspaceId, ...report });
    return report;
  }

  /**
   * Sync members from a FlowTask board to the corresponding ChatApp channel.
   * Includes: board owner, board members, card assignees, subtask assignees,
   * and nanoSubtask assignees.
   *
   * @param {string} boardId - FlowTask board ID
   * @param {string} workspaceId - ChatApp workspace ID
   * @param {string} token - FlowTask JWT token
   * @returns {Promise<{ added: number, total: number }>}
   */
  async syncBoardMembers(boardId, workspaceId, token) {
    const report = { added: 0, total: 0 };

    // Find the channel for this board
    const normalizedBoardId = normalizeEntityId(boardId);
    const channel = await channelRepository.findByFlowTaskRef('board', normalizedBoardId, workspaceId);
    if (!channel) {
      return report;
    }

    // Use deep member extraction (board + cards + subtasks + nanos)
    let memberFlowTaskIds;
    try {
      const result = await flowTaskService.getBoardDeepMembers(boardId, token);
      memberFlowTaskIds = result.memberIds;
    } catch (err) {
      logger.warn('[SYNC] Failed to fetch deep board members', {
        boardId,
        error: err.message,
      });
      return report;
    }

    report.total = memberFlowTaskIds.size;

    // Resolve FlowTask IDs to ChatUser IDs and add to channel
    for (const ftUserId of memberFlowTaskIds) {
      try {
        const chatUser = await userRepository.findByFlowTaskId(ftUserId);
        if (!chatUser) continue;

        if (!channel.hasMember(chatUser._id)) {
          await channelService.addMember(channel._id, chatUser._id).catch(() => {});
          report.added++;
        }
      } catch (err) {
        logger.debug('[SYNC] Failed to add member to channel', {
          flowTaskUserId: ftUserId,
          channelId: channel._id,
          error: err.message,
        });
      }
    }

    return report;
  }

  /**
   * Full reconciliation: sync users, boards, and members.
   * Intended for daily scheduled runs.
   *
   * @param {string} workspaceId - ChatApp workspace ID
   * @param {string} token - FlowTask JWT token
   * @returns {Promise<object>} Combined sync report
   */
  async reconcile(workspaceId, token) {
    logger.info('[SYNC] Starting full reconciliation', { workspaceId });

    const userReport = await this.syncAllUsers(workspaceId, token);
    const boardReport = await this.syncAllBoards(workspaceId, token);

    const report = {
      users: userReport,
      boards: boardReport,
      completedAt: new Date().toISOString(),
    };

    logger.info('[SYNC] Full reconciliation completed', { workspaceId, report });
    return report;
  }

  /**
   * Convert a FlowTask board name to a channel name.
   * @private
   */
  _boardToChannelName(board) {
    const name = board.name || 'Unnamed Project';
    return name.length > 80 ? name.substring(0, 80) : name;
  }
}

export default new FlowTaskSyncService();
