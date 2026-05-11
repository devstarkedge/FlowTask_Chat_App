import asyncHandler from '../../middleware/asyncHandler.js'
import userRepository from '../users/user.repository.js'
import env from '../../config/environment.js'
import logger from '../../utils/logger.js'
import pushService from '../../services/push.service.js'
import Notification from '../notifications/Notification.model.js'
import NotificationPreference from '../notifications/NotificationPreference.model.js'
import { emitToUser } from '../../sockets/socketManager.js'
import { SOCKET_EVENTS } from '../../config/constants.js'

function extractDeviceMetadata(body = {}, req) {
  return {
    deviceId: body.deviceId || req.headers['x-device-id']?.toString() || null,
    browser: body.browser || null,
    platform: body.platform || 'web',
    userAgent: body.userAgent || req.get('user-agent') || null,
    permissionState: body.permissionState || 'default',
    subscriptionStatus: body.subscriptionStatus || 'active',
    lastPromptedAt: body.lastPromptedAt ? new Date(body.lastPromptedAt) : null,
    lastDismissedAt: body.lastDismissedAt ? new Date(body.lastDismissedAt) : null,
    cooldownUntil: body.cooldownUntil ? new Date(body.cooldownUntil) : null,
    dismissCount: Number.isFinite(body.dismissCount) ? body.dismissCount : 0,
    dontAskAgain: Boolean(body.dontAskAgain),
    lastValidatedAt: new Date(),
    lastSeenAt: new Date(),
  }
}

// ─── Web Push (VAPID) ────────────────────────────────────────────────────────

// POST /api/chat/push/subscribe
export const subscribe = asyncHandler(async (req, res) => {
  const sub = req.body?.subscription || req.body
  if (!sub || !sub.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) {
    return res.status(400).json({ success: false, error: { message: 'Invalid subscription payload' } })
  }
  const userId = req.user._id
  const user = await userRepository.addPushSubscription(userId, {
    ...sub,
    ...extractDeviceMetadata(req.body, req),
  })
  res.json({ success: true, data: { subscriptions: user.chatPreferences.pushSubscriptions } })
})

// POST /api/chat/push/unsubscribe
export const unsubscribe = asyncHandler(async (req, res) => {
  const { endpoint } = req.body || {}
  if (!endpoint) return res.status(400).json({ success: false, error: { message: 'endpoint required' } })
  const userId = req.user._id
  const user = await userRepository.removePushSubscription(userId, endpoint)
  res.json({ success: true, data: { subscriptions: user?.chatPreferences?.pushSubscriptions || [] } })
})

// GET /api/chat/push/status
// Return the backend push-enabled state and the current device subscription status.
export const getStatus = asyncHandler(async (req, res) => {
  const userId = req.user._id
  const workspaceId = req.workspaceId
  const deviceId = req.query.deviceId?.toString() || null
  const endpoint = req.query.endpoint?.toString() || null

  const [user, preferences, currentDevice] = await Promise.all([
    userRepository.findById(userId),
    NotificationPreference.getOrCreate(userId, workspaceId),
    userRepository.getPushSubscriptionForDevice(userId, { endpoint, deviceId }),
  ])

  const userPushEnabled = Boolean(
    user?.chatPreferences?.desktopNotifications !== false
    && preferences?.global?.enabled !== false
    && preferences?.global?.desktopPush !== false
  )

  const now = Date.now()
  const cooldownUntil = currentDevice?.cooldownUntil ? new Date(currentDevice.cooldownUntil) : null

  res.json({
    success: true,
    data: {
      userPushEnabled,
      currentDevice: {
        deviceId,
        endpoint,
        hasSubscription: Boolean(currentDevice),
        isValid: Boolean(currentDevice && currentDevice.subscriptionStatus === 'active' && currentDevice.endpoint),
        permissionState: currentDevice?.permissionState || 'default',
        subscriptionStatus: currentDevice?.subscriptionStatus || 'missing',
        browser: currentDevice?.browser || null,
        platform: currentDevice?.platform || 'web',
        cooldownUntil,
        dismissCount: currentDevice?.dismissCount || 0,
        dontAskAgain: Boolean(currentDevice?.dontAskAgain),
        lastSeenAt: currentDevice?.lastSeenAt || null,
        lastValidatedAt: currentDevice?.lastValidatedAt || null,
      },
      prompt: {
        canPrompt: !currentDevice?.dontAskAgain && (!cooldownUntil || cooldownUntil.getTime() <= now),
        cooldownUntil,
      },
    },
  })
})

// GET /api/chat/push/publicKey
// Public endpoint returning VAPID public key for client subscription
export const getPublicKey = (_req, res) => {
  const key = env.VAPID_PUBLIC_KEY || ''
  if (!key) {
    logger.warn('VAPID public key requested but not configured')
    return res.status(204).json({ publicKey: '' })
  }
  res.json({ publicKey: key })
}

// ─── FCM Token Management ────────────────────────────────────────────────────

// POST /api/chat/push/fcm-token
// Register or update an FCM token for the authenticated user
export const registerFCMToken = asyncHandler(async (req, res) => {
  const { token, deviceId, platform } = req.body || {}
  if (!token) {
    return res.status(400).json({ success: false, error: { message: 'FCM token is required' } })
  }

  const userId = req.user._id
  await pushService.registerFCMToken(userId, { token, deviceId, platform })

  logger.info('FCM token registered', { userId: userId.toString(), platform, deviceId })
  res.json({ success: true, message: 'FCM token registered' })
})

// DELETE /api/chat/push/fcm-token
// Remove an FCM token for the authenticated user
export const removeFCMToken = asyncHandler(async (req, res) => {
  const { token } = req.body || {}
  if (!token) {
    return res.status(400).json({ success: false, error: { message: 'FCM token is required' } })
  }

  const userId = req.user._id
  await pushService.removeFCMToken(userId, token)

  res.json({ success: true, message: 'FCM token removed' })
})

// ─── Multi-Device Push Dismissal ─────────────────────────────────────────────

// POST /api/chat/push/dismiss
// Dismiss a notification across all devices (multi-device sync)
export const dismissNotification = asyncHandler(async (req, res) => {
  const { notificationId } = req.body || {}
  if (!notificationId) {
    return res.status(400).json({ success: false, error: { message: 'notificationId is required' } })
  }

  const userId = req.user._id
  const workspaceId = req.workspaceId

  // Update the notification's dismiss timestamp
  const notification = await Notification.findOneAndUpdate(
    { _id: notificationId, recipientId: userId, workspaceId },
    { $set: { pushDismissedAt: new Date() } },
    { returnDocument: 'after' },
  )

  if (!notification) {
    return res.status(404).json({ success: false, error: { message: 'Notification not found' } })
  }

  // Broadcast dismiss to all user's other devices via socket
  emitToUser(userId.toString(), SOCKET_EVENTS.NOTIFICATION_DISMISS, {
    notificationId,
  }, workspaceId?.toString())

  res.json({ success: true, message: 'Notification dismissed' })
})

export default { subscribe, unsubscribe, getStatus, getPublicKey, registerFCMToken, removeFCMToken, dismissNotification }
