import { Router } from 'express';
import { handleFlowTaskWebhook } from './webhook.controller.js';

const router = Router();

/**
 * Webhook Routes
 *
 * POST /api/chat/webhooks/flowtask — Receive FlowTask events
 *
 * No auth middleware — uses HMAC signature verification instead.
 */

router.post('/flowtask', ...handleFlowTaskWebhook);

export default router;
