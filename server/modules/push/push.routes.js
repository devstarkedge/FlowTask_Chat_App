import { Router } from 'express'
import { protect } from '../auth/auth.middleware.js'
import { resolveWorkspace } from '../../middleware/workspaceContext.js'
import ctrl from './push.controller.js'

const router = Router()

// Public: VAPID public key (no auth required)
router.get('/publicKey', ctrl.getPublicKey)

// Push endpoints require auth + workspace
router.use(protect)
// Tokens belong to an account/installation, not to the currently selected workspace.
router.post('/fcm-token', ctrl.registerFCMToken)
router.delete('/fcm-token', ctrl.removeFCMToken)
router.use(resolveWorkspace)
router.get('/status', ctrl.getStatus)
router.post('/subscribe', ctrl.subscribe)
router.post('/unsubscribe', ctrl.unsubscribe)

// FCM token management

// Multi-device push dismissal
router.post('/dismiss', ctrl.dismissNotification)

export default router
