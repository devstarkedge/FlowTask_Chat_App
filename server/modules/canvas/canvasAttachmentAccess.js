import FileReference from '../files/FileReference.model.js';
import Message from '../messages/Message.model.js';
import { authorizeFileReferences } from '../files/fileAccess.service.js';
import { canvasAttachmentIds } from './canvasAttachments.js';
import { canvasShareIds } from './canvasShareLinks.js';

// Only a user who can already read an asset may attach it to a shared canvas.
// Persist access before the editor broadcasts the new media node.
export async function shareCanvasFiles(canvas, fileIds, userId, { repair = false } = {}) {
  const allowed = [];
  for (const fileId of new Set(fileIds)) {
    try {
      await authorizeFileReferences([fileId], userId, canvas.workspaceId);
      allowed.push(fileId);
    } catch (error) {
      if (!repair || ![403, 404].includes(error.statusCode)) throw error;
    }
  }
  if (!allowed.length) return;
  const shares = await Message.find({
    workspaceId: canvas.workspaceId,
    isDeleted: false,
    $or: [
      { contentType: 'canvas_share', 'canvasMeta.canvasId': String(canvas._id) },
      { content: { $regex: String(canvas._id), $options: 'i' } },
      { htmlContent: { $regex: String(canvas._id), $options: 'i' } },
    ],
  }).select('_id channelId contentType canvasMeta content htmlContent').lean();
  const matchingShares = shares.filter(share => canvasShareIds(share).includes(String(canvas._id)));
  const operations = matchingShares.flatMap(share => allowed.map(fileId => ({
    updateOne: {
      filter: { workspaceId: canvas.workspaceId, messageId: share._id, fileId },
      update: { $setOnInsert: {
        workspaceId: canvas.workspaceId, messageId: share._id, fileId,
        channelId: share.channelId, canvasId: canvas._id,
        referencedBy: userId, contextType: 'canvas',
      } },
      upsert: true,
    },
  })));
  if (operations.length) {
    try {
      await FileReference.bulkWrite(operations, { ordered: false });
    } catch (error) {
      // Two collaborators may repair the same missing reference concurrently.
      // The unique index is authoritative; retain other failures.
      const failures = error.writeErrors || [];
      if (!failures.length || failures.some(failure => failure.code !== 11000) || error.writeConcernErrors?.length) throw error;
    }
  }
}

export function syncCanvasFiles(canvas, userId) {
  return shareCanvasFiles(canvas, canvasAttachmentIds(canvas.content), userId, { repair: true });
}
