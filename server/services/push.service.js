import * as webpush from 'web-push'
import env from '../config/environment.js'
import userRepository from '../modules/users/user.repository.js'
import logger from '../utils/logger.js'
import firebaseAdmin from '../config/firebaseAdmin.js'

// Support CommonJS/ESM interop: web-push may export default in runtime
const wp = webpush?.default ?? webpush;
const _firebaseAdmin = firebaseAdmin.initializeFirebase()


// Initialize VAPID details (no-op if keys missing)
if (env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY) {
  try {
    if (typeof wp.setVapidDetails === 'function') {
      wp.setVapidDetails(env.VAPID_SUBJECT || 'mailto:admin@localhost', env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY)
      logger.info('VAPID keys configured for web-push')
    } else {
      logger.error('Failed to set VAPID details for web-push', { error: 'setVapidDetails is not a function on web-push module' })
    }
  } catch (err) {
    logger.error('Failed to set VAPID details for web-push', { error: err.message })
  }
} else {
  logger.info('VAPID keys not configured — web-push disabled')
}

// ─── Web Push (VAPID) ────────────────────────────────────────────────────────

async function sendToSubscription(subscription, payload) {
  try {
    const strPayload = typeof payload === 'string' ? payload : JSON.stringify(payload)
    if (typeof wp.sendNotification !== 'function') {
      throw new Error('web-push sendNotification is not available')
    }
    await wp.sendNotification(subscription, strPayload)
    logger.info('web-push sent', { endpoint: subscription?.endpoint })
    return { success: true }
  } catch (err) {
    logger.warn('web-push send failed', { error: err?.statusCode || err?.message, endpoint: subscription?.endpoint })
    // Some errors (404, 410) indicate subscription is gone — caller should remove it
    return { success: false, error: err }
  }
}

/**
 * Send push notifications to all Web Push subscriptions of a user.
 * Auto-removes expired/invalid subscriptions.
 */
export async function sendToUser(userId, payload) {
  const subs = await userRepository.getPushSubscriptions(userId)
  if (!subs || subs.length === 0) return { sent: 0 }

  let sent = 0
  for (const sub of subs) {
    const res = await sendToSubscription({ endpoint: sub.endpoint, keys: sub.keys }, payload)
    if (res.success) sent++
    else {
      const status = res.error?.statusCode || res.error?.status || null
      if (status === 404 || status === 410) {
        // Remove expired subscription
        await userRepository.removePushSubscription(userId, sub.endpoint)
      }
    }
  }
  return { sent }
}

// ─── FCM (Firebase Cloud Messaging) ──────────────────────────────────────────

/**
 * Send push notification via Firebase Cloud Messaging.
 * Supports mobile (Android/iOS) and desktop clients.
 *
 * Requires FCM_SERVER_KEY or Firebase Admin SDK credentials in env.
 * Falls back silently if not configured.
 *
 * @param {string} userId - ChatUser _id
 * @param {object} payload - { title, body, icon, badge, tag, data }
 * @returns {{ sent: number }}
 */
export async function sendViaFCM(userId, payload) {
  // Check if FCM is configured
  if (!env.FCM_SERVER_KEY && !env.FIREBASE_SERVICE_ACCOUNT && !env.GOOGLE_APPLICATION_CREDENTIALS) {
    return { sent: 0, reason: 'fcm_not_configured' }
  }

  try {
    const user = await userRepository.findById(userId)
    const fcmTokens = user?.chatPreferences?.fcmTokens || []
    if (fcmTokens.length === 0) return { sent: 0 }

    let sent = 0
    const expiredTokens = []

    for (const tokenEntry of fcmTokens) {
      try {
        const fcmPayload = {
          notification: {
            title: payload.title,
            body: payload.body,
            icon: payload.icon || '/icon-192x192.png',
            badge: payload.badge || '/badge.png',
            tag: payload.tag,
            click_action: payload.data?.deepLink || '/',
          },
          data: {
            ...Object.fromEntries(
              Object.entries(payload.data || {}).map(([k, v]) => [k, String(v ?? '')])
            ),
          },
          token: tokenEntry.token,
        }

        // Use HTTP v1 API if Firebase Admin is available
        const response = await _sendFCMHttp(fcmPayload, tokenEntry.token)
        if (response.success) {
          sent++
        } else if (response.expired) {
          expiredTokens.push(tokenEntry.token)
        }
      } catch (err) {
        logger.warn('FCM send failed for token', {
          userId,
          deviceId: tokenEntry.deviceId,
          error: err?.message,
        })
      }
    }

    // Clean up expired tokens
    if (expiredTokens.length > 0) {
      for (const token of expiredTokens) {
        await removeFCMToken(userId, token)
      }
    }

    return { sent }
  } catch (error) {
    logger.error('FCM sendViaFCM failed', { userId, error: error.message })
    return { sent: 0 }
  }
}

/**
 * Send FCM message via HTTP v1 API (legacy).
 * @private
 */
async function _sendFCMHttp(payload, token) {
  // Preferred path: use Firebase Admin SDK if initialized
  try {
    if (firebaseAdmin && firebaseAdmin.isInitialized && firebaseAdmin.isInitialized()) {
      const admin = firebaseAdmin.getAdmin()
      if (admin && admin.messaging) {
        const message = {
          token,
          notification: payload.notification,
          data: payload.data,
        }
        await admin.messaging().send(message)
        return { success: true }
      }
    }
  } catch (err) {
    const code = err?.code || err?.errorInfo?.code
    if (code === 'messaging/registration-token-not-registered' || code === 'messaging/invalid-registration-token') {
      return { success: false, expired: true }
    }
    logger.error('FCM send via admin failed', { error: err?.message })
    return { success: false, expired: false }
  }

  // Fallback: legacy HTTP API using server key
  if (!env.FCM_SERVER_KEY) {
    return { success: false, expired: false }
  }

  try {
    const { default: axios } = await import('axios')
    const response = await axios.post(
      'https://fcm.googleapis.com/fcm/send',
      {
        to: token,
        notification: payload.notification,
        data: payload.data,
        priority: 'high',
        // Collapse key prevents duplicate pushes for same conversation
        collapse_key: payload.notification?.tag,
      },
      {
        headers: {
          Authorization: `key=${env.FCM_SERVER_KEY}`,
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      },
    )

    const result = response.data?.results?.[0]
    if (result?.error === 'NotRegistered' || result?.error === 'InvalidRegistration') {
      return { success: false, expired: true }
    }
    return { success: result?.message_id ? true : false }
  } catch (error) {
    if (error?.response?.status === 401) {
      logger.error('FCM: invalid server key')
    }
    return { success: false, expired: false }
  }
}

// ─── FCM Token Management ────────────────────────────────────────────────────

/**
 * Register or update an FCM token for a user.
 */
export async function registerFCMToken(userId, { token, deviceId, platform }) {
  if (!token) return null

  const ChatUser = (await import('../modules/users/ChatUser.model.js')).default

  // Remove existing token with same deviceId (replace)
  if (deviceId) {
    await ChatUser.findByIdAndUpdate(userId, {
      $pull: { 'chatPreferences.fcmTokens': { deviceId } },
    })
  }

  // Also remove if this exact token already exists on another device
  await ChatUser.findByIdAndUpdate(userId, {
    $pull: { 'chatPreferences.fcmTokens': { token } },
  })

  // Add new token
  return ChatUser.findByIdAndUpdate(userId, {
    $push: {
      'chatPreferences.fcmTokens': {
        token,
        deviceId: deviceId || null,
        platform: platform || 'web',
        createdAt: new Date(),
        lastSeenAt: new Date(),
      },
    },
  }, { new: true })
}

/**
 * Remove an FCM token.
 */
export async function removeFCMToken(userId, token) {
  const ChatUser = (await import('../modules/users/ChatUser.model.js')).default
  return ChatUser.findByIdAndUpdate(userId, {
    $pull: { 'chatPreferences.fcmTokens': { token } },
  }, { new: true })
}

// ─── Multi-Device Push Management ────────────────────────────────────────────

/**
 * Send push to all devices (Web Push + FCM).
 * Used by the notification engine for cross-platform delivery.
 */
export async function sendToAllDevices(userId, payload) {
  const results = await Promise.allSettled([
    sendToUser(userId, payload),
    sendViaFCM(userId, payload),
  ])

  const webResult = results[0].status === 'fulfilled' ? results[0].value : { sent: 0 }
  const fcmResult = results[1].status === 'fulfilled' ? results[1].value : { sent: 0 }

  return {
    webPush: webResult.sent,
    fcm: fcmResult.sent,
    total: webResult.sent + fcmResult.sent,
  }
}

/**
 * Send a silent push to clear notification badges on all devices.
 * Used when user reads messages on one device.
 */
export async function clearBadgeOnAllDevices(userId) {
  const silentPayload = {
    data: {
      type: 'badge_clear',
      action: 'clear_notifications',
    },
  }

  try {
    await sendViaFCM(userId, silentPayload)
  } catch (err) {
    logger.debug('Badge clear push failed (non-critical)', { userId, error: err?.message })
  }
}

export default {
  sendToUser,
  sendToSubscription,
  sendViaFCM,
  registerFCMToken,
  removeFCMToken,
  sendToAllDevices,
  clearBadgeOnAllDevices,
}
