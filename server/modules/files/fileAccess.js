import { ForbiddenError } from '../../middleware/errorHandler.js';

const id = value => value == null ? '' : String(value._id || value);
function denied(message, code) {
  const error = new ForbiddenError(message);
  error.code = code;
  return error;
}

// Share the existing channel authorization policy rather than treating a
// workspace membership as permission to read every private conversation.
export function createFileAuthorizer({ membership, references, authorizeChannel }) {
  return async (asset, req) => {
    const userId = id(req.user);
    const workspaceId = id(asset.workspaceId);
    const requested = req.workspaceId || req.query?.workspaceId || req.query?.w;
    if (!userId || !workspaceId || (requested && id(requested) !== workspaceId) || ['deleted', 'archived'].includes(asset.status)) {
      throw denied('Access denied', 'FILE_CONTEXT_DENIED');
    }
    const member = await membership(userId, workspaceId);
    if (!member) throw denied('Active workspace membership required', 'FILE_MEMBERSHIP_REQUIRED');
    req.workspaceId = workspaceId;
    // Owners retain access to their own uploads, including unsent drafts, but
    // must still belong to the workspace. Populated uploader documents work too.
    if (id(asset.uploadedBy) === userId) return;
    const refs = await references(id(asset), workspaceId);
    for (const channelId of new Set(refs.map(ref => id(ref.channelId)).filter(Boolean))) {
      try {
        await authorizeChannel(channelId, userId, workspaceId, member);
        return;
      } catch (error) {
        if (![403, 404].includes(error.statusCode)) throw error;
      }
    }
    throw denied('Access denied', 'FILE_NOT_SHARED');
  };
}
