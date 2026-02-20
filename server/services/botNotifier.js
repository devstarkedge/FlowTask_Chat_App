import channelRepository from '../modules/channels/channel.repository.js';
import messageService from '../modules/messages/message.service.js';
import logger from '../utils/logger.js';
import { SYSTEM_CHANNELS } from '../config/constants.js';

/**
 * Bot Notifier — routes notifications to appropriate system channels
 * based on event type and organizational context.
 *
 * Admin Notifications (→ #admin channel):
 *   - New project created (any department)
 *   - Verified user registration
 *   - Announcements
 *   - Sales module updates
 *
 * Manager Notifications (→ #managers channel):
 *   - Projects in assigned department
 *   - Verified users in same department
 *   - Sales data (if access exists)
 */

class BotNotifier {
  /**
   * Send a notification to the admin system channel.
   * @param {string} message - Formatted message content
   * @param {object} [flowTaskRef] - Optional FlowTask entity reference
   */
  async notifyAdmins(message, flowTaskRef = null) {
    try {
      const adminChannel = await channelRepository.findBySlug(SYSTEM_CHANNELS.ADMIN.slug);
      if (!adminChannel) {
        logger.warn('BotNotifier: #admin channel not found');
        return;
      }
      await messageService.sendSystemMessage(adminChannel._id, message, flowTaskRef);
    } catch (error) {
      logger.error('BotNotifier: Failed to notify admins', { error: error.message });
    }
  }

  /**
   * Send a notification to the managers system channel.
   * @param {string} message - Formatted message content
   * @param {object} [flowTaskRef] - Optional FlowTask entity reference
   */
  async notifyManagers(message, flowTaskRef = null) {
    try {
      const managersChannel = await channelRepository.findBySlug(SYSTEM_CHANNELS.MANAGERS.slug);
      if (!managersChannel) {
        logger.warn('BotNotifier: #managers channel not found');
        return;
      }
      await messageService.sendSystemMessage(managersChannel._id, message, flowTaskRef);
    } catch (error) {
      logger.error('BotNotifier: Failed to notify managers', { error: error.message });
    }
  }

  /**
   * Send a notification to the announcements system channel.
   * @param {string} message - Formatted message content
   * @param {object} [flowTaskRef] - Optional FlowTask entity reference
   */
  async notifyAnnouncements(message, flowTaskRef = null) {
    try {
      const channel = await channelRepository.findBySlug(SYSTEM_CHANNELS.ANNOUNCEMENTS.slug);
      if (!channel) {
        logger.warn('BotNotifier: #announcements channel not found');
        return;
      }
      await messageService.sendSystemMessage(channel._id, message, flowTaskRef);
    } catch (error) {
      logger.error('BotNotifier: Failed to notify announcements', { error: error.message });
    }
  }

  /**
   * Route a project-created notification to admin and managers channels.
   */
  async onProjectCreated(boardName, creatorName, departmentName) {
    const ref = { entityType: 'board' };
    await this.notifyAdmins(
      `📋 New project created: **${boardName}** by ${creatorName}${departmentName ? ` (${departmentName})` : ''}`,
      ref,
    );
    await this.notifyManagers(
      `📋 New project: **${boardName}**${departmentName ? ` in ${departmentName}` : ''} — created by ${creatorName}`,
      ref,
    );
  }

  /**
   * Route a user-verified notification to admin and managers channels.
   */
  async onUserVerified(userName, email, role, departmentName) {
    await this.notifyAdmins(
      `✅ User verified: **${userName}** (${email}), Role: ${role}`,
    );
    if (departmentName) {
      await this.notifyManagers(
        `✅ New verified user **${userName}** joined **${departmentName}**`,
      );
    }
  }

  /**
   * Route an announcement notification to admin channel (in addition to #announcements).
   */
  async onAnnouncementCreated(title, authorName) {
    await this.notifyAdmins(
      `📢 New announcement: **${title}** by ${authorName}`,
      { entityType: 'announcement' },
    );
  }
}

export default new BotNotifier();
