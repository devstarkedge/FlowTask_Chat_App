import logger from '../utils/logger.js';

/**
 * Permission Engine — configurable capability-based access control.
 *
 * Replaces all hardcoded `user.role === 'admin'` checks with a data-driven
 * role → capability mapping. Supports FlowTask accessType integration.
 *
 * Design principles:
 *   1. Default = NO ACCESS (deny by default)
 *   2. Configuration-driven (no hardcoded roles in consuming code)
 *   3. Context-aware (workspace, department, channel membership)
 *   4. Auditable (all denials are logged)
 */

// ─── Capabilities ────────────────────────────────────────────────────────────
export const CAPABILITIES = Object.freeze({
  VIEW_CHANNEL: 'VIEW_CHANNEL',
  SEND_MESSAGE: 'SEND_MESSAGE',
  VIEW_ALL_CHANNELS: 'VIEW_ALL_CHANNELS',
  MANAGE_PROJECT: 'MANAGE_PROJECT',
  MANAGE_MEMBERS: 'MANAGE_MEMBERS',
  ARCHIVE_CHANNEL: 'ARCHIVE_CHANNEL',
  VIEW_DEPARTMENT_CHANNELS: 'VIEW_DEPARTMENT_CHANNELS',
  VIEW_AUDIT_LOG: 'VIEW_AUDIT_LOG',
  MANAGE_NOTIFICATIONS: 'MANAGE_NOTIFICATIONS',
  MANAGE_WORKSPACE: 'MANAGE_WORKSPACE',
  PIN_CHANNEL: 'PIN_CHANNEL',
});

// ─── Role → Capability Mapping ──────────────────────────────────────────────
// This is the single source of truth for what each role can do.
// To extend: add new capabilities above and assign them to roles below.
const ROLE_CAPABILITIES = {
  admin: new Set(Object.values(CAPABILITIES)), // Admin gets ALL capabilities
  manager: new Set([
    CAPABILITIES.VIEW_CHANNEL,
    CAPABILITIES.SEND_MESSAGE,
    CAPABILITIES.VIEW_ALL_CHANNELS,
    CAPABILITIES.VIEW_DEPARTMENT_CHANNELS,
    CAPABILITIES.MANAGE_PROJECT,
    CAPABILITIES.MANAGE_MEMBERS,
    CAPABILITIES.ARCHIVE_CHANNEL,
    CAPABILITIES.MANAGE_NOTIFICATIONS,
    CAPABILITIES.PIN_CHANNEL,
    CAPABILITIES.VIEW_AUDIT_LOG,
  ]),
  hr: new Set([
    CAPABILITIES.VIEW_CHANNEL,
    CAPABILITIES.SEND_MESSAGE,
    CAPABILITIES.VIEW_DEPARTMENT_CHANNELS,
    CAPABILITIES.MANAGE_NOTIFICATIONS,
    CAPABILITIES.PIN_CHANNEL,
  ]),
  employee: new Set([
    CAPABILITIES.VIEW_CHANNEL,
    CAPABILITIES.SEND_MESSAGE,
    CAPABILITIES.MANAGE_NOTIFICATIONS,
    CAPABILITIES.PIN_CHANNEL,
  ]),
};

// Default capabilities for unknown roles (principle of least privilege)
const DEFAULT_CAPABILITIES = new Set([
  CAPABILITIES.VIEW_CHANNEL,
  CAPABILITIES.SEND_MESSAGE,
]);

class PermissionEngine {
  /**
   * Check if a user has a specific capability.
   *
   * @param {object} user - The ChatUser document (must have .role)
   * @param {string} capability - One of CAPABILITIES values
   * @param {object} [context] - Optional context for fine-grained checks
   * @param {string} [context.workspaceId]
   * @param {string} [context.channelId]
   * @param {string} [context.departmentId]
   * @returns {boolean}
   */
  hasCapability(user, capability, context = {}) {
    if (!user || !capability) return false;

    const role = (user.role || '').toLowerCase();
    const caps = ROLE_CAPABILITIES[role] || DEFAULT_CAPABILITIES;

    // Direct capability check
    if (!caps.has(capability)) {
      return false;
    }

    // Context-aware refinements for department-scoped capabilities
    if (capability === CAPABILITIES.VIEW_DEPARTMENT_CHANNELS && context.departmentId) {
      // HR and managers can view their own department channels
      if (role !== 'admin' && role !== 'manager') {
        const userDepts = (user.departmentIds || []).map(String);
        if (!userDepts.includes(context.departmentId.toString())) {
          return false;
        }
      }
    }

    return true;
  }

  /**
   * Check if a user can access a specific channel.
   *
   * Decision flow:
   *   1. Admin/manager with VIEW_ALL_CHANNELS → always allowed
   *   2. DM channel → must be a participant
   *   3. Public channel → allowed if in same workspace
   *   4. Private/project channel → must be a member
   *   5. Department channel → must belong to that department
   *
   * @param {object} user - ChatUser document
   * @param {object} channel - Channel document
   * @returns {boolean}
   */
  canAccessChannel(user, channel) {
    if (!user || !channel) return false;

    const workspaceId = channel.workspaceId?.toString();

    // FlowTask project channels are assignment-scoped even for admins/managers, except workspace admins/owners.
    if (channel.type === 'project' || channel.flowTaskRef?.entityType === 'board') {
      const role = (user.role || '').toLowerCase();
      if (role === 'admin' || role === 'owner') {
        return true;
      }
      return channel.hasMember?.(user._id) === true;
    }

    // VIEW_ALL_CHANNELS bypasses membership checks
    if (this.hasCapability(user, CAPABILITIES.VIEW_ALL_CHANNELS, { workspaceId })) {
      return true;
    }

    const userId = user._id?.toString();

    // DM: strict participant check
    if (channel.type === 'dm') {
      const isMember = channel.hasMember?.(user._id);
      const isParticipant = channel.dmParticipants?.map(String).includes(userId);
      return isMember || isParticipant;
    }

    // Public channels: any workspace member can view
    if (channel.visibility === 'public') {
      return true;
    }

    // Department channel: user must belong to that department
    if (channel.type === 'department' && channel.flowTaskRef?.entityId) {
      const userDepts = (user.departmentIds || []).map(String);
      if (userDepts.includes(channel.flowTaskRef.entityId.toString())) {
        return true;
      }
    }

    // Membership check (for private/project channels)
    if (channel.hasMember?.(user._id)) {
      return true;
    }

    // Default: NO ACCESS
    return false;
  }

  /**
   * Check if a user can manage (add/remove members, rename) a channel.
   *
   * @param {object} user
   * @param {object} channel
   * @returns {boolean}
   */
  canManageChannel(user, channel) {
    if (!user || !channel) return false;

    // Admin can manage everything
    if (this.hasCapability(user, CAPABILITIES.MANAGE_MEMBERS)) {
      return true;
    }

    // Channel owner can manage their own channel
    const role = channel.getMemberRole?.(user._id);
    return role === 'owner' || role === 'admin';
  }

  /**
   * Get the set of capabilities for a role.
   * Useful for debugging and audit.
   *
   * @param {string} role
   * @returns {string[]}
   */
  getCapabilitiesForRole(role) {
    const caps = ROLE_CAPABILITIES[(role || '').toLowerCase()] || DEFAULT_CAPABILITIES;
    return [...caps];
  }

  /**
   * Check if a user role has VIEW_ALL_CHANNELS (used by socket manager).
   *
   * @param {object} user
   * @param {object} [context]
   * @returns {boolean}
   */
  canViewAllChannels(user, context = {}) {
    return this.hasCapability(user, CAPABILITIES.VIEW_ALL_CHANNELS, context);
  }
}

export default new PermissionEngine();
export { ROLE_CAPABILITIES };
