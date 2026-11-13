import userRepository from './user.repository.js';
import WorkspaceMembership from '../workspaces/WorkspaceMembership.model.js';
import Message from '../messages/Message.model.js';
import Notification from '../notifications/Notification.model.js';
import flowtaskService from '../flowtask/flowtask.service.js';
import { emitToWorkspace, emitToUser } from '../../sockets/socketManager.js';
import { SOCKET_EVENTS } from '../../config/constants.js';
import logger from '../../utils/logger.js';
import axios from 'axios';
import { v2 as cloudinary } from 'cloudinary';

export async function syncFlowTaskUserProfile(user, workspaceId) {
  try {
    if (!workspaceId || !user?._id) throw new Error('User profile sync requires shared user ID and resolved workspace ID');
    let existing = await userRepository.findByFlowTaskId(user._id);
    if (!existing && user.email) {
      existing = await userRepository.findByEmail(user.email.toLowerCase());
      if (existing && !existing.flowTaskUserId) {
        existing.flowTaskUserId = String(user._id);
        await existing.save();
      }
    }
    if (!existing) return null;
    const membership = await WorkspaceMembership.findOne({
      userId: existing._id, workspaceId, isActive: true,
    }).lean();
    if (!membership) {
      logger.warn('Ignored FlowTask profile update outside user workspace', { flowTaskUserId: user._id, workspaceId });
      return null;
    }

    // Avatar Cloudinary transfer
    let userToUpdate = { ...user };
    if (user.avatar && typeof user.avatar === 'string' && user.avatar.trim()) {
      const avatarUrl = user.avatar.trim();
      if (!avatarUrl.includes('chat-app/users/')) {
        try {
          const response = await axios.get(avatarUrl, { responseType: 'arraybuffer', timeout: 8000 });
          const buffer = Buffer.from(response.data);
          const uploadResult = await new Promise((resolve, reject) => {
            const stream = cloudinary.uploader.upload_stream(
              {
                folder: `chat-app/users/${existing._id}/avatar`,
                resource_type: 'image',
                transformation: [
                  { width: 512, height: 512, crop: 'limit' },
                  { quality: 'auto' },
                  { fetch_format: 'auto' },
                ],
              },
              (error, result) => {
                if (error) reject(error);
                else resolve(result);
              }
            );
            stream.end(buffer);
          });
          if (uploadResult?.secure_url) {
            userToUpdate.avatar = uploadResult.secure_url;
          }
        } catch (uploadErr) {
          logger.warn('Failed to transfer avatar to ChatApp Cloudinary, falling back to original URL', {
            error: uploadErr.message,
            userId: existing._id,
          });
          userToUpdate.avatar = avatarUrl;
        }
      }
    } else if (user.avatar === null || user.avatar === '') {
      userToUpdate.avatar = null;
    }

    const updated = await userRepository.updateFlowTaskProfile(userToUpdate, existing._id);
    // A delayed delivery returns the current profile, never its old name.
    const current = updated || await userRepository.findByFlowTaskId(user._id);
    flowtaskService.invalidateUserProfile(String(user._id));
    const updates = { name: current.name, avatar: current.avatar, email: current.email };
    const version = current.flowTaskProfileUpdatedAt || null;
    const versionGuard = (field) => version ? {
      $or: [{ [field]: null }, { [field]: { $lte: version } }],
    } : { [field]: null };
    // Only structured metadata is repaired. Message bodies, HTML, quoted
    // content, IDs, memberships and reaction associations remain untouched.
    await Promise.all([
      Message.updateMany({ workspaceId, $and: [
        { $or: [{ 'activityMeta.targetUserId': current._id }, { 'activityMeta.targetFlowTaskUserId': String(current.flowTaskUserId) }] },
        versionGuard('activityMeta.targetProfileUpdatedAt'),
      ] }, { $set: {
        'activityMeta.newValue': current.name, 'activityMeta.targetProfileUpdatedAt': version,
      } }),
      Message.updateMany({ workspaceId, $and: [
        { $or: [{ 'activityMeta.actorId': current._id }, { 'activityMeta.actorFlowTaskUserId': String(current.flowTaskUserId) }] },
        versionGuard('activityMeta.profileUpdatedAt'),
      ] }, { $set: {
        'activityMeta.actorName': current.name, 'activityMeta.actorAvatar': current.avatar || null,
        'activityMeta.profileUpdatedAt': version,
      } }),
      Message.updateMany({ workspaceId, authorId: current._id, ...versionGuard('senderSnapshot.profileUpdatedAt') }, {
        $set: { 'senderSnapshot.name': current.name, 'senderSnapshot.profileUpdatedAt': version },
      }),
      Message.updateMany({ workspaceId, 'replyTo.authorId': current._id, ...versionGuard('replyTo.profileUpdatedAt') }, {
        $set: { 'replyTo.senderName': current.name, 'replyTo.profileUpdatedAt': version },
      }),
      Notification.updateMany({ workspaceId, senderId: current._id, ...versionGuard('senderProfileUpdatedAt') }, {
        $set: { senderName: current.name, senderProfileUpdatedAt: version },
      }),
      Message.updateMany({ workspaceId, 'forwardMeta.originalSenderId': current._id, ...versionGuard('forwardMeta.profileUpdatedAt') }, {
        $set: { 'forwardMeta.originalSenderName': current.name, 'forwardMeta.profileUpdatedAt': version },
      }),
    ]);

    const userMemberships = await WorkspaceMembership.find({ userId: current._id, isActive: true }).distinct('workspaceId');
    const targetWorkspaces = new Set([String(workspaceId), ...userMemberships.map(String)]);
    for (const ws of targetWorkspaces) {
      emitToWorkspace(ws, SOCKET_EVENTS.USER_PROFILE_UPDATED, {
        workspaceId: ws, userId: String(current._id), flowTaskUserId: String(current.flowTaskUserId),
        updates, profileUpdatedAt: current.flowTaskProfileUpdatedAt || null,
      });
    }
    emitToUser(String(current._id), SOCKET_EVENTS.USER_PROFILE_UPDATED, {
      userId: String(current._id), flowTaskUserId: String(current.flowTaskUserId),
      updates, profileUpdatedAt: current.flowTaskProfileUpdatedAt || null,
    });

    return current;
  } catch (error) {
    logger.error('FlowTask user profile sync failed; delivery remains retryable', {
      flowTaskUserId: user?._id, workspaceId, error: error.message,
    });
    throw error;
  }
}
