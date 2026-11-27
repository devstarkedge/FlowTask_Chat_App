import asyncHandler from '../../middleware/asyncHandler.js'
import userRepository from '../users/user.repository.js'
import env from '../../config/environment.js'
import logger from '../../utils/logger.js'
import pushService from '../../services/push.service.js'
import Notification from '../notifications/Notification.model.js'
import NotificationPreference from '../notifications/NotificationPreference.model.js'
import { emitToUser } from '../../sockets/socketManager.js'
import { SOCKET_EVENTS } from '../../config/constants.js'
import { Expo } from 'expo-server-sdk'
import DeviceInstallation, { getTokenFingerprint } from './DeviceInstallation.model.js'
import notificationOutboxService from '../../services/notificationOutbox.service.js'

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
  if (typeof token !== 'string' || !token.trim()) {
    return res.status(400).json({ success: false, error: { message: 'FCM token is required' } })
  }

  if (platform && !['web', 'android', 'ios', 'desktop', 'expo'].includes(platform)) {
    return res.status(400).json({ success: false, error: { message: 'Invalid push platform' } })
  }
  if ((platform === 'expo') !== Expo.isExpoPushToken(token)) {
    return res.status(400).json({ success: false, error: { message: 'Push token type does not match platform' } })
  }

  const userId = req.user._id
  const user = await pushService.registerFCMToken(userId, { token, deviceId, platform })
  if (!user) return res.status(404).json({ success: false, error: { message: 'Push account not found' } })

  const installationId = deviceId && deviceId !== 'unknown' ? deviceId : `token:${getTokenFingerprint(token)}`
  const previousInst = await DeviceInstallation.findOne({ installationId }).select('userId').lean()
  if (previousInst?.userId && String(previousInst.userId) !== String(userId)) {
    await notificationOutboxService.cancelForInstallationSwitch(installationId, previousInst.userId, 'account_switched')
  }
  await DeviceInstallation.bindInstallation({
    installationId,
    userId,
    platform: platform || 'expo',
    deviceType: ['desktop', 'desktop_win', 'desktop_mac', 'desktop_linux'].includes(platform) ? 'desktop' : platform === 'web' ? 'web' : 'mobile',
    pushProvider: platform === 'expo' ? 'expo' : 'fcm',
    pushToken: token,
  })

  logger.info('FCM token registered', {
    userId: userId.toString(),
    platform,
    deviceId: installationId,
    tokenFingerprint: getTokenFingerprint(token),
  })
  res.json({ success: true, message: 'FCM token registered', data: { installationId } })
})

// DELETE /api/chat/push/fcm-token
// Remove an FCM token for the authenticated user
export const removeFCMToken = asyncHandler(async (req, res) => {
  const { token, deviceId } = req.body || {}
  if (!token) {
    return res.status(400).json({ success: false, error: { message: 'FCM token is required' } })
  }

  const userId = req.user._id
  await pushService.removeFCMToken(userId, token)
  await DeviceInstallation.unbindInstallation({
    installationId: deviceId || null,
    userId,
    pushToken: token,
  })

  res.json({ success: true, message: 'FCM token removed' })
})

// POST /api/chat/push/activity
// Report per-installation activity state (focus, idle, lock, appState, activeChannelId)
export const reportActivity = asyncHandler(async (req, res) => {
  const userId = req.user._id
  const {
    installationId,
    platform,
    deviceType,
    focused,
    idleState,
    screenLocked,
    appState,
    sessionState,
    activeWorkspaceId,
    activeChannelId,
  } = req.body || {}

  if (!installationId || typeof installationId !== 'string') {
    return res.status(400).json({ success: false, error: { message: 'installationId is required' } })
  }

  const updated = await DeviceInstallation.updateActivity({
    installationId,
    userId,
    platform,
    deviceType,
    focused,
    idleState,
    screenLocked,
    appState,
    sessionState,
    activeWorkspaceId,
    activeChannelId,
  })

  const desktopInactive = (deviceType === 'desktop' || String(platform || '').startsWith('desktop'))
    && (screenLocked === true || idleState === 'idle' || idleState === 'locked' || appState === 'closed' || focused === false)
  if (desktopInactive) {
    const canStillReceive = await DeviceInstallation.canDesktopReceiveAlerts(userId)
    if (!canStillReceive) {
      notificationOutboxService.triggerPendingMobileAlertsForUser(userId).catch(() => {})
    }
  }

  res.json({ success: true, data: updated })
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

export default { subscribe, unsubscribe, getStatus, getPublicKey, registerFCMToken, removeFCMToken, reportActivity, dismissNotification }
