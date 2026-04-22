import { Router } from 'express';
import { protect } from '../auth/auth.middleware.js';
import { resolveWorkspace } from '../../middleware/workspaceContext.js';
import { searchLimiter } from '../../middleware/rateLimiter.js';
import { searchAll } from './search.controller.js';

const router = Router();

router.use(protect);
router.use(resolveWorkspace);

router.get('/', searchLimiter, searchAll);

export default router;
