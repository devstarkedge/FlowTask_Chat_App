import { useEffect, useRef, useCallback } from 'react'
import api from '../services/api'
import logger from '../utils/logger'

/**
 * usePushSubscription — manages browser push notification lifecycle.
 *
 * On mount:
 *  1. Registers the service worker (sw.js)
 *  2. Requests notification permission if not yet granted
 *  3. Subscribes to push with VAPID public key
 *  4. Sends subscription to backend
 *
 * Handles permission changes and auto-re-subscribes.
 */
export default function usePushSubscription({ enabled = true } = {}) {
  const subscriptionRef = useRef(null)
  const registrationRef = useRef(null)

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
      // Check for existing subscription
      let subscription = await registration.pushManager.getSubscription()

      if (!subscription) {
        // Get VAPID public key from server
        const { data } = await api.get('/push/publicKey')
        const vapidKey = data?.publicKey
        if (!vapidKey) {
          logger.debug('No VAPID public key configured on server')
          return null
        }

        // Convert VAPID key to Uint8Array
        const applicationServerKey = urlBase64ToUint8Array(vapidKey)

        // Subscribe to push
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey,
        })
      }

      subscriptionRef.current = subscription

      // Send subscription to backend
      await api.post('/push/subscribe', subscription.toJSON())
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

  const requestPermissionAndSubscribe = useCallback(async () => {
    if (!('Notification' in window)) return

    if (Notification.permission === 'denied') {
      logger.debug('Notification permission denied by browser')
      return
    }

    if (Notification.permission === 'default') {
      const result = await Notification.requestPermission()
      if (result !== 'granted') return
    }

    const registration = registrationRef.current || await registerServiceWorker()
    if (registration) {
      await subscribeToPush(registration)
    }
  }, [registerServiceWorker, subscribeToPush])

  const unsubscribe = useCallback(async () => {
    try {
      const subscription = subscriptionRef.current
      if (subscription) {
        // Notify server
        await api.post('/push/unsubscribe', { endpoint: subscription.endpoint })
        // Unsubscribe from push
        await subscription.unsubscribe()
        subscriptionRef.current = null
        logger.debug('Push subscription removed')
      }
    } catch (error) {
      logger.error('Failed to unsubscribe from push:', error)
    }
  }, [])

  useEffect(() => {
    if (!enabled) return

    let mounted = true

    const init = async () => {
      const registration = await registerServiceWorker()
      if (!mounted || !registration) return

      if (Notification.permission === 'granted') {
        await subscribeToPush(registration)
      }
    }

    init()

    return () => {
      mounted = false
    }
  }, [enabled, registerServiceWorker, subscribeToPush])

  return {
    requestPermissionAndSubscribe,
    unsubscribe,
    isSupported: 'serviceWorker' in navigator && 'PushManager' in window,
    permission: typeof Notification !== 'undefined' ? Notification.permission : 'denied',
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}
