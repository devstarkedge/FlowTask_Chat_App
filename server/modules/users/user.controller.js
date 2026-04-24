import asyncHandler from '../../middleware/asyncHandler.js';
import userService from './user.service.js';
import flowtaskService from '../flowtask/flowtask.service.js';
import userRepository from './user.repository.js';
import workspaceRepository from '../workspaces/workspace.repository.js';
import { WORKSPACE_ROLES } from '../../config/constants.js';
import ChatUser from './ChatUser.model.js';
import logger from '../../utils/logger.js';

/**
 * GET /users/dm-contacts
 * Get merged list of FlowTask + ChatApp users for DM contact search.
 *
 * Returns each user with:
 *  - name, email, avatar, flowTaskUserId
 *  - chatUserId (if exists in ChatApp)
 *  - onlineStatus (if in ChatApp)
 *  - isInChatApp: boolean
 *
 * Falls back to ChatApp-only users if FlowTask API fails.
 */
export const getDMContacts = asyncHandler(async (req, res) => {
  const { search } = req.query;
  const workspaceId = req.workspaceId;
  const currentUser = req.user;
  // Prefer verified FlowTask token from auth middleware, then explicit header,
  // then fall back to persisted token on ChatUser.
  let flowTaskToken = req.flowTaskToken || req.headers['x-flowtask-token'];
  if (!flowTaskToken) {
    const userWithToken = await ChatUser.findById(currentUser._id)
      .select('flowTaskToken flowTaskTokenExpiry')
      .lean();

    const tokenExpiry = userWithToken?.flowTaskTokenExpiry
      ? new Date(userWithToken.flowTaskTokenExpiry)
      : null;

    // Ignore expired persisted tokens to avoid noisy 401 calls to FlowTask.
    if (userWithToken?.flowTaskToken && (!tokenExpiry || tokenExpiry > new Date())) {
      flowTaskToken = userWithToken.flowTaskToken;
    } else {
      flowTaskToken = null;
    }
  }

  // ── Step 1: Fetch ChatApp users for this workspace (always available) ──
  const chatUsers = await userRepository.findAllForWorkspace(workspaceId, search);

  // ── Step 2: Try to fetch FlowTask platform users (graceful degradation) ──
  let flowTaskUsers = [];
  let flowTaskFetchFailed = false;

  if (flowTaskToken) {
    try {
      flowTaskUsers = await flowtaskService.getUsers(
        search ? { search } : {},
        flowTaskToken,
      );
    } catch (err) {
      flowTaskFetchFailed = true;

      if (err.response?.status === 401) {
        // Invalidate stale FlowTask token from persisted user record so
        // we do not keep retrying a bad token forever.
        await ChatUser.findByIdAndUpdate(currentUser._id, {
          flowTaskToken: null,
          flowTaskTokenExpiry: null,
        });
      }

      logger.warn('Failed to fetch FlowTask users for DM contacts', {
        error: err.message,
        status: err.response?.status,
        workspaceId,
      });
    }
  }

  // ── Step 3: Merge and deduplicate by email ──
  const contactMap = new Map(); // email -> merged contact

  // First, index ChatApp users by email
  for (const cu of chatUsers) {
    const email = cu.email?.toLowerCase();
    if (!email) continue;
    // Exclude current user
    if (cu._id.toString() === currentUser._id.toString()) continue;

    contactMap.set(email, {
      name: cu.name,
      email: cu.email,
      avatar: cu.avatar || null,
      flowTaskUserId: cu.flowTaskUserId || null,
      chatUserId: cu._id.toString(),
      onlineStatus: cu.onlineStatus || 'offline',
      isInChatApp: true,
      role: cu.role || 'employee',
    });
  }

  // Synchronize FlowTask users into ChatApp workspace membership as needed.
  for (const ftu of flowTaskUsers) {
    try {
      if (!ftu._id || !ftu.email) continue;
      const syncedUser = await userRepository.upsertFromFlowTask(ftu);
      const isMember = await workspaceRepository.isMember(syncedUser._id, workspaceId);
      if (!isMember) {
        await workspaceRepository.addMember(syncedUser._id, workspaceId, WORKSPACE_ROLES.MEMBER);
      }
    } catch (err) {
      logger.warn('Failed to sync FlowTask user into workspace during DM contacts', {
        email: ftu.email,
        error: err.message,
        workspaceId,
      });
      // continue gracefully; contact lookup may still work via FlowTask-only entry
    }

    const email = ftu.email?.toLowerCase();
    if (!email) continue;
    // Exclude current user by flowTaskUserId or email
    if (ftu._id?.toString() === currentUser.flowTaskUserId) continue;
    if (ftu.email?.trim().toLowerCase() === currentUser.email?.trim().toLowerCase()) continue;

    if (contactMap.has(email)) {
      // Already in ChatApp — enrich with FlowTask data if missing
      const existing = contactMap.get(email);
      if (!existing.avatar && ftu.avatar) existing.avatar = ftu.avatar;
      if (!existing.flowTaskUserId && ftu._id) existing.flowTaskUserId = ftu._id.toString();
    } else {
      // FlowTask user NOT in ChatApp
      contactMap.set(email, {
        name: ftu.name,
        email: ftu.email,
        avatar: ftu.avatar || null,
        flowTaskUserId: ftu._id?.toString() || null,
        chatUserId: null,
        onlineStatus: 'offline',
        isInChatApp: false,
        role: ftu.role || 'employee',
      });
    }
  }

  // ── Step 4: Sort — ChatApp users first, then alphabetical ──
  const contacts = Array.from(contactMap.values()).sort((a, b) => {
    // Available users first
    if (a.isInChatApp && !b.isInChatApp) return -1;
    if (!a.isInChatApp && b.isInChatApp) return 1;
    // Then by name
    return (a.name || '').localeCompare(b.name || '');
  });

  res.json({
    success: true,
    data: {
      contacts,
      meta: {
        total: contacts.length,
        inChatApp: contacts.filter((c) => c.isInChatApp).length,
        flowTaskFetchFailed,
      },
    },
  });
});
export const getProfile = asyncHandler(async (req, res) => {
  const profile = await userService.getProfile(req.params.id);
  res.json({ success: true, data: profile });
});

/**
 * Set custom status for the authenticated user.
 * PUT /users/status
 * Body: { emoji?: string, text?: string, duration?: number (minutes) }
 */
export const setCustomStatus = asyncHandler(async (req, res) => {
  const user = await userService.setCustomStatus(req.user._id, req.body);
  res.json({
    success: true,
    data: {
      customStatus: user.customStatus,
    },
  });
});

/**
 * Clear custom status for the authenticated user.
 * DELETE /users/status
 */
export const clearCustomStatus = asyncHandler(async (req, res) => {
  await userService.clearCustomStatus(req.user._id);
  res.json({ success: true, data: { customStatus: { emoji: null, text: null, expiresAt: null } } });
});

/**
 * Set online presence status (online, away, dnd).
 * PUT /users/presence
 * Body: { status: 'online' | 'away' | 'dnd' }
 */
export const setPresence = asyncHandler(async (req, res) => {
  const { status } = req.body;
  const user = await userService.setOnlineStatus(req.user._id, status);
  res.json({
    success: true,
    data: {
      onlineStatus: user.onlineStatus,
    },
  });
});

/**
 * Get all currently online users.
 * GET /users/online
 */
export const getOnlineUsers = asyncHandler(async (req, res) => {
  const users = await userService.getOnlineUsers(req.workspaceId);
  res.json({ success: true, data: users });
});

/**
 * Search users by name or email.
 * GET /users/search?q=...&limit=...
 */
export const searchUsers = asyncHandler(async (req, res) => {
  const { q, limit } = req.query;
  if (!q || !q.trim()) {
    return res.status(400).json({ success: false, error: 'Query parameter "q" is required' });
  }
  const parsedLimit = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
  const users = await userService.searchUsers(q, parsedLimit, req.workspaceId);
  res.json({ success: true, data: users });
});

/**
 * Pause notifications (DND)
 * POST /users/dnd/pause
 * Body: { duration?: string, endsAt?: ISOString }
 */
export const pauseNotifications = asyncHandler(async (req, res) => {
  const payload = req.body || {}
  const user = await userService.pauseNotifications(req.user._id, payload)
  res.json({ success: true, data: { dnd: user.chatPreferences?.dnd || {} } })
})

/**
 * Resume notifications immediately (clear manual DND)
 * POST /users/dnd/resume
 */
export const resumeNotifications = asyncHandler(async (req, res) => {
  const user = await userService.resumeNotifications(req.user._id)
  res.json({ success: true, data: { dnd: user.chatPreferences?.dnd || {} } })
})

/**
 * Get current DND status for the authenticated user
 * GET /users/dnd/status
 */
export const getDndStatus = asyncHandler(async (req, res) => {
  const status = await userService.getDndStatus(req.user._id)
  res.json({ success: true, data: status })
})

/**
 * Save recurring DND schedule
 * POST /users/dnd/schedule
 * Body: { enabled, startHour, endHour, timezone }
 */
export const saveDndSchedule = asyncHandler(async (req, res) => {
  const schedule = req.body || {}
  const user = await userService.saveDndSchedule(req.user._id, schedule)
  res.json({ success: true, data: { dndSchedule: user.chatPreferences?.dndSchedule || {} } })
})
