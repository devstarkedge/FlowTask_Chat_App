import { WORKSPACE_ROLES } from '../../config/constants.js';

/**
 * FlowTask and ChatApp intentionally have different role vocabularies.
 *
 * The FlowTask role is retained verbatim in `flowTaskAccess.role` for
 * FlowTask-specific authorization (project scope and system channels). This
 * mapper produces the *ChatApp workspace membership* role used by ChatApp's
 * own middleware. Keep every translation here so a workspace can never
 * inherit a role from ChatUser's global identity or a different workspace.
 */
const SYSTEM_ROLE_MAP = Object.freeze({
  admin: WORKSPACE_ROLES.ADMIN,
  manager: WORKSPACE_ROLES.MEMBER,
  hr: WORKSPACE_ROLES.MEMBER,
  employee: WORKSPACE_ROLES.MEMBER,
  guest: WORKSPACE_ROLES.GUEST,
});

function normalizedRole(role) {
  if (typeof role !== 'string' || !role.trim()) {
    throw new Error('FlowTask workspace access is missing a role.');
  }
  return role.trim().toLowerCase();
}

/**
 * Resolve the least-privileged ChatApp role for a signed FlowTask snapshot.
 *
 * Unknown role names are never silently treated as `employee`. A custom
 * FlowTask role is explicit only when FlowTask also supplies its roleId; it
 * remains a Chat member unless its signed permissions include the same
 * system-management authority as a FlowTask admin.
 */
export function mapFlowTaskAccessToWorkspaceRole(access) {
  const flowTaskRole = normalizedRole(access?.role);
  const direct = SYSTEM_ROLE_MAP[flowTaskRole];
  if (direct) {
    return { flowTaskRole, workspaceRole: direct, isCustomRole: false };
  }

  if (!access?.roleId) {
    throw new Error(`Unknown FlowTask workspace role "${flowTaskRole}" without a roleId.`);
  }

  const permissions = access.rolePermissions || access.permissions || {};
  return {
    flowTaskRole,
    workspaceRole: permissions.canManageSystem === true
      ? WORKSPACE_ROLES.ADMIN
      : WORKSPACE_ROLES.MEMBER,
    isCustomRole: true,
  };
}

export function normalizeFlowTaskAccess(access) {
  const { flowTaskRole, workspaceRole, isCustomRole } = mapFlowTaskAccessToWorkspaceRole(access);
  return {
    ...access,
    role: flowTaskRole,
    roleId: access.roleId ? String(access.roleId) : null,
    syncedAt: access.syncedAt ? new Date(access.syncedAt) : new Date(),
    _workspaceRole: workspaceRole,
    _isCustomRole: isCustomRole,
  };
}

export default {
  mapFlowTaskAccessToWorkspaceRole,
  normalizeFlowTaskAccess,
};
