import { Router } from 'express';
import {
  getChannels,
  getChannel,
  getChannelBySlug,
  createChannel,
  updateChannel,
  archiveChannel,
  createDM,
  addMember,
  removeMember,
  leaveChannel,
  searchChannels,
  getChannelMembers,
} from './channel.controller.js';
import { protect, requireChannelAccess } from '../auth/auth.middleware.js';
import { resolveWorkspace } from '../../middleware/workspaceContext.js';
import { validate } from '../../middleware/validate.js';
import { createChannelSchema, updateChannelSchema, createDMSchema } from '../../middleware/schemas.js';

const router = Router();

/**
 * Channel Routes — all protected
 *
 * GET    /api/chat/channels            — List user's channels
 * GET    /api/chat/channels/search     — Search channels
 * POST   /api/chat/channels            — Create custom channel
 * POST   /api/chat/channels/dm         — Get/create DM
 * GET    /api/chat/channels/slug/:slug — Get by slug
 * GET    /api/chat/channels/:id        — Get by ID
 * PUT    /api/chat/channels/:id        — Update channel
 * POST   /api/chat/channels/:id/archive — Archive channel
 * POST   /api/chat/channels/:id/members — Add member
 * DELETE /api/chat/channels/:id/members/:userId — Remove member
 * POST   /api/chat/channels/:id/leave  — Leave channel
 */

router.use(protect);
router.use(resolveWorkspace);

router.get('/', getChannels);
router.get('/search', searchChannels);
router.post('/', validate({ body: createChannelSchema }), createChannel);
router.post('/dm', validate({ body: createDMSchema }), createDM);
router.get('/slug/:slug', getChannelBySlug);

router.get('/:id', requireChannelAccess(), getChannel);
router.get('/:id/members', requireChannelAccess(), getChannelMembers);
router.put('/:id', requireChannelAccess(), validate({ body: updateChannelSchema }), updateChannel);
router.post('/:id/archive', requireChannelAccess(), archiveChannel);
router.post('/:id/members', requireChannelAccess(), addMember);
router.delete('/:id/members/:userId', requireChannelAccess(), removeMember);
router.post('/:id/leave', requireChannelAccess(), leaveChannel);

export default router;
