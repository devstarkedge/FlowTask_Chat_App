import { Router } from 'express'
import { protect } from '../auth/auth.middleware.js'
import { resolveWorkspace } from '../../middleware/workspaceContext.js'
import ctrl from './push.controller.js'

const router = Router()

// Public: VAPID public key (no auth required)
router.get('/publicKey', ctrl.getPublicKey)

// Push endpoints require auth + workspace
router.use(protect, resolveWorkspace)
router.get('/status', ctrl.getStatus)
router.post('/subscribe', ctrl.subscribe)
router.post('/unsubscribe', ctrl.unsubscribe)

// FCM token management
router.post('/fcm-token', ctrl.registerFCMToken)
router.delete('/fcm-token', ctrl.removeFCMToken)

// Multi-device push dismissal
router.post('/dismiss', ctrl.dismissNotification)

export default router
