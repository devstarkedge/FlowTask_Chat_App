import { Router } from 'express';
import { processCommand } from './bot.controller.js';
import { protect } from '../auth/auth.middleware.js';

const router = Router();

/**
 * Bot Routes — all protected
 *
 * POST /api/chat/bot/command — Process slash command
 */

router.use(protect);
router.post('/command', processCommand);

export default router;
