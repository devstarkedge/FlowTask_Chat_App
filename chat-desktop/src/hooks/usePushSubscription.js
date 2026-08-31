import { useCallback, useEffect, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { pushAPI } from '../services/api'
import logger from '../utils/logger'
import { useAuthStore } from '../stores/authStore'
import { useNotificationStore } from '../stores/notificationStore'

const PROMPT_DELAY_MS = 1500
const PROMPT_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000
const DEVICE_ID_STORAGE_KEY = 'chat_push_device_id'
const SESSION_DISMISSED_KEY = 'chat_push_modal_dismissed'
const COOLDOWN_STORAGE_KEY = 'chat_push_prompt_cooldown_until'
const DONT_ASK_STORAGE_KEY = 'chat_push_dont_ask_again'
const PROMPT_LOCK_KEY = 'chat_push_prompt_lock_until'

const CLOSED_PROMPT = {
  isOpen: false,
  mode: 'default',
  isBusy: false,
  error: '',
}

export default function usePushSubscription({ enabled = true } = {}) {
  const subscriptionRef = useRef(null)
  const registrationRef = useRef(null)
  const promptTimerRef = useRef(null)

  const [permission, setPermission] = useState(getCurrentPermission())
  const [isSupported, setIsSupported] = useState(hasPushSupport())
  const [deviceStatus, setDeviceStatus] = useState(null)
  const [prompt, setPrompt] = useState(CLOSED_PROMPT)

  const registerServiceWorker = useCallback(async () => {
    if (!('serviceWorker' in navigator)) {
      logger.debug('Service Workers not supported')
      return null
    }

    try {
      const registration = await navigator.serviceWorker.register('/sw.js', {
        scope: '/',
      })
      registrationRef.current = registration
      logger.debug('Service Worker registered', { scope: registration.scope })
      return registration
    } catch (error) {
      logger.error('Service Worker registration failed:', error)
      return null
    }
  }, [])

  const subscribeToPush = useCallback(async (registration) => {
    if (!registration?.pushManager) return null

    try {
      let subscription = await registration.pushManager.getSubscription()

      if (!subscription) {
        const { data } = await pushAPI.getPublicKey()
        const vapidKey = data?.publicKey
        if (!vapidKey) {
          logger.debug('No VAPID public key configured on server')
          return null
        }

        const applicationServerKey = urlBase64ToUint8Array(vapidKey)
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey,
        })
      }

      const deviceMeta = getPushDeviceMeta()

      subscriptionRef.current = subscription
      await pushAPI.subscribe({
        subscription: subscription.toJSON(),
        ...deviceMeta,
        permissionState: getCurrentPermission(),
        subscriptionStatus: 'active',
      })
      logger.debug('Push subscription registered with server')

      return subscription
    } catch (error) {
      if (error?.name === 'NotAllowedError') {
        logger.debug('Push notification permission denied')
      } else {
        logger.error('Push subscription failed:', error)
      }
      return null
    }
  }, [])

  const fetchPushStatus = useCallback(async (subscription = null) => {
    try {
      const { data } = await pushAPI.getStatus({
        deviceId: getOrCreateDeviceId(),
        endpoint: subscription?.endpoint,
      })
      const nextStatus = data?.data || null
      setDeviceStatus(nextStatus)
      return nextStatus
    } catch (error) {
      logger.error('Failed to fetch push status:', error)
      return null
    }
  }, [])

  const requestPermissionAndSubscribe = useCallback(async ({ silent = false } = {}) => {
    if (!hasPushSupport()) {
      if (!silent) {
        openPromptState(setPrompt, 'unsupported')
      }
      return { success: false, reason: 'unsupported' }
    }

    if (!navigator.onLine) {
      if (!silent) {
        setPrompt({
          isOpen: true,
          mode: 'error',
          isBusy: false,
          error: 'You appear to be offline. Reconnect to finish notification setup.',
        })
      }
      return { success: false, reason: 'offline' }
    }

    if (!silent) {
      setPrompt((current) => ({
        ...current,
        isOpen: true,
        isBusy: true,
        error: '',
      }))
    }

    let nextPermission = getCurrentPermission()

    if (nextPermission === 'denied') {
      setPermission('denied')
      await syncBackendPushState(false)

      if (!silent) {
        setPrompt({
          isOpen: true,
          mode: 'blocked',
          isBusy: false,
          error: '',
        })
      }

      return { success: false, reason: 'denied' }
    }

    if (nextPermission === 'default') {
      nextPermission = await Notification.requestPermission()
      setPermission(nextPermission)
    }

    if (nextPermission !== 'granted') {
      if (nextPermission === 'denied') {
        await syncBackendPushState(false)

        if (!silent) {
          setPrompt({
            isOpen: true,
            mode: 'blocked',
            isBusy: false,
            error: '',
          })
        }
      } else if (!silent) {
        setPrompt((current) => ({ ...current, isBusy: false }))
      }

      return { success: false, reason: nextPermission }
    }

    const registration = registrationRef.current || await registerServiceWorker()
    if (!registration) {
      if (!silent) {
        setPrompt({
          isOpen: true,
          mode: 'error',
          isBusy: false,
          error: 'Service worker registration failed on this device.',
        })
      }
      return { success: false, reason: 'service_worker_failed' }
    }

    const subscription = await subscribeToPush(registration)
    if (!subscription) {
      if (!silent) {
        setPrompt({
          isOpen: true,
          mode: 'error',
          isBusy: false,
          error: 'We could not register this browser for push notifications yet.',
        })
      }
      return { success: false, reason: 'subscription_failed' }
    }

    const deviceMeta = getPushDeviceMeta()
    await syncBackendPushState(true)
    clearPromptSuppression()
    releasePromptLock()
    setPrompt(CLOSED_PROMPT)
    setDeviceStatus((current) => ({
      ...(current || {}),
      userPushEnabled: true,
      currentDevice: {
        ...(current?.currentDevice || {}),
        ...deviceMeta,
        endpoint: subscription.endpoint,
        hasSubscription: true,
        isValid: true,
        permissionState: 'granted',
        subscriptionStatus: 'active',
      },
    }))

    if (!silent) {
      toast.success('Notifications are enabled on this device.')
    }

    try {
      const bc = new BroadcastChannel('push_notification_sync')
      bc.postMessage({ type: 'SYNC_PUSH' })
      bc.close()
    } catch (e) {
      logger.debug('BroadcastChannel failed', e)
    }

    return { success: true, subscription }
  }, [registerServiceWorker, subscribeToPush])

  const unsubscribe = useCallback(async () => {
    try {
      const registration = registrationRef.current || await registerServiceWorker()
      const subscription = subscriptionRef.current || await registration?.pushManager?.getSubscription() || null
      const endpoint = subscription?.endpoint || deviceStatus?.currentDevice?.endpoint

      if (endpoint) {
        await pushAPI.unsubscribe({ endpoint })
      }

      if (subscription) {
        await subscription.unsubscribe()
        subscriptionRef.current = null
      }

      await syncBackendPushState(false)

      const deviceMeta = getPushDeviceMeta()
      setDeviceStatus((current) => ({
        ...(current || {}),
        userPushEnabled: false,
        currentDevice: {
          ...(current?.currentDevice || {}),
          ...deviceMeta,
          endpoint: null,
          hasSubscription: false,
          isValid: false,
          permissionState: getCurrentPermission(),
          subscriptionStatus: 'missing',
        },
      }))
      logger.debug('Push subscription removed')
    } catch (error) {
      logger.error('Failed to unsubscribe from push:', error)
    }
  }, [deviceStatus?.currentDevice?.endpoint, registerServiceWorker])

  const dismissForNow = useCallback(() => {
    markDismissedThisSession()
    setPromptCooldown()
    releasePromptLock()
    setPrompt(CLOSED_PROMPT)
  }, [])

  const dismissForever = useCallback(() => {
    setPersistentFlag(DONT_ASK_STORAGE_KEY, 'true')
    markDismissedThisSession()
    releasePromptLock()
    setPrompt(CLOSED_PROMPT)
  }, [])

  const schedulePrompt = useCallback((mode, status = null, error = '') => {
    clearTimeout(promptTimerRef.current)
    promptTimerRef.current = setTimeout(() => {
      if (shouldSuppressPrompt(status)) return
      openPromptState(setPrompt, mode, error)
    }, PROMPT_DELAY_MS)
  }, [])

  useEffect(() => {
    if (!enabled) return undefined

    let mounted = true

    const init = async () => {
      const nextSupport = hasPushSupport()
      setIsSupported(nextSupport)
      setPermission(getCurrentPermission())

      if (!nextSupport) {
        if (!shouldSuppressPrompt(deviceStatus)) {
          schedulePrompt('unsupported', deviceStatus)
        }
        return
      }

      const registration = await registerServiceWorker()
      if (!mounted) return

      if (!registration) {
        if (!shouldSuppressPrompt(deviceStatus)) {
          schedulePrompt('error', deviceStatus, 'Service worker registration failed on this device.')
        }
        return
      }

      const liveSubscription = await registration.pushManager.getSubscription()
      if (!mounted) return

      subscriptionRef.current = liveSubscription
      const status = await fetchPushStatus(liveSubscription)
      if (!mounted) return

      const nextPermission = getCurrentPermission()
      setPermission(nextPermission)

      if (nextPermission === 'granted') {
        if (!liveSubscription || !status?.currentDevice?.isValid || !status?.userPushEnabled) {
          await requestPermissionAndSubscribe({ silent: true })
        }
        return
      }

      if (shouldSuppressPrompt(status)) return

      if (nextPermission === 'denied') {
        await syncBackendPushState(false)
        schedulePrompt('blocked', status)
        return
      }

      if (!status?.currentDevice?.isValid || !status?.userPushEnabled) {
        schedulePrompt('default', status)
      }
    }

    init()

    return () => {
      mounted = false
      clearTimeout(promptTimerRef.current)
      releasePromptLock()
    }
  }, [enabled, fetchPushStatus, registerServiceWorker, requestPermissionAndSubscribe, schedulePrompt])

  useEffect(() => {
    if (!enabled || !navigator.permissions?.query) return undefined

    let permissionStatus = null
    let disposed = false

    navigator.permissions.query({ name: 'notifications' }).then((status) => {
      if (disposed) return

      permissionStatus = status
      status.onchange = async () => {
        const nextPermission = getCurrentPermission()
        setPermission(nextPermission)

        if (nextPermission === 'granted') {
          await requestPermissionAndSubscribe({ silent: true })
          return
        }

        if (nextPermission === 'denied') {
          await unsubscribe()
          schedulePrompt('blocked', deviceStatus)
        }
      }
    }).catch((error) => {
      logger.debug('Notification permission watcher unavailable', error)
    })

    return () => {
      disposed = true
      if (permissionStatus) permissionStatus.onchange = null
    }
  }, [enabled, requestPermissionAndSubscribe, schedulePrompt, unsubscribe])

  useEffect(() => {
    if (!enabled) return undefined
    try {
      const bc = new BroadcastChannel('push_notification_sync')
      bc.onmessage = async (event) => {
        if (event.data?.type === 'SYNC_PUSH') {
          const nextPermission = getCurrentPermission()
          setPermission(nextPermission)
          const registration = await navigator.serviceWorker?.getRegistration()
          if (registration && registration.pushManager) {
            const liveSubscription = await registration.pushManager.getSubscription()
            await fetchPushStatus(liveSubscription)
          }
        }
      }
      return () => bc.close()
    } catch (e) {
      logger.debug('BroadcastChannel failed', e)
    }
  }, [enabled, fetchPushStatus])

  return {
    requestPermissionAndSubscribe,
    unsubscribe,
    isSupported,
    permission,
    deviceStatus,
    prompt: {
      ...prompt,
      browser: getPushDeviceMeta().browser,
      onEnable: requestPermissionAndSubscribe,
      onLater: dismissForNow,
      onDontAskAgain: dismissForever,
    },
  }
}

function hasPushSupport() {
  return typeof window !== 'undefined'
    && 'Notification' in window
    && 'serviceWorker' in navigator
    && 'PushManager' in window
}

function getCurrentPermission() {
  return typeof Notification !== 'undefined' ? Notification.permission : 'denied'
}

function getStorage(kind = 'local') {
  if (typeof window === 'undefined') return null

  try {
    return kind === 'session' ? window.sessionStorage : window.localStorage
  } catch {
    return null
  }
}

function getPersistentFlag(key) {
  return getStorage('local')?.getItem(key) || null
}

function setPersistentFlag(key, value) {
  getStorage('local')?.setItem(key, value)
}

function clearPersistentFlag(key) {
  getStorage('local')?.removeItem(key)
}

function markDismissedThisSession() {
  getStorage('session')?.setItem(SESSION_DISMISSED_KEY, 'true')
}

function dismissedThisSession() {
  return getStorage('session')?.getItem(SESSION_DISMISSED_KEY) === 'true'
}

function clearPromptSuppression() {
  getStorage('session')?.removeItem(SESSION_DISMISSED_KEY)
  clearPersistentFlag(COOLDOWN_STORAGE_KEY)
}

function setPromptCooldown() {
  setPersistentFlag(COOLDOWN_STORAGE_KEY, String(Date.now() + PROMPT_COOLDOWN_MS))
}

function getTimestampFromStorage(key) {
  const raw = getPersistentFlag(key)
  const parsed = raw ? Number(raw) : 0
  return Number.isFinite(parsed) ? parsed : 0
}

function acquirePromptLock() {
  const current = getTimestampFromStorage(PROMPT_LOCK_KEY)
  if (current && current > Date.now()) return false

  setPersistentFlag(PROMPT_LOCK_KEY, String(Date.now() + 15000))
  return true
}

function releasePromptLock() {
  clearPersistentFlag(PROMPT_LOCK_KEY)
}

function shouldSuppressPrompt(status) {
  if (dismissedThisSession()) return true
  if (getPersistentFlag(DONT_ASK_STORAGE_KEY) === 'true') return true

  const localCooldown = getTimestampFromStorage(COOLDOWN_STORAGE_KEY)
  if (localCooldown > Date.now()) return true

  const backendCooldown = status?.prompt?.cooldownUntil
    ? new Date(status.prompt.cooldownUntil).getTime()
    : 0

  if (backendCooldown > Date.now()) return true

  return status?.currentDevice?.dontAskAgain === true || status?.prompt?.canPrompt === false
}

function openPromptState(setPrompt, mode, error = '') {
  if (!acquirePromptLock()) return

  setPrompt({
    isOpen: true,
    mode,
    isBusy: false,
    error,
  })
}

async function syncBackendPushState(enabled) {
  await Promise.allSettled([
    useAuthStore.getState().updatePreferences({ desktopNotifications: enabled }),
    useNotificationStore.getState().updatePreferences({
      global: enabled
        ? { enabled: true, desktopPush: true }
        : { desktopPush: false },
    }),
  ])
}

function getOrCreateDeviceId() {
  const existing = getPersistentFlag(DEVICE_ID_STORAGE_KEY)
  if (existing) return existing

  const generated = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `push-${Date.now()}-${Math.random().toString(16).slice(2)}`

  setPersistentFlag(DEVICE_ID_STORAGE_KEY, generated)
  return generated
}

function detectBrowser(userAgent = '') {
  if (/Edg\//i.test(userAgent)) return 'edge'
  if (/Firefox\//i.test(userAgent)) return 'firefox'
  if (/Safari\//i.test(userAgent) && !/Chrome\//i.test(userAgent)) return 'safari'
  if (/Chrome\//i.test(userAgent)) return 'chrome'
  return 'browser'
}

function detectPlatform(userAgent = '') {
  if (/iphone|ipad|ios/i.test(userAgent)) return 'ios'
  if (/android/i.test(userAgent)) return 'android'
  if (/mac/i.test(userAgent)) return 'mac'
  if (/win/i.test(userAgent)) return 'windows'
  if (/linux/i.test(userAgent)) return 'linux'
  return 'web'
}

function getPushDeviceMeta() {
  if (typeof navigator === 'undefined') {
    return {
      deviceId: null,
      browser: 'browser',
      platform: 'web',
      userAgent: null,
    }
  }

  const userAgent = navigator.userAgent || ''
  return {
    deviceId: getOrCreateDeviceId(),
    browser: detectBrowser(userAgent),
    platform: detectPlatform(userAgent),
    userAgent,
  }
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let index = 0; index < rawData.length; index += 1) {
    outputArray[index] = rawData.charCodeAt(index)
  }
  return outputArray
}
