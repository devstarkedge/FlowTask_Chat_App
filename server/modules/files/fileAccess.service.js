import FileAsset from './FileAsset.model.js';
import FileReference from './FileReference.model.js';
import WorkspaceMembership from '../workspaces/WorkspaceMembership.model.js';
import channelService from '../channels/channel.service.js';
import {createFileAuthorizer} from './fileAccess.js';
import {ForbiddenError,ValidationError} from '../../middleware/errorHandler.js';

export const assertFileAccess = createFileAuthorizer({
  membership:(userId,workspaceId)=>WorkspaceMembership.findOne({userId,workspaceId,isActive:true}).lean(),
  references:(fileId,workspaceId)=>FileReference.find({fileId,workspaceId}).select('channelId').lean(),
  authorizeChannel:(...args)=>channelService.getChannelById(...args),
});

// A caller cannot acquire file access by first inserting a reference to an
// arbitrary asset into a conversation they own. Validate before persistence.
export async function authorizeFileReferences(fileIds,userId,workspaceId) {
  if (!fileIds?.length) return;
  if (!Array.isArray(fileIds) || fileIds.length>10) throw new ValidationError('Invalid file references');
  for (const id of new Set(fileIds.map(String))) {
    if (!/^[a-f\d]{24}$/i.test(id)) throw new ValidationError('Invalid file reference');
    const asset=await FileAsset.findById(id).lean();
    if (!asset) throw new ForbiddenError('File is not accessible');
    await assertFileAccess(asset,{user:{_id:userId},workspaceId,query:{}});
  }
}
