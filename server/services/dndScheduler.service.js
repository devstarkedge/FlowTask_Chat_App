import cron from 'node-cron'
import ChatUser from '../modules/users/ChatUser.model.js'
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
      const expiredResult = await ChatUser.updateMany(
        { 'chatPreferences.dnd.enabled': true, 'chatPreferences.dnd.endAt': { $lte: now } },
        { $set: { 'chatPreferences.dnd.enabled': false }, $unset: { 'chatPreferences.dnd.endAt': 1 } },
      )
      if (expiredResult.modifiedCount > 0) {
        logger.info('Cleared expired manual DND for users', { count: expiredResult.modifiedCount })
      }

      // 2) Evaluate recurring schedules and enable/disable DND accordingly
      const users = await ChatUser.find({ 'chatPreferences.dndSchedule.enabled': true }).select('chatPreferences.dndSchedule chatPreferences.dnd')
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
            // enable recurring DND
            await ChatUser.findByIdAndUpdate(user._id, { $set: { 'chatPreferences.dnd.enabled': true } })
          } else if (!inWindow && currentlyEnabled) {
            // disable recurring DND (only if there is no manual endAt active)
            // If manual endAt exists and is in future, respect manual setting; otherwise clear
            const manualEnd = user.chatPreferences?.dnd?.endAt
            if (!manualEnd || new Date(manualEnd) <= now) {
              await ChatUser.findByIdAndUpdate(user._id, { $set: { 'chatPreferences.dnd.enabled': false }, $unset: { 'chatPreferences.dnd.endAt': 1 } })
            }
          }
        } catch (err) {
          logger.warn('Failed to evaluate recurring DND for user', { userId: user._id, error: err.message })
        }
      }

      const durationMs = Date.now() - start
      logger.debug('DND scheduler run complete', { durationMs })
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
