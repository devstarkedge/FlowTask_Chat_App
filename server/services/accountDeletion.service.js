import cron from 'node-cron';
import logger from '../utils/logger.js';
import ChatUser from '../modules/users/ChatUser.model.js';
import userRepository from '../modules/users/user.repository.js';
import WorkspaceMembership from '../modules/workspaces/WorkspaceMembership.model.js';
import channelService from '../modules/channels/channel.service.js';

class AccountDeletionService {
  constructor() {
    this.cronJob = null;
    this.isRunning = false;
  }

  /**
   * Initialize the cron job to run weekly (Sunday at 3:00 AM)
   */
  init() {
    if (this.cronJob) return;

    logger.info('AccountDeletionService initialized: Weekly cron scheduled for 90-day account cleanup');
    this.cronJob = cron.schedule('0 3 * * 0', this.runCleanup.bind(this), {
      scheduled: true,
      timezone: 'UTC',
    });
  }

  /**
   * Stop the cron job
   */
  stop() {
    if (this.cronJob) {
      this.cronJob.stop();
      this.cronJob = null;
      logger.info('AccountDeletionService stopped');
    }
  }

  /**
   * Run the cleanup job for accounts that have passed their 90-day pending period.
   */
  async runCleanup() {
    if (this.isRunning) {
      logger.warn('Account cleanup job is already running, skipping this interval');
      return;
    }
    
    this.isRunning = true;
    logger.info('Starting weekly account cleanup job');

    try {
      const now = new Date();
      
      // Find all users where accountStatus is 'deletion_pending' and the 90 days have passed
      const cursor = ChatUser.find({
        accountStatus: 'deletion_pending',
        scheduledDeletionAt: { $lte: now }
      }).cursor();

      let successCount = 0;
      let failureCount = 0;

      for await (const user of cursor) {
        try {
          // 1. Permanently anonymize the user profile and wipe credentials
          await userRepository.softDelete(user._id);

          // 2. Remove user from all workspaces (this will cascade some cleanup via hooks)
          // We must pull them from WorkspaceMembership directly as they are now fully gone.
          await WorkspaceMembership.deleteMany({ userId: user._id });

          // 3. (Optional) In the future, we could also attempt to clean up S3 Avatar uploads here,
          // but for now, the existing `softDelete` preserves chat history and leaves the
          // avatar empty.

          successCount++;
          logger.info('Account permanently anonymized and wiped', { userId: user._id });
        } catch (err) {
          failureCount++;
          logger.error('Failed to process account deletion for user', {
            userId: user._id,
            error: err.message,
          });
        }
      }

      logger.info('Finished weekly account cleanup job', { successCount, failureCount });
    } catch (error) {
      logger.error('Account cleanup job encountered a critical error', { error: error.message });
    } finally {
      this.isRunning = false;
    }
  }
}

export default new AccountDeletionService();
