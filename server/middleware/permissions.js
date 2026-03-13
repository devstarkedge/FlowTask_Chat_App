import { WORKSPACE_ROLES } from '../config/constants.js';

/**
 * Granular Permission System — maps workspace roles to specific capabilities.
 *
 * Role Hierarchy: owner > admin > member > guest
 *
 * Usage in routes:
 *   router.post('/channels', protect, resolveWorkspace, requirePermission('channel:create'), handler);
 *   router.delete('/workspace', protect, resolveWorkspace, requirePermission('workspace:delete'), handler);
 */

// ─── Permission Map ──────────────────────────────────────────────────────────
const PERMISSION_MAP = Object.freeze({
  [WORKSPACE_ROLES.OWNER]: [
    '*', // Owner has all permissions
  ],
  [WORKSPACE_ROLES.ADMIN]: [
    'channel:create',
    'channel:update',
    'channel:delete',
    'channel:archive',
    'channel:post_private',
    'channel:manage_members',
    'member:invite',
    'member:remove',
    'integration:manage',
    'integration:view',
    'message:send',
    'message:delete_own',
    'message:delete_any',
    'message:pin',
    'thread:create',
    'thread:lock',
    'thread:resolve',
    'workspace:update',
    'workspace:view_settings',
    'file:upload',
    'file:delete_any',
    'bot:command',
  ],
  [WORKSPACE_ROLES.MEMBER]: [
    'channel:create',
    'channel:update',
    'channel:post_private',
    'channel:manage_members',
    'message:send',
    'message:delete_own',
    'message:pin',
    'thread:create',
    'thread:resolve',
    'workspace:view_settings',
    'integration:view',
    'file:upload',
    'file:delete_own',
    'bot:command',
  ],
  [WORKSPACE_ROLES.GUEST]: [
    'channel:read_public',
    'message:send_public',
    'message:read',
    'message:delete_own',
    'thread:create',
    'file:upload',
    'file:delete_own',
  ],
});

/**
 * Check if a role has a specific permission.
 */
function roleHasPermission(role, permission) {
  const perms = PERMISSION_MAP[role];
  if (!perms) return false;
  if (perms.includes('*')) return true;
  return perms.includes(permission);
}

/**
 * Middleware factory — checks that the user's workspace role has the required permission(s).
 * If multiple permissions are passed, the user must have ALL of them (AND logic).
 *
 * @param  {...string} permissions  Required permissions (e.g., 'channel:create', 'member:invite')
 * @returns {Function}  Express middleware
 */
export function requirePermission(...permissions) {
  return (req, res, next) => {
    if (!req.membership) {
      return res.status(403).json({
        success: false,
        message: 'Workspace membership required.',
      });
    }

    const userRole = req.membership.role;
    const missing = permissions.filter((perm) => !roleHasPermission(userRole, perm));

    if (missing.length > 0) {
      return res.status(403).json({
        success: false,
        message: `Insufficient permissions. Missing: ${missing.join(', ')}. Your role: ${userRole}`,
      });
    }

    next();
  };
}

/**
 * Middleware factory — checks that the user has ANY of the specified permissions (OR logic).
 *
 * @param  {...string} permissions  At least one must be satisfied
 * @returns {Function}  Express middleware
 */
export function requireAnyPermission(...permissions) {
  return (req, res, next) => {
    if (!req.membership) {
      return res.status(403).json({
        success: false,
        message: 'Workspace membership required.',
      });
    }

    const userRole = req.membership.role;
    const hasAny = permissions.some((perm) => roleHasPermission(userRole, perm));

    if (!hasAny) {
      return res.status(403).json({
        success: false,
        message: `Insufficient permissions. Requires one of: ${permissions.join(', ')}. Your role: ${userRole}`,
      });
    }

    next();
  };
}

/**
 * Utility — check permission programmatically (not as middleware).
 * Useful inside service methods or socket handlers.
 */
export function hasPermission(role, permission) {
  return roleHasPermission(role, permission);
}

/**
 * Get all permissions for a given role.
 */
export function getPermissionsForRole(role) {
  return PERMISSION_MAP[role] || [];
}

export { PERMISSION_MAP };
