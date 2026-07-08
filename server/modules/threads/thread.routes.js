import { Router } from 'express';
import {
  createThread,
  getThread,
  getThreadReplies,
  getThreadByTask,
  getChannelThreads,
  getMyThreads,
  lockThread,
  resolveThread,
  updateThreadTitle,
  muteThread,
  unmuteThread,
} from './thread.controller.js';
import { protect } from '../auth/auth.middleware.js';
import { resolveWorkspace } from '../../middleware/workspaceContext.js';

const router = Router();

/**
 * Thread Routes — all protected
 *
 * POST /api/chat/threads              — Create thread
 * GET  /api/chat/threads/my           — User's threads
 * GET  /api/chat/threads/task/:taskId — Thread by task ID
 * GET  /api/chat/threads/:id          — Get thread
 * GET  /api/chat/threads/:id/replies  — Thread replies
 * POST /api/chat/threads/:id/lock     — Lock thread
 * POST /api/chat/threads/:id/resolve  — Resolve thread
 * PUT  /api/chat/threads/:id/title    — Update title
 */

router.use(protect);
router.use(resolveWorkspace);

router.post('/', createThread);
router.get('/my', getMyThreads);
router.get('/task/:taskId', getThreadByTask);
router.get('/:id', getThread);
router.get('/:id/replies', getThreadReplies);
router.post('/:id/lock', lockThread);
router.post('/:id/resolve', resolveThread);
router.put('/:id/title', updateThreadTitle);
router.post('/:id/mute', muteThread);
router.post('/:id/unmute', unmuteThread);

export default router;

/**
 * Channel-scoped thread routes.
 * Mounted on: /api/chat/channels/:channelId
 */
export const channelThreadRouter = Router({ mergeParams: true });
channelThreadRouter.use(protect);
channelThreadRouter.use(resolveWorkspace);
channelThreadRouter.get('/threads', getChannelThreads);
