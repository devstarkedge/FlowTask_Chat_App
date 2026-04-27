import { Router } from 'express'
import { protect } from '../auth/auth.middleware.js'
import { resolveWorkspace } from '../../middleware/workspaceContext.js'
import ctrl from './debug.controller.js'

const router = Router()

// Protected debug notify endpoint. Requires auth + workspace context.
router.use(protect, resolveWorkspace)

router.post('/notify', ctrl.sendDebugNotification)

export default router
