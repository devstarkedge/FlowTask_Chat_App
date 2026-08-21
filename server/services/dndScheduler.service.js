import cron from 'node-cron'
import ChatUser from '../modules/users/ChatUser.model.js'
import NotificationPreference from '../modules/notifications/NotificationPreference.model.js'
import { emitToUser } from '../sockets/socketManager.js'
import { SOCKET_EVENTS } from '../config/constants.js'
import logger from '../utils/logger.js'

let cronJob = null

export function startDNDScheduler() {
  if (cronJob) return

  // Run every minute
  cronJob = cron.schedule('* * * * *', async () => {
    const start = Date.now()
    try {
      const now = new Date()

      // 1) Disable manual DND where endAt has passed
      const expiredUsers = await ChatUser.find({
        'chatPreferences.dnd.enabled': true,
        'chatPreferences.dnd.endAt': { $lte: now }
      }).select('chatPreferences').lean();

      if (expiredUsers.length > 0) {
        const expiredIds = expiredUsers.map(u => u._id);
        await ChatUser.updateMany(
          { _id: { $in: expiredIds } },
          { $set: { 'chatPreferences.dnd.enabled': false }, $unset: { 'chatPreferences.dnd.endAt': 1 } }
        );
        
        try {
          const { broadcastUserPreferences } = await import('../sockets/socketManager.js');
          for (const u of expiredUsers) {
            const updatedPrefs = { ...u.chatPreferences };
            if (updatedPrefs.dnd) {
              updatedPrefs.dnd.enabled = false;
              updatedPrefs.dnd.endAt = null;
            }
            await broadcastUserPreferences(u._id.toString(), updatedPrefs);
          }
        } catch (err) {
          logger.warn('Failed to broadcast DND expiration', { error: err.message });
        }
        logger.info('Cleared expired manual DND for users', { count: expiredUsers.length });
      }

      // 2) Evaluate recurring schedules and enable/disable DND accordingly
      const users = await ChatUser.find({ 'chatPreferences.dndSchedule.enabled': true }).select('chatPreferences')
      for (const user of users) {
        try {
          const sched = user.chatPreferences?.dndSchedule
          if (!sched) continue

          const startHour = Number(sched.startHour ?? 0)
          const endHour = Number(sched.endHour ?? 0)
          const currentHour = now.getUTCHours()

          let inWindow = false
          if (startHour <= endHour) {
            inWindow = currentHour >= startHour && currentHour < endHour
          } else {
            inWindow = currentHour >= startHour || currentHour < endHour
          }

          const currentlyEnabled = !!user.chatPreferences?.dnd?.enabled

          if (inWindow && !currentlyEnabled) {
            await ChatUser.findByIdAndUpdate(user._id, { $set: { 'chatPreferences.dnd.enabled': true } })
            try {
              const { broadcastUserPreferences } = await import('../sockets/socketManager.js');
              user.chatPreferences.dnd = user.chatPreferences.dnd || {};
              user.chatPreferences.dnd.enabled = true;
              await broadcastUserPreferences(user._id.toString(), user.chatPreferences);
            } catch(e) {}
          } else if (!inWindow && currentlyEnabled) {
            const manualEnd = user.chatPreferences?.dnd?.endAt
            if (!manualEnd || new Date(manualEnd) <= now) {
              await ChatUser.findByIdAndUpdate(user._id, { $set: { 'chatPreferences.dnd.enabled': false }, $unset: { 'chatPreferences.dnd.endAt': 1 } })
              try {
                const { broadcastUserPreferences } = await import('../sockets/socketManager.js');
                user.chatPreferences.dnd.enabled = false;
                user.chatPreferences.dnd.endAt = null;
                await broadcastUserPreferences(user._id.toString(), user.chatPreferences);
              } catch(e) {}
            }
          }
        } catch (err) {
          logger.warn('Failed to evaluate recurring DND for user', { userId: user._id, error: err.message })
        }
      }

      // 3) Auto-resume NotificationPreference.pause where resumeAt has passed
      try {
        const expiredPauses = await NotificationPreference.find({
          'pause.active': true,
          'pause.resumeAt': { $lte: now },
        }).select('userId workspaceId').lean()

        if (expiredPauses.length > 0) {
          const expiredIds = expiredPauses.map((p) => p._id)
          await NotificationPreference.updateMany(
            { _id: { $in: expiredIds } },
            { $set: { 'pause.active': false, 'pause.resumeAt': null } },
          )

          // Also clear corresponding ChatUser.dnd entries
          const userIds = [...new Set(expiredPauses.map((p) => p.userId.toString()))]
          await ChatUser.updateMany(
            { _id: { $in: userIds }, 'chatPreferences.dnd.enabled': true },
            { $set: { 'chatPreferences.dnd.enabled': false }, $unset: { 'chatPreferences.dnd.endAt': 1 } },
          )

          // Notify each affected user's devices so clients instantly update isPaused state
          for (const entry of expiredPauses) {
            try {
              const updatedPrefs = await NotificationPreference.findOne({
                userId: entry.userId,
                workspaceId: entry.workspaceId,
              }).lean()
              emitToUser(
                entry.userId.toString(),
                SOCKET_EVENTS.NOTIFICATION_PREFERENCES_UPDATED,
                { preferences: updatedPrefs },
                entry.workspaceId?.toString(),
              )
            } catch (emitErr) {
              logger.warn('Failed to emit pause expiry to user', { userId: entry.userId, error: emitErr.message })
            }
          }

          logger.info('Auto-resumed expired notification pauses', { count: expiredPauses.length })
        }
      } catch (err) {
        logger.error('Failed to auto-resume expired notification pauses', { error: err.message })
      }

      logger.debug('DND scheduler run complete', { durationMs: Date.now() - start })
    } catch (error) {
      logger.error('DND scheduler failed', { error: error.message })
    }
  })

  logger.info('DND scheduler started (runs every minute)')
}

export function stopDNDScheduler() {
  if (!cronJob) return
  cronJob.stop()
  cronJob = null
  logger.info('DND scheduler stopped')
}

export default { startDNDScheduler, stopDNDScheduler }
