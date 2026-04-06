import { Router } from 'express';
import { protect } from '../auth/auth.middleware.js';
import { resolveWorkspace } from '../../middleware/workspaceContext.js';
import { validate } from '../../middleware/validate.js';
import { saveDraftSchema } from './draft.schemas.js';
import {
  saveDraft,
  getDraft,
  getAllDrafts,
  deleteDraft,
  getDraftCount,
  sendDraftNow,
} from './draft.controller.js';

const router = Router();

/**
 * Draft Routes — all protected + workspace-scoped
 *
 * POST   /api/chat/drafts/save          — Save/update a draft
 * GET    /api/chat/drafts/all           — Get all drafts (sidebar)
 * GET    /api/chat/drafts/count         — Get draft count (badge)
 * GET    /api/chat/drafts/:channelId    — Get draft for conversation
 * DELETE /api/chat/drafts/:id           — Delete a draft
 */

router.use(protect);
router.use(resolveWorkspace);

router.post('/save', validate({ body: saveDraftSchema }), saveDraft);
router.post('/:id/send', sendDraftNow);
router.get('/all', getAllDrafts);
router.get('/count', getDraftCount);
router.get('/:channelId', getDraft);
router.delete('/:id', deleteDraft);

export default router;
