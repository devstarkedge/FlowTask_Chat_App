import ChatUser from '../users/ChatUser.model.js'
import userRepository from '../users/user.repository.js'
import logger from '../../utils/logger.js'

/**
 * Decide whether a notification should be delivered to `recipientId`
 * when triggered by `senderId`.
 * Returns true when notification should be delivered, false when suppressed.
 */
export async function shouldDeliverNotification(recipientId, senderId) {
  try {
    const recipient = await userRepository.findById(recipientId)
    if (!recipient) return true

    const now = new Date()

    // 1) Manual DND (pause notifications)
    const manual = recipient.chatPreferences?.dnd
    if (manual && manual.enabled) {
      // If an end time exists and has passed, clear the manual DND and allow delivery
      if (manual.endAt && new Date(manual.endAt) <= now) {
        try {
          await ChatUser.findByIdAndUpdate(recipientId, {
            $set: { 'chatPreferences.dnd.enabled': false },
            $unset: { 'chatPreferences.dnd.endAt': 1 },
          })
        } catch (err) {
          logger.warn('Failed to clear expired manual DND', { recipientId, error: err.message })
        }
      } else {
        // DND still active — allow only if sender is VIP
        if (senderId && Array.isArray(manual.vipUsers) && manual.vipUsers.some((id) => id.toString() === senderId.toString())) {
          return true
        }
        return false
      }
    }

    // 2) Presence-based DND
    if (recipient.onlineStatus === 'dnd') {
      const vipList = recipient.chatPreferences?.dnd?.vipUsers || []
      if (senderId && Array.isArray(vipList) && vipList.some((id) => id.toString() === senderId.toString())) {
        return true
      }
      return false
    }

    // 3) Recurring DND schedule (simplified UTC-hour based check — matches existing logic)
    const sched = recipient.chatPreferences?.dndSchedule
    if (sched && sched.enabled) {
      const startHour = Number(sched.startHour ?? 0)
      const endHour = Number(sched.endHour ?? 0)
      const currentHour = now.getUTCHours()

      let inWindow = false
      if (startHour <= endHour) {
        inWindow = currentHour >= startHour && currentHour < endHour
      } else {
        // wraps midnight
        inWindow = currentHour >= startHour || currentHour < endHour
      }

      if (inWindow) {
        const vipList = recipient.chatPreferences?.dnd?.vipUsers || []
        if (senderId && Array.isArray(vipList) && vipList.some((id) => id.toString() === senderId.toString())) {
          return true
        }
        return false
      }
    }

    // Default: allow delivery
    return true
  } catch (error) {
    // On errors, be conservative and allow notifications (avoid silently dropping messages)
    logger.error('DND gateway failed', { recipientId, senderId, error: error.message })
    return true
  }
}

export default { shouldDeliverNotification }
